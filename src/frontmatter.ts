const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function coerce(v: string): unknown {
  const s = v.trim().replace(/^["']|["']$/g, "");
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  return s;
}

export function parseFrontmatter(
  text: string
): { data: Record<string, unknown>; body: string; raw: string | null } {
  const m = text.match(FM_RE);
  if (!m) return { data: {}, body: text, raw: null };
  const data: Record<string, unknown> = {};
  let key: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      data[key] = kv[2] === "" ? "" : coerce(kv[2]);
      continue;
    }
    if (/^\s*-\s+/.test(line) && key) {
      if (!Array.isArray(data[key])) data[key] = [];
      (data[key] as unknown[]).push(coerce(line.replace(/^\s*-\s+/, "")));
    }
  }
  return { data, body: text.slice(m[0].length), raw: m[1] };
}

function emit(k: string, v: unknown): string {
  if (Array.isArray(v)) return `${k}:\n` + v.map((x) => `  - ${x}`).join("\n");
  return `${k}: ${v}`;
}

export function updateFrontmatter(text: string, updates: Record<string, unknown>): string {
  const { data, body, raw } = parseFrontmatter(text);
  const merged = { ...data, ...updates };
  const yaml = Object.entries(merged)
    .map(([k, v]) => emit(k, v))
    .join("\n");
  // raw === null → no prior frontmatter; `body` is the whole file, prepend a block.
  return `---\n${yaml}\n---\n${raw === null ? "\n" : ""}${body}`;
}
// ponytail: flat-YAML subset only (scalars + one-level "- " lists) — exactly the SPEC schema; no nested maps, anchors, or multiline. Swap for a real YAML dep only if the schema grows.
