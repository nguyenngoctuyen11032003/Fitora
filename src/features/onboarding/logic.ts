// Onboarding / goal-setting pure logic. All energy maths comes from @/lib/energy.
import {
  ACTIVITY_FACTORS,
  GAIN_SURPLUS,
  LOSE_DEFICIT,
  bmiCategory,
  calcAge,
  calcBMI,
  calcBMR,
  calcTDEE,
  goalCalories,
  macroKcal,
  suggestMacros,
  type BmiCategory,
  type Macros,
} from '@/lib/energy';
import type { ActivityLevel, FitProfile, FitProfilePatch, Goal, GoalPace, Sex } from '@/types/db';

/** Editable state shared by the onboarding flow and /goals. */
export interface GoalDraft {
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  goal_pace: GoalPace;
  target_weight_kg: number | null;
  /** Manual override of kcal + macros (null = use suggestion). */
  custom: (Macros & { kcal: number }) | null;
  /** Manual override of water / steps targets (null = suggestion). */
  water_ml: number | null;
  steps: number | null;
}

export const LIMITS = {
  height: { min: 120, max: 230 },
  weight: { min: 30, max: 300 },
  age: { min: 13, max: 100 },
  kcal: { min: 800, max: 6000 },
  macro: { min: 0, max: 1000 },
  water: { min: 500, max: 8000 },
  steps: { min: 1000, max: 50000 },
} as const;

/** kcal stored in 1 kg of body fat (approx.). */
export const KCAL_PER_KG = 7700;

