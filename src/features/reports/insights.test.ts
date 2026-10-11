import { describe, expect, it } from 'vitest';
import type { RangeSummaryRow } from '@/types/db';
import { buildInsights, comparePeriods, dayName } from './insights';
import { buildReport, canGoNext, macroSplit, periodLabel, periodRange, shiftPeriod, weightTrend, type ProfileTargets } from './lib';

const row = (day: string, p: Partial<RangeSummaryRow> = {}): RangeSummaryRow => ({
  day,
  kcal_in: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fiber_g: 0,
  workout_kcal: 0,
  water_ml: 0,
  steps: 0,
  weight_kg: null,
  ...p,
});

const profile: ProfileTargets = {
  sex: 'male',
  birth_date: '1996-01-01',
  height_cm: 175,
  activity_level: 'sedentary',
  goal: 'lose',
  goal_pace: 'medium',
  start_weight_kg: 80,
  calorie_target: 2000,
  protein_g: 160,
  carbs_g: 200,
  fat_g: 60,
  water_target_ml: 2000,
  step_target: 8000,
};

const week = (rows: RangeSummaryRow[], today = '2026-10-18', p: ProfileTargets | null = profile) =>
  buildReport({ rows, from: '2026-10-12', to: '2026-10-18', period: 'week', today, profile: p, refWeightKg: 80 });

describe('period edge cases', () => {
  it('ISO week across a year boundary (Mon 29/12 – Sun 04/01)', () => {
    expect(periodRange('week', '2026-01-01')).toEqual({ from: '2025-12-29', to: '2026-01-04' });
    expect(periodRange('week', '2026-10-18')).toEqual({ from: '2026-10-12', to: '2026-10-18' }); // Sunday stays in its week
    expect(periodLabel('week', '2026-01-01')).toBe('29/12 – 04/01');
  });
  it('month lengths incl. leap February', () => {
    expect(periodRange('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('month', '2026-04-30')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(shiftPeriod('month', '2026-01-31', 1)).toBe('2026-02-01'); // no Jan 31 → Mar 3 overflow
  });
  it('leap-year month report has 29 days', () => {
    const s = buildReport({ rows: [], from: '2028-02-01', to: '2028-02-29', period: 'month', today: '2028-03-05', profile, refWeightKg: 80 });
    expect(s.days).toHaveLength(29);
    expect(s.elapsedDays).toBe(29);
    expect(s.days[28].tick).toBe('29');
  });
  it('future: cannot go past the current period', () => {
    expect(canGoNext('week', '2026-10-12', '2026-10-18')).toBe(false);
    expect(canGoNext('month', '2026-09-15', '2026-10-01')).toBe(true);
  });
});

describe('weightTrend / macroSplit', () => {
  it('needs enough spread', () => {
    expect(weightTrend([])).toBeNull();
    expect(weightTrend([{ day: '2026-10-12', weight: 80 }])).toBeNull();
    expect(weightTrend([{ day: '2026-10-12', weight: 80 }, { day: '2026-10-14', weight: 79 }])).toBeNull();
  });
  it('least-squares slope in kg/week, order-independent', () => {
    const t = weightTrend([
      { day: '2026-10-19', weight: 79.0 },
      { day: '2026-10-12', weight: 80.0 },
      { day: '2026-10-15', weight: 79.6 },
    ]);
    expect(t?.slopeKgPerWeek).toBeCloseTo(-1, 1);
    expect(t?.x0).toBe('2026-10-12');
  });
  it('macro energy split sums to 100', () => {
    expect(macroSplit({ protein_g: 0, carbs_g: 0, fat_g: 0 })).toBeNull();
    const m = macroSplit({ protein_g: 100, carbs_g: 200, fat_g: 50 })!; // 400 / 800 / 450
    expect(m.protein + m.carbs + m.fat).toBe(100);
    expect(m).toEqual({ protein: 24, carbs: 49, fat: 27 });
    const third = macroSplit({ protein_g: 9, carbs_g: 9, fat_g: 4 })!;
    expect(third.protein + third.carbs + third.fat).toBe(100);
  });
});

describe('buildReport extras', () => {
  it('empty → zeros, no trend, no best day', () => {
    const s = week([]);
    expect(s.loggingRate).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.bestDay).toBeNull();
    expect(s.weightTrend).toBeNull();
    expect(s.macroSplit).toBeNull();
    expect(s.days.every((d) => d.weightTrend == null)).toBe(true);
  });
  it('single day', () => {
    const s = week([row('2026-10-12', { kcal_in: 1900, protein_g: 120, carbs_g: 200, fat_g: 60 })], '2026-10-12');
    expect(s.elapsedDays).toBe(1);
    expect(s.loggingRate).toBe(1);
    expect(s.currentStreak).toBe(1);
    expect(s.countedDays).toBe(0); // today is still in progress
    expect(s.macroSplit).not.toBeNull();
  });
  it('unordered rows / timestamp suffix / rows outside the range', () => {
    const s = week([
      row('2026-10-16T00:00:00', { weight_kg: 79 }),
      row('2026-10-12', { weight_kg: 80 }),
      row('2026-10-05', { weight_kg: 90 }),
      row('2026-10-14', { weight_kg: 79.5 }),
    ]);
    expect(s.weightFirst).toBe(80);
    expect(s.weightLast).toBe(79);
    expect(s.weightTrend?.slopeKgPerWeek).toBeLessThan(0);
    expect(s.days.find((d) => d.day === '2026-10-13')?.weightTrend).not.toBeNull();
    expect(s.days.find((d) => d.day === '2026-10-17')?.weightTrend).toBeNull(); // not extrapolated
  });
  it('current streak tolerates an empty today; best day is closest to budget', () => {
    const s = week(
      [
        row('2026-10-13', { kcal_in: 1500 }),
        row('2026-10-15', { kcal_in: 2400 }),
        row('2026-10-16', { kcal_in: 2010 }),
        row('2026-10-17', { kcal_in: 1800 }),
      ],
      '2026-10-18',
    );
    expect(s.currentStreak).toBe(3);
    expect(s.longestStreak).toBe(3);
    expect(s.bestDay?.day).toBe('2026-10-16');
    expect(s.loggingRate).toBeCloseTo(4 / 7);
  });
  it('a past period has no "current" streak (only the longest one)', () => {
    const rows = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].map((d) => row(d, { kcal_in: 1900 }));
    const s = week(rows, '2026-10-25');
    expect(s.currentStreak).toBe(0);
    expect(s.longestStreak).toBe(5);
    const text = buildInsights(s, { period: 'week', goal: 'lose', proteinTarget: null })[0].text;
    expect(text).not.toMatch(/hiện tại/);
    expect(text).not.toMatch(/tuần này/);
  });
});

