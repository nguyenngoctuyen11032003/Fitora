import { db } from '@/lib/supabase';
import type { MealEntry, MealEntryPatch, NewMealEntry } from '@/types/db';
import { MEAL_TYPES } from '@/types/db';
import { invalid, run, runRead, vDate } from './errors';
import { removeImages, signedUrl, uploadImage } from './storage';

export const MEAL_COLS =
  'id, user_id, eaten_on, meal, name, quantity, unit, grams, kcal, protein_g, carbs_g, fat_g, fiber_g, source, custom_food_id, photo_path, ai_meta, created_at, updated_at';

const SOURCES = ['ai', 'search', 'custom', 'manual'];

/** Finite, ≥ 0 (NaN / Infinity / negative → 0). */
const nonNeg = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};
const r1 = (v: unknown) => Math.round(nonNeg(v) * 10) / 10;

function clean<T extends Partial<NewMealEntry>>(e: T): T {
  const out: Record<string, unknown> = { ...e };
  if ('name' in e) {
    const name = String(e.name ?? '').trim().slice(0, 120);
    if (!name) invalid('Hãy nhập tên món.');
    out.name = name;
  }
  if ('unit' in e) out.unit = String(e.unit ?? '').trim().slice(0, 20) || 'phần';
  if ('quantity' in e) {
    const q = Number(e.quantity);
    if (!(q > 0) || !Number.isFinite(q)) invalid('Số lượng phải lớn hơn 0.');
  }
  if ('eaten_on' in e) vDate(e.eaten_on, 'Ngày ăn không hợp lệ.');
  if ('meal' in e && !(MEAL_TYPES as string[]).includes(String(e.meal))) invalid('Bữa ăn không hợp lệ.');
  if ('source' in e && e.source != null && !SOURCES.includes(String(e.source))) out.source = 'manual';
  for (const k of ['grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const) {
    if (k in e) out[k] = r1(e[k]);
  }
  return out as T;
}

/** Entries of one day, ordered by meal then creation time. */
export async function listMeals(date: string): Promise<MealEntry[]> {
  vDate(date);
  const rows = await runRead(
    (signal) =>
      db().from('fit_meal_entries').select(MEAL_COLS).eq('eaten_on', date).order('created_at', { ascending: true }).abortSignal(signal).returns<MealEntry[]>(),
    'Không tải được nhật ký ăn.',
  );
  return rows ?? [];
}

/** Entries in a date range (inclusive). */
export async function listMealsRange(from: string, to: string): Promise<MealEntry[]> {
  vDate(from);
  vDate(to);
  const rows = await runRead(
    (signal) =>
      db()
        .from('fit_meal_entries')
        .select(MEAL_COLS)
        .gte('eaten_on', from)
        .lte('eaten_on', to)
        .order('eaten_on', { ascending: true })
        .order('created_at', { ascending: true })
        .abortSignal(signal)
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

/**
 * How long a deleted entry's photo is kept before cleanup. Must outlast the diary's
 * "Hoàn tác" toast: undo re-inserts the row with the same photo_path, so the file has
 * to still exist then.
 */
export const PHOTO_CLEANUP_DELAY_MS = 15_000;

/** True when some entry still points at `path`. A failed check counts as "in use": an orphan file is harmless, a lost photo is not. */
async function photoInUse(path: string): Promise<boolean> {
  const { count, error } = await db().from('fit_meal_entries').select('id', { count: 'exact', head: true }).eq('photo_path', path);
  return !!error || !!count;
}

/**
 * Deletes the entry. Its photo is removed only after PHOTO_CLEANUP_DELAY_MS and only if
 * no entry uses it by then (multi-dish scans share one photo; an undo restores the row).
 * If the app closes before then the file stays as a harmless orphan.
 */
export async function deleteMeal(id: string): Promise<void> {
  const row = await run(
    db().from('fit_meal_entries').delete().eq('id', id).select('photo_path').maybeSingle<{ photo_path: string | null }>(),
    'Không xóa được món ăn.',
  );
  const path = row?.photo_path;
  if (path) {
    setTimeout(() => {
      photoInUse(path)
        .then((used) => (used ? undefined : removeImages([path])))
        .catch(() => {});
    }, PHOTO_CLEANUP_DELAY_MS);
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
