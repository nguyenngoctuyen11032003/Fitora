import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake fit_meal_entries table: rows by id, each with a photo_path.
let rows: Array<{ id: string; photo_path: string | null }> = [];
let countFails = false;
const removed: string[][] = [];

function table() {
  return {
    delete: () => ({
      eq: (_c: string, id: string) => ({
        select: () => ({
          maybeSingle: async () => {
            const row = rows.find((r) => r.id === id) ?? null;
            rows = rows.filter((r) => r.id !== id);
            return { data: row && { photo_path: row.photo_path }, error: null };
          },
        }),
      }),
    }),
    select: () => ({
      eq: async (_c: string, path: string) =>
        countFails ? { count: null, error: { message: 'boom' } } : { count: rows.filter((r) => r.photo_path === path).length, error: null },
    }),
  };
}
vi.mock('@/lib/supabase', () => ({ db: () => ({ from: () => table() }) }));
vi.mock('./storage', () => ({
  removeImages: vi.fn(async (p: string[]) => void removed.push(p)),
  signedUrl: vi.fn(),
  uploadImage: vi.fn(),
}));

import { deleteMeal, PHOTO_CLEANUP_DELAY_MS } from './meals';

beforeEach(() => {
  vi.useFakeTimers();
  rows = [];
  removed.length = 0;
  countFails = false;
});
afterEach(() => vi.useRealTimers());

describe('deleteMeal photo cleanup', () => {
  it('keeps the photo during the undo window so a restored entry still has it', async () => {
    rows = [{ id: '1', photo_path: 'u/meals/p.webp' }];
    await deleteMeal('1');
    await vi.advanceTimersByTimeAsync(3200); // toast with "Hoàn tác" still visible
    expect(removed).toEqual([]);
    rows.push({ id: '2', photo_path: 'u/meals/p.webp' }); // undo re-inserts with the same photo_path
    await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_DELAY_MS);
    expect(removed).toEqual([]);
  });

  it('removes the photo after the delay when nothing uses it', async () => {
    rows = [{ id: '1', photo_path: 'u/meals/p.webp' }];
    await deleteMeal('1');
    await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_DELAY_MS);
    expect(removed).toEqual([['u/meals/p.webp']]);
  });

  it('keeps a photo shared with another dish of the same scan', async () => {
    rows = [
      { id: '1', photo_path: 'u/meals/p.webp' },
      { id: '2', photo_path: 'u/meals/p.webp' },
    ];
    await deleteMeal('1');
    await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_DELAY_MS);
    expect(removed).toEqual([]);
  });

  it('keeps the photo when the usage check fails', async () => {
    rows = [{ id: '1', photo_path: 'u/meals/p.webp' }];
    countFails = true;
    await deleteMeal('1');
    await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_DELAY_MS);
    expect(removed).toEqual([]);
  });

  it('the undo window is longer than the default toast', () => {
    expect(PHOTO_CLEANUP_DELAY_MS).toBeGreaterThan(5000);
  });
});
