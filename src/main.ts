import {
  App,
  Component,
  debounce,
  Keymap,
  MarkdownRenderChild,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
  setIcon,
} from "obsidian";
import { parse, Segment, SongLine, transposeKey, isValidChord } from "./parser";
import {
  clampCapo,
  scrollSpeedForDuration,
  autoscrollEnd,
  chordPopoverPlacement,
  shouldHoldWakeLock,
  sectionKind,
  barTokens,
} from "./viewutils";
import { Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { chordsOverLyricsToInline } from "./convert";
import {
  parseSetlist,
  nextIndex,
  prevIndex,
  songDurationSec,
  summaryLabel,
  formatDuration,
  currentIndex,
  SONG_BLOCK_RE,
} from "./setlist";
import { ChordShape, chordDiagramData, uniqueChords } from "./diagrams";
import { insertStarterLeadsheet } from "./starter";

declare global {
  interface HTMLElementEventMap {
    "leadsheet-scroll-stopped": CustomEvent<void>;
    "leadsheet-speed-changed": CustomEvent<void>;
    "leadsheet-perf-changed": CustomEvent<void>;
  }
}

interface LeadsheetSettings {
  scrollSpeed: number; // px per second (manual fallback)
  offsets: Record<string, number>; // per-file transpose offset
  fontScale: number; // global leadsheet font multiplier
  chordMode: "sounding" | "shapes";
  align: "left" | "center"; // global sheet alignment
  showDiagrams: boolean;
}

const DEFAULT_SETTINGS: LeadsheetSettings = {
  scrollSpeed: 20,
  offsets: {},
  fontScale: 1,
  chordMode: "sounding",
  align: "left",
  showDiagrams: false,
};

// Reading view and Live Preview scroll containers.
const SCROLLER = ".markdown-preview-view, .cm-scroller";

// The box that actually scrolls a block. An embedded note's inner preview view
// matches SCROLLER but never scrolls itself, so look for real overflow first:
// the embed when it overflows, otherwise the host note's scroller.
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = p.win.getComputedStyle(p);
    if (/auto|scroll|overlay/.test(overflowY) && p.scrollHeight > p.clientHeight) return p;
  }
  return el.closest<HTMLElement>(SCROLLER);
}

// Where the current song is read: 40% down the scroller's visible box, so a
// pane in a split or an embed reads its own line. The set-list position label
// and the autoscroll command must agree on it.
function readingLine(scroller: HTMLElement): number {
  return scroller.getBoundingClientRect().top + scroller.clientHeight * 0.4;
}

export default class LeadsheetPlugin extends Plugin {
  settings: LeadsheetSettings = DEFAULT_SETTINGS;
  private scrollEl: HTMLElement | null = null;
  private scrollSheet: HTMLElement | null = null; // sheet whose play started the scroll
  private scrollRaf = 0;
  private liveSpeed = 0; // px/s of the active scroll; adjustable mid-scroll
  private openChordTrigger: HTMLButtonElement | null = null;
  private performanceMode = false;
  private wakeLock: WakeLockSentinel | null = null;
  private wakeLockRequest: Promise<void> | null = null;

  async onload() {
    await this.loadSettings();
    activeDocument.body.style.setProperty("--ls-font-scale", String(this.settings.fontScale));
    activeDocument.body.classList.toggle("leadsheet-align-center", this.settings.align === "center");

    this.registerDomEvent(activeDocument, "pointerdown", (event) => {
      const target = event.target as Node | null;
      if (target && !this.openChordTrigger?.contains(target)) this.closeChordPopover();
    });
    this.registerDomEvent(activeWindow, "resize", () => {
      if (this.openChordTrigger) this.positionChordPopover(this.openChordTrigger);
    });
    this.registerDomEvent(activeDocument, "visibilitychange", () => this.syncWakeLock());

    // Each block owns a render child so its body-level listeners are removed
    // when Obsidian re-renders or unloads the block.
    this.registerMarkdownCodeBlockProcessor("leadsheet", (src, el, ctx) => {
      const child = new MarkdownRenderChild(el);
      ctx.addChild(child);
      renderLeadsheet(this, child, src, el, ctx.sourcePath);
    });

    this.registerMarkdownCodeBlockProcessor("setlist", (src, el, ctx) => {
      const child = new MarkdownRenderChild(el);
      ctx.addChild(child);
      renderSetlist(this, child, src, el, ctx.sourcePath);
    });

    this.addCommand({
      id: "insert-starter-leadsheet",
      name: "Insert starter leadsheet",
      editorCallback: (editor) => insertStarterLeadsheet(editor),
    });

    this.addCommand({
      id: "convert-selection-to-inline",
      name: "Convert selection: chords-over-lyrics → inline",
      editorCallback: (editor) => {
        const sel = editor.getSelection();
        if (sel) editor.replaceSelection(chordsOverLyricsToInline(sel));
      },
    });

    this.addCommand({
      id: "toggle-performance",
      name: "Toggle performance mode",
      callback: () => this.togglePerformanceMode(),
    });

    this.addCommand({
      id: "toggle-autoscroll",
      name: "Toggle autoscroll",
      callback: () => this.toggleAutoscrollCommand(),
    });

    this.addSettingTab(new LeadsheetSettingTab(this.app, this));
    this.registerEditorExtension(leadsheetLinter());
  }

