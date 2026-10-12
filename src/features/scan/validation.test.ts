import { describe, expect, it } from 'vitest';
import type { AiDish } from '@/types/db';
import { entryLinks } from './entries';
import { DISH_KCAL_WARN, dishIssues, dishWarning, ENTRY_LIMITS, fromAiDish, isDishValid, manualDish, setGrams } from './scale';
import { isGuardState } from './useBackGuard';

const absurd: AiDish = {
  name: 'Lẩu hải sản khổng lồ',
  ingredients: [],
  quantity: 1,
  unit: 'nồi',
  grams: 99_999,
  kcal: 999_999,
  protein_g: 9_999,
  carbs_g: 9_999,
  fat_g: 9_999,
  fiber_g: 999,
  confidence: 0.6,
};

describe('dishIssues (fit_meal_entries limits)', () => {
  it('accepts a normal dish', () => {
    const d = manualDish({ name: 'Phở bò', grams: 500, kcal: 450, protein_g: 25, carbs_g: 60, fat_g: 10 });
    expect(dishIssues(d)).toEqual({});
    expect(isDishValid(d)).toBe(true);
    expect(dishWarning(d)).toBeNull();
  });

  it('flags an absurd AI answer on the energy and macro fields', () => {
    const d = fromAiDish(absurd);
    const issues = dishIssues(d);
    expect(issues.kcal).toMatch(/50\.000 kcal/);
    expect(issues.macros).toBeUndefined(); // 9 999 g is still within 10 000 g
    expect(issues.grams).toBeUndefined();
    expect(isDishValid(d)).toBe(false);
    expect(dishWarning(d)).toBeNull(); // an error, not a mere warning
  });

  it('flags each limit on its own field', () => {
    const base = { name: 'x', quantity: 1, grams: 100, kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 0 };
    expect(dishIssues({ ...base, name: '  ' }).name).toBeTruthy();
    expect(dishIssues({ ...base, quantity: 0 }).quantity).toBe('Phải lớn hơn 0');
    expect(dishIssues({ ...base, quantity: ENTRY_LIMITS.quantity + 1 }).quantity).toMatch(/Tối đa/);
    expect(dishIssues({ ...base, grams: ENTRY_LIMITS.grams + 1 }).grams).toMatch(/100\.000 g/);
    expect(dishIssues({ ...base, grams: Number.NaN }).grams).toBeTruthy();
    expect(dishIssues({ ...base, fat_g: 10_001 }).macros).toMatch(/^Chất béo vượt/);
    expect(dishIssues({ ...base, kcal: -1 }).kcal).toBeTruthy();
    // Exactly at the limit is allowed (CHECK uses "between").
    expect(dishIssues({ ...base, kcal: ENTRY_LIMITS.kcal, grams: ENTRY_LIMITS.grams, quantity: ENTRY_LIMITS.quantity })).toEqual({});
  });

  it('works on name/quantity/grams only (nutrients default to 0)', () => {
    expect(isDishValid({ name: 'Cơm', quantity: 1, grams: 200 })).toBe(true);
  });

  it('warns above ~3000 kcal for one dish but still allows saving', () => {
    const d = setGrams(manualDish({ name: 'Gà rán', grams: 100, kcal: 300 }), 1200); // 3 600 kcal
    expect(d.kcal).toBeGreaterThan(DISH_KCAL_WARN);
    expect(isDishValid(d)).toBe(true);
    expect(dishWarning(d)).toMatch(/3\.000 kcal/);
    expect(dishWarning({ kcal: DISH_KCAL_WARN })).toBeNull();
  });
});

describe('entryLinks', () => {
  const dishes = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  it('re-links only rows whose saved food changed', () => {
    const inserted = [
      { id: 'e1', custom_food_id: null },
      { id: 'e2', custom_food_id: 'f2' },
      { id: 'e3', custom_food_id: null },
    ];
    expect(entryLinks(dishes, inserted, { a: 'f1', b: 'f2' })).toEqual([{ id: 'e1', custom_food_id: 'f1' }]);
  });
  it('does nothing when the inserted rows do not line up with the dishes', () => {
    expect(entryLinks(dishes, [{ id: 'e1', custom_food_id: null }], { a: 'f1' })).toEqual([]);
  });
});

describe('isGuardState', () => {
  it('recognises only our history entries', () => {
    expect(isGuardState({ usr: { scanGuard: true }, key: 'k', idx: 2 })).toBe(true);
    expect(isGuardState({ usr: null, key: 'k', idx: 1 })).toBe(false);
    expect(isGuardState(null)).toBe(false);
    expect(isGuardState({ usr: { scanGuard: 'yes' } })).toBe(false);
  });
});
