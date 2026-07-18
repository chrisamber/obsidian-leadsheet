export const STARTER_SOURCE = `{title: My Song}
{artist: Artist}
{key: C}
{capo: 0}
{tempo: 72}
{time: 4/4}

{Verse}
| [C] | [F] [G] |
[C]Write your lyrics [F]here

{Chorus}
[F]Add a chorus [G]here [C]too`;

export const STARTER_LEADSHEET = `\`\`\`leadsheet\n${STARTER_SOURCE}\n\`\`\``;

interface StarterEditor {
  getCursor(): { line: number; ch: number };
  getLine(line: number): string;
  replaceRange(text: string, from: { line: number; ch: number }): void;
}

export function insertStarterLeadsheet(editor: StarterEditor) {
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line);
  const before = cursor.ch === 0 ? "" : "\n\n";
  const after = cursor.ch === line.length ? "\n" : "\n\n";
  editor.replaceRange(`${before}${STARTER_LEADSHEET}${after}`, cursor);
}
