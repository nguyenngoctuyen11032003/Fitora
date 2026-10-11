// "Món của tôi / món đã lưu" (public.fit_custom_foods). Contract: docs/PLAN.md §2, §4.
// A dish confirmed after an AI scan is saved here (source 'ai') so the user can re-log
// it with one tap next time instead of scanning again. Feature code must go through
// these functions, never query fit_custom_foods directly.
import { db } from '@/lib/supabase';
import type {
  CustomFood,
  CustomFoodPatch,
  CustomFoodSource,
  MealEntry,
  MealType,
  NewCustomFood,
  NewMealEntry,
} from '@/types/db';
import { MEAL_TYPES } from '@/types/db';
import { invalid, run, runRead, vDate } from './errors';
import { addMealEntries, schedulePhotoCleanup, updateMeal } from './meals';

export const FOOD_COLS =
  'id, user_id, name, brand, serving_label, serving_grams, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, ' +
  'source, photo_path, use_count, last_used_at, default_meal, created_at, updated_at';

const SOURCES: CustomFoodSource[] = ['manual', 'ai', 'meal'];

const r1 = (v: number) => Math.round(v * 10) / 10;
const fin = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const nonNeg = (v: unknown) => Math.max(0, fin(v));

/**
 * Key used to recognise "the same dish": lower case, no Vietnamese diacritics (đ → d),
 * punctuation and repeated spaces collapsed. "Phở Bò " === "pho bo" === "PHỞ-BÒ".
 */
export function normalizeFoodName(name: string | null | undefined): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const collator = typeof Intl !== 'undefined' ? new Intl.Collator('vi', { sensitivity: 'base' }) : null;
const byName = (a: string, b: string) => (collator ? collator.compare(a, b) : a.localeCompare(b));

/**
 * "Recently / frequently used first": last_used_at desc (never used last), then
 * use_count desc, then name. Shared by saved foods and meal templates.
 */
export function compareByUse<T extends { last_used_at: string | null; use_count: number; name: string }>(a: T, b: T): number {
  const ta = a.last_used_at ? Date.parse(a.last_used_at) : NaN;
  const tb = b.last_used_at ? Date.parse(b.last_used_at) : NaN;
  const ha = Number.isFinite(ta);
  const hb = Number.isFinite(tb);
  if (ha !== hb) return ha ? -1 : 1;
  if (ha && hb && ta !== tb) return tb - ta;
  if (a.use_count !== b.use_count) return (b.use_count ?? 0) - (a.use_count ?? 0);
  return byName(a.name, b.name);
}

function cleanPhoto(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && s.length <= 300 ? s : null;
}

function clean<T extends CustomFoodPatch>(f: T): T {
  const out: Record<string, unknown> = { ...f };
  // Usage counters are only ever written by the fit_mark_food_used RPC.
  delete out.use_count;
  delete out.last_used_at;
  if ('name' in f) {
    const name = String(f.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!name) invalid('Hãy nhập tên món.');
    out.name = name;
  }
  if ('brand' in f) out.brand = String(f.brand ?? '').trim().slice(0, 80) || null;
  if ('serving_label' in f) out.serving_label = String(f.serving_label ?? '').trim().slice(0, 40) || '1 phần';
  if ('serving_grams' in f) {
    const g = Number(f.serving_grams);
    if (!(g > 0) || !Number.isFinite(g)) invalid('Khối lượng một phần phải lớn hơn 0.');
    if (g > 10000) invalid('Khối lượng một phần tối đa 10 kg.');
    out.serving_grams = Math.round(g * 100) / 100;
  }
  for (const k of ['kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g', 'fiber_100g'] as const) {
    if (k in f) {
      const v = Number(f[k]);
      if (!(v >= 0) || !Number.isFinite(v)) invalid('Giá trị dinh dưỡng không được âm.');
      const max = k === 'kcal_100g' ? 1000 : 100;
      if (v > max) invalid(k === 'kcal_100g' ? 'Năng lượng tối đa 1000 kcal / 100 g.' : 'Mỗi chất tối đa 100 g / 100 g.');
      out[k] = r1(v);
    }
  }
  if ('source' in f) out.source = SOURCES.includes(f.source as CustomFoodSource) ? f.source : 'manual';
  if ('photo_path' in f) out.photo_path = cleanPhoto(f.photo_path);
  if ('default_meal' in f) {
    out.default_meal = f.default_meal == null ? null : f.default_meal;
    if (out.default_meal !== null && !MEAL_TYPES.includes(out.default_meal as MealType)) invalid('Bữa ăn không hợp lệ.');
  }
  return out as T;
}

