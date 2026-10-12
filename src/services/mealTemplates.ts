// "Bữa mẫu" (public.fit_meal_templates): a named set of items re-logged with one tap.
// Contract: docs/PLAN.md §2, §4. Feature code must use these functions, never the table.
import { db } from '@/lib/supabase';
import type { MealEntry, MealTemplate, MealTemplateItem, MealTemplatePatch, MealType, NewMealEntry } from '@/types/db';
import { MEAL_TYPES } from '@/types/db';
import { invalid, run, runRead, vDate } from './errors';
import { compareByUse, markCustomFoodUsed } from './foods';
import { addMealEntries } from './meals';

export const TEMPLATE_COLS = 'id, user_id, name, meal, items, total_kcal, use_count, last_used_at, created_at, updated_at';
export const MAX_TEMPLATE_ITEMS = 30;

const fin = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r1 = (v: unknown) => Math.round(Math.max(0, fin(v)) * 10) / 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validated, rounded copy of the items (throws a Vietnamese FitError). */
export function cleanTemplateItems(items: ReadonlyArray<Partial<MealTemplateItem>> | null | undefined): MealTemplateItem[] {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) invalid('Bữa mẫu cần ít nhất 1 món.');
  if (list.length > MAX_TEMPLATE_ITEMS) invalid(`Bữa mẫu tối đa ${MAX_TEMPLATE_ITEMS} món.`);
  return list.map((it) => {
    const name = String(it?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
    if (!name) invalid('Món trong bữa mẫu cần có tên.');
    const q = fin(it.quantity);
    const id = typeof it.custom_food_id === 'string' && UUID_RE.test(it.custom_food_id) ? it.custom_food_id : null;
    return {
      name,
      quantity: q > 0 ? Math.min(10000, Math.round(q * 100) / 100) : 1,
      unit: String(it.unit ?? '').trim().slice(0, 20) || 'phần',
      grams: r1(it.grams),
      kcal: r1(it.kcal),
      protein_g: r1(it.protein_g),
      carbs_g: r1(it.carbs_g),
      fat_g: r1(it.fat_g),
      fiber_g: r1(it.fiber_g),
      custom_food_id: id,
    };
  });
}

/** Sum of the items' kcal (1 decimal). */
export function templateTotalKcal(items: ReadonlyArray<Pick<MealTemplateItem, 'kcal'>>): number {
  return Math.round(items.reduce((s, it) => s + Math.max(0, fin(it.kcal)), 0) * 10) / 10;
}

function cleanName(name: unknown): string {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!n) invalid('Hãy đặt tên cho bữa mẫu.');
  return n;
}

function cleanMeal(meal: unknown): MealType | null {
  if (meal == null || meal === '') return null;
  if (!MEAL_TYPES.includes(meal as MealType)) invalid('Bữa ăn không hợp lệ.');
  return meal as MealType;
}

/** PostgREST returns numeric as number already; normalise defensively (items may be legacy / hand-edited). */
function fromRow(r: MealTemplate): MealTemplate {
  return {
    ...r,
    items: Array.isArray(r.items) ? r.items : [],
    total_kcal: fin(r.total_kcal),
    use_count: fin(r.use_count),
  };
}

/** Templates, most recently / frequently used first. */
export async function listMealTemplates(): Promise<MealTemplate[]> {
  const rows = await runRead(
    (signal) =>
      db()
        .from('fit_meal_templates')
        .select(TEMPLATE_COLS)
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .order('use_count', { ascending: false })
        .order('name', { ascending: true })
        .abortSignal(signal)
        .returns<MealTemplate[]>(),
    'Không tải được bữa mẫu.',
    { retries: 1 },
  );
  return (rows ?? []).map(fromRow).sort(compareByUse);
}

export async function createMealTemplate(
  name: string,
  meal: MealType | null,
  items: ReadonlyArray<Partial<MealTemplateItem>>,
): Promise<MealTemplate> {
  const clean = cleanTemplateItems(items);
  const row = await run(
    db()
      .from('fit_meal_templates')
      .insert({ name: cleanName(name), meal: cleanMeal(meal), items: clean, total_kcal: templateTotalKcal(clean) })
      .select(TEMPLATE_COLS)
      .single<MealTemplate>(),
    'Không lưu được bữa mẫu.',
  );
  return fromRow(row);
}

export async function updateMealTemplate(id: string, patch: MealTemplatePatch): Promise<MealTemplate> {
  const body: Record<string, unknown> = {};
  if ('name' in patch) body.name = cleanName(patch.name);
  if ('meal' in patch) body.meal = cleanMeal(patch.meal);
  if ('items' in patch) {
    const clean = cleanTemplateItems(patch.items);
    body.items = clean;
    body.total_kcal = templateTotalKcal(clean);
  }
  const row = await run(
    db().from('fit_meal_templates').update(body).eq('id', id).select(TEMPLATE_COLS).single<MealTemplate>(),
    'Không cập nhật được bữa mẫu.',
  );
  return fromRow(row);
}

