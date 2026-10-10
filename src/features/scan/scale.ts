// Portion scaling for AI-scanned dishes.
//
// The AI baseline (grams + nutrients) is turned into a per-gram density once;
// every edit (quantity / unit / grams) only changes the grams, and nutrients
// are always `density × grams`. That keeps edits reversible and drift-free.

import type { AiDish } from '@/types/db';

export const SCAN_UNITS = ['g', 'bát', 'đĩa', 'chiếc', 'ly', 'phần', 'miếng', 'muỗng', 'gói'] as const;
export type ScanUnit = (typeof SCAN_UNITS)[number];

/** Rough grams for one unit when the AI did not use that unit (Vietnamese portions). */
export const DEFAULT_UNIT_GRAMS: Record<ScanUnit, number> = {
  g: 1,
  bát: 250,
  đĩa: 350,
  chiếc: 60,
  ly: 250,
  phần: 200,
  miếng: 40,
  muỗng: 15,
  gói: 75,
};

export interface Nutrients {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

export const NUTRIENT_KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const;

export const ZERO_NUTRIENTS: Nutrients = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };

export interface ScanDish extends Nutrients {
  /** Stable React key. */
  key: string;
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  /** Nutrients per gram (from the AI baseline or the manual entry). */
  density: Nutrients;
  /** Grams for one of each unit, learnt from the AI answer and user edits. */
  unitGrams: Record<string, number>;
  ingredients: string[];
  /** 0–1, null for dishes the user added by hand. */
  confidence: number | null;
  /** The untouched AI answer (stored in ai_meta.original). */
  original: AiDish | null;
}

const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

/** Round to 1 decimal (DB keeps numeric, UI shows ≤1 decimal). */
export const r1 = (v: number) => Math.round(v * 10) / 10;

/** Quantities snap to quarters for countable units, whole grams for 'g'. */
export function roundQuantity(q: number, unit: string): number {
  if (!(q > 0)) return 0;
  if (unit === 'g') return Math.max(1, Math.round(q));
  return Math.max(0.25, Math.round(q * 4) / 4);
}

export function isScanUnit(u: string): u is ScanUnit {
  return (SCAN_UNITS as readonly string[]).includes(u);
}

/** Grams for one `unit` of this dish (dish-specific when known, else the default table, else 100 g). */
export function gramsPerUnit(dish: Pick<ScanDish, 'unitGrams'>, unit: string): number {
  if (unit === 'g') return 1;
  const own = dish.unitGrams[unit];
  if (own > 0) return own;
  return isScanUnit(unit) ? DEFAULT_UNIT_GRAMS[unit] : 100;
}

export function nutrientsFor(density: Nutrients, grams: number): Nutrients {
  const g = Math.max(0, grams);
  return {
    kcal: r1(density.kcal * g),
    protein_g: r1(density.protein_g * g),
    carbs_g: r1(density.carbs_g * g),
    fat_g: r1(density.fat_g * g),
    fiber_g: r1(density.fiber_g * g),
  };
}

export function densityOf(n: Nutrients, grams: number): Nutrients {
  if (!(grams > 0)) return { ...ZERO_NUTRIENTS };
  return {
    kcal: num(n.kcal) / grams,
    protein_g: num(n.protein_g) / grams,
    carbs_g: num(n.carbs_g) / grams,
    fat_g: num(n.fat_g) / grams,
    fiber_g: num(n.fiber_g) / grams,
  };
}

let seq = 0;
export const dishKey = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Build an editable dish from the AI answer. When the AI gave no grams we
 * estimate them from the unit table so the density stays meaningful.
 */
export function fromAiDish(d: AiDish, key = dishKey()): ScanDish {
  const unit = (d.unit || 'phần').trim() || 'phần';
  const quantity = num(d.quantity) || 1;
  let grams = num(d.grams);
  if (unit === 'g') grams = grams || quantity;
  if (!grams) grams = quantity * (isScanUnit(unit) ? DEFAULT_UNIT_GRAMS[unit] : 100);
  const unitGrams: Record<string, number> = { g: 1 };
  if (unit !== 'g') unitGrams[unit] = grams / quantity;
  const density = densityOf(d, grams);
  return {
    key,
    name: d.name,
    quantity: unit === 'g' ? r1(grams) : quantity,
    unit,
    grams: r1(grams),
    density,
    unitGrams,
    ingredients: d.ingredients ?? [],
    confidence: Number.isFinite(d.confidence) ? Math.min(1, Math.max(0, d.confidence)) : null,
    original: d,
    ...nutrientsFor(density, grams),
  };
}

