# Changelog

## Unreleased

### Added

- Set lists show a summary before you start: song count, total known
  duration, how many songs have no duration, and how many links are missing.
- The sticky set-list bar shows the current position (`3/20 · Song`) next to
  Prev/Next.
- A refreshed default look that needs no CSS snippet: a title header with
  metadata pills, labeled toolbar groups with theme-native icons, quieter
  section labels, and chord-only lines drawn as a measure strip.
- Choruses get a filled label and a margin bar.
- A toolbar button for performance mode. Performance mode now also hides the
  note's properties and inline title and pins the toolbar while scrolling.
- Setlist songs link to their notes; missing songs can be created with a click,
  and the position label follows manual scrolling.
- Theme tokens (`--ls-accent`, `--ls-chord-color`, `--ls-section-color`,
  `--ls-lyric-size`) for retuning the sheet from a snippet.

### Changed

- Autoscroll in a set list plays one song: its pace comes from that song's
  duration and height, and it stops at the song's last line instead of running
  into the next one. Prev/Next stop playback before moving.
- **Toggle autoscroll** plays the sheet at the top of the view, with the same
  duration pacing as its play button. In Reading view it no longer scrolls the
  hidden editor instead.
- Autoscroll stops when its sheet unloads, such as when another note opens in
  the same tab.
- Autoscroll carries on from wherever the view moves while it plays (your own
  scroll, or a song above finishing rendering) instead of jumping back.
- A set list rendered in the hidden view mode no longer reports the last song
  as current when you switch to it.
- Prev/Next land each song just below the set-list bar. In Reading view the
  song's first line used to sit under the bar, and long jumps (last song back
  to the first) could stop partway when Obsidian unloaded content above the
  set list mid-scroll. The jump is instant with reduced motion.
- The position label stays on the chosen song until the jump settles instead
  of picking up songs passed on the way.
- Prev/Next and play work in a set list embedded in another note
  (`![[Gig Setlist]]`); they used to do nothing there.
- The current song is read 40% down its own pane rather than the window, so
  the position label follows scrolling in a split pane, and in a popout whose
  set list rendered while another window was active.
- On phones in performance mode, song toolbars pin under the set-list bar's
  real height (exposed as `--ls-setlist-nav-h`), including when the summary
  wraps or the set list is in a popout window. The summary wraps between
  parts, never inside one.
- The capo chip is hidden when the capo is 0.
- The Sounding/Shapes button is now a **Shapes** toggle with a stable label;
  off shows sounding pitch.
- Toolbar toggles (play, Shapes, alignment, diagrams, performance mode) expose
  `aria-pressed`, and control groups are labeled for screen readers.
- Per-block listeners are released when Obsidian re-renders a block instead of
  accumulating until the plugin unloads.
- The README has a centered hero, a feature grid with Lucide icons, and
  light/dark images for the write → get example, toolbar anatomy, and set
  lists. The toolbar reference and the BRAT and manual installs are collapsed.

## 0.7.0 — 2026-08-12

### Added

- Performance mode keeps the screen awake on supported platforms and safely
  falls back when Screen Wake Lock is unavailable.

### Changed

- Mobile toolbar and setlist navigation controls now use touch-sized targets
  and remain reachable during performance.
- Chord diagram popovers stay inside the viewport and close on outside tap.

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
