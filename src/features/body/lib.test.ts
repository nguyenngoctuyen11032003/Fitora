import { describe, expect, it } from 'vitest';
import { computePlan, draftToPatch, profileToDraft } from '@/features/onboarding/logic';
import type { BodyMeasurement, FitProfile, ProgressPhoto } from '@/types/db';
import {
  defaultChartRange,
  deltaTone,
  fieldDelta,
  groupByMonth,
  groupByWeek,
  hasAnyMetric,
  latestValue,
  METRIC_RANGES,
  movingAverage,
  rangeError,
  waistToHeight,
  weightJump,
  num,
  orderPair,
  planRefresh,
  sortAsc,
  targetStatus,
  toggleSelection,
  weightOn,
  weightSeries,
  weightStats,
} from './lib';

const m = (measured_on: string, p: Partial<BodyMeasurement> = {}): BodyMeasurement => ({
  id: measured_on,
  user_id: 'u',
  measured_on,
  weight_kg: null,
  body_fat_pct: null,
  chest_cm: null,
  waist_cm: null,
  hip_cm: null,
  thigh_cm: null,
  arm_cm: null,
  note: null,
  created_at: '',
  updated_at: '',
  ...p,
});

const photo = (id: string, taken_on: string, created_at = '2026-01-01T00:00:00Z'): ProgressPhoto => ({
  id,
  user_id: 'u',
  taken_on,
  pose: 'front',
  storage_path: `u/progress/${id}.webp`,
  note: null,
  created_at,
});

describe('num', () => {
  it('normalises numeric strings and empties', () => {
    expect(num('68.5')).toBe(68.5);
    expect(num(70)).toBe(70);
    expect(num(null)).toBeNull();
    expect(num('')).toBeNull();
    expect(num('abc')).toBeNull();
  });
});

describe('fieldDelta', () => {
  const rows = sortAsc([
    m('2026-10-05', { weight_kg: 70, waist_cm: 80 }),
    m('2026-10-01', { weight_kg: 71.2 }),
    m('2026-10-08', { weight_kg: 69.6 }),
  ]);
  it('compares with the closest earlier row having the field', () => {
    expect(fieldDelta(rows, 2, 'weight_kg')).toBe(-0.4);
    expect(fieldDelta(rows, 1, 'weight_kg')).toBe(-1.2);
  });
  it('returns null without a previous value', () => {
    expect(fieldDelta(rows, 0, 'weight_kg')).toBeNull();
    expect(fieldDelta(rows, 1, 'waist_cm')).toBeNull();
    expect(fieldDelta(rows, 2, 'waist_cm')).toBeNull();
  });
});

describe('weightStats', () => {
  const rows = [m('2026-10-08', { weight_kg: 69.6 }), m('2026-10-01', { weight_kg: 71.2 }), m('2026-10-05', { waist_cm: 80 })];
  it('uses the profile start weight when given', () => {
    const s = weightStats(rows, 73);
    expect(s.current).toBe(69.6);
    expect(s.previous).toBe(71.2);
    expect(s.deltaPrev).toBe(-1.6);
    expect(s.deltaStart).toBe(-3.4);
    expect(s.count).toBe(2);
  });
  it('falls back to the first weigh-in', () => {
    const s = weightStats(rows, null);
    expect(s.start).toBe(71.2);
    expect(s.startDate).toBe('2026-10-01');
  });
  it('handles empty input', () => {
    const s = weightStats([]);
    expect(s.current).toBeNull();
    expect(s.deltaPrev).toBeNull();
    expect(s.deltaStart).toBeNull();
  });
});

describe('deltaTone', () => {
  it('follows the goal for weight', () => {
    expect(deltaTone('weight_kg', -1, 'lose')).toBe('good');
    expect(deltaTone('weight_kg', 1, 'lose')).toBe('bad');
    expect(deltaTone('weight_kg', 1, 'gain')).toBe('good');
    expect(deltaTone('weight_kg', 1, 'maintain')).toBe('neutral');
  });
  it('treats lower fat / waist as good, others neutral', () => {
    expect(deltaTone('body_fat_pct', -0.5)).toBe('good');
    expect(deltaTone('waist_cm', 2)).toBe('bad');
    expect(deltaTone('arm_cm', 1)).toBe('neutral');
    expect(deltaTone('weight_kg', 0, 'lose')).toBe('neutral');
  });
});