export interface ManualDishInput {
  name: string;
  grams: number;
  kcal: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  quantity?: number;
  unit?: string;
}

/** A dish typed in by the user ("kcal for this many grams"). */
export function manualDish(input: ManualDishInput, key = dishKey()): ScanDish {
  const grams = num(input.grams) || 100;
  const unit = input.unit || 'phần';
  const quantity = unit === 'g' ? grams : num(input.quantity) || 1;
  const base: Nutrients = {
    kcal: num(input.kcal),
    protein_g: num(input.protein_g),
    carbs_g: num(input.carbs_g),
    fat_g: num(input.fat_g),
    fiber_g: num(input.fiber_g),
  };
  const density = densityOf(base, grams);
  const unitGrams: Record<string, number> = { g: 1 };
  if (unit !== 'g') unitGrams[unit] = grams / quantity;
  return {
    key,
    name: input.name.trim(),
    quantity,
    unit,
    grams: r1(grams),
    density,
    unitGrams,
    ingredients: [],
    confidence: null,
    original: null,
    ...nutrientsFor(density, grams),
  };
}

function withGrams(dish: ScanDish, grams: number, patch: Partial<ScanDish> = {}): ScanDish {
  const g = Math.max(0, grams);
  return { ...dish, ...patch, grams: r1(g), ...nutrientsFor(dish.density, g) };
}

/** Change the count; grams follow the current unit size. */
export function setQuantity(dish: ScanDish, quantity: number): ScanDish {
  const q = Math.max(0, Number(quantity) || 0);
  return withGrams(dish, q * gramsPerUnit(dish, dish.unit), { quantity: q });
}

/**
 * Switch unit.
 * - to 'g': the portion stays the same, quantity becomes the gram weight.
 * - from 'g': keep the weight, express it in the new unit (snapped to ¼).
 * - between units: keep the count, weight follows the new unit size.
 */
export function setUnit(dish: ScanDish, unit: string): ScanDish {
  if (unit === dish.unit) return dish;
  if (unit === 'g') return withGrams(dish, dish.grams, { unit, quantity: r1(dish.grams) });
  const gpu = gramsPerUnit(dish, unit);
  if (dish.unit === 'g') {
    const q = roundQuantity(dish.grams / gpu, unit);
    return withGrams(dish, q * gpu, { unit, quantity: q });
  }
  return withGrams(dish, dish.quantity * gpu, { unit });
}

/** Edit the weight directly; the current unit's size is re-learnt so the stepper stays consistent. */
export function setGrams(dish: ScanDish, grams: number): ScanDish {
  const g = Math.max(0, Number(grams) || 0);
  if (dish.unit === 'g') return withGrams(dish, g, { quantity: r1(g) });
  const unitGrams = dish.quantity > 0 && g > 0 ? { ...dish.unitGrams, [dish.unit]: g / dish.quantity } : dish.unitGrams;
  return withGrams(dish, g, { unitGrams });
}

export function totals(dishes: Nutrients[]): Nutrients {
  const t = { ...ZERO_NUTRIENTS };
  for (const d of dishes) for (const k of NUTRIENT_KEYS) t[k] += num(d[k]);
  for (const k of NUTRIENT_KEYS) t[k] = r1(t[k]);
  return t;
}

/** Share (0–1) of a dish's energy coming from protein / carbs / fat. */
export function macroShares(n: Pick<Nutrients, 'protein_g' | 'carbs_g' | 'fat_g'>) {
  const p = num(n.protein_g) * 4;
  const c = num(n.carbs_g) * 4;
  const f = num(n.fat_g) * 9;
  const sum = p + c + f;
  if (!sum) return { protein: 0, carbs: 0, fat: 0 };
  return { protein: p / sum, carbs: c / sum, fat: f / sum };
}

/** A dish can be saved when it has a name and a positive amount. */
export function isDishValid(d: Pick<ScanDish, 'name' | 'quantity' | 'grams'>): boolean {
  return d.name.trim().length > 0 && d.quantity > 0 && d.grams >= 0;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export function confidenceLevel(c: number | null): ConfidenceLevel | null {
  if (c === null) return null;
  if (c >= 0.75) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}
