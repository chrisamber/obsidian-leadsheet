# Leadsheet — design spec (2026-07-09)

Obsidian plugin that renders OnSong-style leadsheets from a ChordPro-flavored
schema inside ```leadsheet fenced code blocks.

## Schema

A leadsheet is the content of a ```leadsheet code block:

```
{title: 茉莉花}
{artist: Traditional}
{key: C}
{capo: 0}
{tempo: 72}

{Verse}
| [C]  [G/B] | [Am7] [Am7/G] |
好一朵 [C]美麗的 茉莉[G/B]花

{Chorus}
芬芳美麗[F]滿枝[G]椏 又香又[C]白人人誇
```

- **Directives** `{name: value}` — metadata. Recognized: `title`, `artist`,
  `key`, `capo`, `tempo`, `time`. Unknown directives are kept as metadata too.
- **Sections** `{Anything}` (no colon) — section label, e.g. `{Verse}`, `{Chorus 2}`.
- **Section repeat** `{Name: repeat}` — re-emits the earlier section `Name`
  (header + body) so you don't paste a chorus three times. Any section name
  works (`{Chorus 2: repeat}`); names match case-insensitively.
- **Chords** `[X]` inline before the syllable they land on. Chord grammar:
  `Root(quality)(/Bass)` where Root/Bass ∈ A–G with optional `#`/`b`.
  Anything unparseable renders as-is (e.g. `[N.C.]`).
- **Chord-only lines** work naturally: `| [C]  [G/B] | [Am7] |` — bar pipes
  are just text between chords.
- Blank lines separate stanzas.

## Frontmatter schema

Song metadata lives in the note's YAML frontmatter (template:
`Templates/Song Template.md`). The plugin reads it as the metadata source;
`{key: …}`-style directives inside the block override frontmatter when present.

Design rules (for search + future ML): flat scalars only, lists for
multi-valued fields, controlled vocabularies, ISO codes, integers for numeric
fields. No nested objects — every field maps 1:1 to an Obsidian property and a
dataframe column.

| Field | Type | Values / format | Purpose |
|---|---|---|---|
| `type` | string | always `song` | select song notes in queries |
| `id` | string | stable kebab-case slug | join key across datasets |
| `title`, `title_en` | string | original + romanized/translated | CJK-safe search |
| `artist`, `artist_en` | string | | |
| `album` | string | | |
| `year` | int | release year | |
| `language` | list | ISO 639-1 (`yue`, `en`, `cmn`) | filtering, ML labels |
| `key` | string | `C`, `F#m`, … concert key | transpose base, key-distribution stats |
| `mode` | string | `major` \| `minor` \| `modal` | ML label |
| `capo` | int | 0–11 | |
| `tempo` | int | BPM | |
| `time` | string | `4/4`, `6/8` | |
| `duration` | int | seconds | |
| `genre` | list | lowercase tags | ML labels |
| `instrumentation` | list | `guitar`, `piano`, … | set-list filtering |
| `difficulty` | int | 1–5 | practice queries |
| `status` | string | `todo` \| `learning` \| `ready` \| `performing` \| `retired` | repertoire pipeline |
| `source`, `audio` | string | URL or vault link | provenance / audio pairing |
| `tags` | list | include `song` | Obsidian-native search |

Unknown extra fields are allowed and ignored by the plugin.

## Rendering

- Code block processor for `leadsheet`. Each line is split into segments
  `{chord, text}`; each segment renders as inline-block with the chord stacked
  above the text. This aligns correctly for CJK lyrics (no monospace tricks).
- Lines with no chords render as plain lyrics (no empty chord row).
- Toolbar: title/artist, current key (updates with transpose), capo, tempo,
  transpose − / reset / +, chord-diagram toggle ▦, autoscroll ▶/⏸ and
  speed − / +.
- Chord diagrams: toggling ▦ shows a strip of guitar fingering diagrams
  (standard tuning) for the song's chords, in order of first appearance,
  deduped after transpose. Shapes come from a curated open-position dictionary
  with movable E-/A-shape barre fallbacks (`src/diagrams.ts`); unknown
  qualities degrade to their family grip (C13 → C7), unrecognized chords are
  skipped. Diagrams follow the display offset, so Shapes mode shows capo grips.

## Transpose

- Semitone offset persisted per file in plugin settings (`offsets[filePath]`).
- Accidental choice: transpose the declared `{key:}`; if the resulting key is a
  flat key (F/Bb/Eb/Ab/Db/Gb or relative minors) use flats, else sharps.
  No `{key:}` → sharps.
- Capo display mode is user-selectable: Sounding shows concert pitch, while
  Shapes shifts chord names and diagrams by `-capo` to show the grips played.

## Autoscroll

- Plugin-level rAF scroller on the view's scroll container
  (`.markdown-preview-view` / `.cm-scroller`). Toggled by toolbar button or the
  `Toggle autoscroll` command (hotkeyable). Speed in px/s, default 20,
  adjustable ±5, persisted in settings.

## Tooling

- `src/parser.ts` — parse + transpose, shared by plugin, CLI, tests.
- `cli.mjs` — `node cli.mjs validate <files…>` (report bad chord tokens) and
  `node cli.mjs transpose <±n> <files…>` (rewrite chords inside leadsheet
  blocks in place).
- Tests: `node --test` over built parser.

## Skipped (add when needed)

- Whole-file (non-fenced) rendering of existing notes — wrap songs in a
  ```leadsheet block instead; revisit if that's too much friction.
