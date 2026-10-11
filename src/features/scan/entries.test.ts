import { describe, expect, it } from 'vitest';
import type { AiDish } from '@/types/db';
import { buildMealEntries } from './entries';
import { fromAiDish, manualDish, setQuantity } from './scale';

const com: AiDish = {
  name: ' Cơm tấm sườn ',
  ingredients: ['cơm tấm', 'sườn nướng'],
  quantity: 1,
  unit: 'đĩa',
  grams: 450,
  kcal: 700,
  protein_g: 32,
  carbs_g: 85,
  fat_g: 24,
  fiber_g: 3,
  confidence: 0.77,
};

describe('buildMealEntries', () => {
  it('maps AI dishes with ai_meta and manual dishes without', () => {
    const rows = buildMealEntries([setQuantity(fromAiDish(com), 1.5), manualDish({ name: 'Trà đá', grams: 250, kcal: 0 })], {
      date: '2026-10-11',
      meal: 'lunch',
      photoPath: 'u/meals/x.webp',
    });
    expect(rows[0]).toMatchObject({
      eaten_on: '2026-10-11',
      meal: 'lunch',
      name: 'Cơm tấm sườn',
      quantity: 1.5,
      unit: 'đĩa',
      grams: 675,
      kcal: 1050,
      protein_g: 48,
      source: 'ai',
      photo_path: 'u/meals/x.webp',
    });
    expect(rows[0].ai_meta).toMatchObject({ confidence: 0.77, ingredients: ['cơm tấm', 'sườn nướng'], original: com });
    expect(rows[1]).toMatchObject({ name: 'Trà đá', source: 'manual', ai_meta: null, kcal: 0 });
  });

  it('rounds numbers for storage', () => {
    const [row] = buildMealEntries([setQuantity(fromAiDish({ ...com, grams: 333, kcal: 517 }), 1 / 3)], { date: '2026-10-11', meal: 'dinner', photoPath: null });
    expect(row.quantity).toBe(0.33);
    expect(String(row.grams).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1);
    expect(String(row.kcal).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(1);
    expect(row.photo_path).toBeNull();
  });
});
