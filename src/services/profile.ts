import { db } from '@/lib/supabase';
import type { FitProfile, FitProfilePatch, SharedProfile } from '@/types/db';
import { run } from './errors';
import { currentUserId } from './session';

const SHARED_COLS = 'id, display_name, avatar_url, timezone, locale';
const FIT_COLS =
  'user_id, sex, birth_date, height_cm, activity_level, goal, goal_pace, start_weight_kg, target_weight_kg, calorie_target, protein_g, carbs_g, fat_g, macro_custom, water_target_ml, step_target, onboarded_at, created_at, updated_at';

/** public.profiles row of Note_mytasks (display_name, avatar_url). Null if missing. */
export async function getSharedProfile(): Promise<SharedProfile | null> {
  const uid = await currentUserId();
  return run(
    db().from('profiles').select(SHARED_COLS).eq('id', uid).maybeSingle<SharedProfile>(),
    'Không tải được hồ sơ tài khoản.',
  );
}

/** Update the shared display name (also visible in Note_mytasks). */
export async function updateDisplayName(displayName: string): Promise<SharedProfile> {
  const uid = await currentUserId();
  const name = displayName.trim().slice(0, 80);
  return run(
    db().from('profiles').update({ display_name: name || null }).eq('id', uid).select(SHARED_COLS).single<SharedProfile>(),
    'Không lưu được tên hiển thị.',
  );
}

/** fit_profiles row, or null before onboarding. */
export async function getFitProfile(): Promise<FitProfile | null> {
  const uid = await currentUserId();
  return run(db().from('fit_profiles').select(FIT_COLS).eq('user_id', uid).maybeSingle<FitProfile>(), 'Không tải được hồ sơ Fitora.');
}

/**
 * Insert or update the caller's fit_profiles row. On first insert the patch must
 * contain every NOT NULL column (sex, birth_date, height_cm, activity_level, goal,
 * start_weight_kg, calorie_target, protein_g, carbs_g, fat_g).
 */
export async function upsertFitProfile(patch: FitProfilePatch): Promise<FitProfile> {
  const uid = await currentUserId();
  const msg = 'Không lưu được hồ sơ Fitora.';
  // UPDATE first: a partial patch through INSERT … ON CONFLICT would trip NOT NULL
  // checks on the would-be inserted row even when the row already exists.
  const updated = await run(
    db().from('fit_profiles').update(patch).eq('user_id', uid).select(FIT_COLS).maybeSingle<FitProfile>(),
    msg,
  );
  if (updated) return updated;
  return run(db().from('fit_profiles').insert({ ...patch, user_id: uid }).select(FIT_COLS).single<FitProfile>(), msg);
}
