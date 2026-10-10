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

/** Mifflin–St Jeor BMR (kcal/day), rounded. */
export function calcBMR(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
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

/**
 * Daily calorie target from TDEE.
 * lose: −250/−500/−750 by pace (default medium) · gain: +300 · recomp: −10% · maintain: 0.
 * Floor: 1200 (female) / 1500 (male). Rounded to the nearest 10.
 */
export function goalCalories(tdee: number, goal: Goal, pace: GoalPace | null | undefined, sex: Sex): number {
  let kcal = tdee;
  if (goal === 'lose') kcal = tdee - LOSE_DEFICIT[pace ?? 'medium'];
  else if (goal === 'gain') kcal = tdee + GAIN_SURPLUS;
  else if (goal === 'recomp') kcal = tdee * 0.9;
  kcal = Math.max(MIN_KCAL[sex] ?? 1200, kcal);
  return Math.round(kcal / 10) * 10;
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
 */
export function suggestMacros(kcal: number, goal: Goal, weightKg: number): Macros {
  const fatPct = goal === 'gain' || goal === 'maintain' ? 0.3 : 0.25;
  const fat_g = Math.round((kcal * fatPct) / 9);
  let protein_g = Math.round((PROTEIN_PER_KG[goal] ?? 1.6) * weightKg);
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

/** target − eaten + burned */
export function remainingKcal(target: number, eaten: number, burned: number): number {
  return Math.round((target || 0) - (eaten || 0) + (burned || 0));
}

/** Nutrients for `grams` of a food given per-100 g values. */
export function scalePer100(per100: number, grams: number): number {
  return Math.round(((per100 || 0) * (grams || 0)) / 10) / 10;
}
