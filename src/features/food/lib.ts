// Pure nutrition math + food search for the diary / search screens (no React, no Supabase).
import type { FoodCategory, FoodItem, FoodUnit, Nutrients } from '@/data/foods';
import type { CustomFood, FitProfile, MealEntry, MealSource, MealType, NewMealEntry } from '@/types/db';
import { MEAL_TYPES } from '@/types/db';
import { activityModel, effectiveWeight, energyBalance, targetsFromProfile, type EnergyBalance } from '@/features/today/metrics';

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
  // Keep precision: these are rescaled again when the user changes the portion.
  const per = (v: number) => Math.round((((v || 0) * 100) / basis) * 1000) / 1000;
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
  // Drinks already measured in ml don't also need grams.
  if (opt.gramsKnown && !list.some((u) => u.unit === 'g' || u.unit === 'ml')) list.push({ unit: 'g', grams: 1 });
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

const isWeightUnit = (u: string) => u === 'g' || u === 'ml';
/** Quantities of household units are kept to quarters (½ bát, 1¼ ổ). */
const quarter = (n: number) => Math.round(n * 4) / 4;

/**
 * Quantity to show after switching unit. Switching to/from g·ml keeps the weight
 * (300 g → 2 bát of 150 g); between two household units ("bát" → "bát nhỏ") restarts at 1.
 */
export function convertQuantity(opt: Pick<FoodOption, 'units'>, qty: number, from: string, to: string): number {
  if (from === to) return qty;
  const grams = Math.max(0, qty || 0) * unitGrams(opt, from);
  if (isWeightUnit(to)) return Math.max(1, Math.round(grams / unitGrams(opt, to)));
  if (isWeightUnit(from)) return Math.max(0.25, quarter(grams / unitGrams(opt, to)));
  return 1;
}

