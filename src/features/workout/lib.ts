// Pure helpers for the workout screen (unit-tested in lib.test.ts).
import { ACTIVITIES, CATEGORY_DEFAULT_MET, findActivity, type ActivityDef, type ActivityVariant } from '@/data/activities';
import { addDays, diffDays } from '@/lib/date';
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
  // numeric columns may arrive as strings; ignore implausible values (typos like 7 or 700 kg).
  // Bounds match METRIC_RANGES.weight_kg of the body feature (25–300 kg).
  const ok = (v: unknown) => {
    const n = Number(v);
    return v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n >= 25 && n <= 300 ? n : null;
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

/**
 * Is `title` one the app generated for `activity` ("Chạy bộ", "Chạy bộ · 8 km/h") rather than something the user wrote?
 * Auto titles follow the activity/intensity; hand-written ones are never touched.
 */
export function isAutoTitle(title: string, activity: string): boolean {
  const t = normalizeVi(title);
  if (!t) return true;
  const a = findActivity(activity);
  if (!a) return t === normalizeVi(activity);
  const name = normalizeVi(a.name);
  return t === name || a.variants.some((v) => t === normalizeVi(buildTitle(a, v)));
}

/**
 * Does the title still name the activity it was made for (so it goes stale when the activity changes)?
 * Covers generated titles and quick-log/recent ones such as "Chạy bộ 5 km".
 */
export function titleNamesActivity(title: string, activity: string): boolean {
  if (isAutoTitle(title, activity)) return true;
  const name = normalizeVi(findActivity(activity)?.name ?? activity);
  return !!name && normalizeVi(title).startsWith(name);
}

/** Title after switching to activity `next`: kept only when the user typed it or it is unrelated to the old activity. */
export function titleAfterPick(prevTitle: string, prevActivity: string, typed: boolean, next: ActivityDef, variant?: ActivityVariant): string {
  const keep = !!prevTitle.trim() && (typed || !titleNamesActivity(prevTitle, prevActivity));
  return keep ? prevTitle : buildTitle(next, variant);
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

/**
 * Names the Monday-based week starting `weekStart` relative to `today`:
 * "tuần này", "tuần sau" or "tuần 19/10–25/10" (so a repeat never claims the wrong week).
 */
export function weekRangeLabel(weekStart: string, today: string): string {
  const d = diffDays(weekStart, today); // days from the week's start to today
  if (d >= 0 && d <= 6) return 'tuần này';
  if (d >= -7 && d <= -1) return 'tuần sau';
  const end = addDays(weekStart, 6);
  const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
  return `tuần ${dm(weekStart)}–${dm(end)}`;
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
  sessionKey(a) === sessionKey(b) && (a.start_time ?? '').slice(0, 5) === (b.start_time ?? '').slice(0, 5);

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
    const k = `${sessionKey(w)}|${Number(w.met)}|${w.duration_min}`;
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

// ---- distance remembered in notes ------------------------------------------
// fit_workouts has no distance column; the km the user entered is kept as the
// first line of `notes` ("Quãng đường 5,2 km") so editing / repeating restores it.

const DIST_LINE = /^\s*Quãng đường:?\s*(\d+(?:[.,]\d+)?)\s*km\s*(?:\n|$)/i;

/** Splits a stored note into its distance (km) and the user's own text. */
export function splitDistanceNote(notes: string | null | undefined): { km: number | null; rest: string } {
  const s = notes ?? '';
  const m = DIST_LINE.exec(s);
  if (!m) return { km: null, rest: s };
  const km = Number(m[1].replace(',', '.'));
  return { km: km > 0 && km <= 1000 ? km : null, rest: s.slice(m[0].length) };
}

/** Distance line + user's text (≤ 1000 chars, the DB limit); null when both are empty. */
export function joinDistanceNote(km: number | null | undefined, rest: string | null | undefined): string | null {
  const text = (rest ?? '').trim();
  const line = km && km > 0 ? `Quãng đường ${formatKm(km)} km` : '';
  const out = [line, text].filter(Boolean).join('\n').slice(0, 1000);
  return out || null;
}

/** "5,2" (1 decimal, Vietnamese comma, no trailing ",0"). */
export function formatKm(km: number): string {
  const r = Math.round(km * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',');
}

/** Running pace "6:05/km" for `km` in `minutes`, '' when unknown. */
export function paceLabel(km: number | null | undefined, minutes: number | null | undefined): string {
  if (!km || !minutes || !(km > 0) || !(minutes > 0)) return '';
  let total = Math.round((minutes * 60) / km);
  const m = Math.floor(total / 60);
  total -= m * 60;
  return `${m}:${String(total).padStart(2, '0')}/km`;
}

/** Activity has speed-based variants (running, walking, road cycling) — distance ↔ pace makes sense. */
export function isSpeedBased(activity: string | null | undefined): boolean {
  return !!findActivity(activity)?.variants.some((v) => v.kmh);
}

// ---- habits: "you usually do this on Mondays" ------------------------------

type HabitRow = Pick<Workout, 'id' | 'activity' | 'title' | 'met' | 'duration_min' | 'workout_on' | 'created_at' | 'status' | 'start_time'>;

/** Same session regardless of legacy keys / case / diacritics. */
export function sessionKey(w: Pick<Workout, 'activity' | 'title'>): string {
  return `${findActivity(w.activity)?.key ?? normalizeVi(w.activity)}|${normalizeVi(w.title)}`;
}

export interface Suggestion<T> {
  /** Most recent past session to copy. */
  source: T;
  /** 'weekday': done on this weekday in `count` of the last weeks; 'last': the latest session (no habit yet). */
  reason: 'weekday' | 'last';
  count: number;
}

export interface SuggestOptions {
  /** How many weeks back to look for the weekday habit (default 8). */
  weeks?: number;
  limit?: number;
}

/**
 * Sessions to suggest for `date`: what the user did on the same weekday in
 * the previous weeks — at least twice, or exactly one week ago — most frequent
 * first. Sessions already on `date` (any status) are left out. When there is
 * no habit and the day is still empty, the latest done session is offered
 * ("repeat last session").
 */
export function suggestSessions<T extends HabitRow>(history: T[], date: string, onDay: Pick<Workout, 'activity' | 'title'>[], opts: SuggestOptions = {}): Suggestion<T>[] {
  const weeks = opts.weeks ?? 8;
  const limit = opts.limit ?? 3;
  const from = addDays(date, -7 * weeks);
  const lastWeek = addDays(date, -7);
  const taken = new Set(onDay.map(sessionKey));
  const newest = (a: T, b: T) => b.workout_on.localeCompare(a.workout_on) || b.created_at.localeCompare(a.created_at);
  const done = history.filter((w) => w.status === 'done' && w.workout_on < date).sort(newest);

  const groups = new Map<string, { source: T; days: Set<string> }>();
  for (const w of done) {
    if (w.workout_on < from || diffDays(w.workout_on, date) % 7 !== 0) continue;
    const k = sessionKey(w);
    if (taken.has(k)) continue;
    const g = groups.get(k);
    if (g) g.days.add(w.workout_on);
    else groups.set(k, { source: w, days: new Set([w.workout_on]) });
  }
  const habits = [...groups.values()]
    .filter((g) => g.days.size >= 2 || g.days.has(lastWeek))
    .sort((a, b) => b.days.size - a.days.size || newest(a.source, b.source))
    .slice(0, limit)
    .map((g): Suggestion<T> => ({ source: g.source, reason: 'weekday', count: g.days.size }));
  if (habits.length || onDay.length) return habits;

  const last = done.find((w) => !taken.has(sessionKey(w)));
  return last ? [{ source: last, reason: 'last', count: 1 }] : [];
}

/** Insert row that repeats `src` on `date` (kcal at today's weight, catalogue key resolved). */
export function repeatSession(src: Workout, date: string, status: WorkoutStatus, weightKg: number): NewWorkout {
  return {
    ...toInsert(src),
    activity: findActivity(src.activity)?.key ?? src.activity,
    workout_on: date,
    status,
    kcal: metKcal(Number(src.met), weightKg, src.duration_min),
  };
}

/** Templates by last use (from `history`'s template_id), never-used ones by name. */
export function rankTemplates<T extends Pick<WorkoutTemplate, 'id' | 'name'>>(templates: T[], history: Pick<Workout, 'template_id' | 'workout_on' | 'created_at'>[]): T[] {
  const last = new Map<string, string>();
  for (const w of history) {
    if (!w.template_id) continue;
    const stamp = `${w.workout_on}|${w.created_at}`;
    if ((last.get(w.template_id) ?? '') < stamp) last.set(w.template_id, stamp);
  }
  return [...templates].sort((a, b) => {
    const la = last.get(a.id) ?? '';
    const lb = last.get(b.id) ?? '';
    if (la !== lb) return lb.localeCompare(la);
    return a.name.localeCompare(b.name, 'vi');
  });
}

/**
 * Horizontal scroll offset that brings an item [itemLeft, itemLeft + itemWidth) fully into a scroller's viewport
 * with the least movement (used by the week strip when it has to scroll in a narrow phone frame).
 */
export function scrollLeftToReveal(itemLeft: number, itemWidth: number, scrollLeft: number, clientWidth: number): number {
  const right = itemLeft + itemWidth;
  if (itemLeft < scrollLeft) return Math.max(0, itemLeft);
  if (right > scrollLeft + clientWidth) return Math.max(0, right - clientWidth);
  return scrollLeft;
}
