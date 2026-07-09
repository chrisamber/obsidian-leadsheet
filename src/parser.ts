export interface Segment {
  chord: string | null;
  text: string;
}

export type SongLine =
  | { type: "section"; name: string }
  | { type: "line"; segments: Segment[] }
  | { type: "empty" };

export interface Song {
  meta: Record<string, string>;
  lines: SongLine[];
}

const DIRECTIVE = /^\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*\}\s*$/;
const SECTION = /^\{\s*([^:{}]+?)\s*\}\s*$/;
const CHORD_TOKEN = /\[([^\]]+)\]/g;
export const CHORD_RE = /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/;

// ponytail: repeat matches single-token section names (DIRECTIVE's identifier rule) — {Chorus: repeat}, {Bridge: repeat}. Multi-word "{Chorus 2: repeat}" isn't matched; note in SPEC. Good enough for the common case.
export function parse(source: string): Song {
  const meta: Record<string, string> = {};
  const lines: SongLine[] = [];
  const sections: Record<string, SongLine[]> = {}; // section name (lower) -> body lines
  let active: string | null = null;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      lines.push({ type: "empty" });
      if (active) sections[active].push({ type: "empty" });
      continue;
    }
    let m = line.match(DIRECTIVE);
    if (m) {
      // {Name: repeat} -> expand the earlier section `Name` inline.
      if (m[2].trim().toLowerCase() === "repeat") {
        lines.push({ type: "section", name: m[1] });
        const body = sections[m[1].toLowerCase()];
        if (body) for (const l of body) lines.push(l);
        active = null; // a repeated body is not itself re-recorded
        continue;
      }
      meta[m[1].toLowerCase()] = m[2];
      continue;
    }
    m = line.match(SECTION);
    if (m) {
      active = m[1].toLowerCase();
      sections[active] = [];
      lines.push({ type: "section", name: m[1] });
      continue;
    }
    const seg: SongLine = { type: "line", segments: parseSegments(line) };
    lines.push(seg);
    if (active) sections[active].push(seg);
  }
  while (lines.length && lines[lines.length - 1].type === "empty") lines.pop();
  while (lines.length && lines[0].type === "empty") lines.shift();
  return { meta, lines };
}

function parseSegments(line: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let chord: string | null = null;
  for (const m of line.matchAll(CHORD_TOKEN)) {
    const text = line.slice(last, m.index);
    if (chord !== null || text) segments.push({ chord, text });
    chord = m[1];
    last = (m.index as number) + m[0].length;
  }
  segments.push({ chord, text: line.slice(last) });
  return segments;
}

const NOTES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const NOTE_INDEX: Record<string, number> = {};
NOTES_SHARP.forEach((n, i) => (NOTE_INDEX[n] = i));
NOTES_FLAT.forEach((n, i) => (NOTE_INDEX[n] = i));

// Standard flat key signatures (majors and relative/parallel minors).
const FLAT_KEYS = new Set([
  "F", "Bb", "Eb", "Ab", "Db", "Gb",
  "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm", "Abm",
]);

export function transposeChord(chord: string, semitones: number, useFlats: boolean): string {
  const m = chord.match(CHORD_RE);
  if (!m) return chord;
  const shift = (note: string) => {
    const i = NOTE_INDEX[note];
    if (i === undefined) return note;
    const names = useFlats ? NOTES_FLAT : NOTES_SHARP;
    return names[(((i + semitones) % 12) + 12) % 12];
  };
  return shift(m[1]) + m[2] + (m[3] ? "/" + shift(m[3]) : "");
}

export function transposeKey(
  key: string | undefined,
  semitones: number
): { key: string | undefined; useFlats: boolean } {
  if (!key) return { key: undefined, useFlats: false };
  const m = key.trim().match(/^([A-G](?:#|b)?)\s*(m(?:in(?:or)?)?)?$/i);
  if (!m) return { key, useFlats: false };
  const root = m[1][0].toUpperCase() + m[1].slice(1);
  const i = NOTE_INDEX[root];
  if (i === undefined) return { key, useFlats: false };
  const j = (((i + semitones) % 12) + 12) % 12;
  const minor = !!m[2];
  const flatName = NOTES_FLAT[j] + (minor ? "m" : "");
  const useFlats = FLAT_KEYS.has(flatName);
  const name = (useFlats ? NOTES_FLAT[j] : NOTES_SHARP[j]) + (minor ? "m" : "");
  return { key: name, useFlats };
}

export function isValidChord(chord: string): boolean {
  return CHORD_RE.test(chord) || chord === "N.C." || chord === "NC";
}