describe('comparePeriods / buildInsights', () => {
  const full = (kcal: number, protein: number) =>
    ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'].map((d) =>
      row(d, { kcal_in: kcal, protein_g: protein, carbs_g: 200, fat_g: 60 }),
    );

  it('null without previous period', () => {
    expect(comparePeriods(week([]), null).avgIn).toBeNull();
  });
  it('deltas', () => {
    const cur = week(full(1800, 150), '2026-10-19');
    const prev = week(full(2000, 120).slice(0, 4), '2026-10-19');
    const c = comparePeriods(cur, prev);
    expect(c.avgIn).toBe(-200);
    expect(c.protein).toBe(30);
    expect(c.loggingPts).toBe(43);
  });
  it('empty period → nudge only, never shaming', () => {
    const ins = buildInsights(week([]), { period: 'week', goal: 'lose', proteinTarget: 160 });
    expect(ins).toHaveLength(1);
    expect(ins[0].kind).toBe('nudge');
  });
  it('full week insights', () => {
    const rows = full(1990, 150).map((r, i) => ({ ...r, weight_kg: i % 2 === 0 ? 80 - i * 0.1 : null }));
    const ins = buildInsights(week(rows, '2026-10-19'), { period: 'week', goal: 'lose', proteinTarget: 160 });
    const kinds = ins.map((i) => i.kind);
    expect(kinds).toEqual(['consistency', 'best', 'protein', 'trend']);
    expect(ins[0].text).toContain('7/7');
    expect(ins[2].tone).toBe('good');
    expect(ins[3].text).toContain('giảm');
    expect(ins.every((i) => (i.tone as string) !== 'bad')).toBe(true);
  });
  it('does not repeat the streak when it equals the logged-day count', () => {
    // 7/7 days logged → the trailing streak is the same number; saying it twice adds nothing.
    const perfect = buildInsights(week(full(1990, 150), '2026-10-19'), { period: 'week', goal: 'lose', proteinTarget: 160 });
    expect(perfect[0].kind).toBe('consistency');
    expect(perfect[0].text).not.toContain('Chuỗi');
    // 12..15 + 17..18 logged, 16 skipped (today 18 in progress): trailing streak 2 < 6 logged → shown.
    const gappy = buildInsights(
      week(
        ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-17', '2026-10-18'].map((d) => row(d, { kcal_in: 1990 })),
        '2026-10-18',
      ),
      { period: 'week', goal: 'lose', proteinTarget: null },
    );
    expect(gappy[0].text).toContain('Chuỗi hiện tại 2 ngày');
  });
  it('dayName', () => {
    expect(dayName('2026-10-13')).toBe('Thứ Ba 13/10');
  });
});
