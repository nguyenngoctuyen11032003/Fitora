// Pure maths for the Today dashboard (unit-tested in metrics.test.ts).
import { addDays, parseISODate } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import { ACTIVITY_FACTORS, calcAge, calcBMR, remainingKcal, stepsKcal } from '@/lib/energy';
import type { ActivityLevel, DailyLog, DaySummary, FitProfile, MealEntry, MealType, RangeSummaryRow, Workout } from '@/types/db';

export const DEFAULT_KCAL_TARGET = 2000;
export const DEFAULT_WATER_TARGET = 2000;
export const DEFAULT_STEP_TARGET = 8000;
/** Weight used for step kcal when the user never logged one. */
export const FALLBACK_WEIGHT_KG = 65;

export interface Targets {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  water_ml: number;
  steps: number;
}

/** Fiber guideline: 14 g per 1000 kcal, at least 20 g, rounded. */
export function fiberTarget(kcal: number): number {
  return Math.max(20, Math.round((Math.max(0, kcal || 0) * 14) / 1000));
}

/** Daily targets from the fit profile, with sane fallbacks for unfinished rows. */
export function targetsFromProfile(fit: FitProfile | null | undefined): Targets {
  const kcal = fit?.calorie_target && fit.calorie_target > 0 ? fit.calorie_target : DEFAULT_KCAL_TARGET;
  return {
    kcal,
    // Fallback split 20/50/30 when the profile has no macros yet.
    protein_g: fit?.protein_g ?? Math.round((kcal * 0.2) / 4),
    carbs_g: fit?.carbs_g ?? Math.round((kcal * 0.5) / 4),
    fat_g: fit?.fat_g ?? Math.round((kcal * 0.3) / 9),
    fiber_g: fiberTarget(kcal),
    water_ml: fit?.water_target_ml && fit.water_target_ml > 0 ? fit.water_target_ml : DEFAULT_WATER_TARGET,
    steps: fit?.step_target && fit.step_target > 0 ? fit.step_target : DEFAULT_STEP_TARGET,
  };
}

/** Best known body weight: latest measurement → start weight → fallback. */
export function effectiveWeight(latest: number | null | undefined, start: number | null | undefined): number {
  if (latest && latest > 0) return latest;
  if (start && start > 0) return start;
  return FALLBACK_WEIGHT_KG;
}

/** Activity factor of the resting baseline (same as Reports): BMR × 1.2. */
const BASE_FACTOR = ACTIVITY_FACTORS.sedentary;

export interface ActivityModel {
  /** Mifflin–St Jeor BMR (kcal/day). */
  bmr: number;
  /** BMR × activity factor of the profile, rounded. */
  tdee: number;
  activityLevel: ActivityLevel;
  /** Activity kcal the profile's activity level already assumes = TDEE − BMR × 1.2 (≥ 0). */
  allowance: number;
}

/**
 * Daily activity already built into the calorie target. The target comes from
 * TDEE = BMR × activity factor, so e.g. a "moderate" profile already eats for
 * ≈ BMR × 0.35 of daily movement. Null when the profile is too incomplete for a
 * BMR (then every logged kcal is credited on top of the target).
 */
export function activityModel(
  fit: Pick<FitProfile, 'sex' | 'birth_date' | 'height_cm' | 'activity_level'> | null | undefined,
  weightKg: number,
  date: string,
): ActivityModel | null {
  if (!fit?.sex || !fit.birth_date || !(Number(fit.height_cm) > 0) || !fit.activity_level || !(weightKg > 0)) return null;
  const factor = ACTIVITY_FACTORS[fit.activity_level];
  if (!factor) return null;
  const bmr = calcBMR(fit.sex, weightKg, Number(fit.height_cm), calcAge(fit.birth_date, parseISODate(date)));
  if (!(bmr > 0)) return null;
  const tdee = Math.round(bmr * factor);
  return { bmr, tdee, activityLevel: fit.activity_level, allowance: Math.max(0, Math.round(tdee - bmr * BASE_FACTOR)) };
}

