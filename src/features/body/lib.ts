// Pure helpers for the Body feature (no React, no Supabase) — unit tested in lib.test.ts.
import { addDays, diffDays, endOfWeek, formatDayVi, formatMonthVi, startOfWeek } from '@/lib/date';
import { computePlan, draftToPatch, profileToDraft } from '@/features/onboarding/logic';
import type { BodyMeasurement, FitProfile, Goal, PhotoPose, ProgressPhoto } from '@/types/db';

export type MetricKey = 'weight_kg' | 'body_fat_pct' | 'chest_cm' | 'waist_cm' | 'hip_cm' | 'thigh_cm' | 'arm_cm';
export type CircKey = 'chest_cm' | 'waist_cm' | 'hip_cm' | 'thigh_cm' | 'arm_cm';

/** The five circumferences, numbered to match the body diagram legend. */
export const CIRCUMFERENCES: { key: CircKey; label: string; n: number; min: number; max: number }[] = [
  { key: 'chest_cm', label: 'Ngực', n: 1, min: 40, max: 200 },
  { key: 'waist_cm', label: 'Eo', n: 2, min: 40, max: 200 },
  { key: 'hip_cm', label: 'Hông', n: 3, min: 40, max: 200 },
  { key: 'thigh_cm', label: 'Đùi', n: 4, min: 20, max: 120 },
  { key: 'arm_cm', label: 'Bắp tay', n: 5, min: 10, max: 80 },
];

export const POSE_LABELS: Record<PhotoPose, string> = {
  front: 'Chính diện',
  side: 'Nghiêng',
  back: 'Phía sau',
  other: 'Khác',
};

/** numeric columns may arrive as strings from PostgREST — normalise to number | null. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Copy sorted by measured_on ascending. */
export function sortAsc<T extends { measured_on: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.measured_on < b.measured_on ? -1 : a.measured_on > b.measured_on ? 1 : 0));
}

/**
 * Change of `key` for the row at `index` (rows ascending) vs the closest EARLIER row
 * that has a value for that key. Null when either side is missing.
 */
export function fieldDelta(rowsAsc: BodyMeasurement[], index: number, key: MetricKey): number | null {
  const cur = num(rowsAsc[index]?.[key]);
  if (cur === null) return null;
  for (let i = index - 1; i >= 0; i--) {
    const prev = num(rowsAsc[i][key]);
    if (prev !== null) return r1(cur - prev);
  }
  return null;
}

export interface WeightStats {
  /** Latest weighed row. */
  latest: BodyMeasurement | null;
  current: number | null;
  /** Previous weigh-in (before latest). */
  previous: number | null;
  previousDate: string | null;
  deltaPrev: number | null;
  /** Start weight (profile start weight, else first weigh-in). */
  start: number | null;
  startDate: string | null;
  deltaStart: number | null;
  /** Number of weigh-ins. */
  count: number;
}

/** Weight summary from measurements (any order). `profileStart` = fit_profiles.start_weight_kg. */
export function weightStats(rows: BodyMeasurement[], profileStart?: number | null): WeightStats {
  const weighed = sortAsc(rows).filter((r) => num(r.weight_kg) !== null);
  const latest = weighed[weighed.length - 1] ?? null;
  const prevRow = weighed.length > 1 ? weighed[weighed.length - 2] : null;
  const current = latest ? num(latest.weight_kg) : null;
  const previous = prevRow ? num(prevRow.weight_kg) : null;
  const ps = num(profileStart);
  const start = ps ?? (weighed[0] ? num(weighed[0].weight_kg) : null);
  const startDate = ps !== null ? null : weighed[0]?.measured_on ?? null;
  return {
    latest,
    current,
    previous,
    previousDate: prevRow?.measured_on ?? null,
    deltaPrev: current !== null && previous !== null ? r1(current - previous) : null,
    start,
    startDate,
    deltaStart: current !== null && start !== null ? r1(current - start) : null,
    count: weighed.length,
  };
}

