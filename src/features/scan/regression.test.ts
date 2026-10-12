import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ db: () => ({ functions: { invoke: vi.fn() } }) }));

const { normalizeDish, normalizeConfidence } = await import('@/services/ai');
const { fromAiDish, normalizeUnit, quantityBounds, setUnit, setQuantity, unitOptions } = await import('./scale');

const base = { ingredients: [], fiber_g: 0, confidence: 0.8 };

describe('weight-like AI units (ml / kg / l) are plain grams in the editor', () => {
  const tea = { ...base, name: 'Trà sữa trân châu', quantity: 500, unit: 'ml', grams: 500, kcal: 420, protein_g: 4, carbs_g: 70, fat_g: 14 };

  it('500 ml stays a 500 g portion with its 420 kcal and a stepper that can reach it', () => {
    const d = fromAiDish(tea);
    expect(d).toMatchObject({ unit: 'g', quantity: 500, grams: 500, kcal: 420 });
    const b = quantityBounds(d);
    expect(b.max).toBeGreaterThanOrEqual(500);
    expect(b.min).toBe(1);
    expect(normalizeUnit('ML')).toBe('g');
  });

  it('kg and l are scaled to grams', () => {
    expect(fromAiDish({ ...tea, unit: 'kg', quantity: 0.5, grams: 0 })).toMatchObject({ unit: 'g', quantity: 500, grams: 500, kcal: 420 });
    expect(fromAiDish({ ...tea, unit: 'l', quantity: 1.5, grams: 1500, kcal: 1260 })).toMatchObject({ unit: 'g', quantity: 1500, grams: 1500 });
  });
});

describe('quantityBounds never clamps below what the dish already has', () => {
  const dish = (quantity: number, unit = 'cái') => ({ quantity, unit });
  it('countable units: 0.25 … 50 by default, widened for an AI count outside it', () => {
    expect(quantityBounds(dish(2))).toMatchObject({ min: 0.25, max: 50 });
    expect(quantityBounds(dish(120))).toMatchObject({ max: 120 });
    expect(quantityBounds(dish(0.1)).min).toBe(0.1);
  });
  it('grams: 1 … 5000, widened above', () => {
    expect(quantityBounds(dish(300, 'g'))).toMatchObject({ min: 1, max: 5000, step: 10, decimals: 0 });
    expect(quantityBounds(dish(8000, 'g')).max).toBe(8000);
  });
});

describe('unit picker keeps the AI unit so the portion can be restored', () => {
  const pho = fromAiDish({ ...base, name: 'Phở bò', quantity: 1, unit: 'tô', grams: 600, kcal: 480, protein_g: 30, carbs_g: 55, fat_g: 12 });

  it('lists the AI unit first and keeps it after switching away', () => {
    expect(unitOptions(pho)[0]).toBe('tô');
    const other = setUnit(pho, 'bát');
    expect(unitOptions(other)).toContain('tô');
    expect(unitOptions(other)[0]).toBe('tô');
    expect(new Set(unitOptions(other)).size).toBe(unitOptions(other).length);
  });

  it('switching back to the AI unit restores the exact portion and calories', () => {
    const away = setUnit(pho, 'bát');
    expect(away.kcal).not.toBe(480);
    const back = setUnit(away, 'tô');
    expect(back).toMatchObject({ unit: 'tô', quantity: 1, grams: 600, kcal: 480 });
  });

  it('the current unit is always offered', () => {
    expect(unitOptions({ unit: 'xiên', unitGrams: {}, original: null })).toContain('xiên');
    expect(setQuantity(pho, 2).kcal).toBe(960);
  });
});

describe('client plausibility: energy bound and percent confidence', () => {
  it('a x10 kcal slip that exceeds the macros + alcohol allowance falls back to the macros', () => {
    const d = normalizeDish({ name: 'Cơm tấm sườn', quantity: 1, unit: 'đĩa', grams: 400, kcal: 6800, protein_g: 30, carbs_g: 85, fat_g: 25 });
    expect(d.kcal).toBe(685);
    expect(d.confidence).toBeLessThanOrEqual(0.4);
  });

  it('never exceeds 9 kcal per gram', () => {
    expect(normalizeDish({ name: 'x', grams: 100, kcal: 5000 }).kcal).toBeLessThanOrEqual(900);
  });

  it('keeps alcohol energy that sits outside the macros', () => {
    const beer = normalizeDish({ name: 'Bia', quantity: 1, unit: 'lon', grams: 330, kcal: 140, protein_g: 1.5, carbs_g: 11, fat_g: 0 });
    expect(beer.kcal).toBe(140);
    const wine = normalizeDish({ name: 'Rượu vang', quantity: 1, unit: 'ly', grams: 150, kcal: 125, protein_g: 0, carbs_g: 4, fat_g: 0 });
    expect(wine.kcal).toBe(125);
  });

  it('confidence given as a percentage is rescaled, not clamped to 100%', () => {
    expect(normalizeConfidence(85)).toBe(0.85);
    expect(normalizeConfidence(40)).toBe(0.4);
    expect(normalizeConfidence(0.8)).toBe(0.8);
    expect(normalizeConfidence(1)).toBe(1);
    expect(normalizeDish({ name: 'x', confidence: 85 }).confidence).toBe(0.85);
  });
});
