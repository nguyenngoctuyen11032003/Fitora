// Pure aggregation for the Progress / Reports screen (unit-tested in lib.test.ts).
// All dates are local 'YYYY-MM-DD' strings.
//
// Energy model (kept deliberately conservative so the estimate does not over-promise):
//  - Maintenance (TDEE) = Mifflin–St Jeor BMR × activity factor of the profile. That factor already
//    covers the user's *usual* activity (steps, typical training).
//  - Daily expenditure = max(TDEE, BMR × 1.2 + logged activity). Logged workouts/steps only raise the
//    estimate when they exceed what the activity level already assumes — no double counting.
//  - Only *complete* days count for balance and averages: past days (today is still in progress)
//    whose intake looks like a full day of logging. Unlogged days are never treated as 0 kcal eaten.
//
// Averaging conventions (labelled in the UI):
//  - Intake / macros: per complete logged day ("TB trên N ngày ghi đủ") — never per calendar day.
//  - Activity: per tracked day (food, steps or workout logged).
//  - Adherence (logging, on-target, water, steps): per *elapsed* calendar day of the period.
//  - Weeks are ISO (Monday–Sunday); all date math is local, on 'YYYY-MM-DD' strings (no UTC drift).

import { addDays, diffDays, endOfMonth, endOfWeek, formatMonthVi, parseISODate, rangeDays, startOfMonth, startOfWeek, weekdayShort } from '@/lib/date';
import { ACTIVITY_FACTORS, calcAge, calcBMI, calcBMR, GAIN_SURPLUS, LOSE_DEFICIT, stepsKcal } from '@/lib/energy';
import type { FitProfile, Goal, RangeSummaryRow } from '@/types/db';

/** kcal ≈ 1 kg of body mass. */
export const KCAL_PER_KG = 7700;
/** A day counts as "on target" when intake is within ±10 % of its budget (target + burned). */
export const ON_TARGET_TOLERANCE = 0.1;
/** Fewer complete days than this → no verdict. */
export const MIN_DAYS_FOR_VERDICT = 3;
/** A past day whose intake is below this share of the calorie target is treated as "not fully logged". */
export const PARTIAL_DAY_RATIO = 0.4;
/** Same threshold when no calorie target is set. */
export const PARTIAL_DAY_FALLBACK_KCAL = 800;
/** Activity factor of the resting baseline used to add logged activity on top of BMR. */
const BASE_FACTOR = ACTIVITY_FACTORS.sedentary;

export type Period = 'week' | 'month';

// ───────────────────────── Period helpers ─────────────────────────

