/** expo-battery gives 0..1, or -1 when the device cannot report a level. */
export function toBatteryPercent(raw: number): number | null {
  if (!Number.isFinite(raw) || raw < 0) return null;
  return Math.min(100, Math.round(raw * 100));
}
