# Roadmap to 1.0

This roadmap keeps Leadsheet focused on one outcome: turn a plain-text Obsidian
note into a reliable performance sheet on desktop and mobile. Each release has
one user-visible theme and an exit gate; unfinished work moves forward instead
of expanding the release.

## Release discipline

These gates apply to every version:

- Ship one feature theme per minor release; defects found during verification
  are fixed before adding scope.
- Test from a clean Community Plugins installation on the latest Obsidian and
  the declared `minAppVersion`. Raise the minimum version before release if it
  cannot be supported honestly.
- Keep settings migrations additive and idempotent. Never rewrite a song note
  except through an explicit user command, and keep the original import input
  unchanged.
- Keep the plugin local-first: no telemetry, accounts, or required network
  access.
- Build once, test that build, and verify the published `main.js`,
  `manifest.json`, and `styles.css` match it exactly.
- Treat published releases as immutable. A release defect gets a patch version,
  not replaced assets under an existing tag.

## 0.6 — First song

**Outcome:** a new user can install Leadsheet and render a useful song in under
one minute.

- Add one copyable starter template to the README.
- Add a command that inserts the same starter `leadsheet` block into the
  current note.
- Document the shortest desktop and iPad workflows.
- Keep README screenshots captured from the released plugin in real Obsidian.

**Exit gate:** timed from enabling the plugin, a clean desktop and iPad install
can create and render the starter song in under one minute, without editing
plugin settings, consulting the schema, or producing parser warnings.

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

**Exit gate:** at phone and tablet widths, the starter song can be transposed,
scrolled, and used with chord diagrams on each target device without page-level
horizontal overflow, clipped popovers, obscured controls, or a broken fallback
when screen wake lock is unavailable.

## 0.8 — Setlist performance

**Outcome:** a Markdown setlist is dependable for a complete rehearsal or gig.

- Show song count, total known duration, and broken song links before starting.
- Keep current-song position and Prev/Next controls visible during performance.
- Stop and reset autoscroll predictably when navigating between songs.
- Preserve each song's transpose state while moving through the set.
- Verify long setlists without adding a separate setlist editor; the Markdown
  link list remains the source of truth.

**Exit gate:** a fixture containing 20 songs, mixed durations, and one broken
link completes three full navigation cycles. The broken link is identified,
transpose state is preserved, and autoscroll never continues into the next
song.

## 0.9 — Portable songs

**Outcome:** users can bring existing ChordPro material into Leadsheet without
silent data loss.

- Add an import command that wraps supported ChordPro text in a Leadsheet note.
- Preserve unknown directives as text instead of discarding them.
- Support only the common ChordPro directives demonstrated by import fixtures;
  defer broad dialect compatibility.
- Define and test settings and file-format migrations needed for 1.0.

**Exit gate:** a committed import corpus round-trips through parsing and editing
with chords, lyrics, sections, and metadata intact. The importer never mutates
its source, and unsupported directives are reported visibly rather than
dropped.

## 1.0 — Reliable performance contract

**Outcome:** the existing feature set is stable enough to trust on stage and in
long-lived vaults.

- Freeze the meaning of documented fields for the 1.x line; additive fields
  remain allowed when older versions can ignore them safely.
- Meet keyboard, screen-reader, touch, light-theme, and dark-theme checks.
- Pass desktop and physical mobile smoke tests from a clean Community Plugins
  installation.
- Prove the declared minimum Obsidian version or raise `minAppVersion` and
  preserve older compatible releases through `versions.json`.
- Verify release assets, README instructions, screenshots, migrations, and
  backward compatibility against the published build.
- Resolve all known release-blocking defects; 1.0 adds no new feature family.

**Exit gate:** fixtures from every shipped 0.x format and settings version
upgrade twice with the same result, require no manual repair, and pass the
documented install-to-performance story on every supported platform.

## Not before 1.0

- Audio playback, backing tracks, or chord-to-audio synchronization.
- Online song scraping, accounts, cloud storage, or a backend service.
- A custom setlist database or drag-and-drop editor.
- Ukulele/mandolin diagrams, a custom chord-shape designer, or a theme engine.
- Whole-vault rewrites or automatic migration of user-authored song content.
