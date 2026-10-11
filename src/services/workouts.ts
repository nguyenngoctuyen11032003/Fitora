import { db } from '@/lib/supabase';
import type { NewWorkout, NewWorkoutTemplate, Workout, WorkoutPatch, WorkoutTemplate } from '@/types/db';
import { invalid, run, runRead, vDate } from './errors';

const COLS =
  'id, user_id, workout_on, start_time, category, activity, title, met, duration_min, kcal, status, template_id, notes, created_at, updated_at';
const TPL_COLS = 'id, user_id, name, category, activity, met, duration_min, notes, created_at, updated_at';

function clean<T extends WorkoutPatch>(w: T): T {
  const out: Record<string, unknown> = { ...w };
  if ('title' in w) {
    const t = String(w.title ?? '').trim().slice(0, 80);
    if (!t) invalid('Hãy nhập tên buổi tập.');
    out.title = t;
  }
  if ('workout_on' in w) vDate(w.workout_on, 'Ngày tập không hợp lệ.');
  if ('met' in w) {
    const m = Number(w.met);
    if (!(m >= 1 && m <= 25)) invalid('Chỉ số MET phải từ 1 đến 25.');
  }
  if ('duration_min' in w) {
    const d = Math.round(Number(w.duration_min));
    if (!(d >= 1 && d <= 1440)) invalid('Thời lượng phải từ 1 đến 1440 phút.');
    out.duration_min = d;
  }
  if ('kcal' in w) {
    const k = Number(w.kcal);
    out.kcal = Number.isFinite(k) ? Math.max(0, Math.round(k)) : 0;
  }
  if ('notes' in w) out.notes = String(w.notes ?? '').trim() || null;
  if ('start_time' in w) {
    const t = String(w.start_time ?? '').trim();
    if (t && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(t)) invalid('Giờ bắt đầu không hợp lệ (HH:MM).');
    out.start_time = t || null;
  }
  return out as T;
}

/** Workouts between from and to (inclusive), by day then start time. */
export async function listWorkouts(from: string, to: string): Promise<Workout[]> {
  vDate(from);
  vDate(to);
  const rows = await runRead(
    (signal) =>
      db()
        .from('fit_workouts')
        .select(COLS)
        .gte('workout_on', from)
        .lte('workout_on', to)
        .order('workout_on', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .abortSignal(signal)
        .returns<Workout[]>(),
    'Không tải được lịch tập.',
  );
  return rows ?? [];
}

export async function addWorkout(w: NewWorkout): Promise<Workout> {
  return run(db().from('fit_workouts').insert(clean(w)).select(COLS).single<Workout>(), 'Không lưu được buổi tập.');
}

export async function updateWorkout(id: string, patch: WorkoutPatch): Promise<Workout> {
  return run(db().from('fit_workouts').update(clean(patch)).eq('id', id).select(COLS).single<Workout>(), 'Không cập nhật được buổi tập.');
}

export async function deleteWorkout(id: string): Promise<void> {
  await run(db().from('fit_workouts').delete().eq('id', id), 'Không xóa được buổi tập.');
}

export async function listTemplates(): Promise<WorkoutTemplate[]> {
  const rows = await runRead(
    (signal) => db().from('fit_workout_templates').select(TPL_COLS).order('name', { ascending: true }).abortSignal(signal).returns<WorkoutTemplate[]>(),
    'Không tải được mẫu bài tập.',
  );
  return rows ?? [];
}

export async function createTemplate(t: NewWorkoutTemplate): Promise<WorkoutTemplate> {
  const name = String(t.name ?? '').trim().slice(0, 80);
  if (!name) invalid('Hãy đặt tên cho mẫu.');
  const c = clean({ met: t.met, duration_min: t.duration_min, notes: t.notes ?? null });
  const row = { name, category: t.category, activity: t.activity, met: c.met, duration_min: c.duration_min, notes: c.notes };
  return run(
    db().from('fit_workout_templates').insert(row).select(TPL_COLS).single<WorkoutTemplate>(),
    'Không lưu được mẫu bài tập.',
  );
}

export async function deleteTemplate(id: string): Promise<void> {
  await run(db().from('fit_workout_templates').delete().eq('id', id), 'Không xóa được mẫu bài tập.');
}
