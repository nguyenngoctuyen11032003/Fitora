import { db } from '@/lib/supabase';
import type { FitProfile, FitProfilePatch, SharedProfile } from '@/types/db';
import { FitError, run, runRead, toFitError, vDate } from './errors';
import { currentUserId } from './session';

const SHARED_COLS = 'id, display_name, avatar_url, timezone, locale';
const FIT_COLS =
  'user_id, sex, birth_date, height_cm, activity_level, goal, goal_pace, start_weight_kg, target_weight_kg, calorie_target, protein_g, carbs_g, fat_g, macro_custom, water_target_ml, step_target, onboarded_at, created_at, updated_at';

/** public.profiles row of Note_mytasks (display_name, avatar_url). Null if missing. */
export async function getSharedProfile(): Promise<SharedProfile | null> {
  const uid = await currentUserId();
  return runRead(
    (signal) => db().from('profiles').select(SHARED_COLS).eq('id', uid).abortSignal(signal).maybeSingle<SharedProfile>(),
    'Không tải được hồ sơ tài khoản.',
  );
}

/** Update the shared display name (also visible in Note_mytasks). */
export async function updateDisplayName(displayName: string): Promise<SharedProfile> {
  const uid = await currentUserId();
  const name = String(displayName ?? '').trim().slice(0, 80);
  return run(
    db().from('profiles').update({ display_name: name || null }).eq('id', uid).select(SHARED_COLS).single<SharedProfile>(),
    'Không lưu được tên hiển thị.',
  );
}

/** fit_profiles row, or null before onboarding. */
export async function getFitProfile(): Promise<FitProfile | null> {
  const uid = await currentUserId();
  return runRead(
    (signal) => db().from('fit_profiles').select(FIT_COLS).eq('user_id', uid).abortSignal(signal).maybeSingle<FitProfile>(),
    'Không tải được hồ sơ Fitora.',
  );
}

/** Drops keys the caller must not write (user_id, timestamps) and checks the birth date format. */
function cleanPatch(patch: FitProfilePatch): FitProfilePatch {
  const out: Record<string, unknown> = { ...patch };
  for (const k of ['user_id', 'created_at', 'updated_at']) delete out[k];
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  if (out.birth_date != null) vDate(out.birth_date, 'Ngày sinh không hợp lệ.');
  return out as FitProfilePatch;
}

/**
 * Insert or update the caller's fit_profiles row. On first insert the patch must
 * contain every NOT NULL column (sex, birth_date, height_cm, activity_level, goal,
 * start_weight_kg, calorie_target, protein_g, carbs_g, fat_g).
 */
export async function upsertFitProfile(patch: FitProfilePatch): Promise<FitProfile> {
  const uid = await currentUserId();
  const msg = 'Không lưu được hồ sơ Fitora.';
  const row = cleanPatch(patch);
  // UPDATE first: a partial patch through INSERT … ON CONFLICT would trip NOT NULL
  // checks on the would-be inserted row even when the row already exists.
  const update = () => run(db().from('fit_profiles').update(row).eq('user_id', uid).select(FIT_COLS).maybeSingle<FitProfile>(), msg);
  const updated = await update();
  if (updated) return updated;
  try {
    return await run(db().from('fit_profiles').insert({ ...row, user_id: uid }).select(FIT_COLS).single<FitProfile>(), msg);
  } catch (e) {
    // Another tab / a double tap created the row between our UPDATE and INSERT: update it instead.
    if ((e instanceof FitError ? e : toFitError(e)).code !== 'duplicate') throw e;
    const again = await update();
    if (again) return again;
    throw e;
  }
}
