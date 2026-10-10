// Pure nutrition math + food search for the diary / search screens (no React, no Supabase).
import type { FoodCategory, FoodItem, FoodUnit, Nutrients } from '@/data/foods';
import type { CustomFood, MealEntry, MealSource, MealType, NewMealEntry } from '@/types/db';
import { MEAL_TYPES } from '@/types/db';

/* ===================================================================== */
/* Text normalisation                                                      */
/* ===================================================================== */

/** Diacritic-insensitive key: NFD + strip marks, đ→d, lowercase, punctuation → single spaces. */
export function normalizeVi(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* ===================================================================== */
/* Food options (DB food, custom food or a past entry → one shape)         */
/* ===================================================================== */

export type FoodOrigin = 'db' | 'custom' | 'history';

export interface FoodOption {
  /** 'db:<id>' · 'custom:<uuid>' · 'history:<normalized name>' */
  key: string;
  name: string;
  brand?: string | null;
  category: FoodCategory | null;
  per100g: Nutrients;
  units: FoodUnit[];
  defaultUnit: string;
  origin: FoodOrigin;
  customFoodId?: string | null;
  /** Normalised search keys; first = name. */
  searchKeys: string[];
  /** false for past entries saved without grams (manual / some AI) → no 'g' unit, grams stored as 0. */
  gramsKnown: boolean;
  /** Source to store when this option is logged. */
  source: MealSource;
}

const r1 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 10) / 10;

export function fromDbFood(food: FoodItem): FoodOption {
  return {
    key: `db:${food.id}`,
    name: food.name,
    category: food.category,
    per100g: food.per100g,
    units: food.units,
    defaultUnit: food.defaultUnit,
    origin: 'db',
    searchKeys: [normalizeVi(food.name), ...food.aliases.map(normalizeVi)].filter(Boolean),
    gramsKnown: true,
    source: 'search',
  };
}

/** "1 hộp" → "hộp"; keeps the label otherwise; max 20 chars (DB limit). */
export function servingUnit(label: string | null | undefined): string {
  const t = (label ?? '').trim().replace(/^1\s+/, '');
  return (t || 'phần').slice(0, 20);
}

export function fromCustomFood(cf: CustomFood): FoodOption {
  const unit = servingUnit(cf.serving_label);
  return {
    key: `custom:${cf.id}`,
    name: cf.name,
    brand: cf.brand,
    category: null,
    per100g: { kcal: cf.kcal_100g, protein: cf.protein_100g, carbs: cf.carbs_100g, fat: cf.fat_100g, fiber: cf.fiber_100g },
    units: [{ unit, grams: cf.serving_grams }],
    defaultUnit: unit,
    origin: 'custom',
    customFoodId: cf.id,
    searchKeys: [normalizeVi(cf.name), normalizeVi(cf.brand)].filter(Boolean),
    gramsKnown: true,
    source: 'custom',
  };
}

/**
 * A past entry as a re-loggable option. With grams we derive per-100 g values;
 * without (manual / AI without weight) we treat 1 unit as a pseudo 100 g portion.
 */
export function fromEntry(e: Pick<MealEntry, 'name' | 'quantity' | 'unit' | 'grams' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'source'>): FoodOption {
  const q = e.quantity > 0 ? e.quantity : 1;
  const gramsKnown = e.grams > 0;
  const basis = gramsKnown ? e.grams : q * 100; // grams the stored nutrients refer to
  const per = (v: number) => r1(((v || 0) * 100) / basis);
  const unit = (e.unit || 'phần').slice(0, 20);
  return {
    key: `history:${normalizeVi(e.name)}`,
    name: e.name,
    category: null,
    per100g: { kcal: per(e.kcal), protein: per(e.protein_g), carbs: per(e.carbs_g), fat: per(e.fat_g), fiber: per(e.fiber_g) },
    units: [{ unit, grams: gramsKnown ? e.grams / q : 100 }],
    defaultUnit: unit,
    origin: 'history',
    searchKeys: [normalizeVi(e.name)],
    gramsKnown,
    source: e.source === 'search' || e.source === 'custom' ? e.source : 'manual',
  };
}

/** Units offered in the sheet: the food's own units + 'g' (when grams are meaningful). */
export function unitOptions(opt: Pick<FoodOption, 'units' | 'gramsKnown'>, extra?: FoodUnit): FoodUnit[] {
  const list = [...opt.units];
  if (extra && extra.unit && !list.some((u) => u.unit === extra.unit)) list.push(extra);
  if (opt.gramsKnown && !list.some((u) => u.unit === 'g')) list.push({ unit: 'g', grams: 1 });
  return list;
}

export function unitGrams(opt: Pick<FoodOption, 'units'>, unit: string): number {
  if (unit === 'g' || unit === 'ml') {
    const own = opt.units.find((u) => u.unit === unit);
    return own ? own.grams : 1;
  }
  return opt.units.find((u) => u.unit === unit)?.grams ?? opt.units[0]?.grams ?? 100;
}

