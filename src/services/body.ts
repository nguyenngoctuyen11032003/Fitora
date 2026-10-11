import { db } from '@/lib/supabase';
import type { BodyMeasurement, MeasurementInput, ProgressPhoto, ProgressPhotoMeta } from '@/types/db';
import { invalid, run, runRead, vDate } from './errors';
import { removeImages, signedUrl, uploadImage } from './storage';

const M_COLS = 'id, user_id, measured_on, weight_kg, body_fat_pct, chest_cm, waist_cm, hip_cm, thigh_cm, arm_cm, note, created_at, updated_at';
const P_COLS = 'id, user_id, taken_on, pose, storage_path, note, created_at';
const M_FIELDS = ['weight_kg', 'body_fat_pct', 'chest_cm', 'waist_cm', 'hip_cm', 'thigh_cm', 'arm_cm'] as const;

/** Measurements ordered by date ascending (optionally within a range). */
export async function listMeasurements(from?: string, to?: string): Promise<BodyMeasurement[]> {
  if (from) vDate(from);
  if (to) vDate(to);
  const rows = await runRead((signal) => {
    let q = db().from('fit_body_measurements').select(M_COLS);
    if (from) q = q.gte('measured_on', from);
    if (to) q = q.lte('measured_on', to);
    return q.order('measured_on', { ascending: true }).abortSignal(signal).returns<BodyMeasurement[]>();
  }, 'Không tải được số đo cơ thể.');
  return rows ?? [];
}

/** Latest measurement that has a weight (or null). */
export async function latestWeight(): Promise<BodyMeasurement | null> {
  return runRead(
    (signal) =>
      db()
        .from('fit_body_measurements')
        .select(M_COLS)
        .not('weight_kg', 'is', null)
        .order('measured_on', { ascending: false })
        .limit(1)
        .abortSignal(signal)
        .maybeSingle<BodyMeasurement>(),
    'Không tải được cân nặng.',
  );
}

/** Insert or replace the measurement of `measured_on` (one per day). */
export async function upsertMeasurement(input: MeasurementInput): Promise<BodyMeasurement> {
  const row: Record<string, unknown> = { measured_on: vDate(input.measured_on, 'Ngày đo không hợp lệ.') };
  let any = false;
  for (const k of M_FIELDS) {
    if (k in input) {
      const v = input[k];
      if (v === null || v === undefined || (v as unknown) === '') row[k] = null;
      else {
        const n = Number(v);
        if (!(n > 0) || !Number.isFinite(n)) invalid('Số đo phải là số dương.');
        if (k === 'body_fat_pct' && n >= 100) invalid('Tỷ lệ mỡ phải nhỏ hơn 100%.');
        row[k] = Math.round(n * 10) / 10;
        any = true;
      }
    }
  }
  if ('note' in input) row.note = String(input.note ?? '').trim() || null;
  if (!any) invalid('Hãy nhập ít nhất một chỉ số.');
  return run(
    db().from('fit_body_measurements').upsert(row, { onConflict: 'user_id,measured_on' }).select(M_COLS).single<BodyMeasurement>(),
    'Không lưu được số đo.',
  );
}

export async function deleteMeasurement(id: string): Promise<void> {
  await run(db().from('fit_body_measurements').delete().eq('id', id), 'Không xóa được số đo.');
}

/** Progress photos, newest first. */
export async function listPhotos(): Promise<ProgressPhoto[]> {
  const rows = await runRead(
    (signal) =>
      db()
        .from('fit_progress_photos')
        .select(P_COLS)
        .order('taken_on', { ascending: false })
        .order('created_at', { ascending: false })
        .abortSignal(signal)
        .returns<ProgressPhoto[]>(),
    'Không tải được ảnh tiến trình.',
  );
  return rows ?? [];
}

/** Uploads to fitora/<uid>/progress/<uuid>.webp and inserts the row (rolls back the file if the insert fails). */
export async function uploadProgressPhoto(blob: Blob, meta: ProgressPhotoMeta): Promise<ProgressPhoto> {
  vDate(meta.taken_on, 'Ngày chụp không hợp lệ.');
  const path = await uploadImage(blob, 'progress');
  try {
    return await run(
      db()
        .from('fit_progress_photos')
        .insert({ taken_on: meta.taken_on, pose: meta.pose ?? 'front', note: meta.note?.trim() || null, storage_path: path })
        .select(P_COLS)
        .single<ProgressPhoto>(),
      'Không lưu được ảnh tiến trình.',
    );
  } catch (e) {
    await removeImages([path]).catch(() => {});
    throw e;
  }
}

export async function deletePhoto(id: string): Promise<void> {
  const row = await run(
    db().from('fit_progress_photos').delete().eq('id', id).select('storage_path').maybeSingle<{ storage_path: string }>(),
    'Không xóa được ảnh.',
  );
  if (row?.storage_path) await removeImages([row.storage_path]).catch(() => {});
}

/** 1-hour signed URL for a private image path. */
export function signedPhotoUrl(path: string): Promise<string> {
  return signedUrl(path);
}
