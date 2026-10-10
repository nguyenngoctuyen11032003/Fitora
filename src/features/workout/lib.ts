// Pure helpers for the workout screen (unit-tested in lib.test.ts).
import { ACTIVITIES, CATEGORY_DEFAULT_MET, findActivity, type ActivityDef, type ActivityVariant } from '@/data/activities';
import { addDays } from '@/lib/date';
import { metKcal, stepsKcal } from '@/lib/energy';
import type { NewWorkout, Workout, WorkoutCategory, WorkoutStatus, WorkoutTemplate } from '@/types/db';

/** Weight used for calorie maths when nothing is known. */
export const FALLBACK_WEIGHT_KG = 65;

/** Latest measured weight → start weight from onboarding → fallback. */
export function resolveWeight(latest: number | null | undefined, startWeight: number | null | undefined): { kg: number; source: 'measured' | 'profile' | 'fallback' } {
  if (latest && latest > 0) return { kg: Number(latest), source: 'measured' };
  if (startWeight && startWeight > 0) return { kg: Number(startWeight), source: 'profile' };
  return { kg: FALLBACK_WEIGHT_KG, source: 'fallback' };
}

/** Lower-case, strip Vietnamese diacritics (đ → d), collapse spaces. */
export function normalizeVi(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Diacritic-insensitive activity search. Every query word must appear in the
 * name, category or aliases. Exact name, then name-prefix matches rank first.
 */
export function searchActivities(query: string, category: WorkoutCategory | 'all' = 'all', list: ActivityDef[] = ACTIVITIES): ActivityDef[] {
  const pool = category === 'all' ? list : list.filter((a) => a.category === category);
  const q = normalizeVi(query);
  if (!q) return pool;
  const words = q.split(' ');
  const scored: { a: ActivityDef; score: number; i: number }[] = [];
  pool.forEach((a, i) => {
    const name = normalizeVi(a.name);
    const hay = `${name} ${(a.aliases ?? []).map(normalizeVi).join(' ')} ${a.variants.map((v) => normalizeVi(v.label)).join(' ')}`;
    if (!words.every((w) => hay.includes(w))) return;
    const score = name === q ? -1 : name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
    scored.push({ a, score, i });
  });
  return scored.sort((x, y) => x.score - y.score || x.i - y.i).map((s) => s.a);
}

export function defaultVariant(a: ActivityDef): ActivityVariant {
  return a.variants[a.defaultVariant] ?? a.variants[0];
}

/** Variant whose MET matches (± 0.05), else undefined (= custom MET). */
export function variantForMet(a: ActivityDef | undefined, met: number): ActivityVariant | undefined {
  return a?.variants.find((v) => Math.abs(v.met - met) < 0.05);
}

/** "Chạy bộ · 8 km/h" — the variant label is omitted when the activity has a single variant. */
export function buildTitle(a: ActivityDef, v?: ActivityVariant): string {
  if (!v || a.variants.length < 2) return a.name;
  return `${a.name} · ${v.label}`.slice(0, 80);
}

export function categoryDefaultMet(c: WorkoutCategory): number {
  return CATEGORY_DEFAULT_MET[c] ?? 4;
}

/** Planned for future days, done for today and the past. */
export function defaultStatus(date: string, today: string): WorkoutStatus {
  return date > today ? 'planned' : 'done';
}

/** The 7 ISO dates of the week that starts on `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export interface DayMark {
  done: number;
  planned: number;
}

/** Count of done / planned sessions per day. */
export function dayMarks(workouts: Pick<Workout, 'workout_on' | 'status'>[]): Record<string, DayMark> {
  const out: Record<string, DayMark> = {};
  for (const w of workouts) {
    const m = (out[w.workout_on] ??= { done: 0, planned: 0 });
    if (w.status === 'done') m.done++;
    else m.planned++;
  }
  return out;
}

/** Sessions of one day: timed first (by time), then untimed by creation. */
export function sessionsOn<T extends Pick<Workout, 'workout_on' | 'start_time' | 'created_at'>>(workouts: T[], date: string): T[] {
  return workouts
    .filter((w) => w.workout_on === date)
    .sort((a, b) => {
      if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time) || a.created_at.localeCompare(b.created_at);
      if (a.start_time) return -1;
      if (b.start_time) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
}

export interface DayBurn {
  workoutKcal: number;
  stepsKcal: number;
  total: number;
  doneMinutes: number;
  doneCount: number;
  plannedCount: number;
  plannedKcal: number;
}

/** Burned energy of a day: done workouts + steps (planned sessions are reported separately). */
export function dayBurn(workouts: Pick<Workout, 'workout_on' | 'status' | 'kcal' | 'duration_min'>[], date: string, steps: number, weightKg: number): DayBurn {
  let workoutKcal = 0;
  let doneMinutes = 0;
  let doneCount = 0;
  let plannedCount = 0;
  let plannedKcal = 0;
  for (const w of workouts) {
    if (w.workout_on !== date) continue;
    if (w.status === 'done') {
      workoutKcal += Number(w.kcal) || 0;
      doneMinutes += Number(w.duration_min) || 0;
      doneCount++;
    } else {
      plannedKcal += Number(w.kcal) || 0;
      plannedCount++;
    }
  }
  const sk = stepsKcal(steps, weightKg);
  return {
    workoutKcal: Math.round(workoutKcal),
    stepsKcal: sk,
    total: Math.round(workoutKcal) + sk,
    doneMinutes,
    doneCount,
    plannedCount,
    plannedKcal: Math.round(plannedKcal),
  };
}

/** Insert row for a template applied to `date`. */
export function workoutFromTemplate(t: WorkoutTemplate, date: string, status: WorkoutStatus, weightKg: number): NewWorkout {
  return {
    workout_on: date,
    category: t.category,
    activity: t.activity,
    title: t.name,
    met: Number(t.met),
    duration_min: t.duration_min,
    kcal: metKcal(Number(t.met), weightKg, t.duration_min),
    status,
    template_id: t.id,
    notes: t.notes,
    start_time: null,
  };
}

const sameSession = (a: Pick<Workout, 'title' | 'activity' | 'start_time'>, b: Pick<Workout, 'title' | 'activity' | 'start_time'>) =>
  a.activity === b.activity && a.title.trim().toLowerCase() === b.title.trim().toLowerCase() && (a.start_time ?? '').slice(0, 5) === (b.start_time ?? '').slice(0, 5);

/**
 * Copies `sources` `offsetDays` later as planned sessions, skipping any that
 * already exist on the target day (same activity, title and start time).
 */
export function planCopies(sources: Workout[], existing: Pick<Workout, 'workout_on' | 'title' | 'activity' | 'start_time'>[], offsetDays = 7): NewWorkout[] {
  const out: NewWorkout[] = [];
  const taken = [...existing];
  for (const s of sources) {
    const day = addDays(s.workout_on, offsetDays);
    if (taken.some((e) => e.workout_on === day && sameSession(e, s))) continue;
    const row: NewWorkout = {
      workout_on: day,
      start_time: s.start_time,
      category: s.category,
      activity: s.activity,
      title: s.title,
      met: Number(s.met),
      duration_min: s.duration_min,
      kcal: Number(s.kcal),
      status: 'planned',
      template_id: s.template_id,
      notes: s.notes,
    };
    out.push(row);
    taken.push({ workout_on: day, title: s.title, activity: s.activity, start_time: s.start_time });
  }
  return out;
}

/** Most recent distinct sessions (by activity + title + MET + duration), newest first. */
export function recentSessions<T extends Pick<Workout, 'activity' | 'title' | 'met' | 'duration_min' | 'workout_on' | 'created_at'>>(workouts: T[], limit = 6): T[] {
  const sorted = [...workouts].sort((a, b) => b.workout_on.localeCompare(a.workout_on) || b.created_at.localeCompare(a.created_at));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const w of sorted) {
    const k = `${w.activity}|${w.title.trim().toLowerCase()}|${Number(w.met)}|${w.duration_min}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}

/** 'HH:MM' (or 'HH:MM:SS') → 'HH:MM', '' for empty/invalid. */
export function normalizeTime(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  if (!m) return '';
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return '';
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Step goal progress 0..1+ (0 when no target). */
export function stepRatio(steps: number, target: number | null | undefined): number {
  return target && target > 0 ? Math.max(0, steps) / target : 0;
}

/** Look up the catalogue entry; falls back to undefined for free-text activities. */
export const activityOf = findActivity;
