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
  isCalorieFloored,
  macroKcal,
  MIN_KCAL,
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

/** Beyond ~5 years an ETA is meaningless (tiny deficit vs a large gap) — hide it. */
export const MAX_ETA_WEEKS = 260;

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
  /** Suggested deficit was cut short by the safety floor (1200 nữ / 1500 nam) or by TDEE. */
  floored: boolean;
  /** Safety floor for this sex (kcal). */
  minKcal: number;
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
  const suggested = { kcal, ...suggestMacros(kcal, goal, kg, cm) };
  const eff = d.custom ?? suggested;
  const macros: Macros = { protein_g: eff.protein_g, carbs_g: eff.carbs_g, fat_g: eff.fat_g };
  const delta = eff.kcal - tdee;

  let weeksToTarget: number | null = null;
  const t = d.target_weight_kg;
  if (t && Math.abs(delta) >= 50) {
    const diff = t - kg;
    // Only meaningful when the energy balance points toward the target.
    if ((diff < 0 && delta < 0) || (diff > 0 && delta > 0)) {
      const weeks = Math.ceil(Math.abs(diff) / ((Math.abs(delta) * 7) / KCAL_PER_KG));
      weeksToTarget = weeks <= MAX_ETA_WEEKS ? weeks : null;
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
    floored: d.custom === null && isCalorieFloored(tdee, goal, pace, sex),
    minKcal: MIN_KCAL[sex],
  };
}

/**
 * Plan for a live preview: only computed when the inputs are in range, so a
 * half-typed height ("17" on the way to "170") never flashes an absurd target.
 */
export function previewPlan(d: GoalDraft, today: Date = new Date()): Plan | null {
  if (hasErrors(validateBasics(d, today)) || hasErrors(validateBody(d))) return null;
  return computePlan(d, today);
}

