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
