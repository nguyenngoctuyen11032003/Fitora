// Portion scaling for AI-scanned dishes.
//
// The AI baseline (grams + nutrients) is turned into a per-gram density once;
// every edit (quantity / unit / grams) only changes the grams, and nutrients
// are always `density × grams`. That keeps edits reversible and drift-free.

import { formatNumber } from '@/lib/format';
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

/**
 * Other units the AI uses (see the edge-function prompt) — only consulted when the AI
 * gave no weight, so a "tô" is not mistaken for 100 g.
 */
export const EXTRA_UNIT_GRAMS: Record<string, number> = {
  ml: 1,
  kg: 1000,
  l: 1000,
  lít: 1000,
  tô: 500,
  chén: 200,
  cái: 60,
  cốc: 250,
  lon: 330,
  chai: 500,
  hộp: 200,
  quả: 100,
  trái: 100,
  xiên: 50,
  cuốn: 50,
  lát: 30,
  thìa: 15,
  'ổ': 200,
  hũ: 100,
  khay: 300,
  suất: 350,
};

// 'ml' counts as grams too (1 ml of a drink ≈ 1 g): the editor then only ever sees ONE
// weight unit whose count IS the weight (see DishCard). A "500 ml" drink must not be
// handled like "500 cái" (a countable unit with a stepper capped at 50).
const GRAM_ALIASES = new Set(['g', 'gr', 'gram', 'grams', 'gam', 'gm', 'ml']);

/**
 * Canonical unit spelling: trimmed, lower-case, gram/ml synonyms → 'g', empty → 'phần'.
 * Keeps the stepper/picker logic (which compares with 'g') working for "Gram", " G "…
 */
export function normalizeUnit(unit: unknown): string {
  const u = String(unit ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!u) return 'phần';
  return GRAM_ALIASES.has(u) ? 'g' : u;
}

/** Grams for one `unit` when nothing dish-specific is known (100 g for unknown units). */
export function defaultUnitGrams(unit: string): number {
  const u = normalizeUnit(unit);
  if (isScanUnit(u)) return DEFAULT_UNIT_GRAMS[u];
  return EXTRA_UNIT_GRAMS[u] ?? 100;
}

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
  /** "Ghi nhớ món này" — remember it in "Món của tôi" on save (undefined = on). */
  remember?: boolean;
  /** Saved food whose numbers this dish uses ("Dùng số liệu đã lưu" / picked from the list). */
  savedFoodId?: string | null;
  /** The dish as it was before the saved numbers were applied (undo). */
  aiBackup?: ScanDish | null;
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
  return defaultUnitGrams(unit);
}

