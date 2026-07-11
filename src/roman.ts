import { CHORD_RE } from "./parser";

const NOTES: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};
const DEGREE: Record<number, string> = {
  0: "I", 1: "bII", 2: "II", 3: "bIII", 4: "III", 5: "IV",
  6: "#IV", 7: "V", 8: "bVI", 9: "VI", 10: "bVII", 11: "VII",
};

export function chordToRoman(chord: string, key: string | undefined): string {
  if (!key) return chord;
  const km = key.trim().match(/^([A-G](?:#|b)?)/);
  const cm = chord.match(CHORD_RE);
  if (!km || !cm) return chord;
  const keyRoot = NOTES[km[1]];
  const chordRoot = NOTES[cm[1]];
  if (keyRoot === undefined || chordRoot === undefined) return chord;
  const deg = (((chordRoot - keyRoot) % 12) + 12) % 12;
  let num = DEGREE[deg];
  const quality = cm[2] || "";
  if (/^m(?!aj)/.test(quality)) num = num.toLowerCase(); // minor -> lowercase
  const ext = quality.replace(/^m(in)?/, ""); // drop the 'm', keep 7 / sus / etc.
  return num + ext;
}

// Roman numerals use major-key degrees; mode spelling and slash-bass degrees
// are not represented.