/** Calendar estimate for an ETA in weeks, e.g. "tháng 3/2027" (null if n/a). */
export function targetDateLabel(weeks: number | null | undefined, today: Date = new Date()): string | null {
  if (!weeks || weeks <= 0 || !Number.isFinite(weeks)) return null;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + weeks * 7);
  return `tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
}

/**
 * Starting slider values by sex (≈ Vietnamese adult averages). Used by the
 * onboarding wizard while the body step still shows untouched defaults.
 */
export const SEX_DEFAULTS: Record<Sex, { height_cm: number; weight_kg: number }> = {
  male: { height_cm: 168, weight_kg: 63 },
  female: { height_cm: 157, weight_kg: 52 },
};

/** True when height & weight are still one of the untouched defaults. */
export function hasDefaultBody(d: GoalDraft): boolean {
  const presets = [{ height_cm: EMPTY_DRAFT.height_cm, weight_kg: EMPTY_DRAFT.weight_kg }, ...Object.values(SEX_DEFAULTS)];
  return presets.some((p) => p.height_cm === d.height_cm && p.weight_kg === d.weight_kg);
}

/**
 * Validate a draft restored from storage (older app versions, manual edits or a
 * corrupted value must never crash the wizard or inject out-of-range numbers).
 * Returns null when nothing usable is found.
 */
export function sanitizeDraft(raw: unknown): GoalDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  const birth = typeof r.birth_date === 'string' && isValidISODate(r.birth_date.slice(0, 10)) ? r.birth_date.slice(0, 10) : null;
  let custom: GoalDraft['custom'] = null;
  if (r.custom && typeof r.custom === 'object') {
    const c = r.custom as Record<string, unknown>;
    const kcal = num(c.kcal, 0, 20000);
    const p = num(c.protein_g, LIMITS.macro.min, LIMITS.macro.max);
    const cb = num(c.carbs_g, LIMITS.macro.min, LIMITS.macro.max);
    const f = num(c.fat_g, LIMITS.macro.min, LIMITS.macro.max);
    if (kcal !== null && p !== null && cb !== null && f !== null) custom = { kcal, protein_g: p, carbs_g: cb, fat_g: f };
  }
  return {
    sex: pick<Sex>(r.sex, ['male', 'female']),
    birth_date: birth,
    height_cm: num(r.height_cm, LIMITS.height.min, LIMITS.height.max) ?? EMPTY_DRAFT.height_cm,
    weight_kg: num(r.weight_kg, LIMITS.weight.min, LIMITS.weight.max) ?? EMPTY_DRAFT.weight_kg,
    activity_level: pick<ActivityLevel>(r.activity_level, ['sedentary', 'light', 'moderate', 'active', 'very_active']),
    goal: pick<Goal>(r.goal, ['lose', 'gain', 'maintain', 'recomp']),
    goal_pace: pick<GoalPace>(r.goal_pace, ['slow', 'medium', 'fast']) ?? 'medium',
    target_weight_kg: num(r.target_weight_kg, LIMITS.weight.min, LIMITS.weight.max),
    custom,
    water_ml: num(r.water_ml, LIMITS.water.min, LIMITS.water.max),
    steps: num(r.steps, LIMITS.steps.min, LIMITS.steps.max),
  };
}

/** Index of the first wizard step (0–3) whose data is invalid, or -1. */
export function firstInvalidStep(d: GoalDraft, today: Date = new Date()): number {
  const checks = [validateBasics(d, today), validateBody(d), validateActivity(d), validateGoal(d)];
  return checks.findIndex(hasErrors);
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
  const mx = LIMITS.macro.max;
  const protein_g = clamp(Math.round(m.protein_g * r), 0, mx);
  const fat_g = clamp(Math.round(m.fat_g * r), 0, mx);
  const carbs_g = clamp(Math.round((k - protein_g * 4 - fat_g * 9) / 4), 0, mx);
  const out = { protein_g, carbs_g, fat_g };
  // Per-macro DB caps (1000 g) can make k unreachable → report the real total.
  const real = macroKcal(out);
  return { kcal: Math.abs(real - k) <= 4 ? k : real, ...out };
}

/**
 * Change one macro (grams); kcal is ALWAYS the true 4/4/9 total so the target
 * and the macros never disagree. It may fall outside 800–6000 while the user is
 * editing — {@link validatePlan} blocks saving in that case.
 */
export function setMacro(m: Macros, key: keyof Macros, grams: number): Macros & { kcal: number } {
  const next: Macros = { ...m, [key]: clamp(Math.round(grams), LIMITS.macro.min, LIMITS.macro.max) };
  return { ...next, kcal: macroKcal(next) };
}

/** Plan-level checks before saving (custom totals out of the allowed range). */
export function validatePlan(plan: Plan | null): StepErrors {
  if (!plan) return {};
  if (plan.kcal < LIMITS.kcal.min || plan.kcal > LIMITS.kcal.max)
    return {
      plan: `Tổng calo từ đạm, tinh bột, chất béo đang là ${Math.round(plan.kcal).toLocaleString('vi-VN')} kcal — cần trong khoảng ${LIMITS.kcal.min.toLocaleString('vi-VN')}–${LIMITS.kcal.max.toLocaleString('vi-VN')} kcal.`,
    };
  return {};
}

/** Earliest / latest birth dates allowed (age 13–100), as 'YYYY-MM-DD'. */
export function birthDateBounds(today: Date = new Date()): { min: string; max: string } {
  const iso = (y: number) =>
    `${String(y).padStart(4, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // Born on today's date LIMITS.age.min years ago → exactly that age today.
  const max = iso(today.getFullYear() - LIMITS.age.min);
  // Oldest still "≤ 100": the day after today's date 101 years ago.
  const oldest = new Date(today.getFullYear() - LIMITS.age.max - 1, today.getMonth(), today.getDate() + 1);
  const min = `${oldest.getFullYear()}-${String(oldest.getMonth() + 1).padStart(2, '0')}-${String(oldest.getDate()).padStart(2, '0')}`;
  return { min, max: isValidISODate(max) ? max : iso(today.getFullYear() - LIMITS.age.min).replace(/-29$/, '-28') };
}

function isValidISODate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** Draft from a saved profile (+ latest weight if known). */
export function profileToDraft(p: FitProfile | null, latestWeightKg?: number | null, today: Date = new Date()): GoalDraft {
  if (!p) return { ...EMPTY_DRAFT };
  const weight = latestWeightKg ?? p.start_weight_kg ?? EMPTY_DRAFT.weight_kg;
  const draft: GoalDraft = {
    sex: p.sex,
    birth_date: p.birth_date ? p.birth_date.slice(0, 10) : null,
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
  const plan = computePlan(draft, today);
  // Only a MANUAL plan is kept as-is. A suggested plan (macro_custom = false)
  // follows the current inputs, so a newer weigh-in or a birthday recomputes it
  // (the /goals page then offers to save the refreshed numbers).
  if (plan && p.macro_custom && p.calorie_target != null && p.protein_g != null && p.carbs_g != null && p.fat_g != null) {
    draft.custom = {
      kcal: Number(p.calorie_target),
      protein_g: Number(p.protein_g),
      carbs_g: Number(p.carbs_g),
      fat_g: Number(p.fat_g),
    };
  }
  if (plan && p.water_target_ml != null && p.water_target_ml !== plan.water_ml) draft.water_ml = Number(p.water_target_ml);
  if (plan && p.step_target != null && p.step_target !== plan.steps) draft.steps = Number(p.step_target);
  return draft;
}

/** The fields of a saved profile that {@link draftToPatch} writes, normalised the same way (for dirty checks). */
export function savedPatch(p: FitProfile | null): FitProfilePatch | null {
  if (!p) return null;
  const n = (v: number | string | null | undefined) => (v == null ? null : Number(v));
  return {
    sex: p.sex,
    birth_date: p.birth_date ? p.birth_date.slice(0, 10) : null,
    height_cm: n(p.height_cm),
    activity_level: p.activity_level,
    goal: p.goal,
    goal_pace: p.goal === 'lose' ? (p.goal_pace ?? 'medium') : null,
    target_weight_kg: p.goal === 'maintain' ? null : n(p.target_weight_kg),
    calorie_target: n(p.calorie_target),
    protein_g: n(p.protein_g),
    carbs_g: n(p.carbs_g),
    fat_g: n(p.fat_g),
    macro_custom: Boolean(p.macro_custom),
    water_target_ml: n(p.water_target_ml) as number,
    step_target: n(p.step_target) as number,
  };
}

/** Keys whose values differ between two patches (order-independent). */
export function patchDiff(a: FitProfilePatch | null, b: FitProfilePatch | null): (keyof FitProfilePatch)[] {
  if (!a || !b) return a === b ? [] : ['calorie_target'];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof FitProfilePatch)[]);
  return [...keys].filter((k) => (a[k] ?? null) !== (b[k] ?? null));
}