/** Saved foods, most recently / frequently used first (see compareByUse). */
export async function listCustomFoods(): Promise<CustomFood[]> {
  const rows = await runRead(
    (signal) =>
      db()
        .from('fit_custom_foods')
        .select(FOOD_COLS)
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .order('use_count', { ascending: false })
        .order('name', { ascending: true })
        .abortSignal(signal)
        .returns<CustomFood[]>(),
    'Không tải được danh sách món đã lưu.',
    { retries: 1 },
  );
  return [...(rows ?? [])].sort(compareByUse);
}

export async function createCustomFood(food: NewCustomFood): Promise<CustomFood> {
  return run(db().from('fit_custom_foods').insert(clean(food)).select(FOOD_COLS).single<CustomFood>(), 'Không lưu được món.');
}

export async function updateCustomFood(id: string, patch: CustomFoodPatch): Promise<CustomFood> {
  return run(
    db().from('fit_custom_foods').update(clean(patch)).eq('id', id).select(FOOD_COLS).single<CustomFood>(),
    'Không cập nhật được món.',
  );
}

/** Deletes a saved food. Logged entries keep their values (custom_food_id → null); its photo is cleaned up if unused. */
export async function deleteCustomFood(id: string): Promise<void> {
  const row = await run(
    db().from('fit_custom_foods').delete().eq('id', id).select('photo_path').maybeSingle<{ photo_path: string | null }>(),
    'Không xóa được món.',
  );
  schedulePhotoCleanup(row?.photo_path);
}

/**
 * +1 use and last_used_at = now() for one or more saved foods (atomic RPC). With `meal`
 * that meal becomes the food's default_meal. BEST-EFFORT: never throws (usage stats must
 * not fail a log that already succeeded); returns the updated rows, or [] on failure.
 */
