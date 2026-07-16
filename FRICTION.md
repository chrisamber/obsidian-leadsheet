# Friction

## 2026-07-16 — Escape dismissal in Live Preview

- Symptom: desktop automation kept reporting a chord popover after Escape.
- Cause: its Escape action moved accessibility focus without emitting the
  renderer `keydown`, `blur`, or `focusin` events used by real keyboard input.
- Resolution: suppress hover in the trigger's real Escape handler until the
  next pointer boundary; use the desktop harness for visual/focus checks, but
  not for this renderer-event edge case.
