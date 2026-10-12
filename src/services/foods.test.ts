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
  parseServingLabel,
  per100FromTotals,
  saveEntryAsFood,
  saveScannedDishes,
  servingUnitOf,
  unmarkCustomFoodUsed,
  updateCustomFood,
  usualServings,
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

  it('keeps 2 decimals (numeric(7,2)) so a large serving re-logs to the same macros', async () => {
    // 450 g with 35 g protein: 1 decimal would store 7.8 g/100 g and re-log 35.1 g.
    const v = per100FromTotals({ name: 'Cơm gà', quantity: 1, unit: 'đĩa', grams: 450, kcal: 700, protein_g: 35 });
    expect(v.protein_100g).toBe(7.78);
    expect(v.kcal_100g).toBe(155.56);
    const f = await createCustomFood({ name: 'Cơm gà', ...v, carbs_100g: 0, fat_100g: 0 });
    expect(f.protein_100g).toBe(7.78); // the service does not re-round to 1 decimal
    expect(customFoodEntry(f, '2026-10-12', 'lunch', 1)).toMatchObject({ grams: 450, kcal: 700, protein_g: 35 });
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

  it('a counted label is logged as count × servings of the bare unit ("2 lát" → 2 lát, not "1 2 lát")', () => {
    const f = food({ serving_label: '2 lát', serving_grams: 60, kcal_100g: 250 });
    expect(customFoodEntry(f, '2026-10-12', 'breakfast', 1)).toMatchObject({ quantity: 2, unit: 'lát', grams: 60, kcal: 150 });
    expect(customFoodEntry(f, '2026-10-12', 'breakfast', 1.5)).toMatchObject({ quantity: 3, unit: 'lát', grams: 90 });
    expect(customFoodEntry(food({ serving_label: '100 g', serving_grams: 100 }), '2026-10-12', 'snack', 2)).toMatchObject({
      quantity: 200,
      unit: 'g',
      grams: 200,
    });
    expect(customFoodEntry(food({ serving_label: '1 phần' }), '2026-10-12', 'snack', 1)).toMatchObject({ quantity: 1, unit: 'phần' });
  });

  it('parseServingLabel', () => {
    expect(parseServingLabel('1 bát')).toEqual({ count: 1, unit: 'bát' });
    expect(parseServingLabel(' 2  lát ')).toEqual({ count: 2, unit: 'lát' });
    expect(parseServingLabel('1,5 chén')).toEqual({ count: 1.5, unit: 'chén' });
    expect(parseServingLabel('1/2 ổ')).toEqual({ count: 0.5, unit: 'ổ' });
    expect(parseServingLabel('100g')).toEqual({ count: 100, unit: 'g' });
    expect(parseServingLabel('3')).toEqual({ count: 3, unit: 'phần' });
    expect(parseServingLabel('bát')).toEqual({ count: 1, unit: 'bát' });
    expect(parseServingLabel('0 bát')).toEqual({ count: 1, unit: '0 bát' });
    expect(parseServingLabel('1/0 ổ')).toEqual({ count: 1, unit: '1/0 ổ' });
    expect(parseServingLabel(null)).toEqual({ count: 1, unit: 'phần' });
    expect(parseServingLabel('2 ' + 'x'.repeat(30)).unit).toHaveLength(20);
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
    expect(f).toMatchObject({ name: 'Bánh mì', kcal_100g: 260.04, source: 'manual' });
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

  it('unmarkCustomFoodUsed restores the pre-bump snapshot (undo) and never throws', async () => {
    const prev = '2026-10-01T07:00:00.000Z';
    const before = food({ id: 'b', use_count: 3, last_used_at: prev, default_meal: 'breakfast' });
    fake.tables.fit_custom_foods = [{ ...before }];
    await markCustomFoodUsed('b', 'dinner');
    expect(fake.tables.fit_custom_foods[0]).toMatchObject({ use_count: 4, default_meal: 'dinner' });
    const rows = await unmarkCustomFoodUsed([before, before]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ use_count: 3, last_used_at: prev, default_meal: 'breakfast' });
    expect(fake.calls.filter((c) => c.rpc === 'fit_unmark_food_used').map((c) => c.args)).toEqual([
      { p_id: 'b', p_prev_last_used_at: prev, p_prev_default_meal: 'breakfast' },
    ]);
    // first use undone → back to "never used"
    const fresh = food({ id: 'c' });
    fake.tables.fit_custom_foods.push({ ...fresh });
    await markCustomFoodUsed('c', 'snack');
    const [c] = await unmarkCustomFoodUsed(fresh);
    expect(c).toMatchObject({ use_count: 0, last_used_at: null, default_meal: null });
    expect(await unmarkCustomFoodUsed(fresh)).toEqual([]); // never below 0
    expect(await unmarkCustomFoodUsed([])).toEqual([]);
    fake.failNext = { rpc: 'fit_unmark_food_used', error: { message: 'boom' } };
    expect(await unmarkCustomFoodUsed(before)).toEqual([]);
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

describe("saved foods: never overwrite the user's numbers, remember the usual amount, no duplicates", () => {
  /** A query-builder stand-in that fails with a Postgres error whatever is chained on it. */
  const failing = (code: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'single', 'returns', 'abortSignal']) chain[m] = () => chain;
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { code } }).then(ok);
    return chain;
  };
  const banh = { name: 'Bánh mì ốp la', quantity: 1, unit: 'đĩa', grams: 350, kcal: 700 };

  it('a rescan does NOT replace a hand-entered (manual) food with AI numbers, but still links, counts and fills the photo', async () => {
    fake.tables.fit_custom_foods = [
      food({ id: 'm', name: 'Bánh mì ốp la', source: 'manual', serving_label: '1 ổ', serving_grams: 200, kcal_100g: 200 }),
    ];
    const [f] = await saveScannedDishes([{ ...banh, name: 'banh mi op la' }], { photoPath: 'me/meals/n.webp', meal: 'breakfast' });
    expect(f).toMatchObject({
      id: 'm', source: 'manual', serving_label: '1 ổ', serving_grams: 200, kcal_100g: 200,
      photo_path: 'me/meals/n.webp', default_meal: 'breakfast', use_count: 1,
    });
    expect(fake.tables.fit_custom_foods).toHaveLength(1);
  });

  it('a food saved from the diary (source "meal") keeps its numbers too; an AI food is refreshed', async () => {
    fake.tables.fit_custom_foods = [
      food({ id: 'a', name: 'Cơm gà', source: 'meal', serving_label: '1 phần', serving_grams: 400, kcal_100g: 150 }),
      food({ id: 'b', name: 'Bún riêu', source: 'ai', serving_grams: 400, kcal_100g: 90 }),
    ];
    const [a, b] = await saveScannedDishes([
      { name: 'Cơm gà', quantity: 1, unit: 'phần', grams: 500, kcal: 1000 },
      { name: 'Bún riêu', quantity: 1, unit: 'tô', grams: 500, kcal: 450 },
    ]);
    expect(a).toMatchObject({ id: 'a', serving_grams: 400, kcal_100g: 150 });
    expect(b).toMatchObject({ id: 'b', serving_label: '1 tô', serving_grams: 500, kcal_100g: 90 });
  });

  it('saveEntryAsFood on an entry whose name is a hand-made food keeps the food and links the entry', async () => {
    fake.tables.fit_custom_foods = [food({ id: 'm', name: 'Sữa chua', source: 'manual', serving_grams: 100, kcal_100g: 60 })];
    fake.tables.fit_meal_entries = [{ id: 'e1', custom_food_id: null }];
    const entry = { id: 'e1', name: 'Sữa chua', quantity: 1, unit: 'hộp', grams: 120, kcal: 500, meal: 'snack', photo_path: null, custom_food_id: null } as never;
    const saved = await saveEntryAsFood(entry);
    expect(saved).toMatchObject({ id: 'm', serving_grams: 100, kcal_100g: 60 });
    expect(fake.tables.fit_meal_entries[0].custom_food_id).toBe('m');
  });

  it('remembers how much was eaten: "2 cái, 600 kcal" → serving "1 cái" + default_servings 2, and a one-tap re-log logs 600 kcal', async () => {
    const [f] = await saveScannedDishes([{ name: 'Bánh bao nhân thịt', quantity: 2, unit: 'cái', grams: 300, kcal: 600 }]);
    expect(f).toMatchObject({ serving_label: '1 cái', serving_grams: 150, default_servings: 2 });
    expect(usualServings(f)).toBe(2);
    expect(customFoodEntry(f, '2026-10-12', 'snack')).toMatchObject({ quantity: 2, unit: 'cái', grams: 300, kcal: 600 });
    expect(customFoodEntry(f, '2026-10-12', 'snack', 1)).toMatchObject({ quantity: 1, unit: 'cái', kcal: 300 }); // explicit amount wins
    fake.tables.fit_meal_entries = [];
    const e = await logCustomFood(f, '2026-10-12', 'snack');
    expect(e).toMatchObject({ quantity: 2, kcal: 600, custom_food_id: f.id });
  });

  it('one unit is stored as null (= 1); a weight dish has no usual amount', async () => {
    const [a, b] = await saveScannedDishes([
      { name: 'Phở bò', quantity: 1, unit: 'bát', grams: 500, kcal: 450 },
      { name: 'Khoai lang', quantity: 200, unit: 'g', grams: 200, kcal: 180 },
    ]);
    expect(a.default_servings ?? null).toBeNull();
    expect(b.default_servings ?? null).toBeNull();
    expect(usualServings(a)).toBe(1);
    expect(usualServings(null)).toBe(1);
    expect(usualServings({ default_servings: 0 })).toBe(1);
  });

  it('a rescan of the same unit updates the usual amount, also for a manual food (counted in ITS serving)', async () => {
    fake.tables.fit_custom_foods = [
      food({ id: 'm', name: 'Trứng ốp', source: 'manual', serving_label: '2 quả', serving_grams: 100, kcal_100g: 150 }),
      food({ id: 'x', name: 'Bánh bao', source: 'manual', serving_label: '1 cái', serving_grams: 150 }),
    ];
    const [m, x] = await saveScannedDishes([
      { name: 'Trứng ốp', quantity: 3, unit: 'quả', grams: 150, kcal: 225 },
      { name: 'Bánh bao', quantity: 2, unit: 'chiếc', grams: 300, kcal: 600 }, // other unit: cannot tell, left alone
    ]);
    expect(m).toMatchObject({ serving_label: '2 quả', serving_grams: 100, default_servings: 1.5 });
    expect(x.default_servings ?? null).toBeNull();
  });

  it('logging a different amount (QuickLogSheet) becomes the new usual amount; the same amount writes nothing', async () => {
    const f = food({ id: 'f1', name: 'Bánh bao', serving_label: '1 cái', serving_grams: 150, default_servings: 2 });
    fake.tables.fit_custom_foods = [{ ...f }];
    fake.tables.fit_meal_entries = [];
    await logCustomFood(f, '2026-10-12', 'snack', 2);
    expect(fake.calls.some((c) => c.table === 'fit_custom_foods' && c.op === 'update')).toBe(false);
    await logCustomFood(f, '2026-10-12', 'snack', 3);
    expect(fake.tables.fit_custom_foods[0].default_servings).toBe(3);
    await logCustomFood({ ...f, default_servings: 3 }, '2026-10-12', 'snack', 1);
    expect(fake.tables.fit_custom_foods[0].default_servings).toBeNull();
  });

  it('new foods get a name_key; renaming releases it; manual create has none', async () => {
    const [f] = await saveScannedDishes([{ name: 'Phở Bò', quantity: 1, unit: 'bát', grams: 500, kcal: 450 }]);
    expect(fake.tables.fit_custom_foods.find((r) => r.id === f.id)?.name_key).toBe('pho bo');
    await updateCustomFood(f.id, { name: 'Phở tái' });
    expect(fake.tables.fit_custom_foods.find((r) => r.id === f.id)?.name_key).toBeNull();
    await updateCustomFood(f.id, { kcal_100g: 80 });
    expect(fake.tables.fit_custom_foods.find((r) => r.id === f.id)?.kcal_100g).toBe(80);
    const m = await createCustomFood({ name: 'Cơm', serving_grams: 100, kcal_100g: 100, protein_100g: 0, carbs_100g: 0, fat_100g: 0 });
    expect(fake.tables.fit_custom_foods.find((r) => r.id === m.id)?.name_key).toBeNull();
  });

  it('a concurrent save of the same new dish (unique name_key violated) retries and updates the winner instead of failing or duplicating', async () => {
    const winner = food({ id: 'w', name: 'Cơm tấm', source: 'ai', serving_grams: 400, kcal_100g: 100 });
    const realFrom = fake.from.bind(fake);
    let raced = false;
    fake.from = (table: string) => {
      const b = realFrom(table);
      if (table !== 'fit_custom_foods') return b;
      const realInsert = b.insert.bind(b);
      b.insert = ((p: never) => {
        if (raced) return realInsert(p);
        raced = true;
        fake.tables.fit_custom_foods.push({ ...winner, name_key: 'com tam' }); // the other tab got there first
        return failing('23505');
      }) as never;
      return b;
    };
    const [f] = await saveScannedDishes([{ name: 'Cơm tấm', quantity: 1, unit: 'đĩa', grams: 450, kcal: 765 }]);
    expect(raced).toBe(true);
    expect(fake.tables.fit_custom_foods.filter((r) => r.name === 'Cơm tấm')).toHaveLength(1);
    expect(f).toMatchObject({ id: 'w', serving_label: '1 đĩa', serving_grams: 450, use_count: 1 });
  });

  it('a name_key already taken by an older duplicate does not fail the update', async () => {
    fake.tables.fit_custom_foods = [food({ id: 'o', name: 'Chè', source: 'ai', kcal_100g: 100 })];
    const realFrom = fake.from.bind(fake);
    let failed = false;
    fake.from = (table: string) => {
      const b = realFrom(table);
      const realUpdate = b.update.bind(b);
      b.update = ((patch: Record<string, unknown>) => {
        if (!failed && patch.name_key) {
          failed = true;
          return failing('23505');
        }
        return realUpdate(patch);
      }) as never;
      return b;
    };
    const [f] = await saveScannedDishes([{ name: 'Chè', quantity: 1, unit: 'cốc', grams: 200, kcal: 300 }]);
    expect(failed).toBe(true);
    expect(f).toMatchObject({ id: 'o', serving_label: '1 cốc', kcal_100g: 150 });
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

  it('a new food starts at one use; saving it again (or onto an existing food) never bumps the count', async () => {
    fake.tables.fit_meal_entries = [{ id: 'e1', custom_food_id: null }, { id: 'e2', custom_food_id: null }];
    const entry = {
      id: 'e1', user_id: 'me', eaten_on: '2026-10-12', meal: 'dinner' as const, name: 'Canh chua', quantity: 1, unit: 'bát',
      grams: 300, kcal: 120, protein_g: 8, carbs_g: 10, fat_g: 4, fiber_g: 2, source: 'manual' as const,
      custom_food_id: null, photo_path: null, ai_meta: null, created_at: '', updated_at: '',
    };
    const first = await saveEntryAsFood(entry);
    expect(first.use_count).toBe(1);
    const again = await saveEntryAsFood({ ...entry, custom_food_id: first.id });
    expect(again.id).toBe(first.id);
    await saveEntryAsFood({ ...entry, id: 'e2' });
    expect(fake.tables.fit_custom_foods).toHaveLength(1);
    expect(fake.tables.fit_custom_foods[0].use_count).toBe(1);
    expect(fake.tables.fit_meal_entries[1].custom_food_id).toBe(first.id);
    // a rescan is a real use and still bumps
    await saveScannedDishes([{ name: 'Canh chua', quantity: 1, unit: 'bát', grams: 300, kcal: 120 }]);
    expect(fake.tables.fit_custom_foods[0].use_count).toBe(2);
  });
});
