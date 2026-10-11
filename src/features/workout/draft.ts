// Draft model of the workout sheet (pure — unit-tested in lib.test.ts).
import { findActivity } from '@/data/activities';
import { isISODate } from '@/lib/date';
import type { Workout, WorkoutCategory, WorkoutStatus } from '@/types/db';
import { canMarkDone, defaultStatus, normalizeTime } from './lib';

export interface WorkoutDraft {
  activity: string;
  category: WorkoutCategory;
  title: string;
  met: number | null;
  duration_min: number | null;
  workout_on: string;
  start_time: string;
  status: WorkoutStatus;
  notes: string;
  template_id: string | null;
}

export type SheetMode =
  | { kind: 'new'; date: string; preset?: Partial<WorkoutDraft> }
  | { kind: 'edit'; workout: Workout };

export function draftFrom(mode: SheetMode, today: string): WorkoutDraft {
  if (mode.kind === 'edit') {
    const w = mode.workout;
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
      notes: w.notes ?? '',
      template_id: w.template_id,
    };
  }
  return {
    activity: '',
    category: 'gym',
    title: '',
    met: null,
    duration_min: 30,
    workout_on: mode.date,
    start_time: '',
    status: defaultStatus(mode.date, today),
    notes: '',
    template_id: null,
    ...mode.preset,
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
    notes: d.notes.trim() || null,
  };
}

export type WorkoutRowFields = Pick<
  Workout,
  'workout_on' | 'start_time' | 'category' | 'activity' | 'title' | 'met' | 'duration_min' | 'kcal' | 'status' | 'template_id' | 'notes'
>;
