import { CHORD_RE, NOTE_INDEX, Song } from "./parser";

// Guitar fingering shapes (standard tuning EADGBE). Pure lookup — the SVG
// drawing lives with the rest of the DOM code in main.ts.

export interface ChordShape {
  frets: number[]; // 6 entries, low E -> high E; -1 muted, 0 open, n = absolute fret
  baseFret: number; // 1 = open position; >1 renders an "Nfr" label instead of the nut
  barre?: { fret: number; from: number; to: number }; // string indexes 0 (low E) - 5 (high E)
}

// Open-position shapes, keyed `${pitchClass}|${quality}` (C=0 … B=11),
// encoded low E -> high E, `x` = muted. All fit the 4-fret grid at baseFret 1.
const OPEN_SHAPES: Record<string, string> = {
  "0|": "x32010", "9|": "x02220", "7|": "320003", "4|": "022100", "2|": "xx0232",
  "9|m": "x02210", "4|m": "022000", "2|m": "xx0231",
  "0|7": "x32310", "9|7": "x02020", "11|7": "x21202", "2|7": "xx0212", "4|7": "020100", "7|7": "320001",
  "9|m7": "x02010", "4|m7": "020000", "2|m7": "xx0211",
  "0|maj7": "x32000", "9|maj7": "x02120", "2|maj7": "xx0222", "4|maj7": "021100", "5|maj7": "xx3210", "7|maj7": "320002",
  "9|sus4": "x02230", "2|sus4": "xx0233", "4|sus4": "022200",
  "9|sus2": "x02200", "2|sus2": "xx0230",
  "9|7sus4": "x02030", "2|7sus4": "xx0213", "4|7sus4": "020200",
  "0|add9": "x32030",
};

// Movable shapes: offsets are relative to the root fret on `rootString`
// (0 = low E, 1 = A, 2 = D); -1 = muted. Barred strings sit on the root fret.
interface MovableTemplate {
  rootString: number;
  offsets: number[];
  barre?: { from: number; to: number };
}

const OPEN_PC = [4, 9, 2]; // pitch class of the open E, A, D strings

const MOVABLE: Record<string, MovableTemplate[]> = {
  "": [
    { rootString: 0, offsets: [0, 2, 2, 1, 0, 0], barre: { from: 0, to: 5 } },
    { rootString: 1, offsets: [-1, 0, 2, 2, 2, 0], barre: { from: 1, to: 5 } },
  ],
  m: [
    { rootString: 0, offsets: [0, 2, 2, 0, 0, 0], barre: { from: 0, to: 5 } },
    { rootString: 1, offsets: [-1, 0, 2, 2, 1, 0], barre: { from: 1, to: 5 } },
  ],
  "7": [
    { rootString: 0, offsets: [0, 2, 0, 1, 0, 0], barre: { from: 0, to: 5 } },
    { rootString: 1, offsets: [-1, 0, 2, 0, 2, 0], barre: { from: 1, to: 5 } },
  ],
  m7: [
    { rootString: 0, offsets: [0, 2, 0, 0, 0, 0], barre: { from: 0, to: 5 } },
    { rootString: 1, offsets: [-1, 0, 2, 0, 1, 0], barre: { from: 1, to: 5 } },
  ],
  maj7: [{ rootString: 1, offsets: [-1, 0, 2, 1, 2, 0], barre: { from: 1, to: 5 } }],
  sus4: [
    { rootString: 0, offsets: [0, 2, 2, 2, 0, 0], barre: { from: 0, to: 5 } },
    { rootString: 1, offsets: [-1, 0, 2, 2, 3, 0], barre: { from: 1, to: 5 } },
  ],
  sus2: [{ rootString: 1, offsets: [-1, 0, 2, 2, 0, 0], barre: { from: 1, to: 5 } }],
  "5": [
    { rootString: 0, offsets: [0, 2, 2, -1, -1, -1] },
    { rootString: 1, offsets: [-1, 0, 2, 2, -1, -1] },
  ],
  "6": [{ rootString: 1, offsets: [-1, 0, 2, 2, 2, 2], barre: { from: 1, to: 5 } }],
  m6: [{ rootString: 2, offsets: [-1, -1, 0, 2, 0, 1] }],
  dim: [{ rootString: 2, offsets: [-1, -1, 0, 1, 3, 1] }],
  dim7: [{ rootString: 2, offsets: [-1, -1, 0, 1, 0, 1] }],
  m7b5: [{ rootString: 2, offsets: [-1, -1, 0, 1, 1, 1] }],
  aug: [{ rootString: 0, offsets: [0, 3, 2, 1, -1, -1] }],
};

