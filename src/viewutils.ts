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