export const EMPTY_DRAFT: GoalDraft = {
  sex: null,
  birth_date: null,
  height_cm: 165,
  weight_kg: 60,
  activity_level: null,
  goal: null,
  goal_pace: 'medium',
  target_weight_kg: null,
  custom: null,
  water_ml: null,
  steps: null,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Weekly weight change (kg/week, positive) for a daily kcal delta, rounded to 0.05. */
export function kgPerWeek(dailyDelta: number): number {
  return Math.round(((Math.abs(dailyDelta) * 7) / KCAL_PER_KG) * 20) / 20;
}

export const PACE_KG_WEEK: Record<GoalPace, number> = {
  slow: kgPerWeek(LOSE_DEFICIT.slow),
  medium: kgPerWeek(LOSE_DEFICIT.medium),
  fast: kgPerWeek(LOSE_DEFICIT.fast),
};
export const GAIN_KG_WEEK = kgPerWeek(GAIN_SURPLUS);

/** Suggested water: 35 ml/kg (+300 ml if very active), rounded to 100, 1.5–4 L. */
export function suggestWater(weightKg: number, activity: ActivityLevel | null): number {
  if (!(weightKg > 0)) return 2000;
  const extra = activity === 'active' || activity === 'very_active' ? 300 : 0;
  return clamp(Math.round((weightKg * 35 + extra) / 100) * 100, 1500, 4000);
}

const STEP_BASE: Record<ActivityLevel, number> = {
  sedentary: 6000,
  light: 7500,
  moderate: 9000,
  active: 10000,
  very_active: 12000,
};

/** Suggested daily steps by activity (+1000 when losing weight). */
export function suggestSteps(activity: ActivityLevel | null, goal: Goal | null): number {
  const base = activity ? STEP_BASE[activity] : 8000;
  return base + (goal === 'lose' ? 1000 : 0);
}

export interface Plan {
  age: number;
  bmi: number;
  bmiKey: BmiCategory;
  bmiLabel: string;
  bmr: number;
  tdee: number;
  /** Suggested values (before manual override). */
  suggested: Macros & { kcal: number };
  /** Effective values (override or suggestion). */
  kcal: number;
  macros: Macros;
  custom: boolean;
  water_ml: number;
  steps: number;
  /** kcal/day vs TDEE (negative = deficit). */
  delta: number;
  /** Estimated weeks to reach the target weight (null if n/a). */
  weeksToTarget: number | null;
}

/** True when the draft has everything needed to compute a plan. */
export function isComplete(d: GoalDraft): boolean {
  return Boolean(d.sex && d.birth_date && d.height_cm && d.weight_kg && d.activity_level && d.goal);
}

/** Full plan from a draft (null if incomplete). */
export function computePlan(d: GoalDraft, today: Date = new Date()): Plan | null {
  if (!isComplete(d)) return null;
  const sex = d.sex as Sex;
  const goal = d.goal as Goal;
  const activity = d.activity_level as ActivityLevel;
  const kg = d.weight_kg as number;
  const cm = d.height_cm as number;
  const age = calcAge(d.birth_date as string, today);
  const bmi = calcBMI(kg, cm);
  const cat = bmiCategory(bmi);
  const bmr = calcBMR(sex, kg, cm, age);
  const tdee = calcTDEE(bmr, activity);
  const pace = goal === 'lose' ? d.goal_pace : null;
  const kcal = goalCalories(tdee, goal, pace, sex);
  const suggested = { kcal, ...suggestMacros(kcal, goal, kg) };
  const eff = d.custom ?? suggested;
  const macros: Macros = { protein_g: eff.protein_g, carbs_g: eff.carbs_g, fat_g: eff.fat_g };
  const delta = eff.kcal - tdee;

  let weeksToTarget: number | null = null;
  const t = d.target_weight_kg;
  if (t && Math.abs(delta) >= 50) {
    const diff = t - kg;
    // Only meaningful when the energy balance points toward the target.
    if ((diff < 0 && delta < 0) || (diff > 0 && delta > 0)) {
      weeksToTarget = Math.ceil(Math.abs(diff) / ((Math.abs(delta) * 7) / KCAL_PER_KG));
    }
  }

  return {
    age,
    bmi,
    bmiKey: cat.key,
    bmiLabel: cat.label,
    bmr,
    tdee,
    suggested,
    kcal: eff.kcal,
    macros,
    custom: d.custom !== null,
    water_ml: d.water_ml ?? suggestWater(kg, activity),
    steps: d.steps ?? suggestSteps(activity, goal),
    delta,
    weeksToTarget,
  };
}

/** Share of kcal from each macro, in whole % (sums to ~100). */
export function macroPercents(m: Macros): Macros {
  const total = macroKcal(m);
  if (!total) return { protein_g: 0, carbs_g: 0, fat_g: 0 };
  return {
    protein_g: Math.round(((m.protein_g * 4) / total) * 100),
    carbs_g: Math.round(((m.carbs_g * 4) / total) * 100),
    fat_g: Math.round(((m.fat_g * 9) / total) * 100),
  };
}

/**
 * New kcal target → scale every macro by the same ratio, then let carbs absorb
 * the rounding so that 4P + 4C + 9F stays as close to kcal as possible.
 */
export function scaleMacrosToKcal(m: Macros, kcal: number): Macros & { kcal: number } {
  const k = clamp(Math.round(kcal), LIMITS.kcal.min, LIMITS.kcal.max);
  const cur = macroKcal(m);
  if (!cur) {
    // Nothing to scale from: 25/50/25 split.
    return { kcal: k, protein_g: Math.round((k * 0.25) / 4), carbs_g: Math.round((k * 0.5) / 4), fat_g: Math.round((k * 0.25) / 9) };
  }
  const r = k / cur;
  const protein_g = Math.round(m.protein_g * r);
  const fat_g = Math.round(m.fat_g * r);
  const carbs_g = Math.max(0, Math.round((k - protein_g * 4 - fat_g * 9) / 4));
  return { kcal: k, protein_g, carbs_g, fat_g };
}

/** Change one macro (grams); kcal follows from 4/4/9 (clamped to the DB range). */
export function setMacro(m: Macros, key: keyof Macros, grams: number): Macros & { kcal: number } {
  const next: Macros = { ...m, [key]: clamp(Math.round(grams), LIMITS.macro.min, LIMITS.macro.max) };
  return { ...next, kcal: clamp(macroKcal(next), LIMITS.kcal.min, LIMITS.kcal.max) };
}

/** Draft from a saved profile (+ latest weight if known). */
export function profileToDraft(p: FitProfile | null, latestWeightKg?: number | null): GoalDraft {
  if (!p) return { ...EMPTY_DRAFT };
  const weight = latestWeightKg ?? p.start_weight_kg ?? EMPTY_DRAFT.weight_kg;
  const draft: GoalDraft = {
    sex: p.sex,
    birth_date: p.birth_date,
    height_cm: p.height_cm != null ? Number(p.height_cm) : EMPTY_DRAFT.height_cm,
    weight_kg: weight != null ? Number(weight) : null,
    activity_level: p.activity_level,
    goal: p.goal,
    goal_pace: p.goal_pace ?? 'medium',
    target_weight_kg: p.target_weight_kg != null ? Number(p.target_weight_kg) : null,
    custom: null,
    water_ml: null,
    steps: null,
  };
  const plan = computePlan(draft);
  if (plan && p.calorie_target != null && p.protein_g != null && p.carbs_g != null && p.fat_g != null) {
    const saved = { kcal: p.calorie_target, protein_g: p.protein_g, carbs_g: p.carbs_g, fat_g: p.fat_g };
    const s = plan.suggested;
    const same = saved.kcal === s.kcal && saved.protein_g === s.protein_g && saved.carbs_g === s.carbs_g && saved.fat_g === s.fat_g;
    if (p.macro_custom || !same) draft.custom = saved;
  }
  if (plan && p.water_target_ml !== plan.water_ml) draft.water_ml = p.water_target_ml;
  if (plan && p.step_target !== plan.steps) draft.steps = p.step_target;
  return draft;
}

/** Profile patch to persist (null if the draft is incomplete). */
export function draftToPatch(d: GoalDraft, plan: Plan): FitProfilePatch {
  const target =
    d.goal === 'maintain' || d.target_weight_kg == null ? null : Math.round(clamp(d.target_weight_kg, 20, 400) * 10) / 10;
  return {
    sex: d.sex,
    birth_date: d.birth_date,
    height_cm: Math.round((d.height_cm ?? 0) * 10) / 10,
    activity_level: d.activity_level,
    goal: d.goal,
    goal_pace: d.goal === 'lose' ? d.goal_pace : null,
    target_weight_kg: target,
    calorie_target: clamp(Math.round(plan.kcal), LIMITS.kcal.min, LIMITS.kcal.max),
    protein_g: plan.macros.protein_g,
    carbs_g: plan.macros.carbs_g,
    fat_g: plan.macros.fat_g,
    macro_custom: plan.custom,
    water_target_ml: Math.round(plan.water_ml),
    step_target: Math.round(plan.steps),
  };
}

/** Validation messages per step (Vietnamese). Empty object = valid. */
export type StepErrors = Partial<Record<'sex' | 'birth_date' | 'height' | 'weight' | 'activity' | 'goal' | 'target', string>>;

export function validateBasics(d: GoalDraft, today: Date = new Date()): StepErrors {
  const e: StepErrors = {};
  if (!d.sex) e.sex = 'Chọn giới tính để tính BMR chính xác.';
  if (!d.birth_date) e.birth_date = 'Nhập ngày sinh của bạn.';
  else {
    const age = calcAge(d.birth_date, today);
    if (age < LIMITS.age.min) e.birth_date = `Fitora dành cho người từ ${LIMITS.age.min} tuổi trở lên.`;
    else if (age > LIMITS.age.max) e.birth_date = 'Ngày sinh chưa hợp lệ.';
  }
  return e;
}

export function validateBody(d: GoalDraft): StepErrors {
  const e: StepErrors = {};
  const h = d.height_cm;
  const w = d.weight_kg;
  if (h == null || h < LIMITS.height.min || h > LIMITS.height.max)
    e.height = `Chiều cao từ ${LIMITS.height.min} đến ${LIMITS.height.max} cm.`;
  if (w == null || w < LIMITS.weight.min || w > LIMITS.weight.max)
    e.weight = `Cân nặng từ ${LIMITS.weight.min} đến ${LIMITS.weight.max} kg.`;
  return e;
}

export function validateActivity(d: GoalDraft): StepErrors {
  return d.activity_level ? {} : { activity: 'Chọn mức vận động gần đúng nhất.' };
}

export function validateGoal(d: GoalDraft): StepErrors {
  const e: StepErrors = {};
  if (!d.goal) e.goal = 'Chọn một mục tiêu.';
  const t = d.target_weight_kg;
  const w = d.weight_kg;
  if (t != null && d.goal && d.goal !== 'maintain') {
    if (t < LIMITS.weight.min || t > LIMITS.weight.max) e.target = `Cân nặng mục tiêu từ ${LIMITS.weight.min} đến ${LIMITS.weight.max} kg.`;
    else if (w != null && d.goal === 'lose' && t >= w) e.target = 'Mục tiêu giảm cân nên thấp hơn cân nặng hiện tại.';
    else if (w != null && d.goal === 'gain' && t <= w) e.target = 'Mục tiêu tăng cân nên cao hơn cân nặng hiện tại.';
  }
  return e;
}

export const hasErrors = (e: StepErrors) => Object.keys(e).length > 0;

/** Position (0–1) of a BMI on the 15–35 gauge. */
export function bmiGaugePos(bmi: number): number {
  return clamp((bmi - 15) / 20, 0, 1);
}

export { ACTIVITY_FACTORS };

const UPSTREAM: (keyof GoalDraft)[] = ['sex', 'birth_date', 'height_cm', 'weight_kg', 'activity_level', 'goal', 'goal_pace'];

/**
 * Merge a patch into the draft. Changing any input that feeds the suggestion
 * (body, activity, goal, pace) drops manual overrides so the plan recomputes live.
 */
export function applyPatch(d: GoalDraft, patch: Partial<GoalDraft>): GoalDraft {
  const next = { ...d, ...patch };
  const upstream = UPSTREAM.some((k) => k in patch && patch[k] !== d[k]);
  if (upstream) {
    if (!('custom' in patch)) next.custom = null;
    if (!('water_ml' in patch)) next.water_ml = null;
    if (!('steps' in patch)) next.steps = null;
  }
  return next;
}