export type DeltaTone = 'good' | 'bad' | 'neutral';

/**
 * Is a change "good" for this user? Weight follows the goal (lose ↓, gain ↑; maintain/recomp neutral).
 * Body fat ↓ is always good; waist ↓ is good except on a gain goal (neutral there).
 * Chest / arm / thigh ↑ is good when building muscle (gain, recomp), neutral otherwise. Hip is neutral.
 */
export function deltaTone(key: MetricKey, delta: number | null, goal?: Goal | null): DeltaTone {
  if (delta === null || Math.abs(delta) < 0.05) return 'neutral';
  const down = delta < 0;
  if (key === 'weight_kg') {
    if (goal === 'lose') return down ? 'good' : 'bad';
    if (goal === 'gain') return down ? 'bad' : 'good';
    return 'neutral';
  }
  if (key === 'body_fat_pct') return down ? 'good' : 'bad';
  if (key === 'waist_cm') return goal === 'gain' ? 'neutral' : down ? 'good' : 'bad';
  if ((key === 'chest_cm' || key === 'arm_cm' || key === 'thigh_cm') && (goal === 'gain' || goal === 'recomp')) {
    return down ? 'bad' : 'good';
  }
  return 'neutral';
}

export interface TargetStatus {
  /** Target reached (or passed in the goal direction; ±1 kg band for maintain/recomp). */
  reached: boolean;
  /** Kilos still to go (≥ 0, 1 decimal). */
  remaining: number;
  /** Which way the weight still has to move. */
  direction: 'down' | 'up';
  /** 0–1 progress from the start weight to the target (lose/gain only, null when unknown). */
  pct: number | null;
}

const MAINTAIN_BAND_KG = 1;

/** Where the current weight stands against the target weight, honouring the goal direction. */
export function targetStatus(
  current: number | null,
  target: number | null,
  goal: Goal | null | undefined,
  start: number | null | undefined,
): TargetStatus | null {
  if (current === null || target === null || !(current > 0) || !(target > 0)) return null;
  const diff = target - current; // > 0 → must gain
  const direction: TargetStatus['direction'] = diff > 0 ? 'up' : 'down';
  let reached: boolean;
  if (goal === 'lose') reached = current <= target + 0.05;
  else if (goal === 'gain') reached = current >= target - 0.05;
  else reached = Math.abs(diff) <= (goal === 'maintain' || goal === 'recomp' ? MAINTAIN_BAND_KG : 0.05);
  const s = num(start);
  let pct: number | null = null;
  if (s !== null && Math.abs(s - target) >= 0.1 && (goal === 'lose' || goal === 'gain')) {
    pct = reached ? 1 : Math.round(Math.min(1, Math.max(0, (s - current) / (s - target))) * 100) / 100;
  }
  return { reached, remaining: reached ? 0 : r1(Math.abs(diff)), direction, pct };
}

export type ChartRange = '30' | '90' | '365' | 'all';

/** Initial chart window: 3 months, widened when that would show fewer than 2 weigh-ins. */
export function defaultChartRange(rows: BodyMeasurement[], today: string): ChartRange {
  if (weightSeries(rows, null, today).length < 2 || weightSeries(rows, 90, today).length >= 2) return '90';
  if (weightSeries(rows, 365, today).length >= 2) return '365';
  return 'all';
}

export interface Group<T> {
  key: string;
  label: string;
  items: T[];
}

/** Group by calendar month (newest month first, items newest first). */
export function groupByMonth<T>(items: T[], dateOf: (t: T) => string): Group<T>[] {
  const sorted = [...items].sort((a, b) => (dateOf(a) < dateOf(b) ? 1 : dateOf(a) > dateOf(b) ? -1 : 0));
  const out: Group<T>[] = [];
  for (const it of sorted) {
    const d = dateOf(it);
    const key = d.slice(0, 7);
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: formatMonthVi(d), items: [] };
      out.push(g);
    }
    g.items.push(it);
  }
  return out;
}

