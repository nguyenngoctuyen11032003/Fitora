// Pure helpers for the workout screen (unit-tested in lib.test.ts).
import { ACTIVITIES, CATEGORY_DEFAULT_MET, findActivity, type ActivityDef, type ActivityVariant } from '@/data/activities';
import { addDays } from '@/lib/date';
import { metKcal, stepsKcal } from '@/lib/energy';
import {
  WORKOUT_CATEGORY_LABELS,
  type NewWorkout,
  type Workout,
  type WorkoutCategory,
  type WorkoutPatch,
  type WorkoutStatus,
  type WorkoutTemplate,
} from '@/types/db';

/** Weight used for calorie maths when nothing is known. */
export const FALLBACK_WEIGHT_KG = 65;

/** Latest measured weight → start weight from onboarding → fallback. */
export function resolveWeight(latest: number | string | null | undefined, startWeight: number | string | null | undefined): { kg: number; source: 'measured' | 'profile' | 'fallback' } {
  // numeric columns may arrive as strings; ignore implausible values (typos like 7 or 700 kg)
  const ok = (v: unknown) => {
    const n = Number(v);
    return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n >= 20 && n <= 400 ? n : null;
  };
  const m = ok(latest);
  if (m !== null) return { kg: m, source: 'measured' };
  const s = ok(startWeight);
  if (s !== null) return { kg: s, source: 'profile' };
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
export function searchActivities(
  query: string,
  category: WorkoutCategory | 'all' = 'all',
  list: ActivityDef[] = ACTIVITIES,
  /** Activity keys the user logged recently (most recent first) — they rank first within a match tier. */
  recentKeys: readonly string[] = [],
): ActivityDef[] {
  const pool = category === 'all' ? list : list.filter((a) => a.category === category);
  const q = normalizeVi(query);
  if (!q) return pool;
  const words = q.split(' ');
  const recentRank = (key: string) => {
    const r = recentKeys.indexOf(key);
    return r < 0 ? Number.MAX_SAFE_INTEGER : r;
  };
  const scored: { a: ActivityDef; score: number; r: number; i: number }[] = [];
  pool.forEach((a, i) => {
    const hit = searchIndex(a);
    if (!words.every((w) => hit.hay.includes(w))) return;
    const { name, aliases } = hit;
    const score = name === q ? -1 : name.startsWith(q) ? 0 : aliases.includes(q) ? 0.5 : name.includes(q) ? 1 : 2;
    scored.push({ a, score, r: recentRank(a.key), i });
  });
  return scored.sort((x, y) => x.score - y.score || x.r - y.r || x.i - y.i).map((s) => s.a);
}

/** Normalised search fields per activity, built once (the catalogue is static). */
const SEARCH_INDEX = new WeakMap<ActivityDef, { name: string; aliases: string[]; hay: string }>();
function searchIndex(a: ActivityDef) {
  let hit = SEARCH_INDEX.get(a);
  if (!hit) {
    const name = normalizeVi(a.name);
    const aliases = (a.aliases ?? []).map(normalizeVi);
    const hay = `${name} ${normalizeVi(WORKOUT_CATEGORY_LABELS[a.category] ?? '')} ${a.category.replace('_', ' ')} ${aliases.join(' ')} ${a.variants.map((v) => normalizeVi(v.label)).join(' ')}`;
    hit = { name, aliases, hay };
    SEARCH_INDEX.set(a, hit);
  }
  return hit;
}

/** Distinct catalogue keys of `workouts`, most recent first (legacy keys resolved). */
export function recentActivityKeys(workouts: Pick<Workout, 'activity' | 'workout_on' | 'created_at'>[]): string[] {
  const sorted = [...workouts].sort((a, b) => b.workout_on.localeCompare(a.workout_on) || b.created_at.localeCompare(a.created_at));
  const out: string[] = [];
  for (const w of sorted) {
    const k = findActivity(w.activity)?.key;
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

// ---- distance ↔ duration (speed-based variants) ----------------------------

/** Variant whose typical speed is closest to `kmh` (only variants with a speed). */
export function variantForSpeed(a: ActivityDef | undefined, kmh: number): ActivityVariant | undefined {
  if (!a || !(kmh > 0)) return undefined;
  let best: ActivityVariant | undefined;
  for (const v of a.variants) {
    if (!v.kmh) continue;
    if (!best || Math.abs(v.kmh - kmh) < Math.abs((best.kmh ?? 0) - kmh)) best = v;
  }
  return best;
}

/** Minutes to cover `km` at `kmh` (rounded, ≥ 1), null when either is missing. */
export function durationForDistance(km: number | null | undefined, kmh: number | null | undefined): number | null {
  if (!km || !kmh || !(km > 0) || !(kmh > 0)) return null;
  return Math.max(1, Math.round((km / kmh) * 60));
}

/** Distance (km, 1 decimal) covered in `minutes` at `kmh`, null when unknown. */
export function distanceForDuration(minutes: number | null | undefined, kmh: number | null | undefined): number | null {
  if (!minutes || !kmh || !(minutes > 0) || !(kmh > 0)) return null;
  return Math.round(((minutes / 60) * kmh) * 10) / 10;
}

/**
 * Walking distance of `steps`: stride ≈ 41,5 % (male) / 41,3 % (female) of
 * height; 0,7 m when height is unknown. km, 1 decimal.
 */
export function stepsDistanceKm(steps: number, heightCm?: number | null, sex?: 'male' | 'female' | null): number {
  if (!(steps > 0)) return 0;
  const strideM = heightCm && heightCm >= 80 && heightCm <= 250 ? (heightCm * (sex === 'female' ? 0.413 : 0.415)) / 100 : 0.7;
  return Math.round((steps * strideM) / 100) / 10;
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

/**
 * Planned for future days, done for today and the past. For today, a start
 * time later than `now` (both 'HH:MM') also means it is still planned.
 */
export function defaultStatus(date: string, today: string, startTime?: string, now?: string): WorkoutStatus {
  if (date > today) return 'planned';
  const t = normalizeTime(startTime);
  if (date === today && t && now && t > now) return 'planned';
  return 'done';
}

/** A session can only be marked done on or before today. */
export function canMarkDone(date: string, today: string): boolean {
  return date <= today;
}

/** Local 'HH:MM' of `d`. */
export function nowHHMM(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

export interface PlanCopyOptions {
  /** Recompute kcal at this weight (else keep the source's kcal). */
  weightKg?: number;
  /** Target days before this date are skipped (the past cannot be planned). */
  minDate?: string;
}

/**
 * Copies `sources` `offsetDays` later as planned sessions, skipping any that
 * already exist on the target day (same activity, title and start time) and
 * any target day before `opts.minDate`.
 */
export function planCopies(
  sources: Workout[],
  existing: Pick<Workout, 'workout_on' | 'title' | 'activity' | 'start_time'>[],
  offsetDays = 7,
  opts: PlanCopyOptions = {},
): NewWorkout[] {
  const out: NewWorkout[] = [];
  const taken = [...existing];
  for (const s of sources) {
    const day = addDays(s.workout_on, offsetDays);
    if (opts.minDate && day < opts.minDate) continue;
    if (taken.some((e) => e.workout_on === day && sameSession(e, s))) continue;
    const row: NewWorkout = {
      workout_on: day,
      start_time: s.start_time,
      category: s.category,
      activity: s.activity,
      title: s.title,
      met: Number(s.met),
      duration_min: s.duration_min,
      kcal: opts.weightKg ? metKcal(Number(s.met), opts.weightKg, s.duration_min) : Number(s.kcal),
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

/**
 * Display name of a stored activity: catalogue name, else the free text the
 * user typed; unknown snake_case keys fall back to the session title.
 */
export function activityLabel(activity: string, title: string): string {
  const a = findActivity(activity);
  if (a) return a.name;
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(activity)) return title || activity;
  return activity || title;
}

/** A template with the same name (case/diacritic-insensitive) already exists? */
export function hasTemplateNamed(templates: Pick<WorkoutTemplate, 'name'>[] | undefined, name: string): boolean {
  const n = normalizeVi(name);
  return !!n && (templates ?? []).some((t) => normalizeVi(t.name) === n);
}

/** Insert payload that recreates `w` (used to undo a delete). */
export function toInsert(w: Workout): NewWorkout {
  return {
    workout_on: w.workout_on,
    start_time: w.start_time,
    category: w.category,
    activity: w.activity,
    title: w.title,
    met: Number(w.met),
    duration_min: w.duration_min,
    kcal: Number(w.kcal),
    status: w.status,
    template_id: w.template_id,
    notes: w.notes,
  };
}

/** Patch that restores `w`'s editable fields (used to undo an edit). */
export function toPatch(w: Workout): WorkoutPatch {
  return toInsert(w) as WorkoutPatch;
}

/**
 * kcal to store for a session. A new session, or one whose MET, duration or
 * status changed, is recomputed at `weightKg`; an untouched edit keeps the
 * stored value (it was computed at the weight of that day).
 */
export function sessionKcal(
  draft: { met: number | null; duration_min: number | null; status: WorkoutStatus },
  weightKg: number,
  existing?: Pick<Workout, 'met' | 'duration_min' | 'kcal' | 'status'>,
): number {
  if (draft.met === null || draft.duration_min === null) return 0;
  if (existing && Number(existing.met) === draft.met && existing.duration_min === draft.duration_min && existing.status === draft.status) {
    return Math.round(Number(existing.kcal) || 0);
  }
  return metKcal(draft.met, weightKg, draft.duration_min);
}

/** Look up the catalogue entry; falls back to undefined for free-text activities. */
export const activityOf = findActivity;

/** Wraps `fn` so only the first call runs (undo buttons tapped twice must not insert twice). */
export function once<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  let done = false;
  return (...args: A) => {
    if (done) return;
    done = true;
    fn(...args);
  };
}
