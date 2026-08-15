import { parse } from "./parser";
import { parseFrontmatter } from "./frontmatter";

export const SONG_BLOCK_RE = /```leadsheet\r?\n([\s\S]*?)```/;

// Duration in seconds from a song note: block directive wins over frontmatter,
// matching renderLeadsheet's metadata precedence.
export function songDurationSec(text: string): number | null {
  const m = text.match(SONG_BLOCK_RE);
  const block = m ? parse(m[1]).meta.duration : undefined;
  const v = Number(block ?? parseFrontmatter(text).data.duration);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = `${m}:${String(s).padStart(2, "0")}`;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : ms;
}

export function summaryLabel(total: number, missing: number, knownSec: number): string {
  const parts = [`${total} song${total === 1 ? "" : "s"}`];
  if (knownSec > 0) parts.push(formatDuration(knownSec));
  if (missing > 0) parts.push(`${missing} missing`);
  return parts.join(" · ");
}

export function parseSetlist(source: string): string[] {
  const links: string[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const m = raw.match(/\[\[([^\]]+)\]\]/);
    if (m) links.push(m[1].split("|")[0].split("#")[0].trim());
  }
  return links;
}

export function nextIndex(cur: number, len: number): number {
  return len ? (cur + 1) % len : 0;
}

export function prevIndex(cur: number, len: number): number {
  return len ? (cur - 1 + len) % len : 0;
}
