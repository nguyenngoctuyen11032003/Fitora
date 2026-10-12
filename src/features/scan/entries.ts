import type { MealType, NewMealEntry } from '@/types/db';
import { r1, type ScanDish } from './scale';

interface EntryContext {
  date: string;
  meal: MealType;
  photoPath: string | null;
  /** dish key → saved food id ("Món của tôi") the entry is linked to. */
  foodIds?: Record<string, string | null | undefined>;
}

/**
 * Reviewed dishes → diary rows. AI dishes keep their untouched answer in ai_meta so the
 * diary can show "AI ước tính" and we can audit edits later; a dish picked from the saved
 * foods is 'custom'; hand-added ones are 'manual'. Every dish remembered / matched in
 * "Món của tôi" is linked through custom_food_id.
 */
export function buildMealEntries(dishes: ScanDish[], { date, meal, photoPath, foodIds = {} }: EntryContext): NewMealEntry[] {
  return dishes.map((d) => {
    const foodId = foodIds[d.key] || d.savedFoodId || null;
    return {
      eaten_on: date,
      meal,
      name: d.name.trim().slice(0, 120),
      quantity: d.unit === 'g' ? r1(d.quantity) : Math.round(d.quantity * 100) / 100,
      unit: d.unit.slice(0, 20),
      grams: r1(d.grams),
      kcal: r1(d.kcal),
      protein_g: r1(d.protein_g),
      carbs_g: r1(d.carbs_g),
      fat_g: r1(d.fat_g),
      fiber_g: r1(d.fiber_g),
      source: d.original ? 'ai' : d.savedFoodId ? 'custom' : 'manual',
      custom_food_id: foodId,
      photo_path: photoPath,
      ai_meta: d.original
        ? { ingredients: d.ingredients, confidence: d.confidence, original: d.original, ...(d.savedFoodId ? { used_saved_food: true } : {}) }
        : null,
    };
  });
}

/**
 * After the diary rows are in, the dishes remembered in "Món của tôi" get their ids:
 * which inserted rows (same order as `dishes`) must be re-linked to a saved food.
 */
export function entryLinks(
  dishes: Pick<ScanDish, 'key'>[],
  inserted: { id: string; custom_food_id: string | null }[],
  foodIds: Record<string, string | null | undefined>,
): { id: string; custom_food_id: string }[] {
  if (inserted.length !== dishes.length) return [];
  return dishes.flatMap((d, i) => {
    const want = foodIds[d.key];
    const row = inserted[i];
    return want && row && row.custom_food_id !== want ? [{ id: row.id, custom_food_id: want }] : [];
  });
}
