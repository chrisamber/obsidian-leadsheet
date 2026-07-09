import { test } from "node:test";
import assert from "node:assert/strict";
import { chordsOverLyricsToInline, isChordLine } from "../convert.mjs";

test("isChordLine detects chord-only lines", () => {
  assert.ok(isChordLine("C   G   Am7"));
  assert.ok(!isChordLine("Hello world"));
  assert.ok(!isChordLine(""));
});

test("merges chords over lyrics by column", () => {
  const input = "C       G\nHello   world";
  assert.equal(chordsOverLyricsToInline(input), "[C]Hello   [G]world");
});

test("chord-only line with no lyric below -> inline chords", () => {
  assert.equal(chordsOverLyricsToInline("C G Am"), "[C] [G] [Am]");
});

test("plain lyric lines pass through untouched", () => {
  assert.equal(chordsOverLyricsToInline("just a lyric"), "just a lyric");
});
