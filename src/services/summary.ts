import { db } from '@/lib/supabase';
import type { DaySummary, RangeSummaryRow } from '@/types/db';
import { run } from './errors';
import { num, numOrNull } from './session';

const EMPTY: DaySummary = { kcal_in: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, workout_kcal: 0, water_ml: 0, steps: 0 };

function toDay(raw: Record<string, unknown> | null | undefined): DaySummary {
  if (!raw) return { ...EMPTY };
  return {
    kcal_in: num(raw.kcal_in),
    protein_g: num(raw.protein_g),
    carbs_g: num(raw.carbs_g),
    fat_g: num(raw.fat_g),
    fiber_g: num(raw.fiber_g),
    workout_kcal: num(raw.workout_kcal),
    water_ml: num(raw.water_ml),
    steps: num(raw.steps),
  };
}

/** RPC fit_day_summary(p_date) */
export async function getDaySummary(date: string): Promise<DaySummary> {
  const data = await run(db().rpc('fit_day_summary', { p_date: date }), 'Không tải được tổng kết ngày.');
  return toDay(data as Record<string, unknown> | null);
}

/** RPC fit_range_summary(p_from, p_to) — one row per day (≤ 366 days). */
export async function getRangeSummary(from: string, to: string): Promise<RangeSummaryRow[]> {
  const data = await run(db().rpc('fit_range_summary', { p_from: from, p_to: to }), 'Không tải được báo cáo.');
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    day: String(r.day),
    ...toDay(r),
    weight_kg: numOrNull(r.weight_kg),
  }));
}
