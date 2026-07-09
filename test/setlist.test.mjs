import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSetlist, nextIndex, prevIndex } from "../setlist.mjs";

test("parseSetlist extracts link targets, stripping alias/heading", () => {
  const src = "- [[Song A]]\n- [[Song B|Bee]]\n[[Song C#Chorus]]\njust a note\n";
  assert.deepEqual(parseSetlist(src), ["Song A", "Song B", "Song C"]);
});

test("nav wraps both directions and guards empty", () => {
  assert.equal(nextIndex(0, 3), 1);
  assert.equal(nextIndex(2, 3), 0);
  assert.equal(prevIndex(0, 3), 2);
  assert.equal(prevIndex(1, 3), 0);
  assert.equal(nextIndex(0, 0), 0);
  assert.equal(prevIndex(0, 0), 0);
});
