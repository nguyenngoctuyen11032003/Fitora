import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ db: () => ({}) }));

import { sniffImageType } from './storage';

describe('sniffImageType', () => {
  it('detects formats from bytes, not blob.type', async () => {
    expect(await sniffImageType(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])], { type: 'image/webp' }))).toBe('image/jpeg');
    expect(await sniffImageType(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])]))).toBe('image/png');
    expect(await sniffImageType(new Blob(['RIFF', new Uint8Array([1, 2, 3, 4]), 'WEBP']))).toBe('image/webp');
    expect(await sniffImageType(new Blob(['GIF89a.......']))).toBeNull();
  });
});
