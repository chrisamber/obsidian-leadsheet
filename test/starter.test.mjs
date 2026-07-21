import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, isValidChord } from "../parser.mjs";
import { STARTER_LEADSHEET, STARTER_SOURCE, insertStarterLeadsheet } from "../starter.mjs";

test("starter is valid and matches the documented template", () => {
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
});

test("starter inserts safely at document and line boundaries", () => {
  const cases = [
    ["empty note", "", { line: 0, ch: 0 }, `${STARTER_LEADSHEET}\n`],
    ["start of line", "existing", { line: 0, ch: 0 }, `${STARTER_LEADSHEET}\n\nexisting`],
    ["end of line", "existing", { line: 0, ch: 8 }, `existing\n\n${STARTER_LEADSHEET}\n`],
    ["middle of line", "before after", { line: 0, ch: 6 }, `before\n\n${STARTER_LEADSHEET}\n\n after`],
    [
      "second line",
      "first\nsecond",
      { line: 1, ch: 3 },
      `first\nsec\n\n${STARTER_LEADSHEET}\n\nond`,
    ],
  ];

  for (const [name, original, cursor, expected] of cases) {
    let document = original;
    let insertionPoint;
    insertStarterLeadsheet({
      getCursor: () => cursor,
      getLine: (line) => document.split("\n")[line],
      replaceRange: (text, at) => {
        insertionPoint = at;
        const lines = document.split("\n");
        const offset = lines.slice(0, at.line).reduce((sum, value) => sum + value.length + 1, 0) + at.ch;
        document = document.slice(0, offset) + text + document.slice(offset);
      },
    });
    assert.deepEqual(insertionPoint, cursor, name);
    assert.equal(document, expected, name);
  }
});