describe('grouping', () => {
  const items = ['2026-09-30', '2026-10-08', '2026-10-01', '2026-10-05'];
  it('groups by month newest first', () => {
    const g = groupByMonth(items, (s) => s);
    expect(g.map((x) => x.key)).toEqual(['2026-10', '2026-09']);
    expect(g[0].items).toEqual(['2026-10-08', '2026-10-05', '2026-10-01']);
    expect(g[0].label).toBe('Tháng 10, 2026');
  });
  it('groups by Monday weeks with relative labels', () => {
    const g = groupByWeek(items, (s) => s, '2026-10-09');
    expect(g.map((x) => x.key)).toEqual(['2026-10-05', '2026-09-28']);
    expect(g[0].label).toBe('Tuần này');
    expect(g[1].label).toBe('Tuần trước');
    expect(g[1].items).toEqual(['2026-10-01', '2026-09-30']);
  });
  it('labels older weeks with a date range', () => {
    const g = groupByWeek(['2026-09-16'], (s) => s, '2026-10-09');
    expect(g[0].label).toBe('14/9 – 20/9');
  });
});

describe('weightOn', () => {
  const rows = [m('2026-10-01', { weight_kg: 71 }), m('2026-10-06', { weight_kg: 70 }), m('2026-10-07', { waist_cm: 80 })];
  it('finds exact and nearest weights within the gap', () => {
    expect(weightOn(rows, '2026-10-06')).toEqual({ weight: 70, date: '2026-10-06', exact: true });
    expect(weightOn(rows, '2026-10-08')).toEqual({ weight: 70, date: '2026-10-06', exact: false });
    expect(weightOn(rows, '2026-12-01')).toBeNull();
    expect(weightOn(rows, '2026-10-03', 1)).toBeNull();
  });
});

describe('weightSeries', () => {
  const rows = [m('2026-08-01', { weight_kg: 74 }), m('2026-10-01', { weight_kg: 71 }), m('2026-10-05', { waist_cm: 80 })];
  it('filters to the window and skips rows without weight', () => {
    expect(weightSeries(rows, 30, '2026-10-09')).toEqual([{ date: '2026-10-01', weight: 71 }]);
    expect(weightSeries(rows, null, '2026-10-09')).toHaveLength(2);
  });
});

describe('photo selection', () => {
  it('orders a pair oldest first', () => {
    const a = photo('a', '2026-10-01');
    const b = photo('b', '2026-08-01');
    expect(orderPair(a, b).map((p) => p.id)).toEqual(['b', 'a']);
  });
  it('keeps at most two picks', () => {
    expect(toggleSelection([], 'a')).toEqual(['a']);
    expect(toggleSelection(['a'], 'a')).toEqual([]);
    expect(toggleSelection(['a', 'b'], 'c')).toEqual(['b', 'c']);
  });
});

describe('hasAnyMetric', () => {
  it('needs at least one value', () => {
    expect(hasAnyMetric({})).toBe(false);
    expect(hasAnyMetric({ weight_kg: null, arm_cm: 30 })).toBe(true);
  });
});

describe('deltaTone by goal for circumferences', () => {
  it('rewards bigger chest / arm / thigh when building muscle', () => {
    expect(deltaTone('arm_cm', 0.5, 'gain')).toBe('good');
    expect(deltaTone('chest_cm', -1, 'gain')).toBe('bad');
    expect(deltaTone('thigh_cm', 1, 'recomp')).toBe('good');
    expect(deltaTone('arm_cm', 1, 'lose')).toBe('neutral');
  });
  it('does not punish a bigger waist on a gain goal', () => {
    expect(deltaTone('waist_cm', 1, 'gain')).toBe('neutral');
    expect(deltaTone('waist_cm', 1, 'lose')).toBe('bad');
    expect(deltaTone('hip_cm', -2, 'lose')).toBe('neutral');
  });
});

