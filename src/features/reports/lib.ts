// Pure aggregation for the Progress / Reports screen (unit-tested in lib.test.ts).
// All dates are local 'YYYY-MM-DD' strings.

import { addDays, endOfMonth, endOfWeek, formatMonthVi, parseISODate, rangeDays, startOfMonth, startOfWeek, weekdayShort } from '@/lib/date';
import { calcAge, calcBMI, calcBMR, calcTDEE, GAIN_SURPLUS, LOSE_DEFICIT, stepsKcal } from '@/lib/energy';
import type { FitProfile, Goal, RangeSummaryRow } from '@/types/db';

/** kcal ≈ 1 kg of body mass. */
export const KCAL_PER_KG = 7700;
/** A day counts as "on target" when intake is within ±10 % of its budget (target + burned). */
export const ON_TARGET_TOLERANCE = 0.1;
/** Fewer logged days than this → no verdict. */
export const MIN_DAYS_FOR_VERDICT = 3;

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

/** Secondary label: "Tuần này" / "Tuần trước" / "Tháng này" / "Tháng trước" / year / range. */
export function periodCaption(period: Period, anchor: string, today: string): string {
  const { from, to } = periodRange(period, anchor);
  const prev = shiftPeriod(period, today, -1);
  if (period === 'week') {
    if (isCurrentPeriod(period, anchor, today)) return 'Tuần này';
    if (from === prev) return 'Tuần trước';
    return `Năm ${parseISODate(to).getFullYear()}`;
  }
  if (isCurrentPeriod(period, anchor, today)) return 'Tháng này';
  if (from === prev) return 'Tháng trước';
  return `${ddmm(from)} – ${ddmm(to)}`;
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
  /** Has any food logged. */
  logged: boolean;
  kcalIn: number | null;
  workoutKcal: number;
  stepsKcal: number;
  /** workout + steps (null for future days). */
  burned: number | null;
  /** Day budget = target + burned (null if no target or future). */
  budget: number | null;
  onTarget: boolean;
  water: number;
  steps: number;
  weight: number | null;
  bmi: number | null;
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
  loggedDays: number;
  /** Daily calorie target (null if not set). */
  target: number | null;
  /** Estimated daily maintenance (TDEE) and how it was obtained. */
  maintenance: number | null;
  maintenanceBasis: 'profile' | 'target' | null;
  /** Σ over logged days of kcal_in − (maintenance + burned). Negative = deficit. */
  balance: number;
  avgDailyBalance: number;
  /** Σ over logged days of kcal_in − (target + burned). */
  vsTarget: number;
  avgDailyVsTarget: number;
  /** balance / 7700, 2 decimals. */
  estWeightChangeKg: number;
  totalIn: number;
  totalBurned: number;
  avgIn: number;
  avgBurned: number;
  avgMacros: { protein_g: number; carbs_g: number; fat_g: number };
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

/** Daily maintenance kcal: Mifflin–St Jeor × activity when the profile is complete, else inverted from the goal target. */
export function estimateMaintenance(
  profile: ProfileTargets | null,
  weightKg: number | null,
  today: string,
): { kcal: number | null; basis: 'profile' | 'target' | null } {
  if (!profile) return { kcal: null, basis: null };
  const w = weightKg ?? profile.start_weight_kg;
  if (profile.sex && profile.birth_date && profile.height_cm && profile.activity_level && w && w > 0) {
    const age = calcAge(profile.birth_date, parseISODate(today));
    const bmr = calcBMR(profile.sex, w, Number(profile.height_cm), age);
    return { kcal: calcTDEE(bmr, profile.activity_level), basis: 'profile' };
  }
  const t = profile.calorie_target;
  if (!t || !profile.goal) return { kcal: null, basis: null };
  const kcal =
    profile.goal === 'lose'
      ? t + LOSE_DEFICIT[profile.goal_pace ?? 'medium']
      : profile.goal === 'gain'
        ? t - GAIN_SURPLUS
        : profile.goal === 'recomp'
          ? Math.round(t / 0.9)
          : t;
  return { kcal, basis: 'target' };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildReport({ rows, from, to, period, today, profile, refWeightKg }: BuildInput): ReportSummary {
  const byDay = new Map(rows.map((r) => [r.day.slice(0, 10), r]));
  const target = profile?.calorie_target && profile.calorie_target > 0 ? Number(profile.calorie_target) : null;
  const height = profile?.height_cm ? Number(profile.height_cm) : null;
  const waterTarget = profile?.water_target_ml ?? 2000;
  const stepTarget = profile?.step_target ?? 8000;

  // Weight used for step kcal: latest weigh-in in the range, else the reference.
  const weightsInRange = rows.filter((r) => r.weight_kg != null && r.weight_kg > 0);
  const stepWeight = weightsInRange.length ? (weightsInRange[weightsInRange.length - 1].weight_kg as number) : refWeightKg ?? profile?.start_weight_kg ?? 0;
  const maint = estimateMaintenance(profile, refWeightKg ?? (weightsInRange.length ? stepWeight : null), today);

  const days: DayPoint[] = rangeDays(from, to).map((day) => {
    const r = byDay.get(day);
    const future = day > today;
    const kcalIn = r ? Number(r.kcal_in) || 0 : 0;
    const workoutKcal = r ? Number(r.workout_kcal) || 0 : 0;
    const steps = r ? Number(r.steps) || 0 : 0;
    const sk = stepsKcal(steps, stepWeight || 0);
    const burned = future ? null : Math.round(workoutKcal + sk);
    const logged = !future && kcalIn > 0;
    const budget = target != null && !future ? target + (burned ?? 0) : null;
    const weight = r?.weight_kg != null && r.weight_kg > 0 ? Number(r.weight_kg) : null;
    return {
      day,
      tick: period === 'week' ? weekdayShort(day) : String(parseISODate(day).getDate()),
      future,
      logged,
      kcalIn: future ? null : Math.round(kcalIn),
      workoutKcal: Math.round(workoutKcal),
      stepsKcal: sk,
      burned,
      budget,
      onTarget: logged && budget != null && budget > 0 && Math.abs(kcalIn - budget) <= budget * ON_TARGET_TOLERANCE,
      water: r ? Number(r.water_ml) || 0 : 0,
      steps,
      weight,
      bmi: weight && height ? calcBMI(weight, height) : null,
    };
  });

  const elapsed = days.filter((d) => !d.future);
  const logged = elapsed.filter((d) => d.logged);
  const n = logged.length;

  let totalIn = 0;
  let totalBurnedLogged = 0;
  let p = 0;
  let c = 0;
  let f = 0;
  for (const d of logged) {
    const row = byDay.get(d.day)!;
    totalIn += d.kcalIn ?? 0;
    totalBurnedLogged += d.burned ?? 0;
    p += Number(row.protein_g) || 0;
    c += Number(row.carbs_g) || 0;
    f += Number(row.fat_g) || 0;
  }
  const totalBurned = elapsed.reduce((s, d) => s + (d.burned ?? 0), 0);

  const balance = maint.kcal != null ? Math.round(totalIn - totalBurnedLogged - maint.kcal * n) : 0;
  const vsTarget = target != null ? Math.round(totalIn - totalBurnedLogged - target * n) : 0;

  // Longest run of consecutive logged days inside the period.
  let longestStreak = 0;
  let run = 0;
  for (const d of elapsed) {
    run = d.logged ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }

  const stepDaysArr = elapsed.filter((d) => d.steps > 0);
  const weightPoints = days.filter((d) => d.weight != null).map((d) => ({ day: d.day, weight: d.weight as number, bmi: d.bmi }));
  const weightFirst = weightPoints.length ? weightPoints[0].weight : null;
  const weightLast = weightPoints.length ? weightPoints[weightPoints.length - 1].weight : null;

  const summary: ReportSummary = {
    from,
    to,
    days,
    elapsedDays: elapsed.length,
    loggedDays: n,
    target,
    maintenance: maint.kcal,
    maintenanceBasis: maint.basis,
    balance,
    avgDailyBalance: n ? Math.round(balance / n) : 0,
    vsTarget,
    avgDailyVsTarget: n ? Math.round(vsTarget / n) : 0,
    estWeightChangeKg: r2(balance / KCAL_PER_KG),
    totalIn: Math.round(totalIn),
    totalBurned: Math.round(totalBurned),
    avgIn: n ? Math.round(totalIn / n) : 0,
    avgBurned: elapsed.length ? Math.round(totalBurned / elapsed.length) : 0,
    avgMacros: { protein_g: n ? r1(p / n) : 0, carbs_g: n ? r1(c / n) : 0, fat_g: n ? r1(f / n) : 0 },
    onTargetDays: elapsed.filter((d) => d.onTarget).length,
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
    verdict: { tone: 'neutral', title: '', text: '' },
  };
  summary.verdict = makeVerdict(profile?.goal ?? null, summary, profile);
  return summary;
}

// ───────────────────────── Verdict ─────────────────────────

const fmtInt = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(n)));

