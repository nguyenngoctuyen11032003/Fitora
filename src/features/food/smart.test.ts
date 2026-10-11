// "Remember, don't repeat": saved foods, suggestions per meal, meal-template helpers.
import { describe, expect, it } from 'vitest';
import { FOODS } from '@/data/foods';
import type { CustomFood, MealEntry, MealTemplate } from '@/types/db';
import {
  bumpUsage,
  computePortion,
  daysBetween,
  defaultPortion,
  defaultTemplateName,
  dishesSummary,
  fromCustomFood,
  fromDbFood,
  fromEntry,
  lastPortion,
  mealSuggestions,
  recentFoods,
  relativeDayVi,
  sameDishes,
  searchFoods,
  templatesForMeal,
  toNewEntry,
  usageLabel,
  withDbAliases,
} from './lib';

let n = 0;
const entry = (over: Partial<MealEntry>): MealEntry => ({
  id: `e${++n}`,
  user_id: 'u',
  eaten_on: '2026-10-11',
  meal: 'breakfast',
  name: 'Phở bò',
  quantity: 1,
  unit: 'bát',
  grams: 500,
  kcal: 450,
  protein_g: 27.5,
  carbs_g: 55,
  fat_g: 13,
  fiber_g: 2,
  source: 'search',
  custom_food_id: null,
  photo_path: null,
  ai_meta: null,
  created_at: '2026-10-11T01:00:00Z',
  updated_at: '2026-10-11T01:00:00Z',
  ...over,
});

const food = (over: Partial<CustomFood>): CustomFood => ({
  id: 'c1',
  user_id: 'u',
  name: 'Bún bò Huế',
  brand: null,
  serving_label: '1 bát',
  serving_grams: 600,
  kcal_100g: 95,
  protein_100g: 5,
  carbs_100g: 11,
  fat_100g: 3.2,
  fiber_100g: 0.5,
  source: 'ai',
  photo_path: 'u/meals/bunbo.webp',
  use_count: 3,
  last_used_at: '2026-10-10T05:00:00Z',
  default_meal: 'lunch',
  created_at: '',
  updated_at: '',
  ...over,
});

const tpl = (over: Partial<MealTemplate>): MealTemplate => ({
  id: 't1',
  user_id: 'u',
  name: 'Sáng quen thuộc',
  meal: 'breakfast',
  items: [],
  total_kcal: 0,
  use_count: 0,
  last_used_at: null,
  created_at: '',
  updated_at: '',
  ...over,
});

describe('saved foods as options', () => {
  it('fromCustomFood carries photo + usage, and re-logging shares the photo', () => {
    const o = fromCustomFood(food({}));
    expect(o.photoPath).toBe('u/meals/bunbo.webp');
    expect(o.useCount).toBe(3);
    expect(o.savedFrom).toBe('ai');
    const row = toNewEntry(o, 1, 'bát', 'lunch', '2026-10-12');
    expect(row).toMatchObject({ source: 'custom', custom_food_id: 'c1', photo_path: 'u/meals/bunbo.webp', grams: 600, kcal: 570 });
  });

  it('DB foods never get a photo; past entries keep theirs', () => {
    const db = fromDbFood(FOODS[0]);
    expect(toNewEntry(db, 1, db.defaultUnit, 'lunch', '2026-10-12').photo_path).toBeNull();
    const h = fromEntry(entry({ source: 'ai', photo_path: 'u/meals/p.webp' }));
    expect(h.photoPath).toBe('u/meals/p.webp');
    expect(toNewEntry(h, 1, 'bát', 'lunch', '2026-10-12').photo_path).toBe('u/meals/p.webp');
  });

  it('recentFoods keeps the saved photo of a linked entry', () => {
    const cf = food({});
    const r = recentFoods([entry({ name: 'Bún bò Huế', custom_food_id: 'c1', source: 'custom', grams: 600 })], FOODS, [cf]);
    expect(r[0].option.key).toBe('custom:c1');
    expect(r[0].option.photoPath).toBe('u/meals/bunbo.webp');
  });
});