export function nutrientsFor(density: Nutrients, grams: number): Nutrients {
  const g = num(grams);
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

/** Atwater estimate (4/4/9 kcal per g of protein/carbs/fat). */
export function kcalFromMacros(n: Pick<Nutrients, 'protein_g' | 'carbs_g' | 'fat_g'>): number {
  return num(n.protein_g) * 4 + num(n.carbs_g) * 4 + num(n.fat_g) * 9;
}

/**
 * Clean nutrient numbers (NaN/negative → 0). When the energy is missing but macros
 * are present (an AI slip), estimate it from the macros instead of saving 0 kcal.
 */
export function sanitizeNutrients(n: Partial<Nutrients>): Nutrients {
  const out: Nutrients = {
    kcal: num(n.kcal),
    protein_g: num(n.protein_g),
    carbs_g: num(n.carbs_g),
    fat_g: num(n.fat_g),
    fiber_g: num(n.fiber_g),
  };
  if (!out.kcal) out.kcal = kcalFromMacros(out);
  return out;
}

let seq = 0;
export const dishKey = () => `d${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Build an editable dish from the AI answer. When the AI gave no grams we
 * estimate them from the unit table so the density stays meaningful.
 */
export function fromAiDish(d: AiDish, key = dishKey()): ScanDish {
  let unit = normalizeUnit(d.unit);
  let quantity = num(d.quantity) || 1;
  // "0,5 l" / "1,5 kg" → 500 / 1500 g, so every weight-like unit ends up as plain grams.
  if (unit === 'kg' || unit === 'l' || unit === 'lít') {
    unit = 'g';
    quantity *= 1000;
  }
  let grams = num(d.grams);
  if (unit === 'g') grams = grams || quantity;
  if (!grams) grams = quantity * defaultUnitGrams(unit);
  const unitGrams: Record<string, number> = { g: 1 };
  if (unit !== 'g') unitGrams[unit] = grams / quantity;
  const density = densityOf(sanitizeNutrients(d), grams);
  return {
    key,
    name: String(d.name ?? '').trim(),
    quantity: unit === 'g' ? r1(grams) : quantity,
    unit,
    grams: r1(grams),
    density,
    unitGrams,
    ingredients: d.ingredients ?? [],
    confidence: typeof d.confidence === 'number' && Number.isFinite(d.confidence) ? Math.min(1, Math.max(0, d.confidence)) : null,
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
  const unit = normalizeUnit(input.unit);
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
  const g = num(grams);
  return { ...dish, ...patch, grams: r1(g), ...nutrientsFor(dish.density, g) };
}

/** Change the count; grams follow the current unit size. */
export function setQuantity(dish: ScanDish, quantity: number): ScanDish {
  const q = num(quantity);
  return withGrams(dish, q * gramsPerUnit(dish, dish.unit), { quantity: q });
}

/**
 * Switch unit.
 * - to 'g': the portion stays the same, quantity becomes the gram weight.
 * - from 'g': keep the weight, express it in the new unit (snapped to ¼).
 * - between units: keep the count, weight follows the new unit size.
 */
export function setUnit(dish: ScanDish, rawUnit: string): ScanDish {
  const unit = normalizeUnit(rawUnit);
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
  const g = num(grams);
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

/** Hard limits of one diary row (fit_meal_entries CHECK constraints). */
export const ENTRY_LIMITS = { quantity: 10_000, grams: 100_000, kcal: 50_000, macro: 10_000 } as const;
/** Above this one dish is almost surely a misread portion → warn (still allowed). */
export const DISH_KCAL_WARN = 3000;

export type DishField = 'name' | 'quantity' | 'grams' | 'kcal' | 'macros';
export type DishIssues = Partial<Record<DishField, string>>;

const MACRO_LABEL: Record<'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g', string> = {
  protein_g: 'Đạm',
  carbs_g: 'Tinh bột',
  fat_g: 'Chất béo',
  fiber_g: 'Chất xơ',
};
const vi = (n: number) => formatNumber(n);

/** Per-field errors that would stop the dish from being saved (empty object = OK). */
export function dishIssues(d: Pick<ScanDish, 'name' | 'quantity' | 'grams'> & Partial<Nutrients>): DishIssues {
  const out: DishIssues = {};
  const ok = (v: number) => Number.isFinite(v);
  const n = { ...ZERO_NUTRIENTS, ...d };
  if (!d.name.trim()) out.name = 'Nhập tên món';
  if (!ok(d.quantity) || d.quantity <= 0) out.quantity = 'Phải lớn hơn 0';
  else if (d.quantity > ENTRY_LIMITS.quantity) out.quantity = `Tối đa ${vi(ENTRY_LIMITS.quantity)}`;
  if (!ok(d.grams) || d.grams <= 0) out.grams = 'Phải lớn hơn 0';
  else if (d.grams > ENTRY_LIMITS.grams) out.grams = `Tối đa ${vi(ENTRY_LIMITS.grams)} g`;
  if (!ok(n.kcal) || n.kcal < 0) out.kcal = 'Năng lượng không hợp lệ';
  else if (n.kcal > ENTRY_LIMITS.kcal) out.kcal = `Quá ${vi(ENTRY_LIMITS.kcal)} kcal — giảm khẩu phần`;
  const bad = (Object.keys(MACRO_LABEL) as (keyof typeof MACRO_LABEL)[]).find((k) => !ok(n[k]) || n[k] < 0 || n[k] > ENTRY_LIMITS.macro);
  if (bad) out.macros = `${MACRO_LABEL[bad]} vượt ${vi(ENTRY_LIMITS.macro)} g — giảm khẩu phần`;
  return out;
}

/** A dish can be saved when it has a name, a positive count and weight, and fits the diary limits. */
export function isDishValid(d: Pick<ScanDish, 'name' | 'quantity' | 'grams'> & Partial<Nutrients>): boolean {
  return Object.keys(dishIssues(d)).length === 0;
}

/** Warning (not an error) for a suspiciously large dish. */
export function dishWarning(d: Pick<ScanDish, 'kcal'>): string | null {
  return Number.isFinite(d.kcal) && d.kcal > DISH_KCAL_WARN && d.kcal <= ENTRY_LIMITS.kcal
    ? `Hơn ${vi(DISH_KCAL_WARN)} kcal cho một món — kiểm tra lại khẩu phần.`
    : null;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export function confidenceLevel(c: number | null): ConfidenceLevel | null {
  if (c === null) return null;
  if (c >= 0.75) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}

/** Put `item` back at `index` (clamped) — used to undo a removal. */
export function insertAt<T>(list: T[], index: number, item: T): T[] {
  const i = Math.min(Math.max(0, Math.trunc(index) || 0), list.length);
  return [...list.slice(0, i), item, ...list.slice(i)];
}

/**
 * Units offered in the picker: the AI's own unit first (tô, chén, lon… — so the original
 * portion can always be restored with its learnt size), then the standard units, then any
 * other unit this dish has learnt. The current unit is always present.
 */
export function unitOptions(dish: Pick<ScanDish, 'unit' | 'unitGrams' | 'original'>): string[] {
  const out: string[] = [];
  const add = (u: string) => {
    if (u && !out.includes(u)) out.push(u);
  };
  if (dish.original) add(normalizeUnit(dish.original.unit));
  for (const u of SCAN_UNITS) add(u);
  for (const u of Object.keys(dish.unitGrams)) add(u);
  add(dish.unit);
  return out;
}

/** Stepper / field bounds for the count: never narrower than the value the AI or user already has. */
export function quantityBounds(dish: Pick<ScanDish, 'unit' | 'quantity'>): { min: number; max: number; step: number; decimals: 0 | 2 } {
  const q = Number.isFinite(dish.quantity) && dish.quantity > 0 ? dish.quantity : 0;
  if (dish.unit === 'g') return { min: 1, max: Math.max(5000, Math.ceil(q)), step: 10, decimals: 0 };
  return { min: q > 0 ? Math.min(0.25, q) : 0.25, max: Math.max(50, Math.ceil(q)), step: 0.5, decimals: 2 };
}
