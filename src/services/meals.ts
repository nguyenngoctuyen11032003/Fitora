import { db } from '@/lib/supabase';
import type { MealEntry, MealEntryPatch, NewMealEntry } from '@/types/db';
import { invalid, run } from './errors';
import { removeImages, signedUrl, uploadImage } from './storage';

export const MEAL_COLS =
  'id, user_id, eaten_on, meal, name, quantity, unit, grams, kcal, protein_g, carbs_g, fat_g, fiber_g, source, custom_food_id, photo_path, ai_meta, created_at, updated_at';

const nonNeg = (v: unknown) => Math.max(0, Number(v) || 0);
const r1 = (v: unknown) => Math.round(nonNeg(v) * 10) / 10;

function clean<T extends Partial<NewMealEntry>>(e: T): T {
  const out: Record<string, unknown> = { ...e };
  if ('name' in e) {
    const name = String(e.name ?? '').trim().slice(0, 120);
    if (!name) invalid('Hãy nhập tên món.');
    out.name = name;
  }
  if ('unit' in e) out.unit = String(e.unit ?? '').trim().slice(0, 20) || 'phần';
  if ('quantity' in e && !(Number(e.quantity) > 0)) invalid('Số lượng phải lớn hơn 0.');
  for (const k of ['grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const) {
    if (k in e) out[k] = r1(e[k]);
  }
  return out as T;
}

/** Entries of one day, ordered by meal then creation time. */
export async function listMeals(date: string): Promise<MealEntry[]> {
  const rows = await run(
    db().from('fit_meal_entries').select(MEAL_COLS).eq('eaten_on', date).order('created_at', { ascending: true }).returns<MealEntry[]>(),
    'Không tải được nhật ký ăn.',
  );
  return rows ?? [];
}

/** Entries in a date range (inclusive). */
export async function listMealsRange(from: string, to: string): Promise<MealEntry[]> {
  const rows = await run(
    db()
      .from('fit_meal_entries')
      .select(MEAL_COLS)
      .gte('eaten_on', from)
      .lte('eaten_on', to)
      .order('eaten_on', { ascending: true })
      .order('created_at', { ascending: true })
      .returns<MealEntry[]>(),
    'Không tải được nhật ký ăn.',
  );
  return rows ?? [];
}

export async function addMealEntries(entries: NewMealEntry[]): Promise<MealEntry[]> {
  if (!entries.length) return [];
  const rows = await run(
    db().from('fit_meal_entries').insert(entries.map((e) => clean(e))).select(MEAL_COLS).returns<MealEntry[]>(),
    'Không lưu được món ăn.',
  );
  return rows ?? [];
}

export async function updateMeal(id: string, patch: MealEntryPatch): Promise<MealEntry> {
  return run(
    db().from('fit_meal_entries').update(clean(patch)).eq('id', id).select(MEAL_COLS).single<MealEntry>(),
    'Không cập nhật được món ăn.',
  );
}

/** Deletes the entry; its photo is removed too unless another entry still uses it (multi-dish scans share one photo). */
export async function deleteMeal(id: string): Promise<void> {
  const row = await run(
    db().from('fit_meal_entries').delete().eq('id', id).select('photo_path').maybeSingle<{ photo_path: string | null }>(),
    'Không xóa được món ăn.',
  );
  const path = row?.photo_path;
  if (path) {
    const { count } = await db().from('fit_meal_entries').select('id', { count: 'exact', head: true }).eq('photo_path', path);
    if (!count) await removeImages([path]).catch(() => {});
  }
}

/** Upload a (compressed) meal photo → storage path '<uid>/meals/<uuid>.webp'. */
export function uploadMealPhoto(blob: Blob): Promise<string> {
  return uploadImage(blob, 'meals');
}

/** 1-hour signed URL for a meal photo. */
export function mealPhotoUrl(path: string): Promise<string> {
  return signedUrl(path);
}