/* ===================================================================== */
/* Nutrition math                                                          */
/* ===================================================================== */

export interface Portion {
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

/** Nutrients for `grams` of a food with per-100 g values (1 decimal). */
export function scaleNutrients(per100: Nutrients, grams: number): Omit<Portion, 'grams'> {
  const k = Math.max(0, grams || 0) / 100;
  return {
    kcal: r1(per100.kcal * k),
    protein_g: r1(per100.protein * k),
    carbs_g: r1(per100.carbs * k),
    fat_g: r1(per100.fat * k),
    fiber_g: r1(per100.fiber * k),
  };
}

/** Portion for `qty` × `unit` of an option. grams = 0 when the option has no real weight. */
export function computePortion(opt: Pick<FoodOption, 'units' | 'per100g' | 'gramsKnown'>, qty: number, unit: string): Portion {
  const g = Math.max(0, qty || 0) * unitGrams(opt, unit);
  return { grams: opt.gramsKnown ? r1(g) : 0, ...scaleNutrients(opt.per100g, g) };
}

/** Quantity to show after switching unit: grams keep the weight, other units restart at 1. */
export function convertQuantity(opt: Pick<FoodOption, 'units'>, qty: number, from: string, to: string): number {
  if (from === to) return qty;
  if (to === 'g' || to === 'ml') return Math.max(1, Math.round(qty * unitGrams(opt, from)));
  return 1;
}

/** Insert row for the diary. */
export function toNewEntry(opt: FoodOption, qty: number, unit: string, meal: MealType, date: string): NewMealEntry {
  const p = computePortion(opt, qty, unit);
  return {
    eaten_on: date,
    meal,
    name: opt.name,
    quantity: r1(qty) || qty,
    unit,
    ...p,
    source: opt.source,
    custom_food_id: opt.origin === 'custom' ? (opt.customFoodId ?? null) : null,
  };
}

export interface Totals {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}
export const ZERO_TOTALS: Totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };

export function sumNutrients(rows: Array<Partial<Totals>>): Totals {
  const t = { ...ZERO_TOTALS };
  for (const r of rows) {
    t.kcal += Number(r.kcal) || 0;
    t.protein_g += Number(r.protein_g) || 0;
    t.carbs_g += Number(r.carbs_g) || 0;
    t.fat_g += Number(r.fat_g) || 0;
    t.fiber_g += Number(r.fiber_g) || 0;
  }
  return { kcal: r1(t.kcal), protein_g: r1(t.protein_g), carbs_g: r1(t.carbs_g), fat_g: r1(t.fat_g), fiber_g: r1(t.fiber_g) };
}

export function groupByMeal<T extends { meal: MealType }>(rows: T[]): Record<MealType, T[]> {
  const out = { breakfast: [], lunch: [], dinner: [], snack: [] } as Record<MealType, T[]>;
  for (const r of rows) (out[r.meal] ?? out.snack).push(r);
  return out;
}

/** kcal from macros (4/4/9). */
export function kcalFromMacros(p: number, c: number, f: number): number {
  return Math.round((p || 0) * 4 + (c || 0) * 4 + (f || 0) * 9);
}

/** Custom-food form: values typed per serving → per 100 g. */
export function per100FromServing(n: Nutrients, servingGrams: number): Nutrients {
  const k = servingGrams > 0 ? 100 / servingGrams : 0;
  return { kcal: r1(n.kcal * k), protein: r1(n.protein * k), carbs: r1(n.carbs * k), fat: r1(n.fat * k), fiber: r1(n.fiber * k) };
}

export function perServingFromPer100(n: Nutrients, servingGrams: number): Nutrients {
  const k = servingGrams / 100;
  return { kcal: r1(n.kcal * k), protein: r1(n.protein * k), carbs: r1(n.carbs * k), fat: r1(n.fat * k), fiber: r1(n.fiber * k) };
}

/* ===================================================================== */
/* Meal helpers                                                            */
/* ===================================================================== */

export function parseMeal(v: string | null | undefined): MealType | null {
  return v && (MEAL_TYPES as string[]).includes(v) ? (v as MealType) : null;
}

/** Sensible default meal for the current time. */
export function guessMeal(now: Date = new Date()): MealType {
  const m = now.getHours() * 60 + now.getMinutes();
  if (m >= 4 * 60 && m < 10 * 60 + 30) return 'breakfast';
  if (m >= 10 * 60 + 30 && m < 14 * 60 + 30) return 'lunch';
  if (m >= 17 * 60 && m < 21 * 60 + 30) return 'dinner';
  return 'snack';
}

export const MEAL_SHORT: Record<MealType, string> = {
  breakfast: 'Sáng',
  lunch: 'Trưa',
  dinner: 'Tối',
  snack: 'Ăn vặt',
};

/* ===================================================================== */
/* Recent foods + editing an entry                                         */
/* ===================================================================== */

export interface RecentFood {
  option: FoodOption;
  quantity: number;
  unit: string;
}

