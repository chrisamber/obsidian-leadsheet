import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSections, fileToRecord } from "../songdata.mjs";
import { parse } from "../parser.mjs";

test("extractSections groups chords and lyrics per section", () => {
  const song = parse("{Verse}\nverse [C]line [G]here\n\n{Chorus}\ncho [F]line\n");
  const s = extractSections(song);
  assert.equal(s.length, 2);
  assert.equal(s[0].name, "Verse");
  assert.deepEqual(s[0].chords, ["C", "G"]);
  assert.deepEqual(s[0].lyrics, ["verse line here"]);
  assert.equal(s[1].name, "Chorus");
  assert.deepEqual(s[1].chords, ["F"]);
});

test("fileToRecord merges frontmatter + parsed block", () => {
  const file = `---\ntitle: T\nkey: C\n---\n\n\`\`\`leadsheet\n{Verse}\nla [Am]la\n\`\`\`\n`;
  const rec = fileToRecord(file);
  assert.equal(rec.frontmatter.title, "T");
  assert.equal(rec.sections[0].name, "Verse");
  assert.deepEqual(rec.sections[0].chords, ["Am"]);
});
