import type { Segment } from "./parser";

export function clampCapo(raw: string | undefined): { capo: number; bad: boolean } {
  if (raw == null || raw === "") return { capo: 0, bad: false };
  const n = parseInt(raw, 10);
  if (isNaN(n)) return { capo: 0, bad: true };
  const capo = Math.min(Math.max(n, 0), 11);
  return { capo, bad: capo !== n };
}

export function scrollSpeedForDuration(contentPx: number, durationSec: number): number {
  return durationSec > 0 ? contentPx / durationSec : 0;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Size {
  width: number;
  height: number;
}

export function chordPopoverPlacement(
  trigger: Bounds,
  popover: Size,
  viewport: Size,
  margin = 8,
  gap = 9
): { shiftX: number; below: boolean } {
  const idealLeft = (trigger.left + trigger.right - popover.width) / 2;
  const maxLeft = viewport.width - margin - popover.width;
  const left = maxLeft < margin
    ? margin
    : Math.min(Math.max(idealLeft, margin), maxLeft);
  const above = trigger.top - margin;
  const below = viewport.height - trigger.bottom - margin;
  return {
    shiftX: left - idealLeft,
    below: above < popover.height + gap && below > above,
  };
}

export function shouldHoldWakeLock(
  performanceMode: boolean,
  visibilityState: DocumentVisibilityState,
  supported: boolean
): boolean {
  return performanceMode && visibilityState === "visible" && supported;
}

export type SectionKind = "verse" | "prechorus" | "chorus" | "bridge" | "instrumental" | "other";

// Coarse section role from its label, so choruses and instrumental bars can be
// styled distinctly. Unknown labels stay "other" and render neutrally.
export function sectionKind(name: string): SectionKind {
  const n = name.trim().toLowerCase();
  if (/^pre[-\s]?chorus/.test(n)) return "prechorus";
  if (/^(chorus|refrain|副歌)/.test(n)) return "chorus";
  if (/^(verse|主歌)/.test(n)) return "verse";
  if (/^(bridge|桥段|橋段)/.test(n)) return "bridge";
  if (/^(intro|outro|interlude|instrumental|solo|coda|ending|tag|前奏|间奏|間奏|尾奏)/.test(n))
    return "instrumental";
  return "other";
}

export type BarItem = { chord: string } | { mark: string };
export type BarToken = { pipe: string } | { bar: BarItem[] };

// Groups a chord-only line ("|: [C] [G/B] | [Am] . :|") into bar-line tokens
// and measures. Adjacent pipes merge ("||"), colons touching a pipe become
// repeat signs, and other marks (".", "·") stay inside their measure.
export function barTokens(segments: Segment[]): BarToken[] {
  const out: BarToken[] = [];
  let bar: BarItem[] | null = null;
  let colon = false;
  let prev = "";
  const push = (item: BarItem) => {
    if (colon) {
      colon = false;
      push({ mark: ":" });
    }
    if (!bar) out.push({ bar: (bar = []) });
    bar.push(item);
  };
  for (const seg of segments) {
    if (seg.chord) {
      push({ chord: seg.chord });
      prev = "]";
    }
    for (const ch of seg.text) {
      const last = out[out.length - 1];
      if (ch === "|") {
        if (!bar && last && "pipe" in last && prev === "|") last.pipe += "|";
        else out.push({ pipe: colon ? ":|" : "|" });
        colon = false;
        bar = null;
      } else if (ch === ":") {
        if (!bar && last && "pipe" in last && prev === "|") last.pipe += ":";
        else colon = true;
      } else if (ch.trim()) {
        push({ mark: ch });
      }
      prev = ch;
    }
  }
  if (colon) push({ mark: ":" });
  return out;
}
