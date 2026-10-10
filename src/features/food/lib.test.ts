import { describe, expect, it } from 'vitest';
import { FOOD_BY_ID, FOODS, POPULAR_FOOD_IDS } from '@/data/foods';
import type { CustomFood, MealEntry } from '@/types/db';
import {
  computePortion,
  convertQuantity,
  editDistance,
  fromCustomFood,
  fromDbFood,
  fromEntry,
  groupByMeal,
  guessMeal,
  kcalFromMacros,
  normalizeVi,
  optionForEntry,
  parseMeal,
  per100FromServing,
  perServingFromPer100,
  recentFoods,
  scoreKey,
  searchFoods,
  servingUnit,
  sumNutrients,
  toNewEntry,
  unitOptions,
} from './lib';

const ALL = FOODS.map(fromDbFood);

const entry = (over: Partial<MealEntry>): MealEntry => ({
  id: 'e1',
  user_id: 'u',
  eaten_on: '2026-10-09',
  meal: 'lunch',
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
  created_at: '2026-10-09T05:00:00Z',
  updated_at: '2026-10-09T05:00:00Z',
  ...over,
});

const custom: CustomFood = {
  id: 'c1',
  user_id: 'u',
  name: 'Sữa chua nhà làm',
  brand: 'Mẹ làm',
  serving_label: '1 hũ',
  serving_grams: 120,
  kcal_100g: 80,
  protein_100g: 4,
  carbs_100g: 10,
  fat_100g: 2.5,
  fiber_100g: 0,
  created_at: '',
  updated_at: '',
};

describe('food database', () => {
  it('has ≥150 foods with unique ids and sane values', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    for (const f of FOODS) {
      expect(f.units.length).toBeGreaterThan(0);
      expect(f.units[0].unit).toBe(f.defaultUnit);
      for (const u of f.units) {
        expect(u.grams).toBeGreaterThan(0);
        expect(u.unit.length).toBeLessThanOrEqual(20);
      }
      expect(f.aliases[0]).toBe(normalizeVi(f.name));
      const { kcal, protein, carbs, fat, fiber } = f.per100g;
      for (const v of [kcal, protein, carbs, fat, fiber]) expect(v).toBeGreaterThanOrEqual(0);
      expect(protein + carbs + fat).toBeLessThanOrEqual(100.5);
    }
  });

  it('kcal roughly matches 4/4/9 macros (alcohol excluded)', () => {
    const off = FOODS.filter((f) => !['bia', 'ruou_vang'].includes(f.id) && f.per100g.kcal >= 20).filter((f) => {
      const m = kcalFromMacros(f.per100g.protein, f.per100g.carbs, f.per100g.fat);
      return Math.abs(m - f.per100g.kcal) / f.per100g.kcal > 0.15;
    });
    expect(off.map((f) => f.id)).toEqual([]);
  });

  it('popular ids exist', () => {
    for (const id of POPULAR_FOOD_IDS) expect(FOOD_BY_ID[id]).toBeDefined();
  });
});

describe('normalizeVi', () => {
  it('strips diacritics, đ and punctuation', () => {
    expect(normalizeVi('Phở  Bò (tái)')).toBe('pho bo tai');
    expect(normalizeVi('Đậu phụ')).toBe('dau phu');
    expect(normalizeVi('BÚN ĐẬU mắm-tôm')).toBe('bun dau mam tom');
    expect(normalizeVi(null)).toBe('');
  });
});

describe('search', () => {
  it('is diacritic-insensitive', () => {
    expect(searchFoods('pho bo', ALL)[0].name).toBe('Phở bò');
    expect(searchFoods('phở bò', ALL)[0].name).toBe('Phở bò');
    expect(searchFoods('dau phu', ALL)[0].name).toBe('Đậu phụ');
  });

  it('ranks prefix > word > contains', () => {
    expect(scoreKey('com tam', 'com')).toBeGreaterThan(scoreKey('banh com', 'com'));
    expect(scoreKey('banh com', 'com')).toBeGreaterThan(scoreKey('xcomx', 'com'));
    const res = searchFoods('com', ALL).map((o) => o.name);
    expect(res[0].startsWith('Cơm')).toBe(true);
  });

  it('matches aliases and tolerates typos', () => {
    expect(searchFoods('cha gio', ALL)[0].name).toBe('Nem rán (chả giò)');
    expect(searchFoods('banh mi tiht', ALL).some((o) => o.name === 'Bánh mì thịt')).toBe(true);
    expect(searchFoods('tra sua', ALL)[0].name).toBe('Trà sữa trân châu');
    expect(searchFoods('cafe sua da', ALL)[0].name).toBe('Cà phê sữa đá');
  });

  it('matches multi-token queries in any order', () => {
    expect(searchFoods('bo pho', ALL).some((o) => o.name === 'Phở bò')).toBe(true);
  });

  it('boosts recent and custom foods', () => {
    const plain = searchFoods('bun', ALL).map((o) => o.key);
    const boosted = searchFoods('bun', ALL, { recentKeys: ['db:bun_oc'] }).map((o) => o.key);
    expect(boosted.indexOf('db:bun_oc')).toBeLessThan(plain.indexOf('db:bun_oc'));
    const withCustom = searchFoods('sua chua', [...ALL, fromCustomFood(custom)]);
    expect(withCustom.some((o) => o.origin === 'custom')).toBe(true);
  });

  it('returns nothing for empty / unmatched queries', () => {
    expect(searchFoods('   ', ALL)).toEqual([]);
    expect(searchFoods('zzzzqqq', ALL)).toEqual([]);
  });

  it('editDistance', () => {
    expect(editDistance('thit', 'tiht')).toBe(1);
    expect(editDistance('pho', 'pho')).toBe(0);
    expect(editDistance('abc', 'abcdef', 2)).toBe(3);
  });
});

