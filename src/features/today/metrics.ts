// Pure maths for the Today dashboard (unit-tested in metrics.test.ts).
import { remainingKcal, stepsKcal } from '@/lib/energy';
import type { DaySummary, FitProfile, MealEntry, MealType } from '@/types/db';

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

export interface EnergyBalance {
  target: number;
  eaten: number;
  workoutKcal: number;
  stepsKcal: number;
  /** workout + steps */
  burned: number;
  /** target − eaten + burned (negative = over budget) */
  remaining: number;
  over: boolean;
  /** Budget available today = target + burned. */
  budget: number;
  /** eaten / budget, clamped to [0, 1]. */
  progress: number;
}

export function energyBalance(sum: Pick<DaySummary, 'kcal_in' | 'workout_kcal' | 'steps'>, target: number, weightKg: number): EnergyBalance {
  const eaten = Math.round(Math.max(0, sum.kcal_in || 0));
  const workoutKcal = Math.round(Math.max(0, sum.workout_kcal || 0));
  const fromSteps = stepsKcal(sum.steps || 0, weightKg);
  const burned = workoutKcal + fromSteps;
  const remaining = remainingKcal(target, eaten, burned);
  const budget = Math.max(0, target + burned);
  const progress = budget > 0 ? Math.max(0, Math.min(1, eaten / budget)) : eaten > 0 ? 1 : 0;
  return { target, eaten, workoutKcal, stepsKcal: fromSteps, burned, remaining, over: remaining < 0, budget, progress };
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