export interface EnergyBalance {
  target: number;
  eaten: number;
  workoutKcal: number;
  stepsKcal: number;
  /** All logged activity today: done workouts + steps. */
  burned: number;
  /** Activity kcal already included in the target by the profile's activity level (0 when unknown / sedentary). */
  allowance: number;
  /**
   * Part of `burned` added on top of the target: only what exceeds the activity the
   * target already assumes, so activity is never counted twice. Same model as
   * Reports: max(TDEE, BMR × 1.2 + burned) − TDEE. Equals `burned` without a model.
   */
  bonus: number;
  /** target − eaten + bonus (negative = over budget) */
  remaining: number;
  over: boolean;
  /** Budget available today = target + bonus. */
  budget: number;
  /** eaten / budget, clamped to [0, 1]. */
  progress: number;
}

export function energyBalance(
  sum: Pick<DaySummary, 'kcal_in' | 'workout_kcal' | 'steps'>,
  target: number,
  weightKg: number,
  model: ActivityModel | null = null,
): EnergyBalance {
  const eaten = Math.round(Math.max(0, sum.kcal_in || 0));
  const workoutKcal = Math.round(Math.max(0, sum.workout_kcal || 0));
  const fromSteps = stepsKcal(sum.steps || 0, weightKg);
  const burned = workoutKcal + fromSteps;
  const allowance = model ? model.allowance : 0;
  const bonus = model ? Math.max(0, Math.round(model.bmr * BASE_FACTOR + burned) - model.tdee) : burned;
  const remaining = remainingKcal(target, eaten, bonus);
  const budget = Math.max(0, target + bonus);
  const progress = budget > 0 ? Math.max(0, Math.min(1, eaten / budget)) : eaten > 0 ? 1 : 0;
  return { target, eaten, workoutKcal, stepsKcal: fromSteps, burned, allowance, bonus, remaining, over: remaining < 0, budget, progress };
}

export interface MacroStatus {
  /** Eaten, rounded as displayed. */
  eaten: number;
  /** Target, rounded as displayed. */
  target: number;
  /** target − eaten on the displayed values (negative = over), so "74/156 · Còn 82" always adds up. */
  left: number;
}

/** Macro card numbers, computed on the rounded values that are shown. */
export function macroStatus(eaten: number, target: number): MacroStatus {
  const e = Math.round(Math.max(0, Number(eaten) || 0));
  const t = Math.round(Math.max(0, Number(target) || 0));
  return { eaten: e, target: t, left: t - e };
}

/**
 * Whole-percent progress toward a target that never claims 100 % before the
 * target is actually reached (99.6 % → 99, not 100).
 */
export function progressPercent(value: number, target: number): number {
  if (!(target > 0)) return 0;
  const v = Math.max(0, Number(value) || 0);
  if (v >= target) return Math.floor((v / target) * 100);
  return Math.min(99, Math.round((v / target) * 100));
}

/** Number of droplets drawn for the water target (each ≈ one glass), 4–10. */
export function dropletCount(targetMl: number): number {
  return Math.max(4, Math.min(10, Math.round((targetMl || 0) / 250)));
}

/** Fill level (0..1) of each droplet for the amount drunk. */
export function dropletFills(waterMl: number, targetMl: number): number[] {
  const n = dropletCount(targetMl);
  const per = (targetMl > 0 ? targetMl : DEFAULT_WATER_TARGET) / n;
  const filled = Math.max(0, waterMl || 0) / per;
  return Array.from({ length: n }, (_, i) => Math.max(0, Math.min(1, filled - i)));
}

/** "Thứ Sáu, 09/10" */
export function dateEyebrow(weekday: string, iso: string): string {
  const [, m, d] = iso.split('-');
  return `${weekday}, ${d}/${m}`;
}

