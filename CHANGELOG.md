# Changelog

## 0.3.0 — 2026-07-10

### Added

- **Chord diagrams** — a ▦ toolbar toggle shows guitar fretboard fingerings
  (standard tuning) for every chord in the song. Diagrams follow the current
  transpose offset and the Sounding/Shapes capo mode, so Shapes mode shows the
  grips you actually play. Common open-position shapes plus movable barre
  fallbacks; unknown qualities degrade to their family grip (C13 → C7),
  unrecognized chords are skipped.
- `{Name: repeat}` now accepts multi-word section names, e.g.
  `{Chorus 2: repeat}`.
- `npm version` now syncs `manifest.json` and `versions.json` automatically
  (`version-bump.mjs`).

### Fixed

- CLI usage message now lists all four subcommands (`export` and `annotate`
  were missing).

## 0.2.0 — 2026-07-10

- Added release plumbing: `versions.json`, CI/release workflows, and plugin metadata.

## 0.1.0 — 2026-07-09

Initial release: ChordPro-style leadsheet rendering (CJK-safe chord-over-lyric
alignment), per-file transpose, capo Sounding/Shapes toggle, duration-paced
autoscroll, performance mode, set lists, chords-over-lyrics conversion,
invalid-chord underlining, and a CLI (`validate`, `transpose`, `export`,
`annotate`).