/** Goal-aware one-liner. Uses the average daily deviation from the calorie target (plan already contains the deficit/surplus). */
export function makeVerdict(goal: Goal | null, s: Pick<ReportSummary, 'loggedDays' | 'target' | 'avgDailyVsTarget' | 'avgMacros'>, profile: Pick<ProfileTargets, 'protein_g'> | null): Verdict {
  if (s.loggedDays < MIN_DAYS_FOR_VERDICT) {
    return {
      tone: 'neutral',
      title: 'Chưa đủ dữ liệu',
      text: `Ghi nhật ký ít nhất ${MIN_DAYS_FOR_VERDICT} ngày để Fitora đánh giá tiến độ của bạn.`,
    };
  }
  if (!goal || s.target == null) {
    return { tone: 'neutral', title: 'Chưa có mục tiêu', text: 'Đặt mục tiêu calo để nhận đánh giá theo kế hoạch.' };
  }
  const dev = s.avgDailyVsTarget;
  const over = `vượt mục tiêu ~${fmtInt(dev)} kcal/ngày`;
  const under = `thấp hơn mục tiêu ~${fmtInt(dev)} kcal/ngày`;
  const proteinLow = profile?.protein_g ? s.avgMacros.protein_g < profile.protein_g * 0.85 : false;

  switch (goal) {
    case 'lose':
      if (dev < -600) return { tone: 'warn', title: 'Thâm hụt quá sâu', text: `Bạn ăn ${under}. Giảm quá nhanh dễ mất cơ và mệt mỏi — hãy ăn sát mục tiêu hơn.` };
      if (dev <= 150) return { tone: 'good', title: 'Đúng hướng giảm cân', text: 'Lượng nạp bám sát kế hoạch thâm hụt. Giữ nhịp này nhé!' };
      if (dev <= 400) return { tone: 'warn', title: 'Hơi vượt mục tiêu', text: `Bạn ${over}, tốc độ giảm sẽ chậm lại.` };
      return { tone: 'bad', title: 'Chưa đúng hướng', text: `Bạn ${over} — gần như không còn thâm hụt để giảm cân.` };
    case 'gain':
      if (dev > 600) return { tone: 'warn', title: 'Dư thừa nhiều', text: `Bạn ${over}. Tăng quá nhanh dễ tích mỡ — hãy giảm bớt một chút.` };
      if (dev >= -150) return { tone: 'good', title: 'Đúng hướng tăng cân', text: 'Bạn nạp đủ năng lượng dư để tăng cân đều.' };
      if (dev >= -400) return { tone: 'warn', title: 'Hơi thiếu năng lượng', text: `Bạn ${under}, tăng cân sẽ chậm hơn kế hoạch.` };
      return { tone: 'bad', title: 'Chưa nạp đủ', text: `Bạn ${under} — khó tăng cân với mức này.` };
    case 'maintain':
      if (Math.abs(dev) <= 150) return { tone: 'good', title: 'Giữ cân ổn định', text: 'Năng lượng nạp vào cân bằng với nhu cầu. Tuyệt vời!' };
      if (Math.abs(dev) <= 400) return { tone: 'warn', title: dev > 0 ? 'Hơi dư thừa' : 'Hơi thiếu hụt', text: `Bạn ${dev > 0 ? over : under}.` };
      return { tone: 'bad', title: dev > 0 ? 'Dư thừa nhiều' : 'Thiếu hụt nhiều', text: `Bạn ${dev > 0 ? over : under} — cân nặng có thể thay đổi.` };
    case 'recomp':
    default:
      if (Math.abs(dev) <= 200) {
        return proteinLow
          ? { tone: 'warn', title: 'Calo ổn, cần thêm đạm', text: 'Năng lượng đúng kế hoạch nhưng đạm còn thấp — tăng đạm để giữ và xây cơ.' }
          : { tone: 'good', title: 'Đúng hướng tái cấu trúc', text: 'Calo và đạm đều bám sát kế hoạch. Tiếp tục tập luyện đều!' };
      }
      if (Math.abs(dev) <= 450) return { tone: 'warn', title: dev > 0 ? 'Hơi dư thừa' : 'Hơi thiếu hụt', text: `Bạn ${dev > 0 ? over : under}.` };
      return { tone: 'bad', title: 'Lệch kế hoạch', text: `Bạn ${dev > 0 ? over : under} — khó vừa giảm mỡ vừa giữ cơ.` };
  }
}
