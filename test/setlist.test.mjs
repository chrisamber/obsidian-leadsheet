import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSetlist,
  nextIndex,
  prevIndex,
  songDurationSec,
  formatDuration,
  summaryLabel,
} from "../setlist.mjs";

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

test("songDurationSec reads the leadsheet block directive", () => {
  const note = "---\ntitle: A\n---\n\n```leadsheet\n{duration: 210}\n[C]la\n```\n";
  assert.equal(songDurationSec(note), 210);
});

test("songDurationSec falls back to frontmatter, block wins over it", () => {
  const fmOnly = "---\nduration: 95\n---\n\n```leadsheet\n[C]la\n```\n";
  assert.equal(songDurationSec(fmOnly), 95);
  const both = "---\nduration: 95\n---\n\n```leadsheet\n{duration: 210}\n[C]la\n```\n";
  assert.equal(songDurationSec(both), 210);
});

test("songDurationSec returns null when absent, invalid, or non-positive", () => {
  assert.equal(songDurationSec("```leadsheet\n[C]la\n```"), null);
  assert.equal(songDurationSec("no block at all"), null);
  assert.equal(songDurationSec("```leadsheet\n{duration: fast}\n```"), null);
  assert.equal(songDurationSec("```leadsheet\n{duration: 0}\n```"), null);
  assert.equal(songDurationSec("```leadsheet\n{duration: -5}\n```"), null);
});

test("formatDuration renders m:ss and rolls into hours", () => {
  assert.equal(formatDuration(90), "1:30");
  assert.equal(formatDuration(5), "0:05");
  assert.equal(formatDuration(3725), "1:02:05");
});

test("summaryLabel shows count, known duration, and missing songs", () => {
  assert.equal(summaryLabel(20, 1, 3725), "20 songs · 1:02:05 · 1 missing");
  assert.equal(summaryLabel(1, 0, 90), "1 song · 1:30");
  assert.equal(summaryLabel(3, 0, 0), "3 songs");
  assert.equal(summaryLabel(2, 2, 0), "2 songs · 2 missing");
});

// Roadmap 0.8 exit gate, node-level: 20 songs + one broken link, three full
// navigation cycles in each direction return to the start without skips.
test("exit gate: 20-song setlist with one broken link", () => {
  const names = Array.from({ length: 20 }, (_, i) => `Song ${i + 1}`);
  const fixture = [...names.map((n) => `- [[${n}]]`), "- [[Missing Song]]"].join("\n");
  const targets = parseSetlist(fixture);
  assert.equal(targets.length, 21);
  assert.equal(targets[20], "Missing Song");

  assert.equal(summaryLabel(21, 1, 20 * 180), "21 songs · 1:00:00 · 1 missing");

  let cur = 0;
  for (let i = 0; i < 3 * 21; i++) cur = nextIndex(cur, 21);
  assert.equal(cur, 0);
  for (let i = 0; i < 3 * 21; i++) cur = prevIndex(cur, 21);
  assert.equal(cur, 0);
});
