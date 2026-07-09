import { test } from "node:test";
import assert from "node:assert/strict";
import { chordToRoman } from "../roman.mjs";

test("diatonic triads in C major", () => {
  assert.equal(chordToRoman("C", "C"), "I");
  assert.equal(chordToRoman("Dm", "C"), "ii");
  assert.equal(chordToRoman("Em", "C"), "iii");
  assert.equal(chordToRoman("F", "C"), "IV");
  assert.equal(chordToRoman("G", "C"), "V");
  assert.equal(chordToRoman("Am", "C"), "vi");
});

test("extensions preserved; non-diatonic gets accidental", () => {
  assert.equal(chordToRoman("G7", "C"), "V7");
  assert.equal(chordToRoman("Am7", "C"), "vi7");
  assert.equal(chordToRoman("Bb", "C"), "bVII");
});

test("passthrough when key or chord is unparseable", () => {
  assert.equal(chordToRoman("C", undefined), "C");
  assert.equal(chordToRoman("N.C.", "C"), "N.C.");
});