describe('targetStatus', () => {
  it('counts the remaining kilos in the goal direction', () => {
    expect(targetStatus(76.6, 70, 'lose', 78)).toEqual({ reached: false, remaining: 6.6, direction: 'down', pct: 0.18 });
    expect(targetStatus(60, 65, 'gain', 58)).toEqual({ reached: false, remaining: 5, direction: 'up', pct: 0.29 });
  });
  it('treats going past the target in the goal direction as reached', () => {
    expect(targetStatus(68.4, 70, 'lose', 78)?.reached).toBe(true);
    expect(targetStatus(68.4, 70, 'lose', 78)?.pct).toBe(1);
    expect(targetStatus(66, 65, 'gain', 58)?.reached).toBe(true);
    expect(targetStatus(70.02, 70, 'lose', null)?.reached).toBe(true);
  });
  it('uses a ±1 kg band for maintain / recomp', () => {
    expect(targetStatus(70.8, 70, 'maintain', null)?.reached).toBe(true);
    expect(targetStatus(72, 70, 'maintain', null)).toEqual({ reached: false, remaining: 2, direction: 'down', pct: null });
  });
  it('returns null without a current weight or a target', () => {
    expect(targetStatus(null, 70, 'lose', 78)).toBeNull();
    expect(targetStatus(70, null, 'lose', 78)).toBeNull();
  });
  it('clamps progress when the weight moved the wrong way', () => {
    expect(targetStatus(79, 70, 'lose', 78)?.pct).toBe(0);
  });
});

describe('defaultChartRange', () => {
  it('keeps 3 months when there is enough recent data', () => {
    expect(defaultChartRange([m('2026-10-01', { weight_kg: 71 }), m('2026-10-05', { weight_kg: 70 })], '2026-10-09')).toBe('90');
  });
  it('widens the window when the last 3 months have fewer than 2 weigh-ins', () => {
    expect(defaultChartRange([m('2026-03-01', { weight_kg: 74 }), m('2026-10-05', { weight_kg: 70 })], '2026-10-09')).toBe('365');
    expect(defaultChartRange([m('2024-03-01', { weight_kg: 74 }), m('2024-04-05', { weight_kg: 70 })], '2026-10-09')).toBe('all');
    expect(defaultChartRange([], '2026-10-09')).toBe('90');
  });
});

describe('planRefresh', () => {
  const TODAY = new Date(2026, 9, 11);
  const base = {
    user_id: 'u', sex: 'male', birth_date: '1996-01-15', height_cm: 172, activity_level: 'moderate', goal: 'lose', goal_pace: 'medium',
    start_weight_kg: 78, target_weight_kg: 70, calorie_target: 0, protein_g: 0, carbs_g: 0, fat_g: 0, macro_custom: false,
    water_target_ml: 2700, step_target: 10000, onboarded_at: 'x', created_at: '', updated_at: '',
  } as FitProfile;
  // Saved exactly as /goals would have saved it at 78 kg.
  const d78 = profileToDraft(base, 78, TODAY);
  const saved = { ...base, ...draftToPatch(d78, computePlan(d78, TODAY)!) } as FitProfile;

  it('no hint when the weight has not changed (plan is up to date)', () => {
    expect(planRefresh(saved, 78, TODAY)).toBeNull();
  });

  it('ignores rounding noise from a small weigh-in change', () => {
    expect(planRefresh(saved, 77.9, TODAY)).toBeNull();
  });

  it('suggests a refresh after a meaningful weight change', () => {
    const r = planRefresh(saved, 72, TODAY);
    expect(r).not.toBeNull();
    expect(r!.from).toBe(saved.calorie_target);
    expect(r!.to).toBeLessThan(saved.calorie_target!);
  });

  it('PostgREST numeric strings are handled', () => {
    const asStrings = { ...saved, calorie_target: String(saved.calorie_target), protein_g: String(saved.protein_g) } as unknown as FitProfile;
    expect(planRefresh(asStrings, 78, TODAY)).toBeNull();
  });

  it('never for a manual plan, missing weight, or no profile', () => {
    expect(planRefresh({ ...saved, macro_custom: true }, 60, TODAY)).toBeNull();
    expect(planRefresh(saved, null, TODAY)).toBeNull();
    expect(planRefresh(null, 72, TODAY)).toBeNull();
    expect(planRefresh({ ...saved, onboarded_at: null } as unknown as FitProfile, 72, TODAY)).toBeNull();
  });
});

