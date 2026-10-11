// "Món của tôi" inside the scanner: rank saved foods for the current meal, turn them into
// editable dishes, apply the user's own numbers to an AI dish, and decide what to remember.
// Pure helpers (no requests) — the screen calls the services in src/services/foods.ts.

import { compareByUse, normalizeFoodName, servingUnitOf, type FoodTotals } from '@/services/foods';
import type { CustomFood, MealType } from '@/types/db';
import { dishKey, normalizeUnit, nutrientsFor, r1, roundQuantity, type Nutrients, type ScanDish } from './scale';

type Food = Pick<
  CustomFood,
  'id' | 'name' | 'serving_label' | 'serving_grams' | 'kcal_100g' | 'protein_100g' | 'carbs_100g' | 'fat_100g' | 'fiber_100g'
>;

const MASS_LABEL = /^(\d+(?:[.,]\d+)?)\s*(g|gr|gram|grams|gam|ml)\.?$/i;

/** Per-gram nutrients of a saved food. */
export function foodDensity(food: Food): Nutrients {
  const v = (x: number) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) / 100 : 0);
  return {
    kcal: v(food.kcal_100g),
    protein_g: v(food.protein_100g),
    carbs_g: v(food.carbs_100g),
    fat_g: v(food.fat_100g),
    fiber_g: v(food.fiber_100g),
  };
}

/**
 * How one serving of a saved food is expressed in the scanner: "1 tô" → unit 'tô',
 * a weight label ("100 g", "250 ml") → unit 'g' (quantity = grams).
 */
export function savedServing(food: Food): { unit: string; grams: number } {
  const grams = Number(food.serving_grams) > 0 ? Number(food.serving_grams) : 100;
  const label = String(food.serving_label ?? '').trim();
  if (MASS_LABEL.test(label)) return { unit: 'g', grams };
  return { unit: normalizeUnit(servingUnitOf(label)), grams };
}

/** Nutrients of `servings` servings (1 = the saved serving). */
export function servingNutrients(food: Food, servings = 1): Nutrients {
  const q = Number(servings) > 0 ? Number(servings) : 0;
  return nutrientsFor(foodDensity(food), savedServing(food).grams * q);
}

/** "1 tô · 520 g" style label for one serving. */
export function servingText(food: Food): string {
  const { unit, grams } = savedServing(food);
  return unit === 'g' ? `${Math.round(grams)} g` : `1 ${unit} · ${Math.round(grams)} g`;
}

/** Saved food with the same name (case / diacritics / punctuation ignored); most used wins. */
export function matchSavedFood<T extends Food & Pick<CustomFood, 'last_used_at' | 'use_count'>>(name: string, foods: readonly T[] | null | undefined): T | null {
  const key = normalizeFoodName(name);
  if (!key || !foods?.length) return null;
  return [...foods].sort(compareByUse).find((f) => normalizeFoodName(f.name) === key) ?? null;
}

const DAY = 86_400_000;

/**
 * "Best for now" score: usually eaten at this meal, used recently, used often.
 * Never-used foods score 0 and keep the recent-first order of compareByUse.
 */
export function savedFoodScore(f: Pick<CustomFood, 'default_meal' | 'use_count' | 'last_used_at'>, meal: MealType, now = Date.now()): number {
  let s = 0;
  if (f.default_meal === meal) s += 4;
  s += Math.min(3, Math.log2(1 + Math.max(0, Number(f.use_count) || 0)));
  const t = f.last_used_at ? Date.parse(f.last_used_at) : NaN;
  if (Number.isFinite(t)) {
    const age = Math.max(0, now - t);
    s += age < DAY ? 3 : age < 3 * DAY ? 2 : age < 7 * DAY ? 1.5 : age < 30 * DAY ? 0.5 : 0;
  }
  return s;
}

/** Saved foods ordered for the strip: best for `meal` first. */
export function rankSavedFoods<T extends CustomFood>(foods: readonly T[] | null | undefined, meal: MealType, now = Date.now(), limit = 15): T[] {
  if (!foods?.length) return [];
  return foods
    .map((f) => ({ f, s: savedFoodScore(f, meal, now) }))
    .sort((a, b) => b.s - a.s || compareByUse(a.f, b.f))
    .slice(0, limit)
    .map((x) => x.f);
}

