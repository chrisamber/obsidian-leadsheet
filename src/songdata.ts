import { parse, Song } from "./parser";
import { parseFrontmatter } from "./frontmatter";

export interface SectionData {
  name: string;
  chords: string[];
  lyrics: string[];
}
export interface SongRecord {
  frontmatter: Record<string, unknown>;
  sections: SectionData[];
}

const BLOCK_RE = /```leadsheet\r?\n([\s\S]*?)```/;

export function extractSections(song: Song): SectionData[] {
  const sections: SectionData[] = [];
  let cur: SectionData = { name: "", chords: [], lyrics: [] };
  const flush = () => {
    if (cur.name || cur.chords.length || cur.lyrics.length) sections.push(cur);
  };
  for (const line of song.lines) {
    if (line.type === "section") {
      flush();
      cur = { name: line.name, chords: [], lyrics: [] };
      continue;
    }
    if (line.type === "empty") continue;
    for (const seg of line.segments) if (seg.chord) cur.chords.push(seg.chord);
    const text = line.segments.map((s) => s.text).join("").trim();
    if (text) cur.lyrics.push(text);
  }
  flush();
  return sections;
}

export function fileToRecord(fileText: string): SongRecord {
  const fm = parseFrontmatter(fileText);
  const block = fileText.match(BLOCK_RE);
  const song = parse(block ? block[1] : "");
  return { frontmatter: fm.data, sections: extractSections(song) };
}
