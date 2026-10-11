import { describe, expect, it } from 'vitest';
import { encodeCanvas, MAX_ENCODED_BYTES, releaseCanvas } from './image';

/** Minimal canvas: toBlob honours only the types in `supported` (else PNG, like old Safari). */
function fakeCanvas(supported: string[], sizeOf: (type: string, q: number) => number = () => 1000) {
  const calls: Array<[string, number]> = [];
  const canvas = {
    width: 800,
    height: 600,
    toBlob(cb: (b: Blob | null) => void, type: string, q: number) {
      calls.push([type, q]);
      const t = supported.includes(type) ? type : 'image/png';
      cb(new Blob([new Uint8Array(sizeOf(t, q))], { type: t }));
    },
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, calls };
}

describe('encodeCanvas', () => {
  it('falls back to JPEG when the browser cannot encode WebP', async () => {
    const { canvas, calls } = fakeCanvas(['image/jpeg', 'image/png']);
    const { blob } = await encodeCanvas(canvas, 'image/webp', 0.82);
    expect(blob?.type).toBe('image/jpeg');
    expect(calls.map((c) => c[0])).toEqual(['image/webp', 'image/jpeg']);
  });

  it('keeps WebP when supported', async () => {
    const { canvas } = fakeCanvas(['image/webp', 'image/jpeg']);
    expect((await encodeCanvas(canvas, 'image/webp', 0.82)).blob?.type).toBe('image/webp');
  });

  it('lowers JPEG quality until it fits the AI size limit', async () => {
    const { canvas, calls } = fakeCanvas(['image/jpeg'], (_t, q) => (q > 0.6 ? MAX_ENCODED_BYTES + 1 : 1000));
    const { blob } = await encodeCanvas(canvas, 'image/jpeg', 0.82);
    expect(blob!.size).toBeLessThanOrEqual(MAX_ENCODED_BYTES);
    expect(calls.at(-1)).toEqual(['image/jpeg', 0.55]);
  });

  it('releaseCanvas frees the backing store', () => {
    const { canvas } = fakeCanvas([]);
    releaseCanvas(canvas);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });
});