describe('movingAverage', () => {
  it('averages over a trailing 7-day time window, not a point count', () => {
    const s = [
      { date: '2026-10-01', weight: 70 },
      { date: '2026-10-03', weight: 69 },
      { date: '2026-10-07', weight: 68 }, // window 01..07 → 69
      { date: '2026-10-08', weight: 67 }, // 01 drops out → (69+68+67)/3 = 68
      { date: '2026-10-30', weight: 66 }, // alone in its window
    ];
    expect(movingAverage(s).map((p) => p.avg)).toEqual([70, 69.5, 69, 68, 66]);
    expect(movingAverage([])).toEqual([]);
  });
  it('keeps the raw weight on each point', () => {
    expect(movingAverage([{ date: '2026-10-01', weight: 70.4 }])[0]).toEqual({ date: '2026-10-01', weight: 70.4, avg: 70.4 });
  });
});

describe('latestValue', () => {
  it('returns the most recent non-null value of a key', () => {
    const rows = [m('2026-10-05', { waist_cm: 80 }), m('2026-10-09', { weight_kg: 70 }), m('2026-10-01', { waist_cm: 82 })];
    expect(latestValue(rows, 'waist_cm')).toEqual({ value: 80, date: '2026-10-05' });
    expect(latestValue(rows, 'hip_cm')).toBeNull();
  });
});

describe('waistToHeight', () => {
  it('computes the ratio and bands', () => {
    expect(waistToHeight(80, 170)).toEqual({ ratio: 0.47, key: 'healthy', label: 'Khỏe mạnh' });
    expect(waistToHeight(90, 170)?.key).toBe('elevated');
    expect(waistToHeight(110, 170)?.key).toBe('high');
    expect(waistToHeight(60, 170)?.key).toBe('low');
    expect(waistToHeight('85', '170')?.ratio).toBe(0.5);
  });
  it('is null on missing / invalid input', () => {
    expect(waistToHeight(null, 170)).toBeNull();
    expect(waistToHeight(80, 0)).toBeNull();
  });
});

describe('weightJump', () => {
  const rows = [m('2026-10-01', { weight_kg: 70 }), m('2026-10-08', { weight_kg: 69.5 }), m('2026-10-10', { waist_cm: 80 })];
  it('flags an implausible change vs the nearest other weigh-in', () => {
    expect(weightJump(rows, '2026-10-09', 7)).toEqual({ diff: -62.5, date: '2026-10-08', weight: 69.5 });
    expect(weightJump(rows, '2026-10-09', 73)).toEqual({ diff: 3.5, date: '2026-10-08', weight: 69.5 });
  });
  it('allows normal day-to-day drift and longer-term change', () => {
    expect(weightJump(rows, '2026-10-09', 71)).toBeNull(); // +1.5 in 1 day
    expect(weightJump(rows, '2026-10-29', 66)).toBeNull(); // −3.5 in 21 days (allowed 5.15)
  });
  it('ignores the same day (editing) and far-away / missing data', () => {
    expect(weightJump(rows, '2026-10-08', 90)?.date).toBe('2026-10-01');
    expect(weightJump([m('2026-10-08', { weight_kg: 69.5 })], '2026-10-08', 90)).toBeNull();
    expect(weightJump(rows, '2027-03-01', 90)).toBeNull();
    expect(weightJump(rows, '2026-10-09', null)).toBeNull();
  });
});

describe('rangeError', () => {
  it('validates against realistic ranges with a decimal comma message and unit', () => {
    expect(rangeError('weight_kg', 68.5)).toBeUndefined();
    expect(rangeError('weight_kg', null)).toBeUndefined();
    expect(rangeError('weight_kg', 685)).toBe('Từ 25 đến 300 kg');
    expect(rangeError('arm_cm', 120)).toBe(`Từ ${METRIC_RANGES.arm_cm[0]} đến ${METRIC_RANGES.arm_cm[1]} cm`);
    expect(rangeError('body_fat_pct', 1)).toBeDefined();
  });
  it('uses realistic bounds (weight 25–300 kg, waist 40–200 cm)', () => {
    expect(METRIC_RANGES.weight_kg).toEqual([25, 300]);
    expect(METRIC_RANGES.waist_cm).toEqual([40, 200]);
    // 24 kg or 310 kg is a typo, not a weigh-in
    expect(rangeError('weight_kg', 24)).toBe('Từ 25 đến 300 kg');
    expect(rangeError('weight_kg', 310)).toBe('Từ 25 đến 300 kg');
    expect(rangeError('waist_cm', 39)).toBe('Từ 40 đến 200 cm');
    expect(rangeError('waist_cm', 201)).toBe('Từ 40 đến 200 cm');
    expect(rangeError('waist_cm', 72)).toBeUndefined();
  });
});