function normalizeQuality(q: string): string {
  q = q.trim()
    .replace(/^(minor|min|mi(?![a-z])|-)/, "m")
    .replace(/^(Ma|M|maj|Δ|\^)(?=7|9|11|13)/, "maj")
    .replace(/^(°|o)(?=7|$)/, "dim")
    .replace(/^ø7?$/, "m7b5");
  if (q === "+") return "aug";
  if (q === "maj" || q === "M") return "";
  if (q === "sus") return "sus4";
  if (q === "2") return "sus2";
  return q;
}

// One coarse step down the quality-family ladder; null = give up. Never falls
// back to a bare major triad for an unrecognized quality.
// ponytail: family mapping is deliberately coarse (C13 gets the C7 grip) — add finer shapes per request.
function degradeQuality(q: string): string | null {
  if (/^maj/.test(q)) return q === "maj7" ? null : "maj7";
  if (/^m(?!aj)/.test(q)) return q === "m" ? null : q === "m7" ? "m" : "m7";
  if (/^7?sus/.test(q)) return q.startsWith("7") ? q.slice(1) : null;
  if (/^add/.test(q)) return "";
  if (/^(6|9|11|13)/.test(q) || q.includes("7")) return q === "7" ? null : "7";
  return null;
}

function lookup(pc: number, quality: string): ChordShape | null {
  const open = OPEN_SHAPES[`${pc}|${quality}`];
  if (open) {
    return { frets: [...open].map((c) => (c === "x" ? -1 : Number(c))), baseFret: 1 };
  }
  const templates = MOVABLE[quality];
  if (!templates) return null;
  let best: ChordShape | null = null;
  for (const t of templates) {
    let rootFret = (pc - OPEN_PC[t.rootString] + 12) % 12;
    if (rootFret === 0) rootFret = 12; // the open version, if any, lives in OPEN_SHAPES
    if (best && rootFret >= best.baseFret) continue;
    best = {
      frets: t.offsets.map((o) => (o < 0 ? -1 : rootFret + o)),
      baseFret: rootFret,
      ...(t.barre ? { barre: { fret: rootFret, from: t.barre.from, to: t.barre.to } } : {}),
    };
  }
  return best;
}

// Chord name -> fingering, or null for anything unrecognized (N.C., bad tokens)
// so callers can just skip it. Slash chords get the plain chord's grip.
export function shapeForChord(chord: string): ChordShape | null {
  const m = chord.match(CHORD_RE);
  if (!m) return null;
  const pc = NOTE_INDEX[m[1]];
  if (pc === undefined) return null;
  let quality: string | null = normalizeQuality(m[2]);
  while (quality !== null) {
    const shape = lookup(pc, quality);
    if (shape) return shape;
    quality = degradeQuality(quality);
  }
  return null;
}

// Chords in order of first appearance, deduped (repeat-expanded sections included).
export function uniqueChords(song: Song): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of song.lines) {
    if (line.type !== "line") continue;
    for (const seg of line.segments) {
      if (seg.chord && !seen.has(seg.chord)) {
        seen.add(seg.chord);
        out.push(seg.chord);
      }
    }
  }
  return out;
}
