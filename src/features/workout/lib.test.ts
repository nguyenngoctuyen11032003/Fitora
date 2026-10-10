import { describe, expect, it } from 'vitest';
import { ACTIVITIES, ACTIVITY_BY_KEY, findActivity } from '@/data/activities';
import { WORKOUT_CATEGORIES, type Workout, type WorkoutTemplate } from '@/types/db';
import {
  buildTitle,
  dayBurn,
  dayMarks,
  defaultStatus,
  normalizeTime,
  normalizeVi,
  planCopies,
  recentSessions,
  resolveWeight,
  searchActivities,
  sessionsOn,
  stepRatio,
  variantForMet,
  weekDays,
  workoutFromTemplate,
} from './lib';

const w = (p: Partial<Workout>): Workout => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  user_id: 'u',
  workout_on: '2026-10-05',
  start_time: null,
  category: 'gym',
  activity: 'weight_training',
  title: 'Tập tạ · Vừa',
  met: 3.5,
  duration_min: 45,
  kcal: 200,
  status: 'done',
  template_id: null,
  notes: null,
  created_at: '2026-10-05T01:00:00Z',
  updated_at: '2026-10-05T01:00:00Z',
  ...p,
});

describe('activity catalogue', () => {
  it('has ≥ 40 activities with unique keys and valid METs in every category', () => {
    expect(ACTIVITIES.length).toBeGreaterThanOrEqual(40);
    expect(Object.keys(ACTIVITY_BY_KEY).length).toBe(ACTIVITIES.length);
    for (const a of ACTIVITIES) {
      expect(a.variants.length).toBeGreaterThan(0);
      expect(a.defaultVariant).toBeLessThan(a.variants.length);
      for (const v of a.variants) {
        expect(v.met).toBeGreaterThanOrEqual(1);
        expect(v.met).toBeLessThanOrEqual(25);
      }
      expect(new Set(a.variants.map((v) => v.id)).size).toBe(a.variants.length);
    }
    for (const c of WORKOUT_CATEGORIES) expect(ACTIVITIES.some((a) => a.category === c)).toBe(true);
  });

  it('matches the reference Compendium values', () => {
    expect(variantForMet(findActivity('running'), 8.3)?.label).toBe('8 km/h');
    expect(findActivity('swim_freestyle')?.variants[0].met).toBe(5.8);
    expect(findActivity('yoga_hatha')?.variants[0].met).toBe(2.5);
    expect(findActivity('weight_training')?.variants.map((v) => v.met)).toEqual([3.5, 6.0]);
    expect(findActivity('football')?.variants[0].met).toBe(7.0);
    expect(findActivity('badminton')?.variants[0].met).toBe(5.5);
    expect(variantForMet(findActivity('cycling_road'), 6.8)?.id).toBe('16_19');
  });
});

describe('search', () => {
  it('normalises Vietnamese', () => {
    expect(normalizeVi('  Đạp   Xe ')).toBe('dap xe');
  });
  it('is diacritic-insensitive and uses aliases', () => {
    expect(searchActivities('cau long')[0].key).toBe('badminton');
    expect(searchActivities('bơi').map((a) => a.key)).toContain('swim_freestyle');
    expect(searchActivities('zumba').map((a) => a.key)).toContain('dance');
    expect(searchActivities('chay', 'running').every((a) => a.category === 'running')).toBe(true);
    expect(searchActivities('', 'yoga').length).toBe(ACTIVITIES.filter((a) => a.category === 'yoga').length);
    expect(searchActivities('xyzxyz')).toEqual([]);
  });
  it('ranks name-prefix matches first', () => {
    expect(searchActivities('chạy bộ')[0].key).toBe('running');
  });
});

