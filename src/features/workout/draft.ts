// Draft model of the workout sheet (pure — unit-tested in lib.test.ts).
import { findActivity } from '@/data/activities';
import { isISODate } from '@/lib/date';
import type { Workout, WorkoutCategory, WorkoutStatus } from '@/types/db';
import { canMarkDone, defaultStatus, isSpeedBased, joinDistanceNote, normalizeTime, splitDistanceNote } from './lib';

export interface WorkoutDraft {
  activity: string;
  category: WorkoutCategory;
  title: string;
  met: number | null;
  duration_min: number | null;
  workout_on: string;
  start_time: string;
  status: WorkoutStatus;
  /** The user's own note (without the distance line). */
  notes: string;
  template_id: string | null;
  /** Distance (km) of a speed-based activity — stored as the first line of `notes`. */
  distance_km: number | null;
}

export type SheetMode =
  | { kind: 'new'; date: string; preset?: Partial<WorkoutDraft> }
  | { kind: 'edit'; workout: Workout };

/**
 * Identity of what the sheet edits. An unsaved draft is kept across an accidental
 * close and restored only when the sheet reopens for the SAME target: same new
 * day (and same preset, so tapping a suggestion never shows a stale draft), or
 * the same workout row in the same version (`updated_at` changes → start fresh).
 */
export function modeKey(mode: SheetMode): string {
  if (mode.kind === 'edit') return `edit|${mode.workout.id}|${mode.workout.updated_at}`;
  const p = mode.preset;
  if (!p) return `new|${mode.date}`;
  return `new|${mode.date}|${p.activity ?? ''}|${p.title ?? ''}|${p.met ?? ''}|${p.duration_min ?? ''}|${p.template_id ?? ''}`;
}

export function draftFrom(mode: SheetMode, today: string): WorkoutDraft {
  if (mode.kind === 'edit') {
    const w = mode.workout;
    const { km, rest } = splitDistanceNote(w.notes);
    return {
      // Older rows may carry a legacy key ("running_8kmh") — store the catalogue key on save.
      activity: findActivity(w.activity)?.key ?? w.activity,
      category: w.category,
      title: w.title,
      met: Number(w.met),
      duration_min: w.duration_min,
      workout_on: w.workout_on,
      start_time: normalizeTime(w.start_time),
      status: w.status,
      notes: rest,
      template_id: w.template_id,
      distance_km: km,
    };
  }
  const preset = mode.preset ?? {};
  // A preset note may still carry its distance line (templates, recent sessions).
  const split = splitDistanceNote(preset.notes);
  return {
    activity: '',
    category: 'gym',
    title: '',
    met: null,
    duration_min: 30,
    workout_on: mode.date,
    start_time: '',
    status: defaultStatus(mode.date, today),
    template_id: null,
    ...preset,
    notes: split.rest,
    distance_km: preset.distance_km ?? split.km,
  };
}

export interface DraftCheck {
  met: boolean;
  duration: boolean;
  title: boolean;
  date: boolean;
  /** "Đã tập" is only allowed on or before today. */
  status: boolean;
  activity: boolean;
  /** Everything needed to save the session. */
  valid: boolean;
  /** Everything needed to save it as a template (no date / status). */
  templateValid: boolean;
}

export function checkDraft(d: WorkoutDraft, today: string): DraftCheck {
  const met = d.met !== null && Number.isFinite(d.met) && d.met >= 1 && d.met <= 25;
  const duration = d.duration_min !== null && Number.isInteger(d.duration_min) && d.duration_min >= 1 && d.duration_min <= 1440;
  const title = d.title.trim().length > 0 && d.title.trim().length <= 80;
  const date = isISODate(d.workout_on);
  const status = d.status === 'planned' || !date || canMarkDone(d.workout_on, today);
  const activity = d.activity.trim().length > 0;
  const templateValid = met && duration && title && activity;
  return { met, duration, title, date, status, activity, valid: templateValid && date && status, templateValid };
}

/** Stored notes of a draft: distance line (speed-based activities only) + the user's text. */
export function draftNotes(d: Pick<WorkoutDraft, 'activity' | 'notes' | 'distance_km'>): string | null {
  return joinDistanceNote(isSpeedBased(d.activity) ? d.distance_km : null, d.notes);
}

/** DB fields of a (valid) draft with its kcal. */
export function draftFields(d: WorkoutDraft & { kcal: number }): WorkoutRowFields {
  return {
    workout_on: d.workout_on,
    start_time: d.start_time || null,
    category: d.category,
    activity: d.activity.trim(),
    title: d.title.trim(),
    met: d.met!,
    duration_min: d.duration_min!,
    kcal: d.kcal,
    status: d.status,
    template_id: d.template_id,
    notes: draftNotes(d),
  };
}

export type WorkoutRowFields = Pick<
  Workout,
  'workout_on' | 'start_time' | 'category' | 'activity' | 'title' | 'met' | 'duration_min' | 'kcal' | 'status' | 'template_id' | 'notes'
>;
