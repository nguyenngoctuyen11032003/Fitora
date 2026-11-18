// Pure timer logic for "Tập ngay". State is timestamps, never a counter, so a running session survives
// screen lock, tab switches, reloads and a closed browser. Every function takes `now` so tests can fake time.
import { findActivity, type ActivityDef, type ActivityVariant } from '@/data/activities';
import { PLAN_ACTIVITY_KEY, type PlanDay } from '@/data/workoutPlan';
import { metKcal } from '@/lib/energy';
import type { WorkoutCategory } from '@/types/db';
import { buildTitle, defaultVariant, isSpeedBased, joinDistanceNote } from '../lib';

/** Sessions longer than this probably forgot "Kết thúc" (the finish sheet warns and pre-fills 60 min). */
export const FORGOTTEN_AFTER_MS = 4 * 60 * 60 * 1000;
export const FORGOTTEN_PREFILL_MIN = 60;
export const MIN_SAVE_MINUTES = 1;
export const MAX_SAVE_MINUTES = 300;
export const ACTIVE_SESSION_KEY = 'fitora.activeSession';
export const NOTE_SUFFIX = 'Tập ngay';

type Now = Date | number;
const ms = (t: Now) => (typeof t === 'number' ? t : t.getTime());

export type WeightSource = 'measured' | 'profile' | 'fallback';

export interface ActiveSession {
  /** Random id. */
  id: string;
  kind: 'plan' | 'activity';
  /** PlanDay.id for plan sessions, else null. */
  dayId: string | null;
  /** Catalogue key ('weight_training' for plan sessions). */
  activity: string;
  category: WorkoutCategory;
  /** Variant id of the activity ('moderate', 'vigorous', …). */
  variant: string;
  met: number;
  /** Title shown on the screen and stored on the saved row. */
  title: string;
  /** Weight locked in when the session started. */
  weightKg: number;
  weightSource: WeightSource;
  startedAt: string;
  pausedAt: string | null;
  pausedMs: number;
  /** Plan sessions: sets done per exercise id. */
  sets: Record<string, number>;
}

export interface StartInput {
  kind: 'plan' | 'activity';
  day?: PlanDay | null;
  activity?: ActivityDef | null;
  variantId?: string;
  weightKg: number;
  weightSource: WeightSource;
}

export function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Builds a fresh running session; null when the input names no known activity. */
export function start(input: StartInput, now: Now, id: string = newSessionId()): ActiveSession | null {
  const base = {
    id,
    startedAt: new Date(ms(now)).toISOString(),
    pausedAt: null,
    pausedMs: 0,
    sets: {},
    weightKg: input.weightKg,
    weightSource: input.weightSource,
  };
  if (input.kind === 'plan') {
    const a = findActivity(PLAN_ACTIVITY_KEY);
    const day = input.day;
    if (!a || !day) return null;
    const v = a.variants.find((x) => x.id === (input.variantId ?? day.defaultVariant)) ?? defaultVariant(a);
    return { ...base, kind: 'plan', dayId: day.id, activity: a.key, category: a.category, variant: v.id, met: v.met, title: day.title };
  }
  const a = input.activity;
  if (!a) return null;
  const v = a.variants.find((x) => x.id === input.variantId) ?? defaultVariant(a);
  return { ...base, kind: 'activity', dayId: null, activity: a.key, category: a.category, variant: v.id, met: v.met, title: buildTitle(a, v) };
}

export const isPaused = (s: ActiveSession) => s.pausedAt !== null;

export function pause(s: ActiveSession, now: Now): ActiveSession {
  return s.pausedAt ? s : { ...s, pausedAt: new Date(ms(now)).toISOString() };
}

export function resume(s: ActiveSession, now: Now): ActiveSession {
  if (!s.pausedAt) return s;
  const paused = Math.max(0, ms(now) - Date.parse(s.pausedAt));
  return { ...s, pausedAt: null, pausedMs: s.pausedMs + paused };
}

/** (pausedAt ?? now) − startedAt − pausedMs, never negative. */
export function elapsedMs(s: ActiveSession, now: Now): number {
  const end = s.pausedAt ? Date.parse(s.pausedAt) : ms(now);
  return Math.max(0, end - Date.parse(s.startedAt) - s.pausedMs);
}

/** Sets done for one exercise (0 removes it), clamped to 0…total. */
export function setSetsDone(s: ActiveSession, exerciseId: string, count: number, total: number): ActiveSession {
  const n = Math.max(0, Math.min(total, Math.round(count)));
  const sets = { ...s.sets };
  if (n === 0) delete sets[exerciseId];
  else sets[exerciseId] = n;
  return { ...s, sets };
}

/** Exercises with every set done. */
export function exercisesDone(s: ActiveSession, day: PlanDay | null | undefined): number {
  if (!day) return 0;
  return day.exercises.filter((e) => (s.sets[e.id] ?? 0) >= e.sets).length;
}

