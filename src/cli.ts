import { readFileSync, writeFileSync } from "node:fs";
import { isValidChord, transposeChord, transposeKey, parse } from "./parser";
import { fileToRecord } from "./songdata";
import { updateFrontmatter } from "./frontmatter";
import { chordToRoman } from "./roman";

const BLOCK_RE = /^```leadsheet\n([\s\S]*?)^```/gm;
const CHORD_TOKEN = /\[([^\]]+)\]/g;

const [, , cmd, ...rest] = process.argv;

function forEachBlock(file: string, fn: (block: string) => string | void): boolean {
  const src = readFileSync(file, "utf8");
  let changed = false;
  const out = src.replace(BLOCK_RE, (whole: string, block: string) => {
    const replaced = fn(block);
    if (replaced === undefined || replaced === block) return whole;
    changed = true;
    return whole.replace(block, replaced);
  });
  if (changed) writeFileSync(file, out);
  return changed;
}

if (cmd === "validate") {
  let bad = 0;
  for (const file of rest) {
    forEachBlock(file, (block) => {
      for (const m of block.matchAll(CHORD_TOKEN)) {
        if (!isValidChord(m[1])) {
          console.log(`${file}: unrecognized chord [${m[1]}]`);
          bad++;
        }
      }
    });
  }
  console.log(bad ? `${bad} problem(s)` : "OK");
  process.exit(bad ? 1 : 0);
} else if (cmd === "transpose") {
  const n = parseInt(rest[0], 10);
  if (isNaN(n) || rest.length < 2) usage();
  for (const file of rest.slice(1)) {
    const changed = forEachBlock(file, (block) => {
      const { useFlats, key } = transposeKey(parse(block).meta.key, n);
      return block
        .replace(CHORD_TOKEN, (_, c: string) => `[${transposeChord(c, n, useFlats)}]`)
        .replace(/^\{\s*key\s*:.*\}$/m, key ? `{key: ${key}}` : "$&");
    });
    console.log(`${file}: ${changed ? `transposed ${n > 0 ? "+" : ""}${n}` : "no leadsheet block found"}`);
  }
} else if (cmd === "export") {
  if (rest.length === 0) usage();
  for (const file of rest) {
    const rec = fileToRecord(readFileSync(file, "utf8"));
    process.stdout.write(JSON.stringify({ ...rec.frontmatter, sections: rec.sections }) + "\n");
  }
} else if (cmd === "annotate") {
  if (rest.length === 0) usage();
  for (const file of rest) {
    const text = readFileSync(file, "utf8");
    const rec = fileToRecord(text);
    const key = rec.frontmatter.key as string | undefined;
    const chords_used = [...new Set(rec.sections.flatMap((s) => s.chords))].sort();
    const progression = rec.sections
      .filter((s) => s.chords.length)
      .map((s) => `${s.name}: ${s.chords.map((c) => chordToRoman(c, key)).join(" ")}`)
      .join("; ");
    writeFileSync(file, updateFrontmatter(text, { chords_used, progression }));
    console.log(`${file}: annotated ${chords_used.length} chord(s)`);
  }
} else {
  usage();
}

function usage(): never {
  console.log("usage: node cli.mjs validate <file...> | node cli.mjs transpose <±n> <file...>");
  process.exit(2);
}
