import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSetlist,
  nextIndex,
  prevIndex,
  songDurationSec,
  formatDuration,
  summaryLabel,
  currentIndex,
} from "../setlist.mjs";

// summaryLabel keeps no-break spaces inside each part; compare as plain text.
const label = (...args) => summaryLabel(...args).replace(/\u00a0/g, " ");

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
  assert.equal(label(20, 1, 3725), "20 songs · 1:02:05 · 1 missing");
  assert.equal(label(1, 0, 90), "1 song · 1:30");
  assert.equal(label(3, 0, 0), "3 songs");
  assert.equal(label(2, 2, 0), "2 songs · 2 missing");
});

test("summaryLabel wraps only between parts", () => {
  assert.equal(summaryLabel(21, 1, 3085, 5), "21\u00a0songs · 51:25 · 5\u00a0untimed · 1\u00a0missing");
});

test("summaryLabel calls out untimed songs only beside a partial total", () => {
  assert.equal(label(20, 1, 3085, 5), "20 songs · 51:25 · 5 untimed · 1 missing");
  assert.equal(label(4, 0, 0, 4), "4 songs");
  assert.equal(label(4, 0, 600, 0), "4 songs · 10:00");
});

test("currentIndex picks the last item past the reading line", () => {
  assert.equal(currentIndex([-900, -100, 250, 900], 300), 2);
  assert.equal(currentIndex([400, 900], 300), 0); // none reached yet: the first
  assert.equal(currentIndex([0, 0, 0], 300), 2); // why hidden renders are skipped
  assert.equal(currentIndex([], 300), 0);
});

// Roadmap 0.8 exit gate, node-level: 20 songs with mixed durations + one
// broken link, three full navigation cycles in each direction return to the
// start without skips.
test("exit gate: 20-song setlist with one broken link", () => {
  const names = Array.from({ length: 20 }, (_, i) => `Song ${i + 1}`);
  const fixture = [...names.map((n) => `- [[${n}]]`), "- [[Missing Song]]"].join("\n");
  const targets = parseSetlist(fixture);
  assert.equal(targets.length, 21);
  assert.equal(targets[20], "Missing Song");

  // Every fourth song is untimed; the rest mix block and frontmatter durations.
  const notes = names.map((_, i) =>
    i % 4 === 3 ? "```leadsheet\n[C]la\n```"
      : i % 2 ? `---\nduration: ${120 + i}\n---\n\n\`\`\`leadsheet\n[C]la\n\`\`\``
        : `\`\`\`leadsheet\n{duration: ${120 + i}}\n[C]la\n\`\`\``
  );
  const secs = notes.map(songDurationSec);
  const known = secs.reduce((a, s) => a + (s ?? 0), 0);
  const untimed = secs.filter((s) => s === null).length;
  assert.equal(untimed, 5);
  assert.equal(known, 1935);
  assert.equal(label(21, 1, known, untimed), "21 songs · 32:15 · 5 untimed · 1 missing");

  let cur = 0;
  for (let i = 0; i < 3 * 21; i++) cur = nextIndex(cur, 21);
  assert.equal(cur, 0);
  for (let i = 0; i < 3 * 21; i++) cur = prevIndex(cur, 21);
  assert.equal(cur, 0);
});
