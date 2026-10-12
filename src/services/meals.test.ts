import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fake fit_meal_entries table: rows by id, each with a photo_path; plus saved foods (fit_custom_foods).
let rows: Array<{ id: string; photo_path: string | null }> = [];
let foods: Array<{ id: string; photo_path: string | null }> = [];
let countFails = false;
const removed: string[][] = [];
const inserted: Array<Record<string, unknown>> = [];

function table(name: string) {
  const list = () => (name === 'fit_custom_foods' ? foods : rows);
  return {
    insert: (payload: Array<Record<string, unknown>>) => ({
      select: () => ({
        returns: async () => {
          inserted.push(...payload);
          const out = payload.map((r, i) => ({ id: `new-${rows.length + i}`, created_at: '2026-10-12T09:00:00.000Z', photo_path: null as string | null, ...r }));
          rows.push(...out.map((r) => ({ id: r.id as string, photo_path: (r.photo_path as string | null) ?? null })));
          return { data: out, error: null };
        },
      }),
    }),
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
        countFails ? { count: null, error: { message: 'boom' } } : { count: list().filter((r) => r.photo_path === path).length, error: null },
    }),
  };
}
vi.mock('@/lib/supabase', () => ({ db: () => ({ from: (t: string) => table(t) }) }));
vi.mock('./storage', () => ({
  removeImages: vi.fn(async (p: string[]) => void removed.push(p)),
  signedUrl: vi.fn(),
  uploadImage: vi.fn(),
}));

import { openUndoWindow } from '@/lib/undoWindow';
import { addMealEntries, cancelPhotoCleanup, deleteMeal, PHOTO_CLEANUP_DELAY_MS, PHOTO_CLEANUP_RECHECK_MS, schedulePhotoCleanup } from './meals';

beforeEach(() => {
  vi.useFakeTimers();
  rows = [];
  foods = [];
  removed.length = 0;
  inserted.length = 0;
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

  it('keeps a photo that a saved (scanned) dish still shows', async () => {
    rows = [{ id: '1', photo_path: 'u/meals/p.webp' }];
    foods = [{ id: 'f', photo_path: 'u/meals/p.webp' }];
    await deleteMeal('1');
    await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_DELAY_MS);
    expect(removed).toEqual([]);
  });

  it('schedulePhotoCleanup ignores empty paths and removes unused ones', async () => {
    schedulePhotoCleanup(null);
    schedulePhotoCleanup('u/meals/q.webp');
    await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_DELAY_MS);
    expect(removed).toEqual([['u/meals/q.webp']]);
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

describe('undo of a deleted entry', () => {
  const entry = { eaten_on: '2026-10-12', meal: 'lunch' as const, name: 'Phở bò', quantity: 1, unit: 'bát', photo_path: 'u/meals/p.webp' };

  it('keeps the photo however long the "Hoàn tác" toast stays open (hovered / focused)', async () => {
    rows = [{ id: '1', photo_path: 'u/meals/p.webp' }];
    const release = openUndoWindow(); // the toast with "Hoàn tác" is on screen
    await deleteMeal('1');
    await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_DELAY_MS * 4); // hovered for a minute
    expect(removed).toEqual([]);
    await addMealEntries([entry]); // "Hoàn tác"
    release();
    await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_DELAY_MS * 2);
    expect(removed).toEqual([]);
  });

  it('removes the photo once the toast is gone without an undo', async () => {
    rows = [{ id: '1', photo_path: 'u/meals/p.webp' }];
    const release = openUndoWindow();
    await deleteMeal('1');
    await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_DELAY_MS);
    expect(removed).toEqual([]);
    release();
    await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_RECHECK_MS);
    expect(removed).toEqual([['u/meals/p.webp']]);
  });

  it('re-inserting the photo cancels the pending clean-up (no extra usage check)', async () => {
    rows = [{ id: '1', photo_path: 'u/meals/p.webp' }];
    await deleteMeal('1');
    await addMealEntries([entry]);
    countFails = false;
    rows = []; // even if the check would now say "unused", nothing is scheduled any more
    await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_DELAY_MS * 2);
    expect(removed).toEqual([]);
    cancelPhotoCleanup(null); // harmless
  });

  it('keeps the original created_at so the entry returns to its place in the meal', async () => {
    const [row] = await addMealEntries([{ ...entry, created_at: '2026-10-12T05:30:00+07:00' }]);
    expect(inserted[0].created_at).toBe('2026-10-11T22:30:00.000Z');
    expect(row.created_at).toBe('2026-10-11T22:30:00.000Z');
    await addMealEntries([{ ...entry, created_at: 'not a date' }]);
    expect('created_at' in inserted[1]).toBe(false); // falls back to the DB default
    await addMealEntries([entry]);
    expect('created_at' in inserted[2]).toBe(false);
  });
});