/** Group by ISO week (Monday start), newest first. Label "6/10 – 12/10[/yyyy]". */
export function groupByWeek<T>(items: T[], dateOf: (t: T) => string, today?: string): Group<T>[] {
  const sorted = [...items].sort((a, b) => (dateOf(a) < dateOf(b) ? 1 : dateOf(a) > dateOf(b) ? -1 : 0));
  const thisWeek = today ? startOfWeek(today) : null;
  const out: Group<T>[] = [];
  for (const it of sorted) {
    const d = dateOf(it);
    const key = startOfWeek(d);
    let g = out[out.length - 1];
    if (!g || g.key !== key) {
      let label = `${formatDayVi(key, 'short')} – ${formatDayVi(endOfWeek(d), 'short')}`;
      if (thisWeek && key === thisWeek) label = 'Tuần này';
      else if (thisWeek && key === addDays(thisWeek, -7)) label = 'Tuần trước';
      else if (today && key.slice(0, 4) !== today.slice(0, 4)) label += `/${key.slice(0, 4)}`;
      g = { key, label, items: [] };
      out.push(g);
    }
    g.items.push(it);
  }
  return out;
}

export interface WeightOn {
  weight: number;
  date: string;
  /** Measured on exactly that day. */
  exact: boolean;
}

/** Weight closest to `date` within ±maxGapDays (ties → earlier). */
export function weightOn(rows: BodyMeasurement[], date: string, maxGapDays = 7): WeightOn | null {
  let best: WeightOn | null = null;
  let bestGap = Infinity;
  for (const r of sortAsc(rows)) {
    const w = num(r.weight_kg);
    if (w === null) continue;
    const gap = Math.abs(diffDays(date, r.measured_on));
    if (gap <= maxGapDays && gap < bestGap) {
      best = { weight: w, date: r.measured_on, exact: gap === 0 };
      bestGap = gap;
    }
  }
  return best;
}

/** Chart points {date, weight} ascending, limited to the last `days` days ending `today` (null = all). */
export function weightSeries(rows: BodyMeasurement[], days: number | null, today: string): { date: string; weight: number }[] {
  const from = days === null ? '' : addDays(today, -(days - 1));
  return sortAsc(rows)
    .filter((r) => num(r.weight_kg) !== null && r.measured_on >= from && r.measured_on <= today)
    .map((r) => ({ date: r.measured_on, weight: num(r.weight_kg) as number }));
}

/** Older photo first ("before"), newer second ("after"). */
export function orderPair(a: ProgressPhoto, b: ProgressPhoto): [ProgressPhoto, ProgressPhoto] {
  const ka = `${a.taken_on}|${a.created_at}`;
  const kb = `${b.taken_on}|${b.created_at}`;
  return ka <= kb ? [a, b] : [b, a];
}