/** Quantity as stored (numeric(8,2)): 2 decimals, so ¼ portions stay exact. */
export const roundQty = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Insert row for the diary. */
export function toNewEntry(opt: FoodOption, qty: number, unit: string, meal: MealType, date: string): NewMealEntry {
  const q = roundQty(qty) || qty;
  const p = computePortion(opt, q, unit);
  return {
    eaten_on: date,
    meal,
    name: opt.name,
    quantity: q,
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

/** Entries in the order they were logged (stable: ties keep input order). */
export function sortByLogged<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
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

/**
 * Physical sanity of a serving typed from a label (the DB also caps per-100 g values):
 * returns a Vietnamese message for the first problem, or null.
 */
export function servingProblem(n: Nutrients, servingGrams: number): string | null {
  if (!(servingGrams > 0)) return null;
  const macros = (n.protein || 0) + (n.carbs || 0) + (n.fat || 0);
  if (macros > servingGrams * 1.005) {
    return `Đạm + tinh bột + béo (${r1(macros)} g) không thể nặng hơn cả phần ăn (${r1(servingGrams)} g). Kiểm tra lại khối lượng một phần.`;
  }
  if ((n.fiber || 0) > servingGrams) return `Chất xơ không thể nặng hơn cả phần ăn (${r1(servingGrams)} g).`;
  if ((n.kcal || 0) > servingGrams * 9.05) {
    return `${Math.round(n.kcal)} kcal cho ${r1(servingGrams)} g là quá cao (tối đa ~9 kcal mỗi gam, như dầu ăn). Kiểm tra lại khối lượng một phần.`;
  }
  return null;
}

/** Whether typed kcal and 4/4/9 macros disagree enough to warn. */
export function kcalMismatch(kcal: number | null, fromMacros: number): boolean {
  return kcal !== null && fromMacros > 0 && Math.abs(fromMacros - kcal) > Math.max(30, kcal * 0.25);
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

/** Insert row that recreates an entry (undo of a delete): everything except id / owner / timestamps. */
export function entryToInsert(e: MealEntry): NewMealEntry {
  const { id: _id, user_id: _u, created_at: _c, updated_at: _up, ...rest } = e;
  return rest;
}

/**
 * Copies of `rows` logged on `date` (and `meal`, when given) — "Chép từ hôm qua".
 * Keeps portions, nutrients, source, custom food and photo (shared photos are reference-counted).
 */
export function copyEntries(rows: MealEntry[], date: string, meal?: MealType): NewMealEntry[] {
  return [...rows]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((e) => ({ ...entryToInsert(e), eaten_on: date, ...(meal ? { meal } : {}) }));
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
  /** How many times this food was logged in the given entries (≥ 1). */
  count: number;
}

/** Find the DB food whose name (diacritic-insensitive) equals `name`. */
export function matchDbFood(name: string, foods: FoodItem[]): FoodItem | undefined {
  let index = NAME_INDEX.get(foods);
  if (!index) {
    index = new Map();
    for (const f of foods) {
      const k = normalizeVi(f.name);
      if (!index.has(k)) index.set(k, f);
    }
    NAME_INDEX.set(foods, index);
  }
  return index.get(normalizeVi(name));
}
/** normalised name → food, built once per food array (recentFoods maps hundreds of entries). */
const NAME_INDEX = new WeakMap<FoodItem[], Map<string, FoodItem>>();

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

/** Grams per unit the entry was logged with (0 when unknown or a g/ml entry). */
function entryUnitGrams(e: Pick<MealEntry, 'unit' | 'quantity' | 'grams'>): number {
  return e.grams > 0 && e.quantity > 0 && !isWeightUnit(e.unit) ? e.grams / e.quantity : 0;
}

/**
 * The option with the entry's own household-unit size: if the user's "đĩa" weighed 300 g
 * (or the food has no "tô"), that unit uses the logged grams instead of the database default.
 */
export function withEntryUnit(opt: FoodOption, e: Pick<MealEntry, 'unit' | 'quantity' | 'grams'>): FoodOption {
  const g = entryUnitGrams(e);
  if (!opt.gramsKnown || !(g > 0)) return opt;
  const unit = e.unit.slice(0, 20);
  const own = opt.units.find((u) => u.unit === unit);
  if (own && Math.abs(own.grams - g) <= Math.max(1, own.grams * 0.02)) return opt;
  const units = own ? opt.units.map((u) => (u.unit === unit ? { unit, grams: r1(g) } : u)) : [...opt.units, { unit, grams: r1(g) }];
  return { ...opt, units };
}

/**
 * Option for editing an existing entry. Keeps what was logged: the entry's unit size and,
 * when the stored nutrients differ from the current food data (older DB values, AI, custom
 * food changed), the entry's own per-100 g values — so changing only the meal or the
 * quantity never silently re-prices the entry.
 */
export function optionForEdit(e: MealEntry, foods: FoodItem[], customs: CustomFood[] = []): FoodOption {
  const base = optionForEntry(e, foods, customs);
  if (base.origin === 'history' || !(e.grams > 0)) return base;
  const own = fromEntry(e);
  const ref = base.per100g.kcal;
  const drift = Math.abs(own.per100g.kcal - ref) > Math.max(2, ref * 0.03);
  return withEntryUnit(drift ? { ...base, per100g: own.per100g } : base, e);
}

/** Distinct foods from recent entries, newest first, with the last portion used. */
export function recentFoods(entries: MealEntry[], foods: FoodItem[], customs: CustomFood[] = [], limit = 12): RecentFood[] {
  const sorted = [...entries].sort((a, b) => (b.eaten_on + b.created_at).localeCompare(a.eaten_on + a.created_at));
  const counts = new Map<string, number>();
  for (const e of entries) {
    const k = normalizeVi(e.name);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const seen = new Set<string>();
  const out: RecentFood[] = [];
  for (const e of sorted) {
    // Re-log with the portion size the user actually ate (their "đĩa"), priced with current food data.
    const opt = withEntryUnit(optionForEntry(e, foods, customs), e);
    // A deleted custom food / renamed DB food falls back to the entry itself — dedupe by name too.
    const nameKey = `n:${normalizeVi(opt.name)}`;
    if (seen.has(opt.key) || seen.has(nameKey)) continue;
    seen.add(opt.key);
    seen.add(nameKey);
    const units = unitOptions(opt);
    const unitOk = units.some((u) => u.unit === e.unit);
    // Logged by weight in a unit the food no longer offers (g ↔ ml for drinks): keep the weight.
    const weightUnit = !unitOk && isWeightUnit(e.unit) && e.grams > 0 ? units.find((u) => isWeightUnit(u.unit) && u.grams === 1) : undefined;
    const count = Math.max(1, counts.get(normalizeVi(e.name)) ?? 1);
    if (weightUnit) out.push({ option: opt, quantity: r1(e.grams), unit: weightUnit.unit, count });
    else out.push({ option: opt, quantity: unitOk && e.quantity > 0 ? e.quantity : 1, unit: unitOk ? e.unit : opt.defaultUnit, count });
    if (out.length >= limit) break;
  }
  return out;
}

/** Option key → times logged, for searchFoods' frequency boost. */
export function frequencyByKey(recent: RecentFood[]): Map<string, number> {
  return new Map(recent.map((r) => [r.option.key, r.count]));
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

/**
 * Search-only canonical form: normalizeVi + spelling variants that mean the same word
 * ("mỳ" = "mì", "hủ tíu" = "hủ tiếu").
 */
export function searchNorm(s: string | null | undefined): string {
  let out = normalizeVi(s);
  for (const [re, to] of SYNONYMS) out = out.replace(re, to);
  return out;
}

/**
 * Spelling variants, regional words and chat shorthand folded to one form. Applied to both
 * the query and the food keys, so either spelling finds the other.
 */
const SYNONYMS: Array<[RegExp, string]> = [
  [/\bmy\b/g, 'mi'], // mỳ = mì
  [/\btiu\b/g, 'tieu'], // hủ tíu = hủ tiếu
  [/\b(?:cafe|caphe|coffee|cf)\b/g, 'ca phe'],
  [/\bheo\b/g, 'lon'], // thịt heo (Nam) = thịt lợn (Bắc)
  [/\bdau hu\b/g, 'dau phu'],
  [/\bdau phong\b/g, 'lac'],
  [/\b(?:ko|k|kh|khg)\b/g, 'khong'], // "cafe ko duong" ("hong" stays: Hồng chín)
  [/\bsinhto\b/g, 'sinh to'],
  [/\btrasua\b/g, 'tra sua'],
];

/**
 * Splits `text` into plain / matched parts for highlighting: every query word found at the
 * start of a word (diacritic-insensitive, "pho" marks "Phở"). Offsets refer to the original text.
 */
export function highlightParts(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const tokens = [...new Set(normalizeVi(query).split(' ').filter(Boolean))];
  if (!text || !tokens.length) return [{ text, hit: false }];
  // One folded char per UTF-16 unit, so indexes line up with `text`.
  let folded = '';
  for (const ch of text) {
    const n = normalizeVi(ch);
    folded += (n[0] ?? ' ').padEnd(ch.length, ' ');
  }
  const mark = new Array<boolean>(text.length).fill(false);
  for (const t of tokens) {
    let i = folded.indexOf(t);
    while (i >= 0) {
      if (i === 0 || folded[i - 1] === ' ') for (let j = i; j < i + t.length; j++) mark[j] = true;
      i = folded.indexOf(t, i + 1);
    }
  }
  const parts: Array<{ text: string; hit: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last.hit === mark[i]) last.text += text[i];
    else parts.push({ text: text[i], hit: mark[i] });
  }
  return parts;
}

/** Penalty when the query ends mid-word ("com ga" vs "com gao…") so whole-word matches lead their tier. */
const midWord = (key: string, end: number) => (end < key.length && key[end] !== ' ' ? 60 : 0);

/** Score of one normalised key against a normalised query (0 = no match). */
export function scoreKey(key: string, q: string): number {
  if (!key || !q) return 0;
  if (key === q) return SCORE.exact;
  if (key.startsWith(q)) return SCORE.prefix - midWord(key, q.length) - Math.min(50, key.length - q.length);
  const words = key.split(' ');
  const at = (' ' + key).indexOf(' ' + q);
  if (at >= 0) return SCORE.word - midWord(key, at + q.length) - Math.min(50, key.length - q.length);
  const tokens = q.split(' ');
  if (tokens.every((t) => words.some((w) => w.startsWith(t)))) {
    // Every token is a whole word → better than partial-word matches.
    return SCORE.tokens + (tokens.every((t) => words.includes(t)) ? 40 : 0);
  }
  // Words typed without spaces ("banhmi", "comtam").
  if (!q.includes(' ') && q.length >= 4) {
    const compact = key.replace(/ /g, '');
    if (compact === q) return SCORE.word;
    if (compact.startsWith(q)) return SCORE.tokens - 10;
  }
  if (key.includes(q)) return SCORE.contains;
  if (tokens.every((t) => words.some((w) => fuzzyToken(t, w)))) return SCORE.fuzzy;
  return 0;
}

export interface SearchOptions {
  /** Option keys in recency order → boosted. */
  recentKeys?: string[];
  /** Option key → times logged; frequent foods get an extra boost on top of recency. */
  frequency?: Map<string, number>;
  limit?: number;
}

/**
 * Diacritic-insensitive ranked search. Tiers: exact > prefix > word prefix > all tokens >
 * contains > fuzzy. Recent foods get a boost (enough to lead their tier), custom foods a small one.
 */
export function searchFoods(query: string, options: FoodOption[], opts: SearchOptions = {}): FoodOption[] {
  const q = searchNorm(query);
  if (!q) return [];
  const recent = new Map((opts.recentKeys ?? []).map((k, i) => [k, i]));
  const scored: Array<{ o: FoodOption; s: number }> = [];
  const seen = new Set<string>();
  for (const o of options) {
    if (seen.has(o.key)) continue;
    // First option with a key wins (callers put personalised / recent options first).
    seen.add(o.key);
    let best = 0;
    o.searchKeys.forEach((k, i) => {
      const s = scoreKey(searchNorm(k), q) - (i > 0 ? 5 : 0); // aliases slightly below the real name
      if (s > best) best = s;
    });
    if (best <= 0) continue;
    const r = recent.get(o.key);
    if (r !== undefined) best += 150 - Math.min(r, 20) * 2;
    const n = opts.frequency?.get(o.key) ?? 0;
    if (n > 1) best += (Math.min(n, 10) - 1) * 6;
    if (o.origin === 'custom') best += 20;
    scored.push({ o, s: best });
  }
  scored.sort((a, b) => b.s - a.s || a.o.name.length - b.o.name.length || a.o.name.localeCompare(b.o.name, 'vi'));
  return scored.slice(0, opts.limit ?? 60).map((x) => x.o);
}

// ---- day energy balance (same model as the Today screen) ------------------

export type DiaryBalance = EnergyBalance;

/**
 * "Còn lại" for a diary day, computed by Today's own energy model so both screens
 * show one number for the same day: target − eaten + bonus, where bonus is the
 * part of (done workouts + steps) above the activity the target already assumes.
 * `eaten` comes from the diary rows (updated optimistically); the burn side from
 * fit_day_summary. Without a burn summary, bonus is 0.
 */
export function diaryBalance(
  fit: FitProfile | null | undefined,
  eatenKcal: number,
  burn: { workout_kcal?: number | null; steps?: number | null } | null | undefined,
  latestWeightKg: number | null | undefined,
  date: string,
): DiaryBalance {
  const target = targetsFromProfile(fit).kcal;
  const weight = effectiveWeight(latestWeightKg, fit?.start_weight_kg);
  const model = activityModel(fit, weight, date);
  return energyBalance(
    { kcal_in: Number(eatenKcal) || 0, workout_kcal: Number(burn?.workout_kcal) || 0, steps: Number(burn?.steps) || 0 },
    target,
    weight,
    model,
  );
}