  onunload() {
    this.closeChordPopover();
    this.performanceMode = false;
    void this.releaseWakeLock();
    this.stopAutoscroll();
    activeDocument.body.classList.remove("leadsheet-perf", "leadsheet-align-center");
    activeDocument.body.style.removeProperty("--ls-font-scale");
  }

  isPerformanceMode(): boolean {
    return this.performanceMode;
  }

  togglePerformanceMode() {
    this.performanceMode = !this.performanceMode;
    const body = activeDocument.body;
    body.classList.toggle("leadsheet-perf", this.performanceMode);
    this.syncWakeLock();
    const win = body.doc.defaultView;
    if (win) body.dispatchEvent(new win.CustomEvent("leadsheet-perf-changed"));
  }

  private syncWakeLock() {
    const supported = "wakeLock" in activeWindow.navigator;
    if (!shouldHoldWakeLock(
      this.performanceMode,
      activeDocument.visibilityState,
      supported
    )) {
      void this.releaseWakeLock();
      return;
    }
    if (this.wakeLock || this.wakeLockRequest) return;
    this.wakeLockRequest = this.requestWakeLock().finally(() => {
      this.wakeLockRequest = null;
    });
  }

  private async requestWakeLock() {
    try {
      const sentinel = await activeWindow.navigator.wakeLock.request("screen");
      if (!shouldHoldWakeLock(
        this.performanceMode,
        activeDocument.visibilityState,
        true
      )) {
        await sentinel.release();
        return;
      }
      this.wakeLock = sentinel;
      sentinel.addEventListener("release", () => {
        if (this.wakeLock === sentinel) this.wakeLock = null;
      }, { once: true });
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock() {
    const sentinel = this.wakeLock;
    this.wakeLock = null;
    if (!sentinel) return;
    try {
      await sentinel.release();
    } catch {
      // Native wake-lock loss and unsupported implementations are safe no-ops.
    }
  }

  toggleChordPopover(trigger: HTMLButtonElement): boolean {
    if (this.openChordTrigger === trigger) {
      this.closeChordPopover(true);
      return false;
    }
    this.closeChordPopover();
    this.openChordTrigger = trigger;
    trigger.addClass("ls-popover-open");
    this.positionChordPopover(trigger);
    return true;
  }

  closeChordPopover(suppressHover = false) {
    const trigger = this.openChordTrigger;
    if (!trigger) return;
    trigger.removeClass("ls-popover-open");
    trigger.toggleClass("ls-popover-dismissed", suppressHover);
    this.openChordTrigger = null;
  }

  private positionChordPopover(trigger: HTMLButtonElement) {
    const popover = trigger.querySelector<HTMLElement>(".ls-chord-popover");
    const win = trigger.ownerDocument.defaultView;
    if (!popover || !win) return;

    popover.style.removeProperty("--ls-popover-shift-x");
    popover.removeClass("ls-popover-below");
    const popoverRect = popover.getBoundingClientRect();
    const placement = chordPopoverPlacement(
      trigger.getBoundingClientRect(),
      { width: popoverRect.width, height: popoverRect.height },
      { width: win.innerWidth, height: win.innerHeight }
    );
    popover.style.setProperty("--ls-popover-shift-x", `${placement.shiftX}px`);
    popover.toggleClass("ls-popover-below", placement.below);
  }

  isScrolling(): boolean {
    return this.scrollEl !== null;
  }

  // Duration sets the pace when available; otherwise use the saved speed. A
  // sheet inside a set list scrolls through its own song only: the pace comes
  // from that song's height and playback stops at its last line.
  toggleAutoscroll(el: HTMLElement, durationSec = 0, sheet: HTMLElement | null = null) {
    if (this.scrollEl) {
      this.stopAutoscroll();
      return;
    }
    const bound = sheet?.closest<HTMLElement>(".ls-setlist-song") ?? null;
    this.scrollEl = el;
    this.scrollSheet = sheet;
    const win = el.win;
    const contentPx = (bound ? bound.offsetHeight : el.scrollHeight) - el.clientHeight;
    const derived = scrollSpeedForDuration(contentPx, durationSec);
    this.liveSpeed = derived > 0 ? derived : this.settings.scrollSpeed;
    // Re-measured every frame: songs above may still be rendering.
    const end = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (!bound) return max;
      return autoscrollEnd(
        el.scrollTop,
        max,
        bound.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom
      );
    };
    let pos = el.scrollTop;
    let wrote = pos; // scrollTop as last set, read back after the browser snaps it
    let lastTs = 0;
    const step = (ts: number) => {
      if (this.scrollEl !== el) return;
      if (lastTs) {
        // Carry on from wherever something else moved the view since the last
        // frame: scroll anchoring as songs above render, Reading view shifting
        // content, or the user's own wheel or drag.
        pos += el.scrollTop - wrote;
        const stop = end();
        if (pos >= stop) {
          this.stopAutoscroll();
          return;
        }
        pos = Math.min(pos + (this.liveSpeed * (ts - lastTs)) / 1000, stop);
        el.scrollTop = pos;
        wrote = el.scrollTop;
      }
      lastTs = ts;
      this.scrollRaf = win.requestAnimationFrame(step);
    };
    this.scrollRaf = win.requestAnimationFrame(step);
  }

  // The command plays the sheet at the reading line exactly as its own play
  // button would (duration pace, set-list bounds). A note without a sheet
  // scrolls at the saved speed.
  private toggleAutoscrollCommand() {
    if (this.scrollEl) {
      this.stopAutoscroll();
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const scroller = Array.from(
      view?.containerEl.querySelectorAll<HTMLElement>(SCROLLER) ?? []
    ).find((el) => el.isShown());
    if (!scroller) return;
    const plays = Array.from(scroller.querySelectorAll<HTMLButtonElement>(".leadsheet .ls-play"));
    if (!plays.length) {
      this.toggleAutoscroll(scroller);
      return;
    }
    // Same anchors as the set-list position label.
    const tops = plays.map((play) =>
      (play.closest(".ls-setlist-song") ?? play.closest(".leadsheet"))!.getBoundingClientRect().top
    );
    plays[currentIndex(tops, readingLine(scroller))].click();
  }

  // A sheet that unloads (another file in the leaf, a re-render) takes its
  // playback with it, so the scroller never keeps running under other content.
  releaseAutoscroll(sheet: HTMLElement) {
    if (this.scrollSheet === sheet) this.stopAutoscroll();
  }

  // A no-op when idle, so Prev/Next do not redraw every sheet's play button.
  stopAutoscroll() {
    const el = this.scrollEl;
    if (!el) return;
    if (this.scrollRaf) (el.win ?? activeWindow).cancelAnimationFrame(this.scrollRaf);
    this.scrollRaf = 0;
    this.scrollEl = null;
    this.scrollSheet = null;
    const win = el.doc.defaultView;
    if (win) el.doc.body.dispatchEvent(new win.CustomEvent("leadsheet-scroll-stopped"));
  }

  // Change speed by delta px/s. Persists the manual fallback and, if a scroll
  // is running, applies live so the sheet speeds up/slows without restarting.
  adjustSpeed(delta: number, body = activeDocument.body) {
    this.settings.scrollSpeed = Math.max(5, this.settings.scrollSpeed + delta);
    if (this.scrollEl) this.liveSpeed = Math.max(5, this.liveSpeed + delta);
    void this.saveSettings();
    const win = body.doc.defaultView;
    if (win) body.dispatchEvent(new win.CustomEvent("leadsheet-speed-changed"));
  }

  currentSpeed(): number {
    return Math.round(this.scrollEl ? this.liveSpeed : this.settings.scrollSpeed);
  }

  async loadSettings() {
    const loaded: unknown = await this.loadData();
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      loaded !== null && typeof loaded === "object" ? loaded : {}
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

function renderLeadsheet(
  plugin: LeadsheetPlugin,
  owner: Component,
  src: string,
  el: HTMLElement,
  sourcePath: string
) {
  const hostBody = el.doc.body;
  hostBody.style.setProperty("--ls-font-scale", String(plugin.settings.fontScale));
  hostBody.classList.toggle("leadsheet-align-center", plugin.settings.align === "center");
  const song = parse(src);
  // Frontmatter is the metadata source of truth; block directives override.
  const fm = plugin.app.metadataCache.getCache(sourcePath)?.frontmatter ?? {};
  for (const k of ["title", "artist", "key", "capo", "tempo", "time", "duration"]) {
    if (song.meta[k] === undefined && fm[k] != null && fm[k] !== "")
      song.meta[k] = String(fm[k]);
  }
  el.addClass("leadsheet");

  const header = el.createDiv({ cls: "ls-header" });
  const toolbar = el.createDiv({ cls: "ls-toolbar", attr: { role: "group", "aria-label": "Leadsheet controls" } });
  const diagrams = el.createDiv({ cls: "ls-diagrams" });
  const body = el.createDiv({ cls: "ls-body" });
  const chordList = uniqueChords(song);
  // Tapping the sheet pauses; the toolbar resumes playback.
  body.addEventListener("click", () => {
    if (plugin.isScrolling()) plugin.stopAutoscroll();
  });

  // --- title + metadata chips ---
  const titleBox = header.createDiv({ cls: "ls-titlebox" });
  if (song.meta.title) titleBox.createDiv({ cls: "ls-title", text: song.meta.title });
  if (song.meta.artist) titleBox.createDiv({ cls: "ls-meta ls-artist", text: song.meta.artist });

  const chips = header.createDiv({ cls: "ls-chips" });
  const keyChip = metaChip(chips, "music", "", "Key");
  const keyText = keyChip.querySelector(".ls-chip-text") as HTMLElement;

  const { capo, bad: capoBad } = clampCapo(song.meta.capo);
  // Capo 0 is the default; only show the chip when it changes what you play.
  if (capo > 0 || capoBad) {
    const chip = metaChip(chips, "guitar", capoBad ? `Capo ${song.meta.capo}→${capo}` : `Capo ${capo}`,
      capoBad ? `Invalid capo ${song.meta.capo}; clamped to ${capo}` : `Capo ${capo}`);
    if (capoBad) chip.addClass("ls-warn");
  }
  if (song.meta.tempo) metaChip(chips, "gauge", `${song.meta.tempo} BPM`, "Tempo");
  if (song.meta.time) metaChip(chips, "music-4", song.meta.time, "Time signature");
  const durationSec = Number(song.meta.duration) || 0;
  if (durationSec > 0) metaChip(chips, "timer", formatDuration(durationSec), "Duration");

  // --- transpose ---
  const getOffset = () => plugin.settings.offsets[sourcePath] ?? 0;
  const setOffset = async (n: number) => {
    if (n === 0) delete plugin.settings.offsets[sourcePath];
    else plugin.settings.offsets[sourcePath] = n;
    await plugin.saveSettings();
    redraw();
  };

  const tr = controlGroup(toolbar, "Transpose");
  const minus = iconButton(tr, "minus", "Transpose down", "−");
  const reset = tr.createEl("button", { cls: "ls-offset", attr: { type: "button", "aria-label": "Reset transpose" } });
  const plus = iconButton(tr, "plus", "Transpose up", "+");
  minus.onclick = () => setOffset(getOffset() - 1);
  plus.onclick = () => setOffset(getOffset() + 1);
  reset.onclick = () => setOffset(0);

  // --- capo shape toggle (only meaningful when a capo is set) ---
  if (capo > 0) {
    // A stable label with a pressed state: off shows sounding pitch.
    const modeBtn = tr.createEl("button", {
      cls: "ls-mode",
      text: "Shapes",
      attr: { type: "button", "aria-label": `Show capo shapes (capo ${capo})` },
    });
    const syncMode = () => pressed(modeBtn, plugin.settings.chordMode === "shapes");
    syncMode();
    modeBtn.onclick = async () => {
      plugin.settings.chordMode = plugin.settings.chordMode === "shapes" ? "sounding" : "shapes";
      await plugin.saveSettings();
      syncMode();
      redraw();
    };
  }

  // --- autoscroll ---
  const sc = controlGroup(toolbar, "Scroll");
  const slower = iconButton(sc, "chevron-down", "Scroll slower", "▾");
  const play = iconButton(sc, "play", "Toggle autoscroll", "▶");
  play.addClass("ls-play");
  const faster = iconButton(sc, "chevron-up", "Scroll faster", "▴");
  const speedOut = sc.createSpan({ cls: "ls-speed", attr: { "aria-label": "Scroll speed (px/s)" } });
  const updatePlay = () => {
    const on = plugin.isScrolling();
    setButtonIcon(play, on ? "pause" : "play", on ? "⏸" : "▶");
    pressed(play, on);
  };
  const updateSpeed = () => (speedOut.textContent = `${plugin.currentSpeed()}`);
  updatePlay();
  updateSpeed();
  play.onclick = () => {
    const scrollEl = scrollerOf(el);
    if (scrollEl) plugin.toggleAutoscroll(scrollEl, durationSec, el);
    updatePlay();
    updateSpeed();
  };
  slower.onclick = () => plugin.adjustSpeed(-5, hostBody);
  faster.onclick = () => plugin.adjustSpeed(5, hostBody);
  owner.registerDomEvent(hostBody, "leadsheet-scroll-stopped", () => {
    updatePlay();
    updateSpeed();
  });
  owner.registerDomEvent(hostBody, "leadsheet-speed-changed", updateSpeed);
  owner.register(() => plugin.releaseAutoscroll(el));

  // --- font size (global; drives --ls-font-scale) ---
  const setFont = async (scale: number) => {
    plugin.settings.fontScale = Math.min(3, Math.max(0.6, Math.round(scale * 10) / 10));
    hostBody.style.setProperty("--ls-font-scale", String(plugin.settings.fontScale));
    await plugin.saveSettings();
  };
  const fz = controlGroup(toolbar, null, "Font size");
  iconButton(fz, "a-arrow-down", "Font smaller", "A−").onclick = () =>
    setFont(plugin.settings.fontScale - 0.1);
  iconButton(fz, "a-arrow-up", "Font larger", "A+").onclick = () =>
    setFont(plugin.settings.fontScale + 0.1);

  // --- view toggles: alignment, diagram strip, performance mode ---
  const view = controlGroup(toolbar, null, "View");
  const alignBtn = iconButton(view, "align-left", "Center the sheet", "Left");
  const syncAlign = () => {
    const center = plugin.settings.align === "center";
    setButtonIcon(alignBtn, center ? "align-center" : "align-left", center ? "Center" : "Left");
    pressed(alignBtn, center);
  };
  syncAlign();
  alignBtn.onclick = async () => {
    plugin.settings.align = plugin.settings.align === "center" ? "left" : "center";
    hostBody.classList.toggle("leadsheet-align-center", plugin.settings.align === "center");
    await plugin.saveSettings();
    syncAlign();
  };

  const diaBtn = iconButton(view, "grid", "Toggle chord diagrams", "▦");
  pressed(diaBtn, plugin.settings.showDiagrams);
  diaBtn.onclick = async () => {
    plugin.settings.showDiagrams = !plugin.settings.showDiagrams;
    await plugin.saveSettings();
    pressed(diaBtn, plugin.settings.showDiagrams);
    redraw();
  };

  const perfBtn = iconButton(view, "maximize-2", "Toggle performance mode", "⛶");
  const syncPerf = () => {
    const on = plugin.isPerformanceMode();
    setButtonIcon(perfBtn, on ? "minimize-2" : "maximize-2", "⛶");
    pressed(perfBtn, on);
  };
  syncPerf();
  perfBtn.onclick = () => plugin.togglePerformanceMode();
  owner.registerDomEvent(hostBody, "leadsheet-perf-changed", syncPerf);

  function redraw() {
    plugin.closeChordPopover();
    const offset = getOffset();
    const shapeShift = plugin.settings.chordMode === "shapes" ? -capo : 0;
    const displayOffset = offset + shapeShift;
    const { key, useFlats } = transposeKey(song.meta.key, displayOffset);
    keyChip.toggleAttribute("hidden", !key);
    keyText.textContent = key ? `Key ${key}` : "";
    reset.textContent = offset > 0 ? `+${offset}` : `${offset}`;
    reset.toggleClass("ls-active", offset !== 0);
    // Diagram strip shows the grips as displayed — Shapes mode with a capo
    // gives the shapes your hands actually play.
    diagrams.empty();
    if (plugin.settings.showDiagrams) {
      const seen = new Set<string>();
      for (const raw of chordList) {
        const { name, shape } = chordDiagramData(raw, displayOffset, useFlats);
        if (seen.has(name)) continue;
        seen.add(name);
        if (shape) diagrams.appendChild(renderChordDiagram(name, shape, el.doc));
      }
    }
    body.empty();
    // Each section is a block (label + lines) so choruses and instrumental
    // bars can be styled as units; lines before the first label are untitled.
    let lines = body.createDiv({ cls: "ls-block" }).createDiv({ cls: "ls-lines" });
    for (const line of song.lines) {
      if (line.type === "section") {
        const block = body.createDiv({ cls: "ls-block", attr: { "data-section": sectionKind(line.name) } });
        block.createDiv({ cls: "ls-section" }).createSpan({ cls: "ls-section-label", text: line.name });
        lines = block.createDiv({ cls: "ls-lines" });
        continue;
      }
      renderLine(plugin, lines, line, displayOffset, useFlats);
    }
  }
  redraw();
}

function renderSetlist(
  plugin: LeadsheetPlugin,
  owner: Component,
  src: string,
  el: HTMLElement,
  sourcePath: string
) {
  el.addClass("leadsheet-setlist");
  const targets = parseSetlist(src);
  const nav = el.createDiv({ cls: "ls-setlist-nav" });
  const info = nav.createDiv({ cls: "ls-setlist-info" });
  const pos = info.createDiv({ cls: "ls-setlist-pos", attr: { "aria-live": "polite" } });
  const summary = info.createDiv({ cls: "ls-meta ls-setlist-summary" });
  const buttons = controlGroup(nav, null, "Song navigation");
  const anchors: HTMLElement[] = [];
  let cur = 0;
  let missing = 0;
  // Total duration accumulates as song files resolve; the label stays honest
  // about what is known so far rather than blocking on all reads.
  let knownSec = 0;
  let untimed = 0;
  const updateSummary = () =>
    (summary.textContent = summaryLabel(targets.length, missing, knownSec, untimed));
  const updatePos = () => {
    pos.empty();
    if (!targets.length) return;
    pos.createSpan({ cls: "ls-setlist-count", text: `${cur + 1}/${targets.length}` });
    pos.createSpan({ cls: "ls-setlist-current", text: targets[cur] });
  };

  targets.forEach((name, i) => {
    const dest = plugin.app.metadataCache.getFirstLinkpathDest(name, sourcePath);
    const songEl = el.createDiv({ cls: "ls-setlist-song" });
    anchors.push(songEl);
    const divider = songEl.createDiv({ cls: "ls-setlist-divider" });
    divider.createSpan({ cls: "ls-setlist-num", text: String(i + 1).padStart(2, "0") });
    // Clicking opens the song; an unresolved link offers to create it. A span
    // rather than an <a href> / .internal-link, so Obsidian's own link handler
    // does not navigate a second time (a known crash path on Android).
    const link = divider.createSpan({
      cls: dest ? "ls-setlist-link" : "ls-setlist-link is-unresolved",
      text: name,
      attr: { role: "link", tabindex: "0" },
    });
    const open = (event: MouseEvent | KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      void plugin.app.workspace.openLinkText(name, sourcePath, Keymap.isModEvent(event));
    };
    link.addEventListener("click", open);
    link.addEventListener("keydown", (event) => {
      if (event.key === "Enter") open(event);
    });
    if (!dest) {
      missing++;
      songEl.addClass("ls-setlist-missing");
      divider.createSpan({ cls: "ls-setlist-note", text: "Note not found — click to create" });
      return;
    }
    void plugin.app.vault.cachedRead(dest)
      .then((text: string) => {
        const sec = songDurationSec(text);
        if (sec) knownSec += sec;
        else untimed++;
        updateSummary();
        const m = text.match(SONG_BLOCK_RE);
        if (m) renderLeadsheet(plugin, owner, m[1], songEl.createDiv({ cls: "ls-nested" }), dest.path);
        else songEl.createDiv({ cls: "ls-meta", text: "No leadsheet block in this note." });
      })
      .catch(() => songEl.createDiv({ cls: "ls-meta ls-warn", text: "Failed to read song." }));
  });
  updateSummary();
  updatePos();

  // Follow manual scrolling: the current song is the last one whose top has
  // reached the reading line of whichever box scrolled (the note, or an embed
  // holding the set list). A capture listener on the document hears scrolls
  // from any of them; scroll events arrive at most once a frame. Prev/Next own
  // the position until 250ms after their glide's last frame: a long jump
  // passes other songs on the way, and a short final song never reaches the
  // line. Hidden renders (the other view mode) are skipped too, since every
  // top reads as 0 there.
  let navigating = false;
  const settle = debounce(() => (navigating = false), 250, true);
  owner.register(() => settle.cancel());
  const follow = (event: Event) => {
    const scroller = event.target as Node;
    if (navigating || !scroller.instanceOf(HTMLElement) || !scroller.contains(el) || !el.isShown()) return;
    const i = currentIndex(anchors.map((a) => a.getBoundingClientRect().top), readingLine(scroller));
    if (i !== cur) {
      cur = i;
      updatePos();
    }
  };

  // Listeners, observers and frames belong to the window the block is shown
  // in, so they attach on insertion. A block can render before it is attached,
  // in another window's document: a listener bound then never hears scrolls
  // in the popout it lands in.
  let win = el.win as Window & typeof globalThis;
  let unbind: (() => void) | null = null;
  const bind = () => {
    if (unbind && el.win === win) return;
    unbind?.();
    win = el.win as Window & typeof globalThis;
    const doc = el.doc;
    doc.addEventListener("scroll", follow, { capture: true });
    // Offsets below the bar follow its real height, which grows when the
    // summary wraps on a phone.
    const navSize = new win.ResizeObserver(() =>
      el.style.setProperty("--ls-setlist-nav-h", `${nav.offsetHeight}px`)
    );
    navSize.observe(nav);
    unbind = () => {
      doc.removeEventListener("scroll", follow, { capture: true });
      navSize.disconnect();
    };
  };
  owner.register(el.onNodeInserted(bind));
  owner.register(() => unbind?.());

  // Prev/Next glide the song to just below the bar. Driven per frame because
  // Reading view unloads sections above the set list mid-scroll, which cancels
  // native smooth scrolling; re-measuring every frame also absorbs that shift.
  let glide = 0;
  owner.register(() => win.cancelAnimationFrame(glide));
  const scrollToSong = (target: HTMLElement) => {
    const scroller = scrollerOf(el);
    if (!scroller) return;
    // Where the song's top lands. The bar pins inside the scroller's top
    // padding, which a CSS scroll margin cannot see, so measure both.
    const landAt = scroller.getBoundingClientRect().top +
      parseFloat(win.getComputedStyle(scroller).paddingTop) + nav.offsetHeight + 8;
    const from = scroller.scrollTop;
    const ms = win.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300;
    let start = 0;
    const frame = (ts: number) => {
      if (!start) start = ts;
      const t = ms ? Math.min(1, (ts - start) / ms) : 1;
      const dest = scroller.scrollTop + target.getBoundingClientRect().top - landAt;
      scroller.scrollTop = from + (dest - from) * (1 - (1 - t) ** 3);
      settle();
      glide = t < 1 ? win.requestAnimationFrame(frame) : 0;
    };
    win.cancelAnimationFrame(glide);
    glide = win.requestAnimationFrame(frame);
  };

  // Navigating always stops autoscroll so playback never bleeds into the next song.
  const go = (i: number) => {
    plugin.stopAutoscroll();
    cur = i;
    navigating = true;
    settle();
    updatePos();
    if (anchors[cur]) scrollToSong(anchors[cur]);
  };
  iconButton(buttons, "chevron-left", "Previous song", "◀").onclick =
    () => go(prevIndex(cur, anchors.length));
  iconButton(buttons, "chevron-right", "Next song", "▶").onclick =
    () => go(nextIndex(cur, anchors.length));
}

// A metadata chip: a Lucide icon + value, e.g. ♪ Key C. `label` sets aria-label
// for screen readers (the icon alone conveys nothing). Unknown icon ids render
// blank, so the text stays legible regardless of the Obsidian version's icon set.
function metaChip(parent: HTMLElement, icon: string, text: string, label: string): HTMLElement {
  const chip = parent.createSpan({ cls: "ls-meta ls-chip", attr: { "aria-label": label } });
  setIcon(chip.createSpan({ cls: "ls-chip-icon" }), icon);
  chip.createSpan({ cls: "ls-chip-text", text });
  return chip;
}

// A segmented control group. A visible label doubles as the group's
// accessible name; self-explanatory icon clusters pass null and a name only.
function controlGroup(parent: HTMLElement, label: string | null, name = label): HTMLElement {
  const group = parent.createDiv({ cls: "ls-controls", attr: { role: "group" } });
  if (name) group.setAttr("aria-label", name);
  if (label) group.createSpan({ cls: "ls-group-label", text: label, attr: { "aria-hidden": "true" } });
  return group;
}

function iconButton(parent: HTMLElement, icon: string, label: string, fallback: string): HTMLButtonElement {
  const btn = parent.createEl("button", { cls: "ls-icon-btn", attr: { type: "button", "aria-label": label } });
  setButtonIcon(btn, icon, fallback);
  return btn;
}

// Icon sets differ across Obsidian versions; fall back to a text glyph rather
// than leaving an empty button.
function setButtonIcon(btn: HTMLElement, icon: string, fallback: string) {
  btn.empty();
  setIcon(btn, icon);
  if (!btn.querySelector("svg")) btn.setText(fallback);
}

function pressed(btn: HTMLElement, on: boolean) {
  btn.toggleClass("ls-active", on);
  btn.setAttr("aria-pressed", String(on));
}

function renderLine(
  plugin: LeadsheetPlugin,
  parent: HTMLElement,
  line: SongLine,
  offset: number,
  useFlats: boolean
) {
  if (line.type === "empty") {
    parent.createDiv({ cls: "ls-gap" });
    return;
  }
  if (line.type === "section") return; // sections open blocks in redraw()
  const hasChords = line.segments.some((s) => s.chord !== null);
  const div = parent.createDiv({ cls: "ls-line" });
  if (!hasChords) {
    div.addClass("ls-lyric-only");
    div.setText(line.segments.map((s) => s.text).join(""));
    return;
  }
  // Chord-only lines (bar lines like "| [C] [G/B] |") render as a measure
  // grid instead of stacking chords above empty lyrics.
  if (line.segments.every((s) => /^[\s|.·:]*$/.test(s.text))) {
    renderBars(plugin, div, line.segments, offset, useFlats);
    return;
  }
  for (const seg of line.segments) {
    const span = div.createSpan({ cls: "ls-seg" });
    if (seg.chord) renderChord(plugin, span, seg.chord, offset, useFlats);
    else span.createSpan({ cls: "ls-chord" });
    span.createSpan({ cls: "ls-lyric", text: seg.text || " " });
  }
}

function renderBars(
  plugin: LeadsheetPlugin,
  div: HTMLElement,
  segments: Segment[],
  offset: number,
  useFlats: boolean
) {
  div.addClass("ls-barline");
  for (const token of barTokens(segments)) {
    if ("pipe" in token) {
      div.createSpan({ cls: "ls-pipe", text: token.pipe, attr: { "aria-hidden": "true" } });
      continue;
    }
    const bar = div.createSpan({ cls: "ls-bar" });
    for (const item of token.bar) {
      if ("chord" in item) renderChord(plugin, bar, item.chord, offset, useFlats);
      else bar.createSpan({ cls: "ls-mark", text: item.mark });
    }
  }
}

function renderChord(
  plugin: LeadsheetPlugin,
  parent: HTMLElement,
  chord: string,
  offset: number,
  useFlats: boolean
) {
  const { name, shape } = chordDiagramData(chord, offset, useFlats);
  if (!shape) {
    parent.createSpan({ cls: "ls-chord", text: name });
    return;
  }

  const chordEl = parent.createSpan({ cls: "ls-chord" });
  const trigger = chordEl.createEl("button", {
    cls: "ls-chord-trigger",
    text: name,
    attr: { type: "button", "aria-label": `${name} chord diagram` },
  });
  const popover = trigger.createSpan({ cls: "ls-chord-popover", attr: { role: "tooltip" } });
  popover.appendChild(renderChordDiagram(name, shape, parent.doc));
  const resetHoverDismissal = () => trigger.removeClass("ls-popover-dismissed");
  trigger.addEventListener("pointerenter", resetHoverDismissal);
  trigger.addEventListener("pointerleave", resetHoverDismissal);
  trigger.addEventListener("click", () => {
    if (!plugin.toggleChordPopover(trigger)) trigger.blur();
  });
  trigger.addEventListener("blur", () => plugin.closeChordPopover());
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    plugin.closeChordPopover(true);
    trigger.blur();
  });
}

// --- chord diagrams (SVG lives here with the rest of the DOM code; the shape
// lookup in diagrams.ts stays pure for node tests) ---

const SVG_NS = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: SVGElement | null,
  doc = parent?.doc ?? activeDocument
): SVGElementTagNameMap[K] {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

function renderChordDiagram(name: string, shape: ChordShape, doc: Document): SVGSVGElement {
  const X = (s: number) => 8 + 8 * s; // string index -> x
  const TOP = 18, ROW = 11, BOTTOM = TOP + 4 * ROW;
  const rowY = (fret: number) => TOP + (fret - shape.baseFret + 0.5) * ROW;
  const stroke = { stroke: "currentColor", "stroke-width": 0.75 };

  const root = svg(
    "svg",
    { viewBox: "0 0 60 70", class: "ls-diagram", role: "img", "aria-label": `${name} chord diagram` },
    null,
    doc
  );
  svg("text", { x: X(2.5), y: 8, "text-anchor": "middle", "font-size": 8, class: "ls-diagram-name", fill: "currentColor" }, root).textContent = name;

  for (let i = 0; i <= 4; i++)
    svg("line", { x1: X(0), x2: X(5), y1: TOP + i * ROW, y2: TOP + i * ROW, ...stroke }, root);
  for (let s = 0; s < 6; s++)
    svg("line", { x1: X(s), x2: X(s), y1: TOP, y2: BOTTOM, ...stroke }, root);

  if (shape.baseFret === 1)
    svg("rect", { x: X(0) - 0.4, y: TOP - 1.5, width: X(5) - X(0) + 0.8, height: 2, fill: "currentColor" }, root);
  else
    svg("text", { x: X(5) + 2, y: TOP + 4.5, "font-size": 5, fill: "currentColor" }, root).textContent = `${shape.baseFret}fr`;

  shape.frets.forEach((f, s) => {
    if (f === -1)
      svg("text", { x: X(s), y: 15, "text-anchor": "middle", "font-size": 6, fill: "currentColor" }, root).textContent = "×";
    else if (f === 0) svg("circle", { cx: X(s), cy: 13.5, r: 1.7, fill: "none", ...stroke }, root);
  });

  const b = shape.barre;
  if (b)
    svg("rect", { x: X(b.from) - 2.8, y: rowY(b.fret) - 2, width: X(b.to) - X(b.from) + 5.6, height: 4, rx: 2, fill: "currentColor" }, root);
  shape.frets.forEach((f, s) => {
    if (f <= 0 || (b && f === b.fret && s >= b.from && s <= b.to)) return;
    svg("circle", { cx: X(s), cy: rowY(f), r: 2.6, fill: "currentColor" }, root);
  });
  return root;
}

const INVALID_MARK = Decoration.mark({ class: "ls-invalid-chord" });
const CHORD_TOKEN_G = /\[([^\]]+)\]/g;

function buildInvalidChordDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const text = view.state.doc.toString();
  let inFence = false;
  let offset = 0;
  for (const line of text.split("\n")) {
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      inFence = fence[1] === "leadsheet" ? true : inFence && false;
      offset += line.length + 1;
      continue;
    }
    if (inFence) {
      let m: RegExpExecArray | null;
      CHORD_TOKEN_G.lastIndex = 0;
      while ((m = CHORD_TOKEN_G.exec(line))) {
        if (!isValidChord(m[1])) {
          const from = offset + m.index;
          builder.add(from, from + m[0].length, INVALID_MARK);
        }
      }
    }
    offset += line.length + 1;
  }
  return builder.finish();
}

