import { App, MarkdownView, Plugin, PluginSettingTab, Setting } from "obsidian";
import { parse, Song, SongLine, transposeChord, transposeKey, isValidChord } from "./parser";
import { clampCapo, scrollSpeedForDuration } from "./viewutils";
import { Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { chordsOverLyricsToInline } from "./convert";
import { parseSetlist, nextIndex, prevIndex } from "./setlist";
import { ChordShape, shapeForChord, uniqueChords } from "./diagrams";

interface LeadsheetSettings {
  scrollSpeed: number; // px per second (manual fallback)
  offsets: Record<string, number>; // per-file transpose offset
  fontScale: number; // global leadsheet font multiplier
  chordMode: "sounding" | "shapes";
  showDiagrams: boolean;
}

const DEFAULT_SETTINGS: LeadsheetSettings = {
  scrollSpeed: 20,
  offsets: {},
  fontScale: 1,
  chordMode: "sounding",
  showDiagrams: false,
};

export default class LeadsheetPlugin extends Plugin {
  settings: LeadsheetSettings = DEFAULT_SETTINGS;
  private scrollEl: HTMLElement | null = null;
  private scrollRaf = 0;

  async onload() {
    await this.loadSettings();
    document.body.style.setProperty("--ls-font-scale", String(this.settings.fontScale));

    this.registerMarkdownCodeBlockProcessor("leadsheet", (src, el, ctx) => {
      renderLeadsheet(this, src, el, ctx.sourcePath);
    });

    this.registerMarkdownCodeBlockProcessor("setlist", (src, el, ctx) => {
      renderSetlist(this, src, el, ctx.sourcePath);
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
      callback: () => document.body.classList.toggle("leadsheet-perf"),
    });

    this.addCommand({
      id: "toggle-autoscroll",
      name: "Toggle autoscroll",
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const el = view?.containerEl.querySelector(
          ".markdown-preview-view, .cm-scroller"
        ) as HTMLElement | null;
        if (el) this.toggleAutoscroll(el);
      },
    });

    this.addSettingTab(new LeadsheetSettingTab(this.app, this));
    this.registerEditorExtension(leadsheetLinter());
  }

  onunload() {
    this.stopAutoscroll();
    document.body.classList.remove("leadsheet-perf");
  }

  isScrolling(): boolean {
    return this.scrollEl !== null;
  }

  // ponytail: duration drives scroll — tempo alone can't set scroll distance without bar counts, and duration "just works per song." No duration set -> manual px/s fallback.
  toggleAutoscroll(el: HTMLElement, durationSec = 0) {
    if (this.scrollEl) {
      this.stopAutoscroll();
      return;
    }
    this.scrollEl = el;
    const derived = scrollSpeedForDuration(el.scrollHeight - el.clientHeight, durationSec);
    const speed = derived > 0 ? derived : this.settings.scrollSpeed;
    let pos = el.scrollTop;
    let lastTs = 0;
    const step = (ts: number) => {
      if (!this.scrollEl) return;
      if (lastTs) {
        pos += (speed * (ts - lastTs)) / 1000;
        this.scrollEl.scrollTop = pos;
        // stop at the bottom
        if (pos >= this.scrollEl.scrollHeight - this.scrollEl.clientHeight) {
          this.stopAutoscroll();
          return;
        }
      }
      lastTs = ts;
      this.scrollRaf = requestAnimationFrame(step);
    };
    this.scrollRaf = requestAnimationFrame(step);
  }

  stopAutoscroll() {
    if (this.scrollRaf) cancelAnimationFrame(this.scrollRaf);
    this.scrollRaf = 0;
    this.scrollEl = null;
    document.body.dispatchEvent(new CustomEvent("leadsheet-scroll-stopped"));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

function renderLeadsheet(
  plugin: LeadsheetPlugin,
  src: string,
  el: HTMLElement,
  sourcePath: string
) {
  const song = parse(src);
  // Frontmatter is the metadata source of truth; block directives override.
  const fm = plugin.app.metadataCache.getCache(sourcePath)?.frontmatter ?? {};
  for (const k of ["title", "artist", "key", "capo", "tempo", "time", "duration"]) {
    if (song.meta[k] === undefined && fm[k] != null && fm[k] !== "")
      song.meta[k] = String(fm[k]);
  }
  el.addClass("leadsheet");

  const toolbar = el.createDiv({ cls: "ls-toolbar" });
  const diagrams = el.createDiv({ cls: "ls-diagrams" });
  const body = el.createDiv({ cls: "ls-body" });
  const chordList = uniqueChords(song);
  // ponytail: pause only — resume is the ▶ button. A tap that also had to distinguish select/scroll intent is more than a stage needs.
  body.addEventListener("click", () => {
    if (plugin.isScrolling()) plugin.stopAutoscroll();
  });

  // --- metadata ---
  const titleBox = toolbar.createDiv({ cls: "ls-titlebox" });
  if (song.meta.title) titleBox.createSpan({ cls: "ls-title", text: song.meta.title });
  if (song.meta.artist) titleBox.createSpan({ cls: "ls-meta", text: song.meta.artist });

  const keyLabel = toolbar.createSpan({ cls: "ls-meta ls-key" });
  const { capo, bad: capoBad } = clampCapo(song.meta.capo);
  if (song.meta.capo)
    toolbar.createSpan({
      cls: capoBad ? "ls-meta ls-warn" : "ls-meta",
      text: capoBad ? `⚠ Capo ${song.meta.capo}→${capo}` : `Capo ${capo}`,
      attr: capoBad ? { "aria-label": `Invalid capo ${song.meta.capo}; clamped to ${capo}` } : {},
    });
  if (song.meta.tempo) toolbar.createSpan({ cls: "ls-meta", text: `♩=${song.meta.tempo}` });
  if (song.meta.time) toolbar.createSpan({ cls: "ls-meta", text: song.meta.time });

  // --- transpose controls ---
  const getOffset = () => plugin.settings.offsets[sourcePath] ?? 0;
  const setOffset = async (n: number) => {
    if (n === 0) delete plugin.settings.offsets[sourcePath];
    else plugin.settings.offsets[sourcePath] = n;
    await plugin.saveSettings();
    redraw();
  };

  const tr = toolbar.createDiv({ cls: "ls-controls" });
  const minus = tr.createEl("button", { text: "−", attr: { "aria-label": "Transpose down" } });
  const reset = tr.createEl("button", { cls: "ls-offset" });
  const plus = tr.createEl("button", { text: "+", attr: { "aria-label": "Transpose up" } });
  minus.onclick = () => setOffset(getOffset() - 1);
  plus.onclick = () => setOffset(getOffset() + 1);
  reset.onclick = () => setOffset(0);

  // --- capo shape toggle (only meaningful when a capo is set) ---
  if (capo > 0) {
    const modeBtn = toolbar.createEl("button", { cls: "ls-mode", attr: { "aria-label": "Toggle chord display" } });
    const syncMode = () => (modeBtn.textContent = plugin.settings.chordMode === "shapes" ? "Shapes" : "Sounding");
    syncMode();
    modeBtn.onclick = async () => {
      plugin.settings.chordMode = plugin.settings.chordMode === "shapes" ? "sounding" : "shapes";
      await plugin.saveSettings();
      syncMode();
      redraw();
    };
  }

  // --- chord diagram toggle ---
  const diaBtn = toolbar.createEl("button", {
    text: "▦",
    cls: "ls-mode",
    attr: { "aria-label": "Toggle chord diagrams" },
  });
  const syncDia = () => diaBtn.toggleClass("ls-active", plugin.settings.showDiagrams);
  syncDia();
  diaBtn.onclick = async () => {
    plugin.settings.showDiagrams = !plugin.settings.showDiagrams;
    await plugin.saveSettings();
    syncDia();
    redraw();
  };

  // --- autoscroll controls ---
  const sc = toolbar.createDiv({ cls: "ls-controls" });
  const slower = sc.createEl("button", { text: "▾", attr: { "aria-label": "Scroll slower" } });
  const play = sc.createEl("button", { attr: { "aria-label": "Toggle autoscroll" } });
  const faster = sc.createEl("button", { text: "▴", attr: { "aria-label": "Scroll faster" } });
  const updatePlay = () => (play.textContent = plugin.isScrolling() ? "⏸" : "▶");
  updatePlay();
  play.onclick = () => {
    const scrollEl = el.closest(".markdown-preview-view, .cm-scroller") as HTMLElement | null;
    if (scrollEl) plugin.toggleAutoscroll(scrollEl, Number(song.meta.duration) || 0);
    updatePlay();
  };
  slower.onclick = async () => {
    plugin.settings.scrollSpeed = Math.max(5, plugin.settings.scrollSpeed - 5);
    await plugin.saveSettings();
  };
  faster.onclick = async () => {
    plugin.settings.scrollSpeed += 5;
    await plugin.saveSettings();
  };
  plugin.registerDomEvent(document.body, "leadsheet-scroll-stopped" as any, updatePlay);

  // --- font-size controls (global; drives --ls-font-scale) ---
  const setFont = async (scale: number) => {
    plugin.settings.fontScale = Math.min(3, Math.max(0.6, Math.round(scale * 10) / 10));
    document.body.style.setProperty("--ls-font-scale", String(plugin.settings.fontScale));
    await plugin.saveSettings();
  };
  const fz = toolbar.createDiv({ cls: "ls-controls" });
  fz.createEl("button", { text: "A−", attr: { "aria-label": "Font smaller" } }).onclick = () =>
    setFont(plugin.settings.fontScale - 0.1);
  fz.createEl("button", { text: "A+", attr: { "aria-label": "Font larger" } }).onclick = () =>
    setFont(plugin.settings.fontScale + 0.1);

  function redraw() {
    const offset = getOffset();
    const shapeShift = plugin.settings.chordMode === "shapes" ? -capo : 0;
    const displayOffset = offset + shapeShift;
    const { key, useFlats } = transposeKey(song.meta.key, displayOffset);
    keyLabel.textContent = key ? `Key ${key}` : "";
    reset.textContent = offset > 0 ? `+${offset}` : `${offset}`;
    reset.toggleClass("ls-active", offset !== 0);
    // Diagram strip shows the grips as displayed — Shapes mode with a capo
    // gives the shapes your hands actually play.
    diagrams.empty();
    if (plugin.settings.showDiagrams) {
      const seen = new Set<string>();
      for (const raw of chordList) {
        const name = transposeChord(raw, displayOffset, useFlats);
        if (seen.has(name)) continue;
        seen.add(name);
        const shape = shapeForChord(name);
        if (shape) diagrams.appendChild(renderChordDiagram(name, shape));
      }
    }
    body.empty();
    for (const line of song.lines) renderLine(body, line, displayOffset, useFlats);
  }
  redraw();
}

const SONG_BLOCK_RE = /```leadsheet\r?\n([\s\S]*?)```/;

// ponytail: cachedRead + reuse renderLeadsheet per song — no new render path. Nav is Prev/Next buttons on the block; add hotkey commands only if gigging needs foot-pedal keys.
function renderSetlist(plugin: LeadsheetPlugin, src: string, el: HTMLElement, sourcePath: string) {
  el.addClass("leadsheet-setlist");
  const targets = parseSetlist(src);
  const nav = el.createDiv({ cls: "ls-setlist-nav" });
  const anchors: HTMLElement[] = [];
  let cur = 0;

  targets.forEach((name) => {
    const dest = plugin.app.metadataCache.getFirstLinkpathDest(name, sourcePath);
    const songEl = el.createDiv({ cls: "ls-setlist-song" });
    anchors.push(songEl);
    if (!dest) {
      songEl.createDiv({ cls: "ls-meta ls-warn", text: `⚠ song not found: ${name}` });
      return;
    }
    songEl.createDiv({ cls: "ls-section", text: name });
    plugin.app.vault.cachedRead(dest as any).then((text: string) => {
      const m = text.match(SONG_BLOCK_RE);
      if (m) renderLeadsheet(plugin, m[1], songEl.createDiv(), dest.path);
      else songEl.createDiv({ cls: "ls-meta", text: "(no leadsheet block)" });
    });
  });

  const go = (i: number) => {
    cur = i;
    anchors[cur]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  nav.createEl("button", { text: "◀ Prev" }).onclick = () => go(prevIndex(cur, anchors.length));
  nav.createEl("button", { text: "Next ▶" }).onclick = () => go(nextIndex(cur, anchors.length));
}

function renderLine(parent: HTMLElement, line: SongLine, offset: number, useFlats: boolean) {
  if (line.type === "empty") {
    parent.createDiv({ cls: "ls-gap" });
    return;
  }
  if (line.type === "section") {
    parent.createDiv({ cls: "ls-section", text: line.name });
    return;
  }
  const hasChords = line.segments.some((s) => s.chord !== null);
  const div = parent.createDiv({ cls: "ls-line" });
  if (!hasChords) {
    div.setText(line.segments.map((s) => s.text).join(""));
    return;
  }
  // Chord-only lines (bar lines like "| [C] [G/B] |"): render chords inline
  // between the pipes instead of stacking them above.
  if (line.segments.every((s) => /^[\s|.·:]*$/.test(s.text))) {
    div.addClass("ls-barline");
    for (const seg of line.segments) {
      if (seg.chord)
        div.createSpan({ cls: "ls-chord", text: transposeChord(seg.chord, offset, useFlats) });
      if (seg.text) div.createSpan({ text: seg.text });
    }
    return;
  }
  for (const seg of line.segments) {
    const span = div.createSpan({ cls: "ls-seg" });
    span.createSpan({
      cls: "ls-chord",
      text: seg.chord ? transposeChord(seg.chord, offset, useFlats) : "",
    });
    span.createSpan({ cls: "ls-lyric", text: seg.text || " " });
  }
}

// --- chord diagrams (SVG lives here with the rest of the DOM code; the shape
// lookup in diagrams.ts stays pure for node tests) ---
// ponytail: split into a diagramview.ts if diagrams grow lefty flip or alternate tunings.

const SVG_NS = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: SVGElement | null
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

function renderChordDiagram(name: string, shape: ChordShape): SVGSVGElement {
  const X = (s: number) => 8 + 8 * s; // string index -> x
  const TOP = 18, ROW = 11, BOTTOM = TOP + 4 * ROW;
  const rowY = (fret: number) => TOP + (fret - shape.baseFret + 0.5) * ROW;
  const stroke = { stroke: "currentColor", "stroke-width": 0.75 };

  const root = svg(
    "svg",
    { viewBox: "0 0 60 70", class: "ls-diagram", role: "img", "aria-label": `${name} chord diagram` },
    null
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
          const from = offset + (m.index as number);
          builder.add(from, from + m[0].length, INVALID_MARK);
        }
      }
    }
    offset += line.length + 1;
  }
  return builder.finish();
}

// ponytail: full-document rescan per edit — a song note is short, so O(doc) is free. If someone edits a 10k-line note, switch to viewport-only ranges.
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
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.scrollSpeed = v;
            await this.plugin.saveSettings();
          })
      );
  }
}
