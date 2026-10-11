import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUrls = vi.fn();
const createSignedUrl = vi.fn();
const remove = vi.fn();
const bucket = { createSignedUrls, createSignedUrl, remove };
vi.mock('@/lib/supabase', () => ({ db: () => ({ storage: { from: () => bucket } }) }));

import { forgetSignedUrls, removeImages, signedUrl, signedUrlExpiry, signedUrls } from './storage';

const TTL = 3600;
let n = 0;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-11T08:00:00Z'));
  forgetSignedUrls();
  n = 0;
  createSignedUrls.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://x/${path}?v=${++n}`, error: null })),
    error: null,
  }));
  createSignedUrl.mockImplementation(async (path: string) => ({ data: { signedUrl: `https://x/${path}?v=${++n}` }, error: null }));
  remove.mockResolvedValue({ data: [], error: null });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('signed URL cache', () => {
  it('reports the real expiry of the link it returned', async () => {
    await signedUrls(['u/meals/a.webp'], TTL);
    expect(signedUrlExpiry('u/meals/a.webp')).toBe(Date.now() + TTL * 1000);
    expect(signedUrlExpiry('u/meals/none.webp')).toBeUndefined();
  });

  it('reuses a link only during the first half of its life, so callers always get ≥ ttl/2 left', async () => {
    const first = await signedUrls(['p'], TTL);
    vi.advanceTimersByTime((TTL / 2 - 1) * 1000);
    expect(await signedUrls(['p'], TTL)).toEqual(first);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000); // past half-life → re-sign instead of handing out a link with < 30 min left
    const second = await signedUrls(['p'], TTL);
    expect(second.p).not.toBe(first.p);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    expect(signedUrlExpiry('p')).toBe(Date.now() + TTL * 1000);
  });

  it('signs duplicates once and shares the cache with signedUrl', async () => {
    const map = await signedUrls(['a', 'a', '', 'b'], TTL);
    expect(createSignedUrls).toHaveBeenCalledWith(['a', 'b'], TTL);
    expect(await signedUrl('a', TTL)).toBe(map.a);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('drops cached links for removed images', async () => {
    await signedUrls(['gone'], TTL);
    await removeImages(['gone']);
    expect(signedUrlExpiry('gone')).toBeUndefined();
  });
});
