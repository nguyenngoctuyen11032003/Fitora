import { describe, expect, it } from 'vitest';
import { per100FromTotals } from '@/services/foods';
import type { AiDish, CustomFood } from '@/types/db';
import { buildMealEntries } from './entries';
import {
  applySavedFood,
  dishFromSavedFood,
  dishTotals,
  matchSavedFood,
  rankSavedFoods,
  rememberSignature,
  remembers,
  revertSavedFood,
  savedServing,
  searchSavedFoods,
  servingNutrients,
} from './saved';
import { fromAiDish, setGrams, setQuantity } from './scale';

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

const bunBo: AiDish = {
  name: 'Bún bò Huế',
  ingredients: ['bún', 'bò'],
  quantity: 1,
  unit: 'tô',
  grams: 600,
  kcal: 540,
  protein_g: 30,
  carbs_g: 70,
  fat_g: 15,
  fiber_g: 3,
  confidence: 0.8,
};

const NOW = Date.parse('2026-10-12T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

describe('savedServing / servingNutrients', () => {
  it('reads the unit from the label and scales by servings', () => {
    const f = food({ serving_label: '1 tô', serving_grams: 500, kcal_100g: 90, protein_100g: 5 });
    expect(savedServing(f)).toEqual({ unit: 'tô', grams: 500 });
    expect(servingNutrients(f).kcal).toBe(450);
    expect(servingNutrients(f, 1.5)).toMatchObject({ kcal: 675, protein_g: 37.5 });
  });
  it('treats weight labels as grams', () => {
    expect(savedServing(food({ serving_label: '100 g', serving_grams: 100 })).unit).toBe('g');
    expect(savedServing(food({ serving_label: '250 ml', serving_grams: 250 })).unit).toBe('g');
  });
});

describe('matchSavedFood', () => {
  const list = [food({ id: 'a', name: 'Phở bò', use_count: 1 }), food({ id: 'b', name: 'PHỞ BÒ ', use_count: 5, last_used_at: hoursAgo(1) })];
  it('ignores case / diacritics and prefers the most used duplicate', () => {
    expect(matchSavedFood('pho bo', list)?.id).toBe('b');
    expect(matchSavedFood('Phở gà', list)).toBeNull();
    expect(matchSavedFood('', list)).toBeNull();
    expect(matchSavedFood('pho bo', [])).toBeNull();
  });
});

describe('rankSavedFoods', () => {
  it('puts foods usually eaten at this meal and used recently first', () => {
    const list = [
      food({ id: 'old', name: 'A', use_count: 20, last_used_at: hoursAgo(24 * 60) }),
      food({ id: 'lunch', name: 'B', use_count: 2, last_used_at: hoursAgo(48), default_meal: 'lunch' }),
      food({ id: 'never', name: 'C' }),
      food({ id: 'today', name: 'D', use_count: 1, last_used_at: hoursAgo(2), default_meal: 'breakfast' }),
    ];
    expect(rankSavedFoods(list, 'lunch', NOW).map((f) => f.id)).toEqual(['lunch', 'today', 'old', 'never']);
    expect(rankSavedFoods(list, 'breakfast', NOW)[0].id).toBe('today');
    expect(rankSavedFoods(list, 'lunch', NOW, 2)).toHaveLength(2);
    expect(rankSavedFoods(null, 'lunch')).toEqual([]);
  });
});

describe('searchSavedFoods', () => {
  it('finds by partial name without diacritics, prefix first', () => {
    const list = [food({ id: '1', name: 'Cơm gà xối mỡ' }), food({ id: '2', name: 'Gà rán' }), food({ id: '3', name: 'Phở bò' })];
    expect(searchSavedFoods('ga', list).map((f) => f.id)).toEqual(['2', '1']);
    expect(searchSavedFoods('g', list)).toEqual([]);
  });
});

describe('dishFromSavedFood', () => {
  it('builds a linked, manual dish that keeps nutrients proportional', () => {
    const f = food({ id: 'x', name: 'Sữa chua', serving_label: '1 hộp', serving_grams: 100, kcal_100g: 95, protein_100g: 3.5 });
    const d = dishFromSavedFood(f, 2);
    expect(d).toMatchObject({ name: 'Sữa chua', unit: 'hộp', quantity: 2, grams: 200, kcal: 190, protein_g: 7, savedFoodId: 'x', original: null });
    expect(setQuantity(d, 3).kcal).toBe(285);
    const [row] = buildMealEntries([d], { date: '2026-10-12', meal: 'snack', photoPath: null });
    expect(row).toMatchObject({ source: 'custom', custom_food_id: 'x', ai_meta: null });
  });
});

describe('applySavedFood / revertSavedFood', () => {
  const mine = food({ id: 'bb', name: 'Bún bò Huế', serving_label: '1 tô', serving_grams: 550, kcal_100g: 80, protein_100g: 6, carbs_100g: 9, fat_100g: 2 });

  it("uses the user's numbers, keeps the AI count for the same unit", () => {
    const ai = setQuantity(fromAiDish(bunBo), 2);
    const d = applySavedFood(ai, mine);
    expect(d).toMatchObject({ unit: 'tô', quantity: 2, grams: 1100, kcal: 880, protein_g: 66, savedFoodId: 'bb', original: bunBo });
    expect(setQuantity(d, 1).kcal).toBe(440);
    const [row] = buildMealEntries([d], { date: '2026-10-12', meal: 'lunch', photoPath: 'u/meals/p.webp' });
    expect(row).toMatchObject({ source: 'ai', custom_food_id: 'bb', kcal: 880 });
    expect(row.ai_meta).toMatchObject({ used_saved_food: true });
  });

  it('falls back to one saved serving when the unit differs, and reverts exactly', () => {
    const ai = fromAiDish({ ...bunBo, unit: 'bát', quantity: 3, grams: 750 });
    const d = applySavedFood(ai, mine);
    expect(d).toMatchObject({ unit: 'tô', quantity: 1, grams: 550, kcal: 440 });
    const back = revertSavedFood({ ...d, remember: false });
    expect(back).toMatchObject({ unit: 'bát', quantity: 3, grams: 750, kcal: ai.kcal, savedFoodId: null, remember: false, key: ai.key });
  });

  it('applying twice keeps the original AI backup', () => {
    const ai = fromAiDish(bunBo);
    const twice = applySavedFood(applySavedFood(ai, mine), mine);
    expect(revertSavedFood(twice).kcal).toBe(ai.kcal);
  });
});

describe('remember round-trip', () => {
  it('a remembered dish re-logs with the same kcal and macros', () => {
    const edited = setGrams(setQuantity(fromAiDish(bunBo), 1.5), 800);
    const t = dishTotals(edited);
    const saved = food({ id: 's', name: t.name, ...per100FromTotals(t) });
    const again = dishFromSavedFood(saved, 1.5);
    expect(Math.abs(again.kcal - edited.kcal)).toBeLessThanOrEqual(2);
    expect(Math.abs(again.protein_g - edited.protein_g)).toBeLessThanOrEqual(0.5);
    expect(again.grams).toBeCloseTo(edited.grams, 0);
  });

  it('remember defaults on and the signature tracks edits', () => {
    const d = fromAiDish(bunBo);
    expect(remembers(d)).toBe(true);
    expect(remembers({ remember: false })).toBe(false);
    expect(rememberSignature(d)).toBe(rememberSignature({ ...d, key: 'other' }));
    expect(rememberSignature(setQuantity(d, 2))).not.toBe(rememberSignature(d));
  });
});
