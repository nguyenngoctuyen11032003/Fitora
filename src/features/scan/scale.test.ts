import { describe, expect, it } from 'vitest';
import type { AiDish } from '@/types/db';
import {
  confidenceLevel,
  fromAiDish,
  gramsPerUnit,
  insertAt,
  isDishValid,
  macroShares,
  manualDish,
  normalizeUnit,
  roundQuantity,
  setGrams,
  setQuantity,
  setUnit,
  totals,
} from './scale';

const pho: AiDish = {
  name: 'Phở bò',
  ingredients: ['bánh phở', 'thịt bò'],
  quantity: 1,
  unit: 'bát',
  grams: 500,
  kcal: 450,
  protein_g: 25,
  carbs_g: 55,
  fat_g: 12,
  fiber_g: 2,
  confidence: 0.82,
};

describe('fromAiDish', () => {
  it('keeps the AI baseline and learns grams per unit', () => {
    const d = fromAiDish(pho, 'k');
    expect(d).toMatchObject({ key: 'k', name: 'Phở bò', quantity: 1, unit: 'bát', grams: 500, kcal: 450, protein_g: 25 });
    expect(d.density.kcal).toBeCloseTo(0.9);
    expect(gramsPerUnit(d, 'bát')).toBe(500);
    expect(gramsPerUnit(d, 'đĩa')).toBe(350);
    expect(d.original).toBe(pho);
    expect(d.confidence).toBe(0.82);
  });

  it('estimates grams when the AI gives none', () => {
    const d = fromAiDish({ ...pho, quantity: 2, unit: 'chiếc', grams: 0, kcal: 240 });
    expect(d.grams).toBe(120);
    expect(d.kcal).toBe(240);
    expect(gramsPerUnit(d, 'chiếc')).toBe(60);
  });

  it('treats unit g as quantity = grams', () => {
    const d = fromAiDish({ ...pho, quantity: 150, unit: 'g', grams: 0, kcal: 300 });
    expect(d.grams).toBe(150);
    expect(d.quantity).toBe(150);
    expect(d.density.kcal).toBeCloseTo(2);
  });
});

describe('setQuantity', () => {
  it('scales nutrients proportionally', () => {
    const d = setQuantity(fromAiDish(pho), 1.5);
    expect(d.grams).toBe(750);
    expect(d.kcal).toBe(675);
    expect(d.protein_g).toBe(37.5);
    expect(d.fat_g).toBe(18);
  });

  it('round-trips without drift', () => {
    let d = fromAiDish(pho);
    for (const q of [0.25, 3, 1.75, 0.5]) d = setQuantity(d, q);
    d = setQuantity(d, 1);
    expect(d.kcal).toBe(450);
    expect(d.carbs_g).toBe(55);
  });

  it('zero quantity gives zero nutrients and an invalid dish', () => {
    const d = setQuantity(fromAiDish(pho), 0);
    expect(d.kcal).toBe(0);
    expect(isDishValid(d)).toBe(false);
  });
});

describe('setUnit', () => {
  it('to g keeps the portion', () => {
    const d = setUnit(fromAiDish(pho), 'g');
    expect(d).toMatchObject({ unit: 'g', quantity: 500, grams: 500, kcal: 450 });
  });

  it('from g expresses the weight in the new unit', () => {
    const g = setUnit(fromAiDish(pho), 'g');
    const back = setUnit(g, 'bát');
    expect(back).toMatchObject({ unit: 'bát', quantity: 1, grams: 500, kcal: 450 });
  });

  it('between units keeps the count and uses the unit size', () => {
    const d = setUnit(fromAiDish(pho), 'đĩa');
    expect(d).toMatchObject({ unit: 'đĩa', quantity: 1, grams: 350, kcal: 315 });
  });

  it('same unit is a no-op', () => {
    const d = fromAiDish(pho);
    expect(setUnit(d, 'bát')).toBe(d);
  });
});

describe('setGrams', () => {
  it('rescales nutrients and re-learns the unit size', () => {
    const d = setGrams(fromAiDish(pho), 400);
    expect(d.kcal).toBe(360);
    expect(d.quantity).toBe(1);
    expect(gramsPerUnit(d, 'bát')).toBe(400);
    expect(setQuantity(d, 2).grams).toBe(800);
  });

  it('with unit g also updates quantity', () => {
    const d = setGrams(setUnit(fromAiDish(pho), 'g'), 250);
    expect(d).toMatchObject({ quantity: 250, grams: 250, kcal: 225 });
  });
});

