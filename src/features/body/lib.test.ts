import { describe, expect, it } from 'vitest';
import type { BodyMeasurement, ProgressPhoto } from '@/types/db';
import {
  deltaTone,
  fieldDelta,
  groupByMonth,
  groupByWeek,
  hasAnyMetric,
  num,
  orderPair,
  sortAsc,
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
