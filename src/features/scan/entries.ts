import type { MealType, NewMealEntry } from '@/types/db';
import { r1, type ScanDish } from './scale';

interface EntryContext {
  date: string;
  meal: MealType;
  photoPath: string | null;
}

/**
 * Reviewed dishes → diary rows. AI dishes keep their untouched answer in ai_meta so the
 * diary can show "AI ước tính" and we can audit edits later; hand-added ones are 'manual'.
 */
export function buildMealEntries(dishes: ScanDish[], { date, meal, photoPath }: EntryContext): NewMealEntry[] {
  return dishes.map((d) => ({
    eaten_on: date,
    meal,
    name: d.name.trim().slice(0, 120),
    quantity: d.unit === 'g' ? r1(d.quantity) : Math.round(d.quantity * 100) / 100,
    unit: d.unit,
    grams: r1(d.grams),
    kcal: r1(d.kcal),
    protein_g: r1(d.protein_g),
    carbs_g: r1(d.carbs_g),
    fat_g: r1(d.fat_g),
    fiber_g: r1(d.fiber_g),
    source: d.original ? 'ai' : 'manual',
    photo_path: photoPath,
    ai_meta: d.original ? { ingredients: d.ingredients, confidence: d.confidence, original: d.original } : null,
  }));
}
