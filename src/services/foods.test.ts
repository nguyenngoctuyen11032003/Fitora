import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomFood } from '@/types/db';
import { createFakeDb, type FakeDb } from './fakeDb.testutil';

let fake: FakeDb;
vi.mock('@/lib/supabase', () => ({ db: () => fake }));
const removed: string[][] = [];
vi.mock('./storage', () => ({
  removeImages: vi.fn(async (p: string[]) => void removed.push(p)),
  signedUrl: vi.fn(),
  uploadImage: vi.fn(),
}));

import {
  compareByUse,
  createCustomFood,
  customFoodEntry,
  deleteCustomFood,
  findCustomFoodByName,
  listCustomFoods,
  logCustomFood,
  markCustomFoodUsed,
  normalizeFoodName,
  per100FromTotals,
  saveEntryAsFood,
  saveScannedDishes,
  servingUnitOf,
  updateCustomFood,
} from './foods';
import { PHOTO_CLEANUP_DELAY_MS } from './meals';

const food = (o: Partial<CustomFood>): CustomFood => ({
  id: 'f',
  user_id: 'me',
  name: 'Món',
  brand: null,
  serving_label: '1 phần',
  serving_grams: 100,
  kcal_100g: 100,
  protein_100g: 0,
  carbs_100g: 0,
  fat_100g: 0,
  fiber_100g: 0,
  source: 'manual',
  photo_path: null,
  use_count: 0,
  last_used_at: null,
  default_meal: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...o,
});

beforeEach(() => {
  fake = createFakeDb();
  removed.length = 0;
});

describe('normalizeFoodName', () => {
  it('ignores case, diacritics, đ, punctuation and extra spaces', () => {
    expect(normalizeFoodName('  Phở   Bò ')).toBe('pho bo');
    expect(normalizeFoodName('PHỞ-BÒ')).toBe('pho bo');
    expect(normalizeFoodName('Đậu phụ sốt cà')).toBe('dau phu sot ca');
    expect(normalizeFoodName(null)).toBe('');
  });
});

describe('compareByUse', () => {
  it('recent first, never-used last, then use_count, then name (Vietnamese order)', () => {
    const list = [
      food({ id: 'a', name: 'Bún', last_used_at: null, use_count: 9 }),
      food({ id: 'b', name: 'Cơm', last_used_at: '2026-10-10T00:00:00Z', use_count: 1 }),
      food({ id: 'c', name: 'Ăn sáng', last_used_at: null, use_count: 9 }),
      food({ id: 'd', name: 'Phở', last_used_at: '2026-10-11T00:00:00Z', use_count: 1 }),
      food({ id: 'e', name: 'Xôi', last_used_at: null, use_count: 0 }),
    ];
    expect([...list].sort(compareByUse).map((f) => f.id)).toEqual(['d', 'b', 'c', 'a', 'e']);
  });
});

describe('per100FromTotals', () => {
  it('turns "1.5 bát, 750 g" into one bát of 500 g with per-100 g values', () => {
    expect(per100FromTotals({ name: 'Phở', quantity: 1.5, unit: 'bát', grams: 750, kcal: 675, protein_g: 37.5, carbs_g: 82.5, fat_g: 18, fiber_g: 3 })).toEqual({
      serving_label: '1 bát',
      serving_grams: 500,
      kcal_100g: 90,
      protein_100g: 5,
      carbs_100g: 11,
      fat_100g: 2.4,
      fiber_100g: 0.4,
    });
  });

  it('grams-like units become one "phần" of the whole amount', () => {
    const v = per100FromTotals({ name: 'Ức gà', quantity: 200, unit: 'g', grams: 200, kcal: 330, protein_g: 62 });
    expect(v).toMatchObject({ serving_label: '1 phần', serving_grams: 200, kcal_100g: 165, protein_100g: 31 });
  });

  it('missing or implausibly small weight still round-trips the kcal of one serving', () => {
    const noWeight = per100FromTotals({ name: 'x', quantity: 1, unit: 'đĩa', grams: 0, kcal: 650 });
    expect(noWeight.serving_grams).toBe(100);
    expect((noWeight.kcal_100g * noWeight.serving_grams) / 100).toBe(650);
    const tooDense = per100FromTotals({ name: 'x', quantity: 1, unit: 'cái', grams: 20, kcal: 400, fat_g: 30 });
    expect(tooDense.kcal_100g).toBeLessThanOrEqual(1000);
    expect(tooDense.fat_100g).toBeLessThanOrEqual(100);
    expect(Math.round((tooDense.kcal_100g * tooDense.serving_grams) / 100)).toBe(400);
  });

  it('never produces NaN / negative values', () => {
    const v = per100FromTotals({ name: 'x', quantity: NaN, unit: '', grams: -5, kcal: -1, protein_g: Infinity });
    for (const n of Object.values(v)) if (typeof n === 'number') expect(Number.isFinite(n) && n >= 0).toBe(true);
    expect(v.serving_label).toBe('1 phần');
  });
});