export async function markCustomFoodUsed(ids: string | string[], meal?: MealType | null): Promise<CustomFood[]> {
  const list = [...new Set((Array.isArray(ids) ? ids : [ids]).filter((x): x is string => typeof x === 'string' && !!x))];
  if (!list.length) return [];
  try {
    const out: CustomFood[] = [];
    for (let i = 0; i < list.length; i += 100) {
      const { data, error } = await db().rpc('fit_mark_food_used', {
        p_ids: list.slice(i, i + 100),
        p_meal: meal && MEAL_TYPES.includes(meal) ? meal : null,
      });
      if (error) return out;
      out.push(...((data as CustomFood[] | null) ?? []));
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Saved food whose name matches `name` ignoring case / diacritics / punctuation, or null.
 * Pass `foods` (e.g. an already loaded list) to avoid a request. With duplicates the most
 * used one wins.
 */
export async function findCustomFoodByName(name: string, foods?: CustomFood[]): Promise<CustomFood | null> {
  const key = normalizeFoodName(name);
  if (!key) return null;
  const list = foods ? [...foods].sort(compareByUse) : await listCustomFoods();
  return list.find((f) => normalizeFoodName(f.name) === key) ?? null;
}

/* ------------------------------------------------------------------ */
/* Conversions                                                         */
/* ------------------------------------------------------------------ */

/** A dish / entry described by TOTAL values (AiDish, MealEntry, MealTemplateItem…). */
export interface FoodTotals {
  name: string;
  quantity?: number | null;
  unit?: string | null;
  grams?: number | null;
  kcal?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  fiber_g?: number | null;
}

const MASS_UNITS = /^(g|gr|gram|grams|gam|kg|ml|l|lit|lít)$/i;

/**
 * Converts totals ("1,5 bát, 750 g, 600 kcal") to the saved-food shape: ONE serving of
 * the unit ("1 bát" = 500 g) plus values per 100 g. Grams-like units become one "phần"
 * of the whole amount. Unknown or implausibly small weights are raised to the smallest
 * weight that keeps the per-100 g values within the DB limits, so re-logging one serving
 * gives back the same kcal / macros.
 */
export function per100FromTotals(t: FoodTotals): Pick<
  CustomFood,
  'serving_label' | 'serving_grams' | 'kcal_100g' | 'protein_100g' | 'carbs_100g' | 'fat_100g' | 'fiber_100g'
> {
  const qRaw = fin(t.quantity);
  const unit = String(t.unit ?? '').trim().replace(/\s+/g, ' ');
  const perUnit = qRaw > 0 && !!unit && !MASS_UNITS.test(unit);
  const div = perUnit ? qRaw : 1;
  const kcal = nonNeg(t.kcal) / div;
  const p = nonNeg(t.protein_g) / div;
  const c = nonNeg(t.carbs_g) / div;
  const f = nonNeg(t.fat_g) / div;
  const fi = nonNeg(t.fiber_g) / div;
  let g = nonNeg(t.grams) / div;
  if (!(g > 0)) g = 100; // no weight: one serving is a pseudo 100 g portion
  g = Math.max(g, kcal / 10, p, c, f, fi); // ≤ 1000 kcal and ≤ 100 g of each nutrient per 100 g
  g = Math.min(10000, Math.max(0.1, Math.ceil(g * 10) / 10));
  const per = (v: number, max: number) => Math.min(max, r1((v / g) * 100));
  return {
    serving_label: (perUnit ? `1 ${unit}` : '1 phần').slice(0, 40),
    serving_grams: g,
    kcal_100g: per(kcal, 1000),
    protein_100g: per(p, 100),
    carbs_100g: per(c, 100),
    fat_100g: per(f, 100),
    fiber_100g: per(fi, 100),
  };
}

/** "1 bát" → "bát"; "2 lát" stays as is; max 20 chars (fit_meal_entries.unit). */
export function servingUnitOf(label: string | null | undefined): string {
  const t = String(label ?? '').trim().replace(/^1\s+/, '');
  return (t || 'phần').slice(0, 20);
}

/**
 * The meal entry for `servings` servings of a saved food (source 'custom', linked by
 * custom_food_id, sharing the food's photo). Pure — no request.
 */
export function customFoodEntry(food: CustomFood, date: string, meal: MealType, servings = 1): NewMealEntry {
  const q = Number(servings) > 0 && Number.isFinite(Number(servings)) ? Number(servings) : 1;
  const grams = food.serving_grams * q;
  const v = (per100: number) => r1((per100 * grams) / 100);
  return {
    eaten_on: date,
    meal,
    name: food.name,
    quantity: Math.round(q * 100) / 100,
    unit: servingUnitOf(food.serving_label),
    grams: r1(grams),
    kcal: v(food.kcal_100g),
    protein_g: v(food.protein_100g),
    carbs_g: v(food.carbs_100g),
    fat_g: v(food.fat_100g),
    fiber_g: v(food.fiber_100g),
    source: 'custom',
    custom_food_id: food.id,
    photo_path: food.photo_path ?? null,
  };
}

/**
 * One-tap re-log: inserts the entry, then (best-effort) bumps the food's usage and
 * remembers `meal` as its default meal. Returns the new entry.
 */
export async function logCustomFood(food: CustomFood, date: string, meal: MealType, servings = 1): Promise<MealEntry> {
  vDate(date, 'Ngày ăn không hợp lệ.');
  if (!MEAL_TYPES.includes(meal)) invalid('Hãy chọn bữa ăn.');
  const [row] = await addMealEntries([customFoodEntry(food, date, meal, servings)]);
  await markCustomFoodUsed(food.id, meal);
  return row;
}

/* ------------------------------------------------------------------ */
/* Remember dishes (AI scan, diary entries)                            */
/* ------------------------------------------------------------------ */

export interface SaveFoodsOptions {
  /** Photo of the scan ('<uid>/meals/…'); kept as the food's thumbnail if it has none yet. */
  photoPath?: string | null;
  /** Meal the dishes were logged at → default_meal. */
  meal?: MealType | null;
  /** Count this save as a use (default true: the dishes were just logged). */
  markUsed?: boolean;
}

async function upsertFoodsByName(items: FoodTotals[], source: CustomFoodSource, opts: SaveFoodsOptions): Promise<CustomFood[]> {
  if (!items.length) return [];
  const names = items.map((d) => String(d?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 120));
  if (names.some((n) => !n)) invalid('Hãy nhập tên món.');
  const meal = opts.meal && MEAL_TYPES.includes(opts.meal) ? opts.meal : null;
  const photo = cleanPhoto(opts.photoPath);

  const existing = await listCustomFoods();
  const byKey = new Map<string, CustomFood>();
  for (const f of existing) {
    const k = normalizeFoodName(f.name);
    if (!byKey.has(k)) byKey.set(k, f); // list is most-used first
  }

  // Last occurrence of a name in the batch wins (two "Phở bò" in one scan → one saved food).
  const plan = new Map<string, { name: string; values: ReturnType<typeof per100FromTotals> }>();
  names.forEach((name, i) => plan.set(normalizeFoodName(name), { name, values: per100FromTotals(items[i]) }));

  const saved = new Map<string, CustomFood>();
  const inserts: Array<{ key: string; row: NewCustomFood }> = [];
  const updates: Array<Promise<void>> = [];
  for (const [key, { name, values }] of plan) {
    const cur = byKey.get(key);
    if (cur) {
      const patch: CustomFoodPatch = { ...values };
      if (meal) patch.default_meal = meal;
      if (!cur.photo_path && photo) patch.photo_path = photo;
      updates.push(updateCustomFood(cur.id, patch).then((row) => void saved.set(key, row)));
    } else {
      inserts.push({ key, row: { name, ...values, source, photo_path: photo, default_meal: meal } });
    }
  }
  if (inserts.length) {
    const rows = await run(
      db().from('fit_custom_foods').insert(inserts.map((x) => clean(x.row))).select(FOOD_COLS).returns<CustomFood[]>(),
      'Không lưu được món.',
    );
    (rows ?? []).forEach((row) => saved.set(normalizeFoodName(row.name), row));
  }
  await Promise.all(updates);

  if (opts.markUsed !== false && saved.size) {
    const bumped = await markCustomFoodUsed([...saved.values()].map((f) => f.id), meal);
    for (const row of bumped) saved.set(normalizeFoodName(row.name), row);
  }
  return names.map((n) => {
    const row = saved.get(normalizeFoodName(n));
    if (!row) throw invalid('Không lưu được món.');
    return row;
  });
}

/**
 * Remembers the dishes of a confirmed AI scan as saved foods (source 'ai'), matched by
 * normalised name: a dish saved before is UPDATED with the new values (photo kept if it
 * already has one), a new one is inserted. Counts as one use each (do not call
 * markCustomFoodUsed again). Returns the saved foods in the order of `dishes`, so the
 * caller can set custom_food_id on the entries it logs.
 */
export function saveScannedDishes(dishes: FoodTotals[], opts: SaveFoodsOptions = {}): Promise<CustomFood[]> {
  return upsertFoodsByName(dishes, 'ai', opts);
}

/**
 * "Lưu món này": remembers a logged entry as a saved food (source 'meal', same name-based
 * upsert) and links the entry to it. Returns the saved food.
 */
export async function saveEntryAsFood(entry: MealEntry): Promise<CustomFood> {
  const [food] = await upsertFoodsByName([entry], 'meal', { photoPath: entry.photo_path, meal: entry.meal });
  if (entry.custom_food_id !== food.id) {
    await updateMeal(entry.id, { custom_food_id: food.id }).catch(() => undefined); // the food is saved; the link is a nicety
  }
  return food;
}