// Song notes are short enough to rescan after edits or viewport changes.
function leadsheetLinter(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildInvalidChordDecos(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = buildInvalidChordDecos(u.view);
      }
    },
    { decorations: (v) => v.decorations }
  );
}

class LeadsheetSettingTab extends PluginSettingTab {
  plugin: LeadsheetPlugin;

  constructor(app: App, plugin: LeadsheetPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName("Autoscroll speed")
      .setDesc("Pixels per second")
      .addSlider((s) =>
        s
          .setLimits(5, 120, 5)
          .setValue(this.plugin.settings.scrollSpeed)
          .onChange(async (v) => {
            this.plugin.settings.scrollSpeed = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Font size")
      .setDesc("Leadsheet text scale (also the A− / A+ toolbar buttons)")
      .addSlider((s) =>
        s
          .setLimits(0.6, 3, 0.1)
          .setValue(this.plugin.settings.fontScale)
          .onChange(async (v) => {
            this.plugin.settings.fontScale = v;
            this.containerEl.doc.body.style.setProperty("--ls-font-scale", String(v));
            await this.plugin.saveSettings();
          })
      );

    new Setting(this.containerEl)
      .setName("Alignment")
      .setDesc("How the sheet is aligned in the pane")
      .addDropdown((d) =>
        d
          .addOptions({ left: "Left", center: "Center" })
          .setValue(this.plugin.settings.align)
          .onChange(async (v) => {
            this.plugin.settings.align = v as "left" | "center";
            this.containerEl.doc.body.classList.toggle("leadsheet-align-center", v === "center");
            await this.plugin.saveSettings();
          })
      );
  }
}
