import { test } from "node:test";
import assert from "node:assert/strict";
import { chordDiagramData, shapeForChord, uniqueChords } from "../diagrams.mjs";
import { parse } from "../parser.mjs";

test("open-position shapes", () => {
  assert.deepEqual(shapeForChord("C"), { frets: [-1, 3, 2, 0, 1, 0], baseFret: 1 });
  assert.deepEqual(shapeForChord("Am7"), { frets: [-1, 0, 2, 0, 1, 0], baseFret: 1 });
  assert.deepEqual(shapeForChord("D7"), { frets: [-1, -1, 0, 2, 1, 2], baseFret: 1 });
});

test("quality aliases normalize", () => {
  assert.deepEqual(shapeForChord("Amin7"), shapeForChord("Am7"));
  assert.deepEqual(shapeForChord("A-7"), shapeForChord("Am7"));
  assert.deepEqual(shapeForChord("CM7"), shapeForChord("Cmaj7"));
  assert.deepEqual(shapeForChord("Esus"), shapeForChord("Esus4"));
  assert.deepEqual(shapeForChord("D2"), shapeForChord("Dsus2"));
});

test("slash chords use the plain chord's grip", () => {
  assert.deepEqual(shapeForChord("C/E"), shapeForChord("C"));
  assert.deepEqual(shapeForChord("G/B"), shapeForChord("G"));
});

test("enharmonic spellings agree", () => {
  assert.deepEqual(shapeForChord("Db"), shapeForChord("C#"));
  assert.deepEqual(shapeForChord("Bbm7"), shapeForChord("A#m7"));
});

test("E-shape barre fallback", () => {
  assert.deepEqual(shapeForChord("F"), {
    frets: [1, 3, 3, 2, 1, 1],
    baseFret: 1,
    barre: { fret: 1, from: 0, to: 5 },
  });
  assert.deepEqual(shapeForChord("F#"), {
    frets: [2, 4, 4, 3, 2, 2],
    baseFret: 2,
    barre: { fret: 2, from: 0, to: 5 },
  });
});

test("A-shape wins when it sits lower on the neck", () => {
  assert.deepEqual(shapeForChord("Bb"), {
    frets: [-1, 1, 3, 3, 3, 1],
    baseFret: 1,
    barre: { fret: 1, from: 1, to: 5 },
  });
  assert.equal(shapeForChord("C#m7").baseFret, 4);
});

test("quality families degrade to a playable grip", () => {
  assert.deepEqual(shapeForChord("C13"), shapeForChord("C7"));
  assert.deepEqual(shapeForChord("Cmaj9"), shapeForChord("Cmaj7"));
  assert.deepEqual(shapeForChord("Am9"), shapeForChord("Am7"));
  assert.deepEqual(shapeForChord("Gadd11"), shapeForChord("G"));
  assert.deepEqual(shapeForChord("B7sus4"), shapeForChord("Bsus4"));
});

test("unrecognized chords return null, never a guessed major", () => {
  assert.equal(shapeForChord("N.C."), null);
  assert.equal(shapeForChord("H7"), null);
  assert.equal(shapeForChord("Cxyz"), null);
});

test("diagram presentation follows the displayed transposition", () => {
  const diagram = chordDiagramData("C", 2, false);
  assert.equal(diagram.name, "D");
  assert.deepEqual(diagram.shape, shapeForChord("D"));
  assert.equal(chordDiagramData("N.C.", 2, false).shape, null);
});

test("uniqueChords: first-appearance order, deduped, repeats included", () => {
  const song = parse(
    "{Chorus}\n[F]la [C]la\n{Verse}\n[G]la [F]la\n{Chorus: repeat}\n"
  );
  assert.deepEqual(uniqueChords(song), ["F", "C", "G"]);
});
