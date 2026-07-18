import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, isValidChord } from "../parser.mjs";
import { STARTER_LEADSHEET, STARTER_SOURCE, insertStarterLeadsheet } from "../starter.mjs";

test("starter is valid, documented, and inserts without replacing text", () => {
  const song = parse(STARTER_SOURCE);
  assert.equal(song.meta.title, "My Song");
  for (const line of song.lines) {
    if (line.type === "line") {
      for (const segment of line.segments) {
        if (segment.chord) assert.ok(isValidChord(segment.chord), segment.chord);
      }
    }
  }

  assert.ok(readFileSync(new URL("../README.md", import.meta.url), "utf8").includes(STARTER_LEADSHEET));

  const cursor = { line: 0, ch: 6 };
  let document = "before after";
  let insertionPoint;
  insertStarterLeadsheet({
    getCursor: () => cursor,
    getLine: () => document,
    replaceRange: (text, at) => {
      insertionPoint = at;
      document = document.slice(0, at.ch) + text + document.slice(at.ch);
    },
  });
  assert.deepEqual(insertionPoint, cursor);
  assert.match(document, /^before\n\n```leadsheet/);
  assert.match(document, /```\n\n after$/);
});