export async function deleteMealTemplate(id: string): Promise<void> {
  await run(db().from('fit_meal_templates').delete().eq('id', id), 'Không xóa được bữa mẫu.');
}

/** Template items from logged entries ("Lưu bữa này làm bữa mẫu"). Pure. */
export function templateItemsFromEntries(
  entries: ReadonlyArray<Pick<MealEntry, 'name' | 'quantity' | 'unit' | 'grams' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'custom_food_id'>>,
): MealTemplateItem[] {
  return cleanTemplateItems(
    entries.slice(0, MAX_TEMPLATE_ITEMS).map((e) => ({
      name: e.name,
      quantity: e.quantity,
      unit: e.unit,
      grams: e.grams,
      kcal: e.kcal,
      protein_g: e.protein_g,
      carbs_g: e.carbs_g,
      fat_g: e.fat_g,
      fiber_g: e.fiber_g,
      custom_food_id: e.custom_food_id ?? null,
    })),
  );
}

/**
 * The meal entries a template produces. `foods` = still-existing linked saved foods
 * (id → photo_path): links to deleted foods are dropped (source 'manual'), live ones
 * become source 'custom' and share the food's photo. Pure.
 */
export function templateEntries(
  template: Pick<MealTemplate, 'items'>,
  date: string,
  meal: MealType,
  foods: ReadonlyMap<string, string | null> = new Map(),
): NewMealEntry[] {
  return cleanTemplateItems(template.items).map((it) => {
    const linked = it.custom_food_id && foods.has(it.custom_food_id) ? it.custom_food_id : null;
    return {
      eaten_on: date,
      meal,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      grams: it.grams,
      kcal: it.kcal,
      protein_g: it.protein_g,
      carbs_g: it.carbs_g,
      fat_g: it.fat_g,
      fiber_g: it.fiber_g,
      source: linked ? 'custom' : 'manual',
      custom_food_id: linked,
      photo_path: linked ? (foods.get(linked) ?? null) : null,
    };
  });
}

/**
 * Logs every item of the template on `date` at `meal` (default: the template's meal).
 * Then, best-effort, bumps the template's and the linked foods' usage (their default_meal
 * is not changed). Returns the new
 * entries (for an "Hoàn tác" toast: delete them with deleteMeal).
 */
export async function logMealTemplate(template: MealTemplate, date: string, meal?: MealType | null): Promise<MealEntry[]> {
  vDate(date, 'Ngày ăn không hợp lệ.');
  const m = cleanMeal(meal ?? template.meal);
  if (!m) invalid('Hãy chọn bữa ăn.');
  const ids = [...new Set(template.items.map((i) => i?.custom_food_id).filter((x): x is string => typeof x === 'string' && UUID_RE.test(x)))];
  const foods = new Map<string, string | null>();
  if (ids.length) {
    const rows = await runRead(
      (signal) => db().from('fit_custom_foods').select('id, photo_path').in('id', ids).abortSignal(signal).returns<Array<{ id: string; photo_path: string | null }>>(),
      'Không tải được món đã lưu.',
    );
    for (const r of rows ?? []) foods.set(r.id, r.photo_path);
  }
  const created = await addMealEntries(templateEntries(template, date, m, foods));
  await Promise.all([
    // The template sets the meal here, so the foods' own default meal is left as is.
    markCustomFoodUsed([...foods.keys()], null),
    Promise.resolve(db().rpc('fit_mark_meal_template_used', { p_id: template.id })).catch(() => undefined),
  ]);
  return created;
}

/** What unmarkMealTemplateUsed needs: the template as it was BEFORE the logMealTemplate bump. */
export type MealTemplateUsage = Pick<MealTemplate, 'id' | 'last_used_at'>;

/**
 * Undo of ONE logMealTemplate usage bump ("Hoàn tác" right after logging a "Bữa mẫu"):
 * pass the template as it was before the log. use_count −1 (never below 0), last_used_at
 * back to the snapshot (never moved forward; null when the count returns to 0).
 * BEST-EFFORT like the bump itself: never throws, returns the updated template or null.
 * The linked foods are restored separately with unmarkCustomFoodUsed.
 */
export async function unmarkMealTemplateUsed(before: MealTemplateUsage | null | undefined): Promise<MealTemplate | null> {
  if (!before || typeof before.id !== 'string' || !before.id) return null;
  try {
    const { data, error } = await db().rpc('fit_unmark_meal_template_used', {
      p_id: before.id,
      p_prev_last_used_at: before.last_used_at ?? null,
    });
    if (error) return null;
    const rows = (Array.isArray(data) ? data : data ? [data] : []) as MealTemplate[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