describe('search puts saved and frequent foods first', () => {
  const pool = [...FOODS.map(fromDbFood)];
  it('a saved "Bún bò Huế" outranks the database dish of the same name tier', () => {
    const saved = fromCustomFood(food({ name: 'Bún bò Huế nhà làm', use_count: 9 }));
    const res = searchFoods('bun bo h', [...pool, saved]);
    expect(res[0].key).toBe('custom:c1');
  });

  it('a saved dish named like a database dish answers to its aliases and ranks first', () => {
    const saved = withDbAliases(fromCustomFood(food({ name: 'Bún bò Huế' })), FOODS);
    expect(saved.searchKeys.length).toBeGreaterThan(1);
    expect(searchFoods('bun bo', [...pool, saved])[0].key).toBe('custom:c1');
    expect(searchFoods('bun bo hue', [...pool, saved])[0].key).toBe('custom:c1');
    // The database dish is still offered, right after.
    expect(searchFoods('bun bo hue', [...pool, saved])[1].key).toBe('db:bun_bo_hue');
    // Non-saved options and unmatched names are returned as is.
    const db = pool[0];
    expect(withDbAliases(db, FOODS)).toBe(db);
    const odd = fromCustomFood(food({ name: 'Món lạ của mẹ' }));
    expect(withDbAliases(odd, FOODS)).toBe(odd);
  });

  it('more uses → higher among saved foods; an exact match still wins its tier', () => {
    const a = fromCustomFood(food({ id: 'a', name: 'Cơm gà xé', use_count: 1 }));
    const b = fromCustomFood(food({ id: 'b', name: 'Cơm gà luộc', use_count: 8 }));
    expect(searchFoods('com ga', [a, b]).map((o) => o.key)).toEqual(['custom:b', 'custom:a']);
    const exact = fromCustomFood(food({ id: 'x', name: 'Cơm gà', use_count: 0 }));
    expect(searchFoods('com ga', [a, b, exact])[0].key).toBe('custom:x');
  });
});

describe('portions', () => {
  it('defaultPortion: 1 unit, or 100 g for weight units', () => {
    expect(defaultPortion({ defaultUnit: 'bát' })).toEqual({ quantity: 1, unit: 'bát' });
    expect(defaultPortion({ defaultUnit: 'g' })).toEqual({ quantity: 100, unit: 'g' });
    expect(defaultPortion({ defaultUnit: 'ml' })).toEqual({ quantity: 100, unit: 'ml' });
  });

  it('lastPortion keeps the unit when the food offers it, else falls back', () => {
    const o = fromCustomFood(food({}));
    expect(lastPortion(o, { unit: 'bát', quantity: 1.5, grams: 900 })).toEqual({ quantity: 1.5, unit: 'bát' });
    expect(lastPortion(o, { unit: 'g', quantity: 300, grams: 300 })).toEqual({ quantity: 300, unit: 'g' });
    expect(lastPortion(o, { unit: 'đĩa', quantity: 2, grams: 0 })).toEqual({ quantity: 1, unit: 'bát' });
  });
});

describe('mealSuggestions', () => {
  const date = '2026-10-12';
  it('ranks what is usually eaten at that meal, recent habits weighing more', () => {
    const rows = [
      entry({ eaten_on: '2026-10-11', name: 'Bánh mì trứng', unit: 'ổ', quantity: 1, grams: 150, kcal: 350 }),
      entry({ eaten_on: '2026-10-10', name: 'Bánh mì trứng', unit: 'ổ', quantity: 1, grams: 150, kcal: 350 }),
      entry({ eaten_on: '2026-09-01', name: 'Xôi xéo', unit: 'gói', quantity: 1, grams: 200, kcal: 400 }),
      entry({ eaten_on: '2026-09-02', name: 'Xôi xéo', unit: 'gói', quantity: 1, grams: 200, kcal: 400 }),
      entry({ eaten_on: '2026-10-11', meal: 'dinner', name: 'Lẩu thái' }),
    ];
    const s = mealSuggestions({ entries: rows, customs: [], foods: FOODS, meal: 'breakfast', date });
    expect(s.map((x) => x.option.name)).toEqual(['Bánh mì trứng', 'Xôi xéo']);
    expect(s[0].count).toBe(2);
    expect(s[0].score).toBeGreaterThan(s[1].score);
  });

  it('keeps the portion last eaten at that meal', () => {
    const rows = [
      entry({ eaten_on: '2026-10-11', created_at: '2026-10-11T01:00:00Z', quantity: 2, grams: 1000, kcal: 900 }),
      entry({ eaten_on: '2026-10-05', quantity: 1, grams: 500 }),
    ];
    const [s] = mealSuggestions({ entries: rows, customs: [], foods: FOODS, meal: 'breakfast', date });
    expect(s.quantity).toBe(2);
    expect(computePortion(s.option, s.quantity, s.unit).kcal).toBeGreaterThan(0);
  });

  it('skips foods already in that meal on the day, and that day does not count as habit', () => {
    const rows = [entry({ eaten_on: date, name: 'Phở bò' }), entry({ eaten_on: '2026-10-11', name: 'Phở bò' }), entry({ eaten_on: date, name: 'Cháo gà' })];
    const s = mealSuggestions({ entries: rows, customs: [], foods: FOODS, meal: 'breakfast', date });
    expect(s.map((x) => x.option.name)).toEqual([]);
  });

  it('adds saved foods remembered for the meal (default_meal + use_count) and merges with history', () => {
    const cf = food({ default_meal: 'breakfast', use_count: 5 });
    const other = food({ id: 'c2', name: 'Sữa chua', default_meal: 'snack' });
    const s = mealSuggestions({ entries: [], customs: [cf, other], foods: FOODS, meal: 'breakfast', date });
    expect(s).toHaveLength(1);
    expect(s[0].option.key).toBe('custom:c1');
    expect(s[0]).toMatchObject({ quantity: 1, unit: 'bát', count: 0 });
    // Same food in history at that meal → one suggestion with the history portion + bonus.
    const rows = [entry({ eaten_on: '2026-10-11', name: 'Bún bò Huế', custom_food_id: 'c1', source: 'custom', quantity: 2, unit: 'bát', grams: 1200 })];
    const merged = mealSuggestions({ entries: rows, customs: [cf], foods: FOODS, meal: 'breakfast', date });
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(2);
    expect(merged[0].score).toBeGreaterThan(1);
  });

  it('respects the limit', () => {
    const rows = Array.from({ length: 10 }, (_, i) => entry({ name: `Món ${i}`, source: 'manual', grams: 0 }));
    expect(mealSuggestions({ entries: rows, customs: [], foods: FOODS, meal: 'breakfast', date, limit: 4 })).toHaveLength(4);
  });
});

