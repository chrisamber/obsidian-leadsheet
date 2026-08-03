export function clampCapo(raw: string | undefined): { capo: number; bad: boolean } {
  if (raw == null || raw === "") return { capo: 0, bad: false };
  const n = parseInt(raw, 10);
  if (isNaN(n)) return { capo: 0, bad: true };
  const capo = Math.min(Math.max(n, 0), 11);
  return { capo, bad: capo !== n };
}

export function scrollSpeedForDuration(contentPx: number, durationSec: number): number {
  return durationSec > 0 ? contentPx / durationSec : 0;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Size {
  width: number;
  height: number;
}

export function chordPopoverPlacement(
  trigger: Bounds,
  popover: Size,
  viewport: Size,
  margin = 8,
  gap = 9
): { shiftX: number; below: boolean } {
  const idealLeft = (trigger.left + trigger.right - popover.width) / 2;
  const maxLeft = viewport.width - margin - popover.width;
  const left = maxLeft < margin
    ? margin
    : Math.min(Math.max(idealLeft, margin), maxLeft);
  const above = trigger.top - margin;
  const below = viewport.height - trigger.bottom - margin;
  return {
    shiftX: left - idealLeft,
    below: above < popover.height + gap && below > above,
  };
}

export function shouldHoldWakeLock(
  performanceMode: boolean,
  visibilityState: DocumentVisibilityState,
  supported: boolean
): boolean {
  return performanceMode && visibilityState === "visible" && supported;
}