describe('manualDish / totals / helpers', () => {
  it('manual dish derives density from the typed portion', () => {
    const d = manualDish({ name: '  Trứng luộc ', grams: 50, kcal: 78, protein_g: 6.3, fat_g: 5.3, unit: 'chiếc' });
    expect(d.name).toBe('Trứng luộc');
    expect(d.confidence).toBeNull();
    expect(setQuantity(d, 2)).toMatchObject({ grams: 100, kcal: 156, protein_g: 12.6 });
  });

  it('totals sums and rounds', () => {
    const t = totals([fromAiDish(pho), manualDish({ name: 'Trà đá', grams: 250, kcal: 0 })]);
    expect(t).toEqual({ kcal: 450, protein_g: 25, carbs_g: 55, fat_g: 12, fiber_g: 2 });
  });

  it('macroShares splits energy', () => {
    const s = macroShares({ protein_g: 25, carbs_g: 25, fat_g: 0 });
    expect(s.protein).toBeCloseTo(0.5);
    expect(macroShares({ protein_g: 0, carbs_g: 0, fat_g: 0 }).fat).toBe(0);
  });

  it('roundQuantity snaps per unit', () => {
    expect(roundQuantity(1.4, 'bát')).toBe(1.5);
    expect(roundQuantity(0.05, 'bát')).toBe(0.25);
    expect(roundQuantity(123.6, 'g')).toBe(124);
  });

  it('confidenceLevel buckets', () => {
    expect(confidenceLevel(0.9)).toBe('high');
    expect(confidenceLevel(0.6)).toBe('medium');
    expect(confidenceLevel(0.2)).toBe('low');
    expect(confidenceLevel(null)).toBeNull();
  });
});

describe('units the AI uses outside the picker', () => {
  it('estimates weight from realistic sizes when grams are missing', () => {
    expect(fromAiDish({ ...pho, unit: 'tô', grams: 0, kcal: 500 }).grams).toBe(500);
    expect(fromAiDish({ ...pho, quantity: 330, unit: 'ml', grams: 0, kcal: 140 }).grams).toBe(330);
    expect(fromAiDish({ ...pho, quantity: 2, unit: 'Quả', grams: 0, kcal: 140 }).grams).toBe(200);
    expect(fromAiDish({ ...pho, unit: 'thứ lạ', grams: 0 }).grams).toBe(100);
  });

  it('keeps nutrients proportional when the count of an AI unit changes', () => {
    const d = fromAiDish({ ...pho, unit: 'tô', grams: 600, kcal: 540, protein_g: 30 });
    const two = setQuantity(d, 2);
    expect(two).toMatchObject({ grams: 1200, kcal: 1080, protein_g: 60 });
    expect(setQuantity(two, 0.5)).toMatchObject({ grams: 300, kcal: 270, protein_g: 15 });
  });
});

describe('isDishValid', () => {
  it('needs a name, a positive count and a positive weight', () => {
    const d = fromAiDish(pho);
    expect(isDishValid(d)).toBe(true);
    expect(isDishValid({ ...d, name: '  ' })).toBe(false);
    expect(isDishValid(setQuantity(d, 0))).toBe(false);
    expect(isDishValid(setGrams(d, 0))).toBe(false);
  });
});

describe('robustness against messy AI answers', () => {
  it('normalises unit spelling and gram synonyms', () => {
    expect(normalizeUnit(' Gram ')).toBe('g');
    expect(normalizeUnit('GR.')).toBe('g');
    expect(normalizeUnit('Bát')).toBe('bát');
    expect(normalizeUnit('')).toBe('phần');
    expect(normalizeUnit(undefined)).toBe('phần');
    const d = fromAiDish({ ...pho, quantity: 200, unit: 'Gram', grams: 0, kcal: 300 });
    expect(d).toMatchObject({ unit: 'g', quantity: 200, grams: 200, kcal: 300 });
  });

  it('estimates kcal from macros when the AI forgot the energy', () => {
    const d = fromAiDish({ ...pho, kcal: 0, protein_g: 10, carbs_g: 20, fat_g: 5 });
    expect(d.kcal).toBe(165);
    expect(setQuantity(d, 2).kcal).toBe(330);
  });

  it('never yields NaN or negative numbers', () => {
    const d = fromAiDish({ ...pho, grams: NaN, kcal: -50, protein_g: Number.NaN, quantity: -2 });
    for (const k of ['grams', 'quantity', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const) {
      expect(Number.isFinite(d[k])).toBe(true);
      expect(d[k]).toBeGreaterThanOrEqual(0);
    }
    const bad = setQuantity(fromAiDish(pho), Number.NaN);
    expect(bad).toMatchObject({ quantity: 0, grams: 0, kcal: 0 });
    expect(setGrams(fromAiDish(pho), -10)).toMatchObject({ grams: 0, kcal: 0 });
    expect(totals([{ kcal: NaN, protein_g: -1, carbs_g: 2, fat_g: 0, fiber_g: 0 }])).toMatchObject({ kcal: 0, protein_g: 0, carbs_g: 2 });
  });

  it('setUnit accepts any spelling of the target unit', () => {
    const d = setUnit(fromAiDish(pho), 'Gram');
    expect(d).toMatchObject({ unit: 'g', grams: 500, kcal: 450 });
  });

  it('keeps kcal and macros consistent after many edits', () => {
    let d = fromAiDish(pho);
    d = setUnit(d, 'g');
    d = setGrams(d, 333);
    d = setUnit(d, 'bát');
    d = setQuantity(d, 2);
    // nutrients are always density × grams, rounded to 0.1
    expect(d.kcal).toBeCloseTo(d.grams * 0.9, 0);
    expect(d.protein_g).toBeCloseTo(d.grams * 0.05, 0);
  });
});

describe('insertAt', () => {
  it('restores an item at its old position (clamped)', () => {
    expect(insertAt(['a', 'c'], 1, 'b')).toEqual(['a', 'b', 'c']);
    expect(insertAt(['a'], 9, 'b')).toEqual(['a', 'b']);
    expect(insertAt(['a'], -3, 'b')).toEqual(['b', 'a']);
  });
});