describe('meal template helpers', () => {
  it('templatesForMeal: own meal first, then meal-less, never other meals', () => {
    const list = [tpl({ id: 'a', meal: null }), tpl({ id: 'b', meal: 'dinner' }), tpl({ id: 'c', meal: 'breakfast' })];
    expect(templatesForMeal(list, 'breakfast').map((t) => t.id)).toEqual(['c', 'a']);
    expect(templatesForMeal(list, 'lunch').map((t) => t.id)).toEqual(['a']);
    expect(templatesForMeal(list, 'breakfast', 1).map((t) => t.id)).toEqual(['c']);
  });

  it('defaultTemplateName avoids taken names (diacritics ignored)', () => {
    expect(defaultTemplateName('breakfast', [])).toBe('Bữa sáng quen thuộc');
    expect(defaultTemplateName('lunch', ['bua trua quen thuoc'])).toBe('Bữa trưa quen thuộc 2');
    expect(defaultTemplateName('lunch', ['Bữa trưa quen thuộc', 'Bữa trưa quen thuộc 2'])).toBe('Bữa trưa quen thuộc 3');
  });

  it('sameDishes compares names as a multiset', () => {
    expect(sameDishes([{ name: 'Phở bò' }, { name: 'Trà đá' }], [{ name: 'tra da' }, { name: 'PHỞ BÒ' }])).toBe(true);
    expect(sameDishes([{ name: 'Phở bò' }], [{ name: 'Phở bò' }, { name: 'Phở bò' }])).toBe(false);
    expect(sameDishes([], [])).toBe(false);
  });

  it('dishesSummary', () => {
    expect(dishesSummary([{ name: 'A' }])).toBe('A');
    expect(dishesSummary([{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }])).toBe('A, B +2 món');
  });
});

describe('usage labels', () => {
  const now = new Date(2026, 9, 12, 9, 0);
  it('daysBetween', () => {
    expect(daysBetween('2026-10-01', '2026-10-12')).toBe(11);
    expect(daysBetween('2026-10-12', '2026-10-01')).toBe(-11);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across DST elsewhere
  });

  it('relativeDayVi', () => {
    expect(relativeDayVi(new Date(2026, 9, 12, 1).toISOString(), now)).toBe('hôm nay');
    expect(relativeDayVi(new Date(2026, 9, 11, 23).toISOString(), now)).toBe('hôm qua');
    expect(relativeDayVi(new Date(2026, 9, 9).toISOString(), now)).toBe('3 ngày trước');
    expect(relativeDayVi(new Date(2026, 8, 28).toISOString(), now)).toBe('2 tuần trước');
    expect(relativeDayVi(new Date(2026, 6, 1).toISOString(), now)).toBe('3 tháng trước');
    expect(relativeDayVi(null, now)).toBe('');
    expect(relativeDayVi('garbage', now)).toBe('');
  });

  it('usageLabel', () => {
    expect(usageLabel(0, null, now)).toBe('Chưa ăn lần nào');
    expect(usageLabel(7, new Date(2026, 9, 11).toISOString(), now)).toBe('Đã ăn 7 lần · hôm qua');
    expect(usageLabel(2, null, now)).toBe('Đã ăn 2 lần');
  });

  it('bumpUsage mirrors the RPC locally', () => {
    const b = bumpUsage(food({ use_count: 3 }), now);
    expect(b.use_count).toBe(4);
    expect(b.last_used_at).toBe(now.toISOString());
  });
});