/** Name used in the greeting: Vietnamese given name = last word of the full name. */
export function greetingName(displayName: string): string {
  const parts = (displayName || '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : 'bạn';
}

/** Meal most likely being logged at this hour (pre-selects the scan screen). */
export function mealForHour(hour: number): MealType {
  if (hour >= 4 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 17) return 'snack';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

export interface MealGroup {
  meal: MealType;
  kcal: number;
  count: number;
  names: string[];
}

/** Per-meal totals in MEAL_TYPES order. */
export function groupMeals(entries: MealEntry[], order: MealType[]): MealGroup[] {
  return order.map((meal) => {
    const list = entries.filter((e) => e.meal === meal);
    return {
      meal,
      kcal: Math.round(list.reduce((a, e) => a + (Number(e.kcal) || 0), 0)),
      count: list.length,
      names: list.map((e) => e.name),
    };
  });
}

/** Finite, non-negative number (NaN / null / negative / numeric strings from PostgREST → safe). */
export function nn(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Day summary rebuilt from the raw rows, used when the `fit_day_summary` RPC fails but
 * meals / workouts / the daily log loaded. Same rules as the RPC: only `done` workouts burn.
 */
export function summaryFromParts(
  meals: Pick<MealEntry, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g'>[],
  workouts: Pick<Workout, 'kcal' | 'status'>[],
  daily: Pick<DailyLog, 'water_ml' | 'steps'>,
): DaySummary {
  const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g') => meals.reduce((a, m) => a + nn(m[k]), 0);
  return {
    kcal_in: sum('kcal'),
    protein_g: sum('protein_g'),
    carbs_g: sum('carbs_g'),
    fat_g: sum('fat_g'),
    fiber_g: sum('fiber_g'),
    workout_kcal: workouts.reduce((a, w) => a + (w.status === 'done' ? nn(w.kcal) : 0), 0),
    water_ml: nn(daily.water_ml),
    steps: nn(daily.steps),
  };
}

export interface Streaks {
  /** Consecutive days (ending today, or yesterday if today has nothing yet) with at least one meal logged. */
  logging: number;
  /** Same, for days where the water target was reached. */
  water: number;
  /** Today already counts in `logging` (false → the streak is still open today). */
  loggedToday: boolean;
}

/**
 * Streaks from past days (`history`, any order, today excluded) plus today's values.
 * A day "counts" when kcal_in > 0 (logging) / water ≥ target (water). Today extends the
 * streak once it qualifies but never breaks it while the day is still running.
 */
export function computeStreaks(
  history: Pick<RangeSummaryRow, 'day' | 'kcal_in' | 'water_ml'>[],
  today: { date: string; kcalIn: number; waterMl: number; waterTarget: number },
): Streaks {
  const byDay = new Map(history.map((r) => [r.day, r]));
  const run = (ok: (r: Pick<RangeSummaryRow, 'kcal_in' | 'water_ml'>) => boolean, todayOk: boolean) => {
    let n = todayOk ? 1 : 0;
    let d = addDays(today.date, -1);
    for (let guard = 0; guard < 400; guard++) {
      const r = byDay.get(d);
      if (!r || !ok(r)) break;
      n++;
      d = addDays(d, -1);
    }
    return n;
  };
  const loggedToday = nn(today.kcalIn) > 0;
  const wt = today.waterTarget > 0 ? today.waterTarget : DEFAULT_WATER_TARGET;
  return {
    logging: run((r) => nn(r.kcal_in) > 0, loggedToday),
    water: run((r) => nn(r.water_ml) >= wt, nn(today.waterMl) >= wt),
    loggedToday,
  };
}

/** Screen-reader sentence for the calorie gauge (the SVG itself is decorative). */
export function heroSummary(e: Pick<EnergyBalance, 'remaining' | 'eaten' | 'budget' | 'over'>): string {
  const pct = progressPercent(e.eaten, e.budget);
  const head = e.over ? `Đã vượt ${formatNumber(-e.remaining)} kcal` : `Còn ${formatNumber(e.remaining)} kcal`;
  return `${head}. Đã ăn ${formatNumber(e.eaten)} trên ngân sách ${formatNumber(e.budget)} kcal (${pct}%).`;
}