describe('titles & status', () => {
  it('builds titles', () => {
    const run = findActivity('running')!;
    expect(buildTitle(run, run.variants[1])).toBe('Chạy bộ · 8 km/h');
    const pil = findActivity('pilates')!;
    expect(buildTitle(pil, pil.variants[0])).toBe('Pilates');
  });
  it('defaults status by date', () => {
    expect(defaultStatus('2026-10-10', '2026-10-09')).toBe('planned');
    expect(defaultStatus('2026-10-09', '2026-10-09')).toBe('done');
    expect(defaultStatus('2026-10-01', '2026-10-09')).toBe('done');
  });
  it('resolves weight', () => {
    expect(resolveWeight(70.5, 80)).toEqual({ kg: 70.5, source: 'measured' });
    expect(resolveWeight(null, 80)).toEqual({ kg: 80, source: 'profile' });
    expect(resolveWeight(undefined, null).source).toBe('fallback');
  });
  it('normalises times', () => {
    expect(normalizeTime('07:30:00')).toBe('07:30');
    expect(normalizeTime('7:05')).toBe('07:05');
    expect(normalizeTime('25:00')).toBe('');
    expect(normalizeTime(null)).toBe('');
  });
  it('step ratio', () => {
    expect(stepRatio(4000, 8000)).toBe(0.5);
    expect(stepRatio(4000, 0)).toBe(0);
  });
});

describe('week & day', () => {
  it('lists the 7 days of a week', () => {
    const d = weekDays('2026-10-05');
    expect(d).toHaveLength(7);
    expect(d[0]).toBe('2026-10-05');
    expect(d[6]).toBe('2026-10-11');
  });
  it('marks days', () => {
    const m = dayMarks([w({ status: 'done' }), w({ status: 'planned' }), w({ workout_on: '2026-10-06', status: 'planned' })]);
    expect(m['2026-10-05']).toEqual({ done: 1, planned: 1 });
    expect(m['2026-10-06']).toEqual({ done: 0, planned: 1 });
  });
  it('sorts a day: timed first', () => {
    const list = sessionsOn(
      [
        w({ id: 'a', start_time: null, created_at: '2026-10-05T00:00:00Z' }),
        w({ id: 'b', start_time: '18:00:00' }),
        w({ id: 'c', start_time: '06:30:00' }),
        w({ id: 'd', workout_on: '2026-10-06' }),
      ],
      '2026-10-05',
    );
    expect(list.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
  it('sums burned energy (done + steps), planned separately', () => {
    const b = dayBurn([w({ kcal: 300, duration_min: 40 }), w({ kcal: 150, status: 'planned' }), w({ workout_on: '2026-10-04', kcal: 999 })], '2026-10-05', 7000, 70);
    expect(b.workoutKcal).toBe(300);
    expect(b.stepsKcal).toBe(280);
    expect(b.total).toBe(580);
    expect(b.doneMinutes).toBe(40);
    expect(b.plannedCount).toBe(1);
    expect(b.plannedKcal).toBe(150);
  });
});

describe('templates & copies', () => {
  it('applies a template with recomputed kcal', () => {
    const t: WorkoutTemplate = {
      id: 't1', user_id: 'u', name: 'Chạy sáng', category: 'running', activity: 'running', met: 8.3, duration_min: 30, notes: null,
      created_at: '', updated_at: '',
    };
    const row = workoutFromTemplate(t, '2026-10-09', 'done', 70);
    expect(row).toMatchObject({ workout_on: '2026-10-09', title: 'Chạy sáng', template_id: 't1', status: 'done', kcal: 305 });
  });
  it('copies to next week as planned and skips duplicates', () => {
    const src = [w({ id: '1', start_time: '06:00:00' }), w({ id: '2', title: 'Yoga', activity: 'yoga_hatha', status: 'planned' })];
    const existing = [{ workout_on: '2026-10-12', title: 'tập tạ · vừa', activity: 'weight_training', start_time: '06:00' }];
    const rows = planCopies(src, existing, 7);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ workout_on: '2026-10-12', title: 'Yoga', status: 'planned' });
    // the same source twice → only one copy
    expect(planCopies([src[1], src[1]], [], 7)).toHaveLength(1);
  });
  it('dedupes recent sessions', () => {
    const r = recentSessions([
      w({ id: 'a', workout_on: '2026-10-01' }),
      w({ id: 'b', workout_on: '2026-10-03' }),
      w({ id: 'c', workout_on: '2026-10-02', title: 'Yoga', activity: 'yoga_hatha' }),
    ]);
    expect(r.map((x) => x.id)).toEqual(['b', 'c']);
  });
});