/** Toggle a photo in a max-2 selection (oldest pick dropped when a third is added). */
export function toggleSelection(sel: string[], id: string, max = 2): string[] {
  if (sel.includes(id)) return sel.filter((x) => x !== id);
  const next = [...sel, id];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** True when at least one metric is filled. */
export function hasAnyMetric(v: Partial<Record<MetricKey, number | null>>): boolean {
  return (['weight_kg', 'body_fat_pct', 'chest_cm', 'waist_cm', 'hip_cm', 'thigh_cm', 'arm_cm'] as MetricKey[]).some(
    (k) => num(v[k]) !== null,
  );
}

/**
 * When the saved plan is a SUGGESTED one (macro_custom = false), calorie_target and macros
 * are stored values computed from the weight at save time. They are only recomputed when the
 * user saves /goals, so after weighing in they can lag behind. Returns the refreshed kcal
 * when the plan for `latestWeightKg` differs noticeably (>= 20 kcal or >= 5 g of a macro)
 * from what is stored; null when nothing needs updating (manual plan, no weight, incomplete
 * profile, or only rounding noise).
 */
export function planRefresh(
  fit: FitProfile | null,
  latestWeightKg: number | null,
  today: Date = new Date(),
): { from: number; to: number } | null {
  if (!fit || fit.macro_custom || latestWeightKg === null || !fit.onboarded_at) return null;
  const stored = num(fit.calorie_target);
  if (stored === null) return null;
  const draft = profileToDraft(fit, latestWeightKg, today);
  const plan = computePlan(draft, today);
  if (!plan) return null;
  const p = draftToPatch(draft, plan);
  const next = { kcal: num(p.calorie_target), protein_g: num(p.protein_g) ?? 0, carbs_g: num(p.carbs_g) ?? 0, fat_g: num(p.fat_g) ?? 0 };
  if (next.kcal === null) return null;
  const kcalDiff = Math.abs(next.kcal - stored);
  const macroDiff = Math.max(
    Math.abs(next.protein_g - (num(fit.protein_g) ?? 0)),
    Math.abs(next.carbs_g - (num(fit.carbs_g) ?? 0)),
    Math.abs(next.fat_g - (num(fit.fat_g) ?? 0)),
  );
  if (kcalDiff < 20 && macroDiff < 5) return null;
  return { from: stored, to: next.kcal };
}

export interface SeriesPoint {
  date: string;
  weight: number;
  /** Trailing moving average (time window), 1 decimal. */
  avg: number;
}

/**
 * Trailing moving average over a TIME window (default 7 days, inclusive of the point's day),
 * so irregular weigh-ins are not over-weighted. Input must be ascending by date.
 */
export function movingAverage(series: { date: string; weight: number }[], windowDays = 7): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let lo = 0;
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    sum += series[i].weight;
    while (lo < i && diffDays(series[lo].date, series[i].date) >= windowDays) {
      sum -= series[lo].weight;
      lo++;
    }
    out.push({ date: series[i].date, weight: series[i].weight, avg: r1(sum / (i - lo + 1)) });
  }
  return out;
}

/** Latest non-null value of `key` with its date (rows any order). */
export function latestValue(rows: BodyMeasurement[], key: MetricKey): { value: number; date: string } | null {
  const asc = sortAsc(rows);
  for (let i = asc.length - 1; i >= 0; i--) {
    const v = num(asc[i][key]);
    if (v !== null) return { value: v, date: asc[i].measured_on };
  }
  return null;
}

export type WhtrKey = 'low' | 'healthy' | 'elevated' | 'high';
export const WHTR_LABELS: Record<WhtrKey, string> = {
  low: 'Thấp',
  healthy: 'Khỏe mạnh',
  elevated: 'Tăng nguy cơ',
  high: 'Nguy cơ cao',
};

/** Waist-to-height ratio (2 decimals) with the common < 0.5 rule-of-thumb bands. Null on bad input. */
export function waistToHeight(waistCm: number | string | null | undefined, heightCm: number | string | null | undefined): { ratio: number; key: WhtrKey; label: string } | null {
  const w = num(waistCm);
  const h = num(heightCm);
  if (w === null || h === null || !(w > 0) || !(h > 0)) return null;
  const ratio = Math.round((w / h) * 100) / 100;
  const key: WhtrKey = ratio < 0.4 ? 'low' : ratio < 0.5 ? 'healthy' : ratio < 0.6 ? 'elevated' : 'high';
  return { ratio, key, label: WHTR_LABELS[key] };
}

/**
 * Flags an implausible weight entry: compares with the closest weigh-in on ANOTHER day within
 * 30 days. Allowed drift = 2 kg (water / food) + 0.15 kg per day between the two. Returns the
 * difference (entered − reference) and the reference day, or null when it looks plausible.
 */