export function periodRange(period: Period, anchor: string): { from: string; to: string } {
  return period === 'week'
    ? { from: startOfWeek(anchor), to: endOfWeek(anchor) }
    : { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

/** Move the anchor one period back (−1) or forward (+1); always lands on the period start. */
export function shiftPeriod(period: Period, anchor: string, dir: -1 | 1): string {
  if (period === 'week') return addDays(startOfWeek(anchor), dir * 7);
  const d = parseISODate(startOfMonth(anchor));
  d.setMonth(d.getMonth() + dir);
  return startOfMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`);
}

/** True when there is a later period that has already started. */
export function canGoNext(period: Period, anchor: string, today: string): boolean {
  return periodRange(period, anchor).to < today;
}

export function isCurrentPeriod(period: Period, anchor: string, today: string): boolean {
  const { from, to } = periodRange(period, anchor);
  return from <= today && today <= to;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "30/09" */
export function ddmm(date: string): string {
  const d = parseISODate(date);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** Main label: week "30/09 – 06/10", month "Tháng 10, 2026". */
export function periodLabel(period: Period, anchor: string): string {
  const { from, to } = periodRange(period, anchor);
  return period === 'week' ? `${ddmm(from)} – ${ddmm(to)}` : formatMonthVi(from);
}

/** Secondary label: "Tuần này" / "Tuần trước" / "3 tuần trước" / "Tháng này" / "Tháng trước" / "N tháng trước". */
export function periodCaption(period: Period, anchor: string, today: string): string {
  const { from } = periodRange(period, anchor);
  if (period === 'week') {
    const weeks = Math.round(diffDays(from, startOfWeek(today)) / 7);
    if (weeks <= 0) return 'Tuần này';
    if (weeks === 1) return 'Tuần trước';
    return `${weeks} tuần trước`;
  }
  const a = parseISODate(from);
  const t = parseISODate(today);
  const months = (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());
  if (months <= 0) return 'Tháng này';
  if (months === 1) return 'Tháng trước';
  return `${months} tháng trước`;
}

// ───────────────────────── Aggregation ─────────────────────────

export type ProfileTargets = Pick<
  FitProfile,
  | 'sex'
  | 'birth_date'
  | 'height_cm'
  | 'activity_level'
  | 'goal'
  | 'goal_pace'
  | 'start_weight_kg'
  | 'calorie_target'
  | 'protein_g'
  | 'carbs_g'
  | 'fat_g'
  | 'water_target_ml'
  | 'step_target'
>;

export interface DayPoint {
  day: string;
  /** Short axis label: "T2" (week) or "7" (month). */
  tick: string;
  future: boolean;
  isToday: boolean;
  /** Has any food logged. */
  logged: boolean;
  /** Past day with a plausible full day of logging → used for balance & averages. */
  complete: boolean;
  /** Past day with some food logged but too little to be a full day. */
  partial: boolean;
  kcalIn: number | null;
  workoutKcal: number;
  stepsKcal: number;
  /** workout + steps (null for future days). */
  burned: number | null;
  /** Estimated total expenditure of the day (null if unknown or future). */
  expenditure: number | null;
  /** Day budget = target + burned (null if no target or future). */
  budget: number | null;
  onTarget: boolean;
  water: number;
  steps: number;
  weight: number | null;
  bmi: number | null;
  /** Linear-regression weight trend (only between the first and last weigh-in of the period). */
  weightTrend: number | null;
}

export interface MacroSplit {
  /** Share of macro energy (P×4, C×4, F×9) in whole percent; sums to 100. */
  protein: number;
  carbs: number;
  fat: number;
}

export interface WeightTrend {
  /** Least-squares slope in kg per week. */
  slopeKgPerWeek: number;
  /** Fitted weight at `x0`. */
  intercept: number;
  /** Day the regression x-axis starts at (first weigh-in). */
  x0: string;
}

export type VerdictTone = 'good' | 'warn' | 'bad' | 'neutral';
export interface Verdict {
  tone: VerdictTone;
  title: string;
  text: string;
}

export interface ReportSummary {
  from: string;
  to: string;
  days: DayPoint[];
  /** Days of the period up to today. */
  elapsedDays: number;
  /** Days with any food logged (today included). */
  loggedDays: number;
  /** Complete days: the basis of balance, averages and the verdict. */
  countedDays: number;
  /** Past days logged but with too little intake to count. */
  partialDays: number;
  /** Intake below which a past day is considered not fully logged. */
  partialThreshold: number;
  /** Today is in this period and has food logged (shown, but not counted yet). */
  todayPending: boolean;
  /** Daily calorie target (null if not set). */
  target: number | null;
  /** Estimated daily maintenance (TDEE) and how it was obtained. */
  maintenance: number | null;
  maintenanceBasis: 'profile' | 'target' | null;
  /** Planned daily balance of the goal: target − maintenance (e.g. −500 when losing). */
  plannedDailyBalance: number | null;
  /** Σ over complete days of kcal_in − expenditure. Negative = deficit. */
  balance: number;
  avgDailyBalance: number;
  /** Average expenditure over complete days. */
  avgExpenditure: number;
  /** Σ over complete days of kcal_in − target (food only). */
  vsTarget: number;
  /** Average intake − target over complete days. */
  avgDailyVsTarget: number;
  /** balance / 7700, 2 decimals. */
  estWeightChangeKg: number;
  /** Estimated change per week at the current average balance. */
  estWeeklyChangeKg: number;
  totalIn: number;
  totalBurned: number;
  /** Average intake over the averaging basis (complete days, else every logged day). */
  avgIn: number;
  /** Average workout + steps kcal over tracked days. */
  avgBurned: number;
  /** Elapsed days with any data (food, steps or workout). */
  trackedDays: number;
  avgMacros: { protein_g: number; carbs_g: number; fat_g: number };
  /** Number of days behind avgIn/avgMacros and whether they include unfinished days. */
  avgBasisDays: number;
  avgBasisIncomplete: boolean;
  onTargetDays: number;
  longestStreak: number;
  waterHitDays: number;
  waterTarget: number;
  stepDays: number;
  avgSteps: number;
  stepHitDays: number;
  stepTarget: number;
  weightPoints: { day: string; weight: number; bmi: number | null }[];
  weightFirst: number | null;
  weightLast: number | null;
  weightDelta: number | null;
  bmiLast: number | null;
  /** Least-squares weight trend over the period (null when too few / too close weigh-ins). */
  weightTrend: WeightTrend | null;
  /** Energy share of the average macros (null when nothing logged). */
  macroSplit: MacroSplit | null;
  /** loggedDays / elapsedDays (0–1). */
  loggingRate: number;
  /** onTargetDays / elapsedDays (0–1). */
  onTargetRate: number;
  /** Consecutive logged days ending today (or yesterday while today is still empty). */
  currentStreak: number;
  /** Complete day whose intake was closest to its budget (null without a target). */
  bestDay: { day: string; kcalIn: number; budget: number } | null;
  verdict: Verdict;
}

export interface BuildInput {
  rows: RangeSummaryRow[];
  from: string;
  to: string;
  period: Period;
  today: string;
  profile: ProfileTargets | null;
  /** Reference body weight for TDEE / steps kcal (latest known). */
  refWeightKg: number | null;
}

export interface Maintenance {
  /** TDEE (kcal/day) or null. */
  kcal: number | null;
  /** BMR when computed from the profile (null on the target fallback). */
  bmr: number | null;
  basis: 'profile' | 'target' | null;
}

/** Daily maintenance kcal: Mifflin–St Jeor × activity when the profile is complete, else inverted from the goal target. */
export function estimateMaintenance(profile: ProfileTargets | null, weightKg: number | null, today: string): Maintenance {
  if (!profile) return { kcal: null, bmr: null, basis: null };
  const w = weightKg ?? (profile.start_weight_kg != null ? Number(profile.start_weight_kg) : null);
  if (profile.sex && profile.birth_date && profile.height_cm && profile.activity_level && w && w > 0) {
    const age = calcAge(profile.birth_date, parseISODate(today));
    const bmr = calcBMR(profile.sex, w, Number(profile.height_cm), age);
    return { kcal: Math.round(bmr * (ACTIVITY_FACTORS[profile.activity_level] ?? BASE_FACTOR)), bmr, basis: 'profile' };
  }
  const t = profile.calorie_target;
  if (!t || !profile.goal) return { kcal: null, bmr: null, basis: null };
  const kcal =
    profile.goal === 'lose'
      ? t + LOSE_DEFICIT[profile.goal_pace ?? 'medium']
      : profile.goal === 'gain'
        ? t - GAIN_SURPLUS
        : profile.goal === 'recomp'
          ? Math.round(t / 0.9)
          : t;
  return { kcal, bmr: null, basis: 'target' };
}

/**
 * Estimated expenditure of one day. With a BMR, logged activity is added on top of a sedentary
 * baseline and the result never drops below TDEE (the activity level already covers usual activity).
 * Without a BMR (target fallback) the logged activity is added to the maintenance estimate.
 */
export function dayExpenditure(m: Maintenance, burned: number): number | null {
  if (m.kcal == null) return null;
  if (m.bmr != null) return Math.max(m.kcal, Math.round(m.bmr * BASE_FACTOR + burned));
  return Math.round(m.kcal + burned);
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Minimum span between first and last weigh-in before a slope is reported. */
export const MIN_TREND_SPAN_DAYS = 4;

/**
 * Least-squares weight slope (kg/week). Requires ≥ 3 weigh-ins spanning ≥ 4 days, or 2 weigh-ins
 * ≥ 7 days apart — readings only a day or two apart are dominated by water fluctuations.
 */
export function weightTrend(points: { day: string; weight: number }[]): WeightTrend | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const x0 = sorted[0].day;
  const xs = sorted.map((p) => diffDays(x0, p.day));
  const span = xs[xs.length - 1];
  if (span < MIN_TREND_SPAN_DAYS || (sorted.length < 3 && span < 7)) return null;
  const n = sorted.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = sorted.reduce((a, p) => a + p.weight, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (sorted[i].weight - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const perDay = num / den;
  return { slopeKgPerWeek: r2(perDay * 7), intercept: my - perDay * mx, x0 };
}

/** Energy share of macros in whole percent (largest-remainder rounding so the parts sum to 100). */
export function macroSplit(m: { protein_g: number; carbs_g: number; fat_g: number }): MacroSplit | null {
  const kc = [Math.max(0, m.protein_g) * 4, Math.max(0, m.carbs_g) * 4, Math.max(0, m.fat_g) * 9];
  const total = kc[0] + kc[1] + kc[2];
  if (!(total > 0)) return null;
  const raw = kc.map((k) => (k / total) * 100);
  const out = raw.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return { protein: out[0], carbs: out[1], fat: out[2] };
}

export function buildReport({ rows, from, to, period, today, profile, refWeightKg }: BuildInput): ReportSummary {
  // Rows may arrive unordered or with a timestamp suffix → normalise, clip to the range and sort by day.
  const sortedRows = rows
    .map((r) => ({ ...r, day: r.day.slice(0, 10) }))
    .filter((r) => r.day >= from && r.day <= to)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const byDay = new Map(sortedRows.map((r) => [r.day, r]));
  const target = profile?.calorie_target && profile.calorie_target > 0 ? Number(profile.calorie_target) : null;
  const height = profile?.height_cm ? Number(profile.height_cm) : null;
  const waterTarget = profile?.water_target_ml ?? 2000;
  const stepTarget = profile?.step_target ?? 8000;
  const partialThreshold = target != null ? Math.round(target * PARTIAL_DAY_RATIO) : PARTIAL_DAY_FALLBACK_KCAL;

  // Body weight of the period: latest weigh-in inside the range, else the latest known, else the start weight.
  const weightsInRange = sortedRows.filter((r) => r.day <= today && r.weight_kg != null && r.weight_kg > 0);
  const periodWeight = weightsInRange.length
    ? Number(weightsInRange[weightsInRange.length - 1].weight_kg)
    : refWeightKg ?? (profile?.start_weight_kg != null ? Number(profile.start_weight_kg) : null);
  const stepWeight = periodWeight ?? 0;
  const maint = estimateMaintenance(profile, periodWeight, today);

  const days: DayPoint[] = rangeDays(from, to).map((day) => {
    const r = byDay.get(day);
    const future = day > today;
    const isToday = day === today;
    const kcalIn = r ? Number(r.kcal_in) || 0 : 0;
    const workoutKcal = r ? Number(r.workout_kcal) || 0 : 0;
    const steps = r ? Number(r.steps) || 0 : 0;
    // Today's step kcal must match Today/Workout, which use the latest weigh-in overall (refWeightKg).
    const sk = stepsKcal(steps, isToday && refWeightKg != null && refWeightKg > 0 ? refWeightKg : stepWeight);
    const burned = future ? null : Math.round(workoutKcal + sk);
    const logged = !future && kcalIn > 0;
    const complete = logged && !isToday && kcalIn >= partialThreshold;
    const budget = target != null && !future ? target + (burned ?? 0) : null;
    const weight = r?.weight_kg != null && r.weight_kg > 0 ? Number(r.weight_kg) : null;
    return {
      day,
      tick: period === 'week' ? weekdayShort(day) : String(parseISODate(day).getDate()),
      future,
      isToday,
      logged,
      complete,
      partial: logged && !isToday && !complete,
      kcalIn: future ? null : Math.round(kcalIn),
      workoutKcal: future ? 0 : Math.round(workoutKcal),
      stepsKcal: future ? 0 : sk,
      burned,
      expenditure: future ? null : dayExpenditure(maint, burned ?? 0),
      budget,
      onTarget: logged && budget != null && budget > 0 && Math.abs(kcalIn - budget) <= budget * ON_TARGET_TOLERANCE,
      water: future ? 0 : r ? Number(r.water_ml) || 0 : 0,
      steps: future ? 0 : steps,
      weight: future ? null : weight,
      bmi: !future && weight && height ? calcBMI(weight, height) : null,
      weightTrend: null,
    };
  });

  const elapsed = days.filter((d) => !d.future);
  const logged = elapsed.filter((d) => d.logged);
  const counted = elapsed.filter((d) => d.complete);
  const n = counted.length;
  // Averages: complete days when there are some; otherwise every logged day (e.g. only today so far).
  const avgBasis = n > 0 ? counted : logged;
  const nb = avgBasis.length;

  let totalIn = 0;
  let p = 0;
  let c = 0;
  let f = 0;
  for (const d of avgBasis) {
    const row = byDay.get(d.day)!;
    totalIn += d.kcalIn ?? 0;
    p += Number(row.protein_g) || 0;
    c += Number(row.carbs_g) || 0;
    f += Number(row.fat_g) || 0;
  }
  const countedIn = counted.reduce((s, d) => s + (d.kcalIn ?? 0), 0);
  const countedExp = counted.reduce((s, d) => s + (d.expenditure ?? 0), 0);
  const totalBurned = elapsed.reduce((s, d) => s + (d.burned ?? 0), 0);
  // Activity average only over tracked days (food, steps or a workout) — untracked days are unknown, not 0.
  const tracked = elapsed.filter((d) => d.logged || d.steps > 0 || d.workoutKcal > 0);

  const balance = maint.kcal != null && n ? Math.round(countedIn - countedExp) : 0;
  const vsTarget = target != null && n ? Math.round(countedIn - target * n) : 0;
  const avgDailyBalance = n ? Math.round(balance / n) : 0;

  // Longest run of consecutive logged days inside the period.
  let longestStreak = 0;
  let run = 0;
  for (const d of elapsed) {
    run = d.logged ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }

  const stepDaysArr = elapsed.filter((d) => d.steps > 0);
  const weightPoints = days.filter((d) => d.weight != null).map((d) => ({ day: d.day, weight: d.weight as number, bmi: d.bmi }));
  const trend = weightTrend(weightPoints);
  if (trend) {
    const lastWeighIn = weightPoints[weightPoints.length - 1].day;
    for (const d of days) {
      if (d.day >= trend.x0 && d.day <= lastWeighIn) {
        d.weightTrend = r2(trend.intercept + (trend.slopeKgPerWeek / 7) * diffDays(trend.x0, d.day));
      }
    }
  }

  // Current streak: consecutive logged days ending today (an empty today does not break it yet).
  let currentStreak = 0;
  for (let i = elapsed.length - 1; i >= 0; i--) {
    const d = elapsed[i];
    if (d.logged) currentStreak++;
    else if (d.isToday && currentStreak === 0) continue;
    else break;
  }

  let bestDay: ReportSummary['bestDay'] = null;
  for (const d of counted) {
    if (d.budget == null || d.kcalIn == null) continue;
    if (!bestDay || Math.abs(d.kcalIn - d.budget) < Math.abs(bestDay.kcalIn - bestDay.budget)) {
      bestDay = { day: d.day, kcalIn: d.kcalIn, budget: d.budget };
    }
  }
  const avgMacros = { protein_g: nb ? r1(p / nb) : 0, carbs_g: nb ? r1(c / nb) : 0, fat_g: nb ? r1(f / nb) : 0 };
  const onTargetDays = elapsed.filter((d) => d.onTarget).length;

  const weightFirst = weightPoints.length ? weightPoints[0].weight : null;
  const weightLast = weightPoints.length ? weightPoints[weightPoints.length - 1].weight : null;

  const summary: ReportSummary = {
    from,
    to,
    days,
    elapsedDays: elapsed.length,
    loggedDays: logged.length,
    countedDays: n,
    partialDays: elapsed.filter((d) => d.partial).length,
    partialThreshold,
    todayPending: elapsed.some((d) => d.isToday && d.logged),
    target,
    maintenance: maint.kcal,
    maintenanceBasis: maint.basis,
    plannedDailyBalance: target != null && maint.kcal != null ? target - maint.kcal : null,
    balance,
    avgDailyBalance,
    avgExpenditure: n ? Math.round(countedExp / n) : 0,
    vsTarget,
    avgDailyVsTarget: n ? Math.round(vsTarget / n) : 0,
    estWeightChangeKg: r2(balance / KCAL_PER_KG),
    estWeeklyChangeKg: r2((avgDailyBalance * 7) / KCAL_PER_KG),
    totalIn: Math.round(totalIn),
    totalBurned: Math.round(totalBurned),
    avgIn: nb ? Math.round(totalIn / nb) : 0,
    avgBurned: tracked.length ? Math.round(tracked.reduce((s, d) => s + (d.burned ?? 0), 0) / tracked.length) : 0,
    trackedDays: tracked.length,
    avgMacros,
    avgBasisDays: nb,
    avgBasisIncomplete: n === 0 && nb > 0,
    onTargetDays,
    longestStreak,
    waterHitDays: waterTarget > 0 ? elapsed.filter((d) => d.water >= waterTarget).length : 0,
    waterTarget,
    stepDays: stepDaysArr.length,
    avgSteps: stepDaysArr.length ? Math.round(stepDaysArr.reduce((s, d) => s + d.steps, 0) / stepDaysArr.length) : 0,
    stepHitDays: stepTarget > 0 ? elapsed.filter((d) => d.steps >= stepTarget).length : 0,
    stepTarget,
    weightPoints,
    weightFirst,
    weightLast,
    weightDelta: weightFirst != null && weightLast != null && weightPoints.length > 1 ? r1(weightLast - weightFirst) : null,
    bmiLast: weightLast && height ? calcBMI(weightLast, height) : null,
    weightTrend: trend,
    macroSplit: macroSplit(avgMacros),
    loggingRate: elapsed.length ? logged.length / elapsed.length : 0,
    onTargetRate: elapsed.length ? onTargetDays / elapsed.length : 0,
    currentStreak,
    bestDay,
    verdict: { tone: 'neutral', title: '', text: '' },
  };
  summary.verdict = makeVerdict(profile?.goal ?? null, summary, profile);
  return summary;
}

// ───────────────────────── Verdict ─────────────────────────

const fmtInt = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(n)));
const fmtKg = (n: number) => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(n));

type VerdictInput = Pick<
  ReportSummary,
  'countedDays' | 'target' | 'maintenance' | 'avgDailyBalance' | 'plannedDailyBalance' | 'avgDailyVsTarget' | 'avgIn' | 'avgMacros'
>;

/** "thâm hụt ~520 kcal/ngày" / "dư ~300 kcal/ngày" / "cân bằng" */
function balanceText(b: number): string {
  if (Math.abs(b) < 50) return 'gần như cân bằng năng lượng';
  return b < 0 ? `thâm hụt ~${fmtInt(b)} kcal/ngày` : `dư ~${fmtInt(b)} kcal/ngày`;
}

/** "(≈ giảm 0,5 kg/tuần)" */
function paceText(b: number): string {
  const kg = (b * 7) / KCAL_PER_KG;
  if (Math.abs(kg) < 0.05) return '';
  return ` (≈ ${kg < 0 ? 'giảm' : 'tăng'} ${fmtKg(kg)} kg/tuần)`;
}

/**
 * Goal-aware assessment. Compares the actual average daily energy balance (intake − estimated
 * expenditure, complete days only) with the balance the goal plans for (target − maintenance).
 */
export function makeVerdict(goal: Goal | null, s: VerdictInput, profile: Pick<ProfileTargets, 'protein_g'> | null): Verdict {
  if (s.countedDays < MIN_DAYS_FOR_VERDICT) {
    return {
      tone: 'neutral',
      title: 'Chưa đủ dữ liệu',
      text: `Cần ít nhất ${MIN_DAYS_FOR_VERDICT} ngày ghi đủ bữa (không tính hôm nay) để Fitora đánh giá tiến độ.${
        s.countedDays > 0 ? ` Hiện có ${s.countedDays} ngày.` : ''
      }`,
    };
  }
  if (!goal || s.target == null || s.maintenance == null || s.plannedDailyBalance == null) {
    return { tone: 'neutral', title: 'Chưa có mục tiêu', text: 'Hoàn tất hồ sơ và mục tiêu calo để nhận đánh giá theo kế hoạch.' };
  }
  const b = s.avgDailyBalance;
  const plan = s.plannedDailyBalance;
  const actual = `Bạn đang ${balanceText(b)}${paceText(b)}`;
  const proteinLow = profile?.protein_g ? s.avgMacros.protein_g < profile.protein_g * 0.85 : false;
  const proteinNote = proteinLow && profile?.protein_g ? ` Đạm TB ${fmtInt(s.avgMacros.protein_g)}/${fmtInt(profile.protein_g)} g — nên ăn thêm đạm.` : '';

  switch (goal) {
    case 'lose': {
      const deficit = -b;
      const planned = Math.max(0, -plan);
      if (deficit > Math.max(planned + 400, 1000)) {
        return { tone: 'warn', title: 'Thâm hụt quá sâu', text: `${actual}, sâu hơn kế hoạch (~${fmtInt(planned)}). Giảm quá nhanh dễ mất cơ và mệt mỏi — ăn thêm một chút.${proteinNote}` };
      }
      if (deficit >= planned - 200 && deficit > 0) {
        const near = deficit <= planned + 200;
        return {
          tone: proteinLow ? 'warn' : 'good',
          title: 'Đúng hướng giảm cân',
          text: `${actual} — ${near ? 'sát kế hoạch' : `sâu hơn kế hoạch (~${fmtInt(planned)}) một chút`}.${proteinNote || ' Giữ nhịp này nhé!'}`,
        };
      }
      if (deficit > 0) {
        return { tone: 'warn', title: 'Thâm hụt ít hơn kế hoạch', text: `${actual}, ít hơn mức ~${fmtInt(planned)} của kế hoạch nên sẽ giảm chậm hơn.` };
      }
      return { tone: 'bad', title: 'Chưa đúng hướng', text: `${actual} — chưa có thâm hụt để giảm cân. Thử bớt ~${fmtInt(planned - deficit)} kcal/ngày.` };
    }
    case 'gain': {
      const planned = Math.max(0, plan);
      if (b > planned + 500) return { tone: 'warn', title: 'Dư thừa nhiều', text: `${actual}. Tăng quá nhanh dễ tích mỡ — giảm bớt một chút.` };
      if (b >= planned - 200 && b > 0)
        return {
          tone: proteinLow ? 'warn' : 'good',
          title: 'Đúng hướng tăng cân',
          text: `${actual} — ${b <= planned + 200 ? 'sát kế hoạch' : `cao hơn kế hoạch (~${fmtInt(planned)}) một chút`}.${proteinNote}`,
        };
      if (b > 0) return { tone: 'warn', title: 'Hơi thiếu năng lượng', text: `${actual}, thấp hơn mức dư ~${fmtInt(planned)} của kế hoạch.` };
      return { tone: 'bad', title: 'Chưa nạp đủ', text: `${actual} — chưa đủ năng lượng để tăng cân. Thử ăn thêm ~${fmtInt(planned - b)} kcal/ngày.` };
    }
    case 'maintain':
      if (Math.abs(b) <= 200) return { tone: 'good', title: 'Giữ cân ổn định', text: `${actual}. Năng lượng nạp vào cân bằng với nhu cầu — tuyệt vời!` };
      if (Math.abs(b) <= 450) return { tone: 'warn', title: b > 0 ? 'Hơi dư thừa' : 'Hơi thiếu hụt', text: `${actual}.` };
      return { tone: 'bad', title: b > 0 ? 'Dư thừa nhiều' : 'Thiếu hụt nhiều', text: `${actual} — cân nặng sẽ ${b > 0 ? 'tăng' : 'giảm'} nếu giữ mức này.` };
    case 'recomp':
    default: {
      const dev = b - plan;
      if (Math.abs(dev) <= 250) {
        return proteinLow
          ? { tone: 'warn', title: 'Calo ổn, cần thêm đạm', text: `${actual} — đúng kế hoạch.${proteinNote}` }
          : { tone: 'good', title: 'Đúng hướng tái cấu trúc', text: `${actual}. Calo và đạm đều bám sát kế hoạch — tiếp tục tập đều!` };
      }
      if (Math.abs(dev) <= 500) return { tone: 'warn', title: dev > 0 ? 'Hơi dư thừa' : 'Thâm hụt hơi sâu', text: `${actual}, lệch kế hoạch ~${fmtInt(dev)} kcal/ngày.` };
      return { tone: 'bad', title: 'Lệch kế hoạch', text: `${actual}, lệch kế hoạch ~${fmtInt(dev)} kcal/ngày — khó vừa giảm mỡ vừa giữ cơ.` };
    }
  }
}