describe('nutrition math', () => {
  const pho = fromDbFood(FOOD_BY_ID.pho_bo);

  it('computes a portion from household units and grams', () => {
    const p = computePortion(pho, 1, 'bát');
    expect(p.grams).toBe(500);
    expect(p.kcal).toBe(450);
    expect(p.protein_g).toBe(27.5);
    expect(computePortion(pho, 1.5, 'bát').kcal).toBe(675);
    expect(computePortion(pho, 200, 'g').kcal).toBe(180);
  });

  it('adds g to unit options and converts quantities', () => {
    expect(unitOptions(pho).map((u) => u.unit)).toContain('g');
    expect(convertQuantity(pho, 1, 'bát', 'g')).toBe(500);
    expect(convertQuantity(pho, 300, 'g', 'bát')).toBe(1);
  });

  it('builds an insert row', () => {
    const row = toNewEntry(pho, 2, 'bát', 'breakfast', '2026-10-09');
    expect(row).toMatchObject({ name: 'Phở bò', meal: 'breakfast', quantity: 2, unit: 'bát', grams: 1000, kcal: 900, source: 'search', custom_food_id: null });
    const cRow = toNewEntry(fromCustomFood(custom), 1, 'hũ', 'snack', '2026-10-09');
    expect(cRow).toMatchObject({ source: 'custom', custom_food_id: 'c1', grams: 120, kcal: 96 });
  });

  it('serving ↔ per-100 g conversion round-trips', () => {
    const per100 = per100FromServing({ kcal: 300, protein: 12, carbs: 30, fat: 15, fiber: 3 }, 200);
    expect(per100).toEqual({ kcal: 150, protein: 6, carbs: 15, fat: 7.5, fiber: 1.5 });
    expect(perServingFromPer100(per100, 200)).toEqual({ kcal: 300, protein: 12, carbs: 30, fat: 15, fiber: 3 });
    expect(servingUnit('1 hộp')).toBe('hộp');
    expect(servingUnit('')).toBe('phần');
  });

  it('sums and groups entries', () => {
    const rows = [entry({}), entry({ id: 'e2', meal: 'dinner', kcal: 100.25, protein_g: 1 })];
    expect(sumNutrients(rows).kcal).toBe(550.3);
    const g = groupByMeal(rows);
    expect(g.lunch).toHaveLength(1);
    expect(g.dinner).toHaveLength(1);
    expect(g.breakfast).toHaveLength(0);
  });
});

describe('entries → options', () => {
  it('derives per-100 g from an entry with grams', () => {
    const o = fromEntry(entry({ name: 'Món lạ', source: 'ai', grams: 250, kcal: 500, quantity: 1, unit: 'đĩa' }));
    expect(o.per100g.kcal).toBe(200);
    expect(computePortion(o, 2, 'đĩa').kcal).toBe(1000);
    expect(o.source).toBe('manual');
  });

  it('handles manual entries without grams', () => {
    const o = fromEntry(entry({ name: 'Nhập nhanh', source: 'manual', grams: 0, kcal: 320, quantity: 1, unit: 'phần' }));
    expect(o.gramsKnown).toBe(false);
    expect(unitOptions(o).map((u) => u.unit)).toEqual(['phần']);
    const p = computePortion(o, 1.5, 'phần');
    expect(p.kcal).toBe(480);
    expect(p.grams).toBe(0);
  });

  it('maps entries back to DB / custom foods', () => {
    expect(optionForEntry(entry({}), FOODS).key).toBe('db:pho_bo');
    expect(optionForEntry(entry({ custom_food_id: 'c1', name: 'x' }), FOODS, [custom]).key).toBe('custom:c1');
    expect(optionForEntry(entry({ source: 'ai' }), FOODS).origin).toBe('history');
  });

  it('lists distinct recent foods newest first with last portion', () => {
    const rows = [
      entry({ id: 'a', created_at: '2026-10-08T01:00:00Z', eaten_on: '2026-10-08' }),
      entry({ id: 'b', name: 'Chuối', unit: 'quả', quantity: 2, grams: 200, kcal: 194, created_at: '2026-10-09T01:00:00Z' }),
      entry({ id: 'c', quantity: 1.5, created_at: '2026-10-09T02:00:00Z' }),
    ];
    const r = recentFoods(rows, FOODS);
    expect(r.map((x) => x.option.name)).toEqual(['Phở bò', 'Chuối']);
    expect(r[0].quantity).toBe(1.5);
    expect(r[1]).toMatchObject({ quantity: 2, unit: 'quả' });
  });
});

describe('meal helpers', () => {
  it('parses and guesses meals', () => {
    expect(parseMeal('lunch')).toBe('lunch');
    expect(parseMeal('brunch')).toBeNull();
    expect(guessMeal(new Date(2026, 9, 9, 7, 0))).toBe('breakfast');
    expect(guessMeal(new Date(2026, 9, 9, 12, 0))).toBe('lunch');
    expect(guessMeal(new Date(2026, 9, 9, 15, 30))).toBe('snack');
    expect(guessMeal(new Date(2026, 9, 9, 19, 0))).toBe('dinner');
    expect(guessMeal(new Date(2026, 9, 9, 23, 0))).toBe('snack');
  });
});
