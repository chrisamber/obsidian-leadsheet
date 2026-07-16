# Roadmap to 1.0

This roadmap keeps Leadsheet focused on one outcome: turn a plain-text Obsidian
note into a reliable performance sheet on desktop and mobile. Each release has
one user-visible theme and an exit gate; unfinished work moves forward instead
of expanding the release.

## 0.6 — First song

**Outcome:** a new user can install Leadsheet and render a useful song in under
one minute.

- Add one copyable starter template to the README.
- Add a command that inserts the same starter `leadsheet` block into the
  current note.
- Document the shortest desktop and iPad workflows.
- Keep README screenshots captured from the released plugin in real Obsidian.

**Exit gate:** a clean desktop and iPad install can create and render the
starter song without editing plugin settings or consulting the schema.

## 0.7 — Mobile rehearsal

**Outcome:** touch users can rehearse without fighting desktop-sized controls
or clipped overlays.

- Make the toolbar responsive with touch-sized controls and predictable
  wrapping.
- Keep chord popovers inside the viewport; close them on outside tap while
  preserving keyboard behavior.
- Keep essential playback and navigation controls reachable in performance
  mode.
- Keep the screen awake during active performance mode when the platform
  supports it, with a no-op fallback.
- Run physical-device smoke tests on iPad, iPhone, and Android.

**Exit gate:** the starter song can be transposed, scrolled, and used with
chord diagrams on each target device without horizontal overflow or obscured
controls.

## 0.8 — Setlist performance

**Outcome:** a Markdown setlist is dependable for a complete rehearsal or gig.

- Show song count, total known duration, and broken song links before starting.
- Keep current-song position and Prev/Next controls visible during performance.
- Stop and reset autoscroll predictably when navigating between songs.
- Preserve each song's transpose state while moving through the set.
- Verify long setlists without adding a separate setlist editor; the Markdown
  link list remains the source of truth.

**Exit gate:** a 20-song setlist opens, navigates, and autoscrolls without lost
state, missing-link ambiguity, or noticeable interaction lag.

## 0.9 — Portable songs

**Outcome:** users can bring existing ChordPro material into Leadsheet without
silent data loss.

- Add an import command that wraps supported ChordPro text in a Leadsheet note.
- Preserve unknown directives as text instead of discarding them.
- Support only the common ChordPro directives demonstrated by import fixtures;
  defer broad dialect compatibility.
- Define and test settings and file-format migrations needed for 1.0.

**Exit gate:** representative imported songs round-trip through parsing and
editing with chords, lyrics, sections, and metadata intact.

## 1.0 — Reliable performance contract

**Outcome:** the existing feature set is stable enough to trust on stage and in
long-lived vaults.

- Freeze the documented Leadsheet schema and settings format for the 1.x line.
- Meet keyboard, screen-reader, touch, light-theme, and dark-theme checks.
- Pass desktop and physical mobile smoke tests from a clean Community Plugins
  installation.
- Verify release assets, README instructions, screenshots, migrations, and
  backward compatibility against the published build.
- Resolve all known release-blocking defects; 1.0 adds no new feature family.

**Exit gate:** existing 0.x songs and settings upgrade without manual repair,
and the documented install-to-performance story passes on every supported
platform.

## Not before 1.0

- Audio playback, backing tracks, or chord-to-audio synchronization.
- Online song scraping, accounts, cloud storage, or a backend service.
- A custom setlist database or drag-and-drop editor.
- Ukulele/mandolin diagrams, a custom chord-shape designer, or a theme engine.
- Whole-vault rewrites or automatic migration of user-authored song content.