/** Find the DB food whose name (diacritic-insensitive) equals `name`. */
export function matchDbFood(name: string, foods: FoodItem[]): FoodItem | undefined {
  const n = normalizeVi(name);
  return foods.find((f) => normalizeVi(f.name) === n);
}

/** Best option to re-log / edit an entry: its custom food, else a DB food with that name, else the entry itself. */
export function optionForEntry(e: MealEntry, foods: FoodItem[], customs: CustomFood[] = []): FoodOption {
  if (e.custom_food_id) {
    const cf = customs.find((c) => c.id === e.custom_food_id);
    if (cf) return fromCustomFood(cf);
  }
  if (e.source !== 'ai' && e.source !== 'manual' && e.grams > 0) {
    const db = matchDbFood(e.name, foods);
    if (db) return fromDbFood(db);
  }
  return fromEntry(e);
}

/** Distinct foods from recent entries, newest first, with the last portion used. */
export function recentFoods(entries: MealEntry[], foods: FoodItem[], customs: CustomFood[] = [], limit = 12): RecentFood[] {
  const sorted = [...entries].sort((a, b) => (b.eaten_on + b.created_at).localeCompare(a.eaten_on + a.created_at));
  const seen = new Set<string>();
  const out: RecentFood[] = [];
  for (const e of sorted) {
    const opt = optionForEntry(e, foods, customs);
    // A deleted custom food / renamed DB food falls back to the entry itself — dedupe by name too.
    const nameKey = `n:${normalizeVi(opt.name)}`;
    if (seen.has(opt.key) || seen.has(nameKey)) continue;
    seen.add(opt.key);
    seen.add(nameKey);
    const unitOk = unitOptions(opt).some((u) => u.unit === e.unit);
    out.push({ option: opt, quantity: unitOk && e.quantity > 0 ? e.quantity : 1, unit: unitOk ? e.unit : opt.defaultUnit });
    if (out.length >= limit) break;
  }
  return out;
}

/* ===================================================================== */
/* Search                                                                  */
/* ===================================================================== */

/** Optimal-string-alignment distance (Levenshtein + adjacent transpositions); returns max+1 when above `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return Math.min(d[a.length][b.length], max + 1);
}

/** Typo-tolerant token match: word starts with a token that is ≤1 edit (≤2 for long tokens) away. */
function fuzzyToken(t: string, w: string): boolean {
  if (t.length < 3) return w.startsWith(t);
  const max = t.length >= 6 ? 2 : 1;
  if (w.startsWith(t)) return true;
  return editDistance(t, w.slice(0, t.length), max) <= max || editDistance(t, w, max) <= max;
}

export const SCORE = { exact: 1000, prefix: 800, word: 600, tokens: 500, contains: 400, fuzzy: 200 } as const;

/** Score of one normalised key against a normalised query (0 = no match). */
export function scoreKey(key: string, q: string): number {
  if (!key || !q) return 0;
  if (key === q) return SCORE.exact;
  if (key.startsWith(q)) return SCORE.prefix - Math.min(50, key.length - q.length);
  const words = key.split(' ');
  if ((' ' + key).includes(' ' + q)) return SCORE.word - Math.min(50, key.length - q.length);
  const tokens = q.split(' ');
  if (tokens.every((t) => words.some((w) => w.startsWith(t)))) return SCORE.tokens;
  if (key.includes(q)) return SCORE.contains;
  if (tokens.every((t) => words.some((w) => fuzzyToken(t, w)))) return SCORE.fuzzy;
  return 0;
}

export interface SearchOptions {
  /** Option keys in recency order → boosted. */
  recentKeys?: string[];
  limit?: number;
}

/**
 * Diacritic-insensitive ranked search. Tiers: exact > prefix > word prefix > all tokens >
 * contains > fuzzy. Recent foods get a boost (enough to lead their tier), custom foods a small one.
 */
export function searchFoods(query: string, options: FoodOption[], opts: SearchOptions = {}): FoodOption[] {
  const q = normalizeVi(query);
  if (!q) return [];
  const recent = new Map((opts.recentKeys ?? []).map((k, i) => [k, i]));
  const scored: Array<{ o: FoodOption; s: number }> = [];
  const seen = new Set<string>();
  for (const o of options) {
    if (seen.has(o.key)) continue;
    let best = 0;
    o.searchKeys.forEach((k, i) => {
      const s = scoreKey(k, q) - (i > 0 ? 5 : 0); // aliases slightly below the real name
      if (s > best) best = s;
    });
    if (best <= 0) continue;
    seen.add(o.key);
    const r = recent.get(o.key);
    if (r !== undefined) best += 150 - Math.min(r, 20) * 2;
    if (o.origin === 'custom') best += 20;
    scored.push({ o, s: best });
  }
  scored.sort((a, b) => b.s - a.s || a.o.name.length - b.o.name.length || a.o.name.localeCompare(b.o.name, 'vi'));
  return scored.slice(0, opts.limit ?? 60).map((x) => x.o);
}
