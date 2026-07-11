import { isValidChord } from "./parser";

export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => isValidChord(t));
}

function mergeChordLine(chordLine: string, lyric: string): string {
  const positions: { col: number; chord: string }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chordLine))) positions.push({ col: m.index, chord: m[0] });
  let result = lyric;
  // Insert right-to-left so earlier columns stay valid.
  for (let i = positions.length - 1; i >= 0; i--) {
    const { col, chord } = positions[i];
    const at = Math.min(col, result.length);
    result = result.slice(0, at) + `[${chord}]` + result.slice(at);
  }
  return result;
}

// Best-effort conversion: a lyric line made entirely of chord names is treated
// as a chord line.
export function chordsOverLyricsToInline(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isChordLine(line)) {
      out.push(line);
      continue;
    }
    const next = lines[i + 1];
    if (next !== undefined && next.trim() && !isChordLine(next)) {
      out.push(mergeChordLine(line, next));
      i++; // consumed the lyric line
    } else {
      out.push(line.trim().split(/\s+/).map((c) => `[${c}]`).join(" "));
    }
  }
  return out.join("\n");
}