export function weightJump(
  rows: BodyMeasurement[],
  date: string,
  weight: number | null,
): { diff: number; date: string; weight: number } | null {
  if (weight === null || !(weight > 0)) return null;
  let ref: { date: string; weight: number; gap: number } | null = null;
  for (const r of rows) {
    const w = num(r.weight_kg);
    if (w === null || r.measured_on === date) continue;
    const gap = Math.abs(diffDays(date, r.measured_on));
    if (gap > 30) continue;
    if (!ref || gap < ref.gap || (gap === ref.gap && r.measured_on < date)) ref = { date: r.measured_on, weight: w, gap };
  }
  if (!ref) return null;
  const diff = r1(weight - ref.weight);
  return Math.abs(diff) > 2 + 0.15 * ref.gap ? { diff, date: ref.date, weight: ref.weight } : null;
}

/** Realistic input ranges per metric (validation in the measurement sheet AND the service). */
export const METRIC_RANGES: Record<MetricKey, [number, number]> = {
  weight_kg: [25, 300],
  body_fat_pct: [2, 75],
  ...(Object.fromEntries(CIRCUMFERENCES.map((c) => [c.key, [c.min, c.max]])) as Record<CircKey, [number, number]>),
};

/** Unit shown in range validation messages. */
export const METRIC_UNITS: Record<MetricKey, string> = {
  weight_kg: 'kg',
  body_fat_pct: '%',
  chest_cm: 'cm',
  waist_cm: 'cm',
  hip_cm: 'cm',
  thigh_cm: 'cm',
  arm_cm: 'cm',
};

/** Human name per metric (validation messages outside the form, e.g. the service). */
export const METRIC_LABELS: Record<MetricKey, string> = {
  weight_kg: 'Cân nặng',
  body_fat_pct: 'Tỷ lệ mỡ',
  chest_cm: 'Vòng ngực',
  waist_cm: 'Vòng eo',
  hip_cm: 'Vòng hông',
  thigh_cm: 'Vòng đùi',
  arm_cm: 'Vòng bắp tay',
};

/** Range error message for a value (Vietnamese decimal comma, with the unit), undefined when OK or empty. */
export function rangeError(key: MetricKey, v: number | null | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  const [lo, hi] = METRIC_RANGES[key];
  return v < lo || v > hi
    ? `Từ ${String(lo).replace('.', ',')} đến ${String(hi).replace('.', ',')} ${METRIC_UNITS[key]}`
    : undefined;
}

const POSE_ORDER: PhotoPose[] = ['front', 'side', 'back', 'other'];

/**
 * Smart default pose for a new progress photo on `date`:
 * - nothing shot that day → the pose of the most recent photo (the user's habit), else 'front';
 * - some poses already shot that day → the next pose of the user's usual set (poses they have
 *   ever used, in front → side → back → other order) still missing that day — a front/side/back
 *   routine moves on by itself;
 * - the whole usual set done → 'other' when unused that day, else the habit pose.
 */
export function suggestPose(photos: ReadonlyArray<Pick<ProgressPhoto, 'pose' | 'taken_on' | 'created_at'>>, date: string): PhotoPose {
  if (!photos.length) return 'front';
  const latest = [...photos].sort((a, b) => (`${a.taken_on}|${a.created_at}` < `${b.taken_on}|${b.created_at}` ? 1 : -1))[0];
  const habit = latest.pose;
  const sameDay = new Set(photos.filter((p) => p.taken_on === date).map((p) => p.pose));
  if (!sameDay.size) return habit;
  const usual = POSE_ORDER.filter((p) => p !== 'other' && photos.some((x) => x.pose === p));
  const next = usual.find((p) => !sameDay.has(p)) ?? POSE_ORDER.find((p) => p !== 'other' && !sameDay.has(p));
  if (next) return next;
  return sameDay.has('other') ? habit : 'other';
}
