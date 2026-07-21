# Changelog

## 0.6.0 — 2026-07-21

### Added

- **Leadsheet: Insert starter leadsheet** adds a valid, editable song block at
  the cursor without replacing selected text.
- Added the same copyable starter template and a short desktop/iPad workflow to
  the README.
- Added a scoped roadmap with measurable release gates through 1.0.

### Changed

- Refreshed the README hero from the actual Obsidian interface and documented
  the Center/Left alignment control.

## 0.5.0 — 2026-07-16

### Added

- Hover, keyboard-focus, or tap any recognized chord to show its guitar
  fingering without opening the full diagram strip. Popovers follow the active
  transpose offset and Sounding/Shapes capo mode.

### Changed

- Chord diagram triggers preserve theme styling and expose accessible labels
  and keyboard focus states.
- Credited Obsidian Chord Sheets as the inspiration for chord diagram
  popovers.

## 0.4.0 — 2026-07-11

Public beta and Community Plugins submission release.

### Highlights

- Render ChordPro lead sheets directly in Obsidian, with chord-over-lyric
  alignment that works for CJK lyrics.
- Transpose per song, switch between sounding pitch and capo shapes, and show
  guitar chord diagrams that follow both.
- Build continuous set lists and use duration-paced autoscroll and performance
  mode on stage.
- Validate, transpose, annotate, and export song data from the repository CLI.

### Changed

- Updated installation guidance for BRAT beta testing and Community Plugins.
- Refined plugin metadata and source for Community Plugins review.

Beta feedback is welcome through
[GitHub Issues](https://github.com/chrisamber/obsidian-leadsheet/issues).

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