describe('customFoodEntry / servingUnitOf', () => {
  it('builds a linked entry for N servings sharing the photo', () => {
    const f = food({ id: 'f1', name: 'Bún bò Huế', serving_label: '1 bát', serving_grams: 550, kcal_100g: 98.2, protein_100g: 5.5, photo_path: 'me/meals/a.webp' });
    expect(customFoodEntry(f, '2026-10-12', 'lunch', 2)).toEqual({
      eaten_on: '2026-10-12',
      meal: 'lunch',
      name: 'Bún bò Huế',
      quantity: 2,
      unit: 'bát',
      grams: 1100,
      kcal: 1080.2,
      protein_g: 60.5,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      source: 'custom',
      custom_food_id: 'f1',
      photo_path: 'me/meals/a.webp',
    });
    expect(customFoodEntry(f, '2026-10-12', 'lunch', 0).quantity).toBe(1);
    expect(servingUnitOf('2 lát')).toBe('2 lát');
    expect(servingUnitOf('')).toBe('phần');
  });
});

describe('CRUD', () => {
  it('lists most recently / frequently used first', async () => {
    fake.tables.fit_custom_foods = [
      food({ id: 'a', name: 'A', last_used_at: null }),
      food({ id: 'b', name: 'B', last_used_at: '2026-10-11T00:00:00Z' }),
    ];
    expect((await listCustomFoods()).map((f) => f.id)).toEqual(['b', 'a']);
  });

  it('create validates and strips usage counters', async () => {
    await expect(createCustomFood({ name: '  ', serving_grams: 100, kcal_100g: 1, protein_100g: 0, carbs_100g: 0, fat_100g: 0 })).rejects.toThrow('Hãy nhập tên món.');
    await expect(createCustomFood({ name: 'x', serving_grams: 100, kcal_100g: 1200, protein_100g: 0, carbs_100g: 0, fat_100g: 0 })).rejects.toThrow(/1000 kcal/);
    await expect(createCustomFood({ name: 'x', serving_grams: 100, kcal_100g: 10, protein_100g: 0, carbs_100g: 0, fat_100g: 0, default_meal: 'brunch' as never })).rejects.toThrow('Bữa ăn không hợp lệ.');
    const f = await createCustomFood({ name: ' Bánh  mì ', serving_grams: 120, kcal_100g: 260.04, protein_100g: 9, carbs_100g: 50, fat_100g: 3, source: 'bogus' as never });
    expect(f).toMatchObject({ name: 'Bánh mì', kcal_100g: 260, source: 'manual' });
    const u = await updateCustomFood(f.id, { use_count: 99, name: 'Bánh mì que' } as never);
    expect(u.use_count).toBe(0);
    expect(u.name).toBe('Bánh mì que');
  });

  it('delete cleans the photo later only when nothing else uses it', async () => {
    vi.useFakeTimers();
    try {
      fake.tables.fit_custom_foods = [food({ id: 'a', photo_path: 'me/meals/a.webp' }), food({ id: 'b', photo_path: 'me/meals/b.webp' })];
      fake.tables.fit_meal_entries = [{ id: 'm', photo_path: 'me/meals/b.webp' }];
      await deleteCustomFood('a');
      await deleteCustomFood('b');
      await vi.advanceTimersByTimeAsync(PHOTO_CLEANUP_DELAY_MS);
      expect(removed).toEqual([['me/meals/a.webp']]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('markCustomFoodUsed bumps, remembers the meal, dedupes and never throws', async () => {
    fake.tables.fit_custom_foods = [food({ id: 'a' })];
    const rows = await markCustomFoodUsed(['a', 'a', ''], 'dinner');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ use_count: 1, default_meal: 'dinner' });
    expect(fake.calls.filter((c) => c.rpc).map((c) => c.args)).toEqual([{ p_ids: ['a'], p_meal: 'dinner' }]);
    expect(await markCustomFoodUsed([])).toEqual([]);
    fake.failNext = { rpc: 'fit_mark_food_used', error: { message: 'boom' } };
    expect(await markCustomFoodUsed('a')).toEqual([]);
  });

  it('findCustomFoodByName matches without diacritics and prefers the most used duplicate', async () => {
    const list = [food({ id: 'old', name: 'Phở bò', use_count: 1 }), food({ id: 'hot', name: 'PHO BO', use_count: 5 })];
    expect((await findCustomFoodByName('pho bò', list))?.id).toBe('hot');
    expect(await findCustomFoodByName('bún', list)).toBeNull();
    expect(await findCustomFoodByName('  ', list)).toBeNull();
    fake.tables.fit_custom_foods = list;
    expect((await findCustomFoodByName('Phở Bò'))?.id).toBe('hot');
  });

  it('logCustomFood inserts a linked entry and counts the use', async () => {
    const f = food({ id: 'a', name: 'Sữa chua', serving_label: '1 hũ', serving_grams: 150, kcal_100g: 97 });
    fake.tables.fit_custom_foods = [f];
    const e = await logCustomFood(f, '2026-10-12', 'snack');
    expect(e).toMatchObject({ name: 'Sữa chua', unit: 'hũ', kcal: 145.5, custom_food_id: 'a', source: 'custom' });
    expect(fake.tables.fit_custom_foods[0]).toMatchObject({ use_count: 1, default_meal: 'snack' });
    await expect(logCustomFood(f, '12/10/2026', 'snack')).rejects.toThrow('Ngày ăn không hợp lệ.');
    await expect(logCustomFood(f, '2026-10-12', 'brunch' as never)).rejects.toThrow('Hãy chọn bữa ăn.');
  });
});

describe('saveScannedDishes', () => {
  const pho = { name: 'Phở bò', quantity: 1, unit: 'bát', grams: 500, kcal: 450, protein_g: 25, carbs_g: 55, fat_g: 12, fiber_g: 2 };
  const tra = { name: 'Trà đá', quantity: 1, unit: 'cốc', grams: 250, kcal: 0 };

  it('inserts new dishes as source "ai" with the scan photo, counted as one use, in input order', async () => {
    const saved = await saveScannedDishes([pho, tra], { photoPath: 'me/meals/s1.webp', meal: 'breakfast' });
    expect(saved.map((f) => f.name)).toEqual(['Phở bò', 'Trà đá']);
    expect(saved[0]).toMatchObject({
      source: 'ai', photo_path: 'me/meals/s1.webp', default_meal: 'breakfast', use_count: 1,
      serving_label: '1 bát', serving_grams: 500, kcal_100g: 90,
    });
    expect(fake.tables.fit_custom_foods).toHaveLength(2);
  });

  it('re-scanning the same dish (other spelling) updates it instead of duplicating, keeping its photo', async () => {
    fake.tables.fit_custom_foods = [food({ id: 'p', name: 'Phở bò', source: 'ai', photo_path: 'me/meals/old.webp', use_count: 3, kcal_100g: 80 })];
    const [f] = await saveScannedDishes([{ ...pho, name: 'PHO BO', kcal: 500 }], { photoPath: 'me/meals/new.webp', meal: 'lunch' });
    expect(fake.tables.fit_custom_foods).toHaveLength(1);
    expect(f).toMatchObject({ id: 'p', name: 'Phở bò', photo_path: 'me/meals/old.webp', kcal_100g: 100, use_count: 4, default_meal: 'lunch' });
  });

  it('fills a missing photo; same dish twice in one scan → one food, both positions return it', async () => {
    fake.tables.fit_custom_foods = [food({ id: 'p', name: 'Phở bò', photo_path: null })];
    const out = await saveScannedDishes([pho, { ...pho, name: 'phở bò ' }], { photoPath: 'me/meals/s.webp' });
    expect(out.map((f) => f.id)).toEqual(['p', 'p']);
    expect(out[0].photo_path).toBe('me/meals/s.webp');
    expect(out[0].use_count).toBe(1);
  });

  it('validates names and handles an empty list', async () => {
    expect(await saveScannedDishes([])).toEqual([]);
    await expect(saveScannedDishes([{ ...pho, name: ' ' }])).rejects.toThrow('Hãy nhập tên món.');
  });

  it('a failing usage bump does not fail the save', async () => {
    fake.failNext = { rpc: 'fit_mark_food_used', error: { message: 'x' } };
    const [f] = await saveScannedDishes([pho]);
    expect(f.use_count).toBe(0);
  });
});

describe('saveEntryAsFood', () => {
  it('saves a diary entry as source "meal" and links the entry', async () => {
    fake.tables.fit_meal_entries = [{ id: 'e1', custom_food_id: null }];
    const entry = {
      id: 'e1', user_id: 'me', eaten_on: '2026-10-12', meal: 'dinner' as const, name: 'Canh chua', quantity: 1, unit: 'bát',
      grams: 300, kcal: 120, protein_g: 8, carbs_g: 10, fat_g: 4, fiber_g: 2, source: 'manual' as const,
      custom_food_id: null, photo_path: null, ai_meta: null, created_at: '', updated_at: '',
    };
    const f = await saveEntryAsFood(entry);
    expect(f).toMatchObject({ name: 'Canh chua', source: 'meal', default_meal: 'dinner', serving_label: '1 bát', kcal_100g: 40 });
    expect(fake.tables.fit_meal_entries[0].custom_food_id).toBe(f.id);
  });
});
