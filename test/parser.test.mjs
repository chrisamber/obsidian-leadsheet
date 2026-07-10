import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, transposeChord, transposeKey, isValidChord } from "../parser.mjs";

test("parses directives, sections, chords", () => {
  const song = parse(
    "{title: 茉莉花}\n{key: C}\n\n{Verse}\n| [C]  [G/B] |\n好一朵 [C]美麗的 茉莉[G/B]花\n"
  );
  assert.equal(song.meta.title, "茉莉花");
  assert.equal(song.meta.key, "C");
  assert.deepEqual(song.lines[0], { type: "section", name: "Verse" });

  const barLine = song.lines[1];
  assert.equal(barLine.type, "line");
  assert.deepEqual(
    barLine.segments.map((s) => s.chord),
    [null, "C", "G/B"]
  );

  const lyric = song.lines[2];
  assert.deepEqual(lyric.segments, [
    { chord: null, text: "好一朵 " },
    { chord: "C", text: "美麗的 茉莉" },
    { chord: "G/B", text: "花" },
  ]);
});

test("lines with no chords keep full text", () => {
  const song = parse("好一朵美麗的茉莉花");
  assert.deepEqual(song.lines[0].segments, [{ chord: null, text: "好一朵美麗的茉莉花" }]);
});

test("transposeChord", () => {
  assert.equal(transposeChord("C", 2, false), "D");
  assert.equal(transposeChord("Am7", 2, false), "Bm7");
  assert.equal(transposeChord("G/B", 2, false), "A/C#");
  assert.equal(transposeChord("G/B", 2, true), "A/Db");
  assert.equal(transposeChord("F#m7b5", -1, false), "Fm7b5");
  assert.equal(transposeChord("N.C.", 3, false), "N.C.");
});

test("transposeKey picks flats for flat keys", () => {
  assert.deepEqual(transposeKey("C", 3), { key: "Eb", useFlats: true });
  assert.deepEqual(transposeKey("C", 2), { key: "D", useFlats: false });
  assert.deepEqual(transposeKey("Am", -2), { key: "Gm", useFlats: true });
  assert.deepEqual(transposeKey(undefined, 2), { key: undefined, useFlats: false });
});

test("isValidChord", () => {
  assert.ok(isValidChord("Am7/G"));
  assert.ok(isValidChord("N.C."));
  assert.ok(!isValidChord("H7"));
});

test("{Section: repeat} works with multi-word section names", () => {
  const song = parse(
    "{key: C}\n{Chorus 2}\ncho [F]line\n{Verse}\nverse [C]line\n{Chorus 2: repeat}\n"
  );
  const n = song.lines.length;
  assert.deepEqual(song.lines[n - 2], { type: "section", name: "Chorus 2" });
  assert.deepEqual(
    song.lines[n - 1].segments.map((s) => s.chord),
    [null, "F"]
  );
  assert.equal(song.meta["chorus 2"], undefined);
  // ordinary directives still land in metadata
  assert.equal(song.meta.key, "C");
});

test("repeat of an unknown section emits just the header", () => {
  const song = parse("{Bridge 1: repeat}\n");
  assert.deepEqual(song.lines, [{ type: "section", name: "Bridge 1" }]);
});

test("{Section: repeat} expands the earlier section inline", () => {
  const song = parse(
    "{Chorus}\ncho [F]line\n{Verse}\nverse [C]line\n{Chorus: repeat}\n"
  );
  // last two lines are a fresh Chorus header + a copy of the chorus body
  const n = song.lines.length;
  assert.deepEqual(song.lines[n - 2], { type: "section", name: "Chorus" });
  assert.equal(song.lines[n - 1].type, "line");
  assert.deepEqual(
    song.lines[n - 1].segments.map((s) => s.chord),
    [null, "F"]
  );
  // repeat directive must not pollute metadata
  assert.equal(song.meta.chorus, undefined);
});
