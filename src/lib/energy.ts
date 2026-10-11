// Energy & body maths (pure, unit-tested in energy.test.ts).
import type { ActivityLevel, Goal, GoalPace, Sex } from '@/types/db';

/** Age in whole years at `on` (default today). birthDate: 'YYYY-MM-DD'. */
export function calcAge(birthDate: string, on: Date = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate ?? '');
  if (!m) return 0;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < mo || (on.getMonth() + 1 === mo && on.getDate() < d)) age--;
  return Math.max(0, age);
}

/** BMI = kg / m², rounded to 1 decimal. 0 if inputs invalid. */
export function calcBMI(weightKg: number, heightCm: number): number {
  if (!(weightKg > 0) || !(heightCm > 0)) return 0;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export type BmiCategory = 'underweight' | 'normal' | 'overweight' | 'obese';
export const BMI_LABELS: Record<BmiCategory, string> = {
  underweight: 'Thiếu cân',
  normal: 'Bình thường',
  overweight: 'Thừa cân',
  obese: 'Béo phì',
};

/** Asian cut-offs (WHO Western Pacific): <18.5 / <23 / <25 / ≥25. */
export function bmiCategory(bmi: number): { key: BmiCategory; label: string } {
  const key: BmiCategory = bmi < 18.5 ? 'underweight' : bmi < 23 ? 'normal' : bmi < 25 ? 'overweight' : 'obese';
  return { key, label: BMI_LABELS[key] };
}

/** Mifflin–St Jeor BMR (kcal/day), rounded. 0 when weight or height is missing/invalid. */
export function calcBMR(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  if (!(weightKg > 0) || !(heightCm > 0)) return 0;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * Math.max(0, Number(age) || 0);
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function calcTDEE(bmr: number, activity: ActivityLevel): number {
  return Math.round(bmr * (ACTIVITY_FACTORS[activity] ?? 1.2));
}

export const LOSE_DEFICIT: Record<GoalPace, number> = { slow: 250, medium: 500, fast: 750 };
export const GAIN_SURPLUS = 300;
export const MIN_KCAL: Record<Sex, number> = { female: 1200, male: 1500 };
/** Lowest daily target ever proposed (the DB lower bound of fit_profiles.calorie_target). */
export const ABS_MIN_KCAL = 800;
/** Highest daily target ever proposed (the DB upper bound of fit_profiles.calorie_target). */
export const ABS_MAX_KCAL = 6000;

/**
 * Daily calorie target from TDEE.
 * lose: −250/−500/−750 by pace (default medium) · gain: +300 · recomp: −10% · maintain: 0.
 * Floor: 1200 (female) / 1500 (male). Rounded to the nearest 10.
 * A deficit goal (lose / recomp) never ends up ABOVE maintenance: when TDEE itself
 * is below the floor (small, older, sedentary bodies) the target stays at TDEE
 * instead of silently turning a "lose" plan into a surplus.
 * Kept within {@link ABS_MIN_KCAL}–{@link ABS_MAX_KCAL} (800–6000, the DB bounds of
 * calorie_target) so a suggested plan can always be saved, even for extreme bodies.
 */
export function goalCalories(tdee: number, goal: Goal, pace: GoalPace | null | undefined, sex: Sex): number {
  const floor = MIN_KCAL[sex] ?? 1200;
  const planned = plannedCalories(tdee, goal, pace);
  const deficitGoal = goal === 'lose' || goal === 'recomp';
  const kcal = Math.min(ABS_MAX_KCAL, Math.max(deficitGoal ? Math.min(floor, tdee) : floor, planned, ABS_MIN_KCAL));
  return Math.round(kcal / 10) * 10;
}

/** TDEE ± the goal adjustment, before the safety floor. */
function plannedCalories(tdee: number, goal: Goal, pace: GoalPace | null | undefined): number {
  if (goal === 'lose') return tdee - (LOSE_DEFICIT[pace ?? 'medium'] ?? LOSE_DEFICIT.medium);
  if (goal === 'gain') return tdee + GAIN_SURPLUS;
  if (goal === 'recomp') return tdee * 0.9;
  return tdee;
}

/** True when goalCalories had to stop at the safety floor (or at TDEE) instead of the planned deficit. */
export function isCalorieFloored(tdee: number, goal: Goal, pace: GoalPace | null | undefined, sex: Sex): boolean {
  if (goal !== 'lose' && goal !== 'recomp') return false;
  return goalCalories(tdee, goal, pace, sex) > Math.round(plannedCalories(tdee, goal, pace) / 10) * 10;
}

/**
 * Body weight used for protein g/kg. With a lot of body fat, g/kg of TOTAL weight
 * over-shoots (≈240 g/day for a 120 kg person), so above BMI 25 (Asian obesity
 * cut-off) protein is based on the weight at BMI 25 for that height.
 */
export function proteinReferenceKg(weightKg: number, heightCm?: number | null): number {
  if (!(heightCm && heightCm > 0) || !(weightKg > 0)) return weightKg;
  const m = heightCm / 100;
  return Math.min(weightKg, 25 * m * m);
}

export const PROTEIN_PER_KG: Record<Goal, number> = { lose: 2.0, recomp: 2.2, gain: 1.8, maintain: 1.6 };

export interface Macros {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Macro split: protein by g/kg (lose 2.0, recomp 2.2, gain 1.8, maintain 1.6),
 * fat 25% of kcal (30% for gain/maintain), the rest carbs (≥ 0).
 * Protein is capped so that protein + fat never exceed the calorie budget.
 * Pass `heightCm` to base protein on {@link proteinReferenceKg} (recommended).
 * 4P + 4C + 9F lands within ±2 kcal of `kcal` (carbs absorb the rounding).
 */
export function suggestMacros(kcal: number, goal: Goal, weightKg: number, heightCm?: number | null): Macros {
  const fatPct = goal === 'gain' || goal === 'maintain' ? 0.3 : 0.25;
  const fat_g = Math.round((kcal * fatPct) / 9);
  let protein_g = Math.round((PROTEIN_PER_KG[goal] ?? 1.6) * proteinReferenceKg(weightKg, heightCm));
  const maxProtein = Math.floor((kcal - fat_g * 9) / 4);
  if (protein_g > maxProtein) protein_g = Math.max(0, maxProtein);
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return { protein_g, carbs_g, fat_g };
}

/** kcal from macros (4/4/9). */
export function macroKcal(m: Macros): number {
  return Math.round(m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9);
}

/** MET · 3.5 · kg / 200 · minutes, rounded. */
export function metKcal(met: number, weightKg: number, minutes: number): number {
  if (!(met > 0) || !(weightKg > 0) || !(minutes > 0)) return 0;
  return Math.round(((met * 3.5 * weightKg) / 200) * minutes);
}

/** steps · 0.04 · kg / 70, rounded. */
export function stepsKcal(steps: number, weightKg: number): number {
  if (!(steps > 0) || !(weightKg > 0)) return 0;
  return Math.round((steps * 0.04 * weightKg) / 70);
}

/**
 * Calories earned back by activity (PLAN §4): the target already includes the profile's
 * activity factor, so only what goes beyond it counts — max(0, BMR·1.2 + burned − TDEE).
 * Without a BMR / TDEE model the whole burn counts.
 */
export function exerciseBonus(bmr: number | null | undefined, tdee: number | null | undefined, burned: number): number {
  const b = Math.max(0, Number(burned) || 0);
  if (!(bmr && bmr > 0) || !(tdee && tdee > 0)) return Math.round(b);
  return Math.max(0, Math.round(bmr * ACTIVITY_FACTORS.sedentary + b - tdee));
}

/** target − eaten + burned */
export function remainingKcal(target: number, eaten: number, burned: number): number {
  return Math.round((target || 0) - (eaten || 0) + (burned || 0));
}

/** Nutrients for `grams` of a food given per-100 g values. */
export function scalePer100(per100: number, grams: number): number {
  return Math.round(((per100 || 0) * (grams || 0)) / 10) / 10;
}
