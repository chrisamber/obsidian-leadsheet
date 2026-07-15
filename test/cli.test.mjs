import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter } from "../frontmatter.mjs";

const dir = mkdtempSync(join(tmpdir(), "ls-"));
const song = join(dir, "song.md");
writeFileSync(
  song,
  `---\ntitle: T\nkey: C\n---\n\n\`\`\`leadsheet\n{Verse}\nla [Am]la [F]fa\n\`\`\`\n`
);

test("export emits one JSONL record per file", () => {
  const out = execFileSync("node", ["cli.mjs", "export", song], { encoding: "utf8" });
  const lines = out.trim().split("\n");
  assert.equal(lines.length, 1);
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.title, "T");
  assert.equal(rec.sections[0].name, "Verse");
  assert.deepEqual(rec.sections[0].chords, ["Am", "F"]);
});

test("annotate writes chords_used + progression back to frontmatter", () => {
  const f = join(dir, "annot.md");
  writeFileSync(
    f,
    `---\ntitle: A\nkey: C\n---\n\n\`\`\`leadsheet\n{Verse}\nla [Am]la [F]fa [G]ga\n\`\`\`\n`
  );
  execFileSync("node", ["cli.mjs", "annotate", f], { encoding: "utf8" });
  const { data } = parseFrontmatter(readFileSync(f, "utf8"));
  assert.deepEqual(data.chords_used, ["Am", "F", "G"]); // sorted unique
  assert.equal(data.progression, "Verse: vi IV V");
  assert.equal(data.title, "A"); // untouched
});

test("annotate ignores a non-string key", () => {
  const f = join(dir, "numeric-key.md");
  writeFileSync(
    f,
    `---\nkey: 7\n---\n\n\`\`\`leadsheet\n{Verse}\nla [Am]la\n\`\`\`\n`
  );
  execFileSync("node", ["cli.mjs", "annotate", f], { encoding: "utf8" });
  const { data } = parseFrontmatter(readFileSync(f, "utf8"));
  assert.equal(data.progression, "Verse: Am");
});
