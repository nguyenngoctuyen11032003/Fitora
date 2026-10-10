// Cheap scene-stability check for Live Scan: compare tiny grayscale thumbnails.

/** Luma of an RGBA buffer, one byte per pixel. */
export function toLuma(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length >> 2);
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    out[j] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  }
  return out;
}

/** Mean absolute difference (0–255) between two equally sized luma buffers; Infinity when not comparable. */
export function frameDiff(a: Uint8Array | null, b: Uint8Array | null): number {
  if (!a || !b || a.length !== b.length || !a.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Average brightness 0–255 (too dark → ask for more light, skip the AI call). */
export function meanLuma(a: Uint8Array): number {
  if (!a.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i];
  return sum / a.length;
}

export const STABLE_DIFF = 9;
export const DARK_LUMA = 28;