/** Profile patch to persist (null if the draft is incomplete). */
export function draftToPatch(d: GoalDraft, plan: Plan): FitProfilePatch {
  const target =
    d.goal === 'maintain' || d.target_weight_kg == null ? null : Math.round(clamp(d.target_weight_kg, 20, 400) * 10) / 10;
  const g = (v: number) => clamp(Math.round(v), LIMITS.macro.min, LIMITS.macro.max);
  return {
    sex: d.sex,
    birth_date: d.birth_date,
    height_cm: Math.round((d.height_cm ?? 0) * 10) / 10,
    activity_level: d.activity_level,
    goal: d.goal,
    goal_pace: d.goal === 'lose' ? d.goal_pace : null,
    target_weight_kg: target,
    calorie_target: clamp(Math.round(plan.kcal), LIMITS.kcal.min, LIMITS.kcal.max),
    protein_g: g(plan.macros.protein_g),
    carbs_g: g(plan.macros.carbs_g),
    fat_g: g(plan.macros.fat_g),
    macro_custom: plan.custom,
    water_target_ml: clamp(Math.round(plan.water_ml), LIMITS.water.min, LIMITS.water.max),
    step_target: clamp(Math.round(plan.steps), LIMITS.steps.min, LIMITS.steps.max),
  };
}

/** Validation messages per step (Vietnamese). Empty object = valid. */
export type StepErrors = Partial<
  Record<'sex' | 'birth_date' | 'height' | 'weight' | 'activity' | 'goal' | 'target' | 'plan', string>
>;

export function validateBasics(d: GoalDraft, today: Date = new Date()): StepErrors {
  const e: StepErrors = {};
  if (!d.sex) e.sex = 'Chọn giới tính để tính BMR chính xác.';
  if (!d.birth_date) e.birth_date = 'Nhập ngày sinh của bạn.';
  else if (!isValidISODate(d.birth_date.slice(0, 10))) e.birth_date = 'Ngày sinh chưa hợp lệ.';
  else {
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const age = calcAge(d.birth_date, today);
    if (d.birth_date.slice(0, 10) > todayIso) e.birth_date = 'Ngày sinh không thể ở tương lai.';
    else if (age < LIMITS.age.min) e.birth_date = `Fitora dành cho người từ ${LIMITS.age.min} tuổi trở lên.`;
    else if (age > LIMITS.age.max) e.birth_date = `Ngày sinh chưa hợp lệ (tuổi tối đa ${LIMITS.age.max}).`;
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
    else if (w != null && d.goal === 'lose' && t >= w)
      e.target = `Cân nặng mục tiêu phải thấp hơn hiện tại (${fmtKg(w)} kg). Đã đạt mục tiêu? Hãy chọn Giữ cân.`;
    else if (w != null && d.goal === 'gain' && t <= w)
      e.target = `Cân nặng mục tiêu phải cao hơn hiện tại (${fmtKg(w)} kg). Đã đạt mục tiêu? Hãy chọn Giữ cân.`;
  }
  return e;
}

const fmtKg = (v: number) => (Math.round(v * 10) / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 });