export function setVariant(s: ActiveSession, variantId: string): ActiveSession {
  const a = findActivity(s.activity);
  const v = a?.variants.find((x) => x.id === variantId);
  if (!a || !v) return s;
  return { ...s, variant: v.id, met: v.met, title: s.kind === 'plan' ? s.title : buildTitle(a, v) };
}

export function clampMinutes(n: number, min = MIN_SAVE_MINUTES): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(MAX_SAVE_MINUTES, Math.max(min, Math.round(n)));
}

export interface FinishSummary {
  elapsedMs: number;
  /** Elapsed time rounded to whole minutes, clamped to 0–300. */
  minutes: number;
  /** Ran longer than 4 h: "Có thể bạn quên bấm kết thúc". */
  forgotten: boolean;
  suggestedMinutes: number;
  /** Under one minute: only "Hủy buổi tập" is allowed. */
  canSave: boolean;
}

export function finish(s: ActiveSession, now: Now): FinishSummary {
  const e = elapsedMs(s, now);
  const minutes = clampMinutes(Math.round(e / 60000), 0);
  const forgotten = e > FORGOTTEN_AFTER_MS;
  return { elapsedMs: e, minutes, forgotten, suggestedMinutes: forgotten ? FORGOTTEN_PREFILL_MIN : minutes, canSave: forgotten || minutes >= MIN_SAVE_MINUTES };
}

/** Live kcal for an elapsed time in ms (fractional minutes, so it grows every few seconds). */
export function liveKcal(met: number, weightKg: number, elapsed: number): number {
  return metKcal(met, weightKg, elapsed / 60000);
}

/** "12:05" under an hour, "1:02:05" above. */
export function formatClock(elapsed: number): string {
  const total = Math.max(0, Math.floor(elapsed / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

export interface FinishRowInput {
  session: ActiveSession;
  durationMin: number;
  variantId?: string;
  weightKg?: number;
  km?: number | null;
  day?: PlanDay | null;
}

/** The `fit_workouts` fields of a finished session (status 'done', dated by when it started). */
export function toWorkoutFields(input: FinishRowInput) {
  const { session } = input;
  const activity = findActivity(session.activity);
  const variant: ActivityVariant | undefined = activity?.variants.find((v) => v.id === (input.variantId ?? session.variant));
  const met = variant?.met ?? session.met;
  const weightKg = input.weightKg ?? session.weightKg;
  const duration = clampMinutes(input.durationMin);
  const started = new Date(session.startedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = input.day ?? null;
  let title = session.title;
  if (session.kind === 'activity' && activity) title = buildTitle(activity, variant);
  let notes: string;
  if (session.kind === 'plan') {
    notes = `${exercisesDone(session, day)}/${day?.exercises.length ?? 0} bài · ${NOTE_SUFFIX}`;
  } else if (input.km && input.km > 0 && isSpeedBased(session.activity)) {
    notes = joinDistanceNote(input.km, NOTE_SUFFIX) ?? NOTE_SUFFIX;
  } else {
    notes = NOTE_SUFFIX;
  }
  return {
    workout_on: `${started.getFullYear()}-${pad(started.getMonth() + 1)}-${pad(started.getDate())}`,
    start_time: `${pad(started.getHours())}:${pad(started.getMinutes())}`,
    category: activity?.category ?? session.category,
    activity: activity?.key ?? session.activity,
    title: title.slice(0, 80),
    met,
    duration_min: duration,
    kcal: metKcal(met, weightKg, duration),
    status: 'done' as const,
    notes: notes.slice(0, 1000),
  };
}

export function serializeSession(s: ActiveSession): string {
  return JSON.stringify(s);
}

/** Parses a stored session; null when missing or malformed. */
export function parseSession(raw: string | null | undefined): ActiveSession | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ActiveSession>;
    const okStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
    if (
      !okStr(v.id) ||
      (v.kind !== 'plan' && v.kind !== 'activity') ||
      !okStr(v.activity) ||
      !okStr(v.variant) ||
      typeof v.met !== 'number' ||
      typeof v.weightKg !== 'number' ||
      !okStr(v.startedAt) ||
      Number.isNaN(Date.parse(v.startedAt))
    ) {
      return null;
    }
    const sets: Record<string, number> = {};
    if (v.sets && typeof v.sets === 'object') for (const [k, n] of Object.entries(v.sets)) if (typeof n === 'number' && n > 0) sets[k] = n;
    return {
      id: v.id,
      kind: v.kind,
      dayId: typeof v.dayId === 'string' ? v.dayId : null,
      activity: v.activity,
      category: (v.category ?? 'gym') as WorkoutCategory,
      variant: v.variant,
      met: v.met,
      title: typeof v.title === 'string' ? v.title : '',
      weightKg: v.weightKg,
      weightSource: (v.weightSource ?? 'fallback') as WeightSource,
      startedAt: v.startedAt,
      pausedAt: typeof v.pausedAt === 'string' ? v.pausedAt : null,
      pausedMs: typeof v.pausedMs === 'number' && v.pausedMs >= 0 ? v.pausedMs : 0,
      sets,
    };
  } catch {
    return null;
  }
}
