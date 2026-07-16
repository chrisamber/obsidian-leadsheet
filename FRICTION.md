# Friction

## 2026-07-16 — Release screenshot drift

- Symptom: the README hero showed the pre-0.5 toolbar and omitted chord
  popovers, while the published plugin had diagram and alignment controls.
- Cause: release verification checked the build and runtime without comparing
  committed README media to the installed release.
- Resolution: replace the hero with an actual Obsidian 1.12.7 capture and
  document the alignment control; compare README media during release checks
  whenever visible UI changes.

## 2026-07-16 — Escape dismissal in Live Preview

- Symptom: desktop automation kept reporting a chord popover after Escape.
- Cause: its Escape action moved accessibility focus without emitting the
  renderer `keydown`, `blur`, or `focusin` events used by real keyboard input.
- Resolution: suppress hover in the trigger's real Escape handler until the
  next pointer boundary; use the desktop harness for visual/focus checks, but
  not for this renderer-event edge case.
