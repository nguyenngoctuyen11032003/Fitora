// Pure helpers for the Body feature (no React, no Supabase) — unit tested in lib.test.ts.
import { addDays, diffDays, endOfWeek, formatDayVi, formatMonthVi, startOfWeek } from '@/lib/date';
import type { BodyMeasurement, Goal, PhotoPose, ProgressPhoto } from '@/types/db';

export type MetricKey = 'weight_kg' | 'body_fat_pct' | 'chest_cm' | 'waist_cm' | 'hip_cm' | 'thigh_cm' | 'arm_cm';
export type CircKey = 'chest_cm' | 'waist_cm' | 'hip_cm' | 'thigh_cm' | 'arm_cm';

/** The five circumferences, numbered to match the body diagram legend. */
export const CIRCUMFERENCES: { key: CircKey; label: string; n: number; min: number; max: number }[] = [
  { key: 'chest_cm', label: 'Ngực', n: 1, min: 20, max: 300 },
  { key: 'waist_cm', label: 'Eo', n: 2, min: 20, max: 300 },
  { key: 'hip_cm', label: 'Hông', n: 3, min: 20, max: 300 },
  { key: 'thigh_cm', label: 'Đùi', n: 4, min: 10, max: 200 },
  { key: 'arm_cm', label: 'Bắp tay', n: 5, min: 5, max: 150 },
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
 * Is a change "good" for this user? Weight follows the goal (lose ↓, gain ↑),
 * body fat and waist ↓ are good; other circumferences are neutral.
 */
export function deltaTone(key: MetricKey, delta: number | null, goal?: Goal | null): DeltaTone {
  if (delta === null || Math.abs(delta) < 0.05) return 'neutral';
  const down = delta < 0;
  if (key === 'weight_kg') {
    if (goal === 'lose') return down ? 'good' : 'bad';
    if (goal === 'gain') return down ? 'bad' : 'good';
    return 'neutral';
  }
  if (key === 'body_fat_pct' || key === 'waist_cm') return down ? 'good' : 'bad';
  return 'neutral';
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