/**
 * Non-blocking health hints for the chosen goal (Vietnamese). Uses Asian BMI
 * cut-offs: losing weight while already underweight, or aiming for a target
 * below BMI 18.5, deserves a warning.
 */
export function goalWarnings(d: GoalDraft): string[] {
  const out: string[] = [];
  const w = d.weight_kg;
  const h = d.height_cm;
  if (!w || !h || !d.goal) return out;
  const bmi = calcBMI(w, h);
  const m = h / 100;
  const healthyMin = Math.ceil(18.5 * m * m * 10) / 10;
  if ((d.goal === 'lose' || d.goal === 'recomp') && bmi > 0 && bmi < 18.5) {
    out.push(`BMI hiện tại ${bmi.toLocaleString('vi-VN')} đã dưới ngưỡng khỏe mạnh — không nên giảm thêm. Cân nhắc Giữ cân hoặc Tăng cân.`);
  } else if (d.goal !== 'maintain' && d.target_weight_kg != null && d.target_weight_kg < healthyMin) {
    out.push(`Cân nặng mục tiêu tương ứng BMI ${calcBMI(d.target_weight_kg, h).toLocaleString('vi-VN')}, dưới ngưỡng khỏe mạnh (từ ${fmtKg(healthyMin)} kg với chiều cao của bạn).`);
  }
  return out;
}

export interface TargetSuggestion {
  kg: number;
  /** Short Vietnamese reason shown next to the value. */
  reason: string;
}

const roundHalf = (v: number) => Math.round(v * 2) / 2;

/**
 * One-tap target weight for "Giảm cân" / "Tăng cân" (Asian BMI cut-offs), so the
 * user does not have to work out a sensible number:
 * - lose, BMI ≥ 23: the top of the normal range (BMI 22,9), but no more than −10 %
 *   at once (a realistic first milestone);
 * - lose, normal BMI: −3 kg, never below BMI 18,5;
 * - gain, BMI < 18,5: the bottom of the normal range, but no more than +10 % at once;
 * - gain, otherwise: +3 kg, never above BMI 24,9.
 * Rounded to 0,5 kg. Null when there is nothing sensible to suggest (e.g. losing
 * while already underweight) or for other goals.
 */
export function suggestTargetWeight(d: GoalDraft): TargetSuggestion | null {
  const w = d.weight_kg;
  const h = d.height_cm;
  if (!w || !h || !(w > 0) || !(h > 0)) return null;
  const m2 = (h / 100) ** 2;
  const bmi = w / m2;
  const lowKg = 18.5 * m2;
  const highKg = 22.9 * m2;
  let kg: number;
  let reason: string;
  if (d.goal === 'lose') {
    if (bmi >= 23) {
      const tenPct = w * 0.9;
      if (tenPct > highKg) {
        kg = roundHalf(tenPct);
        reason = 'mốc đầu tiên: giảm 10%';
      } else {
        kg = roundHalf(highKg);
        reason = 'BMI 22,9 — vừa vào ngưỡng bình thường';
      }
    } else {
      kg = roundHalf(Math.max(w - 3, Math.ceil(lowKg * 2) / 2));
      reason = 'giảm nhẹ 3 kg, vẫn trong ngưỡng khỏe mạnh';
    }
    if (!(kg <= w - 0.5) || kg < LIMITS.weight.min) return null;
  } else if (d.goal === 'gain') {
    if (bmi < 18.5) {
      const tenPct = w * 1.1;
      if (tenPct < lowKg) {
        kg = roundHalf(tenPct);
        reason = 'mốc đầu tiên: tăng 10%';
      } else {
        kg = Math.ceil(lowKg * 2) / 2;
        reason = 'BMI 18,5 — vừa vào ngưỡng bình thường';
      }
    } else {
      kg = roundHalf(Math.min(w + 3, Math.floor(24.9 * m2 * 2) / 2));
      reason = 'tăng 3 kg, chưa vượt ngưỡng thừa cân';
    }
    if (!(kg >= w + 0.5) || kg > LIMITS.weight.max) return null;
  } else {
    return null;
  }
  return { kg, reason };
}

/** True when a target weight points the wrong way for the goal. */
function targetContradicts(goal: Goal | null, target: number | null, weight: number | null): boolean {
  if (target == null || weight == null) return false;
  return (goal === 'lose' && target >= weight) || (goal === 'gain' && target <= weight);
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
  // Switching goal (e.g. lose → gain) makes an old target meaningless: drop it
  // instead of leaving a contradiction that only surfaces as an error on save.
  if ('goal' in patch && patch.goal !== d.goal && !('target_weight_kg' in patch)) {
    if (targetContradicts(next.goal, next.target_weight_kg, next.weight_kg)) next.target_weight_kg = null;
  }
  return next;
}
