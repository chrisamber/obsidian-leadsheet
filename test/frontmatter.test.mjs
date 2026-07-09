import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, updateFrontmatter } from "../frontmatter.mjs";

const FILE = `---
type: song
title: 茉莉花
year: 2003
capo: 2
language:
  - yue
tags:
  - song
---

body text here
`;

test("parseFrontmatter reads scalars, ints, and lists", () => {
  const { data, body } = parseFrontmatter(FILE);
  assert.equal(data.type, "song");
  assert.equal(data.title, "茉莉花");
  assert.equal(data.year, 2003);           // coerced to int
  assert.equal(data.capo, 2);
  assert.deepEqual(data.language, ["yue"]);
  assert.deepEqual(data.tags, ["song"]);
  assert.equal(body.trim(), "body text here");
});

test("parseFrontmatter returns raw=null when absent", () => {
  const { data, raw } = parseFrontmatter("no frontmatter\n");
  assert.deepEqual(data, {});
  assert.equal(raw, null);
});

test("updateFrontmatter merges new fields and preserves the body", () => {
  const out = updateFrontmatter(FILE, { chords_used: ["Am7", "F", "G"], progression: "Verse: vi IV V" });
  const { data, body } = parseFrontmatter(out);
  assert.equal(data.title, "茉莉花");                 // untouched
  assert.deepEqual(data.chords_used, ["Am7", "F", "G"]); // added list
  assert.equal(data.progression, "Verse: vi IV V");      // added scalar
  assert.equal(body.trim(), "body text here");           // body intact
});
