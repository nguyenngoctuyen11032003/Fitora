/**
 * value / max for progress visuals, safe against NaN, Infinity, max ≤ 0 and
 * negative values. `clamped` ∈ [0, 1]; `over` = value exceeds max.
 */
export function clampRatio(value: number, max: number): { ratio: number; clamped: number; over: boolean } {
  const ratio = Number.isFinite(value) && Number.isFinite(max) && max > 0 ? Math.max(0, value / max) : 0;
  return { ratio, clamped: Math.min(1, ratio), over: ratio > 1 };
}