/** Saved foods whose name contains `query` (diacritics ignored), prefix matches first. */
export function searchSavedFoods<T extends CustomFood>(query: string, foods: readonly T[] | null | undefined, limit = 4): T[] {
  const q = normalizeFoodName(query);
  if (q.length < 2 || !foods?.length) return [];
  const hits = foods.filter((f) => normalizeFoodName(f.name).includes(q));
  const starts = (f: T) => (normalizeFoodName(f.name).startsWith(q) ? 0 : 1);
  return hits.sort((a, b) => starts(a) - starts(b) || compareByUse(a, b)).slice(0, limit);
}

/** An editable dish made from a saved food (picked by hand, no AI). */
export function dishFromSavedFood(food: Food, servings = 1, key = dishKey()): ScanDish {
  const { unit, grams: perUnit } = savedServing(food);
  const q = Number(servings) > 0 ? Number(servings) : 1;
  const grams = perUnit * q;
  const density = foodDensity(food);
  return {
    key,
    name: food.name,
    quantity: unit === 'g' ? r1(grams) : q,
    unit,
    grams: r1(grams),
    density,
    unitGrams: unit === 'g' ? { g: 1 } : { g: 1, [unit]: perUnit },
    ingredients: [],
    confidence: null,
    original: null,
    savedFoodId: food.id,
    aiBackup: null,
    ...nutrientsFor(density, grams),
  };
}

/**
 * "Dùng số liệu đã lưu": the user's own numbers (per gram + their serving size) replace
 * the AI estimate. The count is kept when the AI used the same unit, otherwise one saved
 * serving. The AI answer stays in `original` (audit) and the previous state in
 * `aiBackup` (undo).
 */
export function applySavedFood(dish: ScanDish, food: Food): ScanDish {
  const { unit, grams: perUnit } = savedServing(food);
  const density = foodDensity(food);
  let quantity: number;
  let grams: number;
  if (unit === 'g') {
    grams = dish.unit === 'g' ? dish.grams : perUnit;
    quantity = r1(grams);
  } else {
    quantity = dish.unit === unit && dish.quantity > 0 ? roundQuantity(dish.quantity, unit) : 1;
    grams = quantity * perUnit;
  }
  const backup = dish.aiBackup ?? { ...dish, aiBackup: null, savedFoodId: null };
  return {
    ...dish,
    name: food.name,
    unit,
    quantity,
    grams: r1(grams),
    density,
    unitGrams: { ...dish.unitGrams, ...(unit === 'g' ? {} : { [unit]: perUnit }) },
    savedFoodId: food.id,
    aiBackup: backup,
    ...nutrientsFor(density, grams),
  };
}

/** Undo applySavedFood (keeps the user's remember choice). */
export function revertSavedFood(dish: ScanDish): ScanDish {
  if (!dish.aiBackup) return { ...dish, savedFoodId: null };
  return { ...dish.aiBackup, key: dish.key, remember: dish.remember, savedFoodId: null, aiBackup: null };
}

export const remembers = (d: Pick<ScanDish, 'remember'>) => d.remember !== false;

/** Totals sent to saveScannedDishes for one dish. */
export function dishTotals(d: ScanDish): FoodTotals {
  return {
    name: d.name.trim(),
    quantity: d.quantity,
    unit: d.unit,
    grams: d.grams,
    kcal: d.kcal,
    protein_g: d.protein_g,
    carbs_g: d.carbs_g,
    fat_g: d.fat_g,
    fiber_g: d.fiber_g,
  };
}

/** Identity of what was remembered for a dish — a retry re-saves only dishes that changed. */
export function rememberSignature(d: ScanDish): string {
  const t = dishTotals(d);
  return [normalizeFoodName(t.name), t.quantity, t.unit, t.grams, t.kcal, t.protein_g, t.carbs_g, t.fat_g, t.fiber_g].join('|');
}
