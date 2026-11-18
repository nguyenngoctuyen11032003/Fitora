import { describe, expect, it } from 'vitest';
import { findActivity } from '@/data/activities';
import { findPlanDay, TRAINING_DAYS, WORKOUT_PLAN } from '@/data/workoutPlan';
import * as T from './timer';

const T0 = Date.parse('2026-11-18T08:00:00');
const W = { weightKg: 70, weightSource: 'measured' as const };

describe('plan data', () => {
  it('has 5 training days and 2 rest days with unique exercise ids per day', () => {
    expect(TRAINING_DAYS).toHaveLength(5);
    expect(WORKOUT_PLAN.filter((d) => d.isRestDay)).toHaveLength(2);
    for (const d of TRAINING_DAYS) expect(new Set(d.exercises.map((e) => e.id)).size).toBe(d.exercises.length);
  });
});

describe('timer', () => {
  const day = findPlanDay('monday')!;
  const s0 = T.start({ kind: 'plan', day, ...W }, T0, 'id1')!;

  it('starts a plan session on weight_training with the day variant', () => {
    expect(s0.activity).toBe('weight_training');
    expect(s0.met).toBe(3.5);
    expect(s0.title).toBe(day.title);
  });
  it('returns null without a day / activity', () => {
    expect(T.start({ kind: 'plan', ...W }, T0)).toBeNull();
    expect(T.start({ kind: 'activity', ...W }, T0)).toBeNull();
  });
  it('excludes paused time from elapsed', () => {
    const p = T.pause(s0, T0 + 10 * 60_000);
    expect(T.elapsedMs(p, T0 + 99 * 60_000)).toBe(10 * 60_000);
    const r = T.resume(p, T0 + 15 * 60_000);
    expect(T.elapsedMs(r, T0 + 20 * 60_000)).toBe(15 * 60_000);
  });
  it('tracks sets and finished exercises', () => {
    const ex = day.exercises[0];
    let s = T.setSetsDone(s0, ex.id, 2, ex.sets);
    expect(s.sets[ex.id]).toBe(2);
    expect(T.exercisesDone(s, day)).toBe(0);
    s = T.setSetsDone(s, ex.id, ex.sets + 5, ex.sets);
    expect(s.sets[ex.id]).toBe(ex.sets);
    expect(T.exercisesDone(s, day)).toBe(1);
    s = T.setSetsDone(s, ex.id, 0, ex.sets);
    expect(s.sets[ex.id]).toBeUndefined();
  });
  it('flags forgotten sessions and blocks saving under a minute', () => {
    expect(T.finish(s0, T0 + 20_000).canSave).toBe(false);
    const f = T.finish(s0, T0 + 5 * 3600_000);
    expect(f.forgotten).toBe(true);
    expect(f.suggestedMinutes).toBe(60);
  });
  it('builds the saved row', () => {
    const ex = day.exercises[0];
    const s = T.setSetsDone(s0, ex.id, ex.sets, ex.sets);
    const row = T.toWorkoutFields({ session: s, durationMin: 60, day });
    expect(row).toMatchObject({ workout_on: '2026-11-18', start_time: '08:00', category: 'gym', status: 'done', duration_min: 60, met: 3.5 });
    expect(row.notes).toBe(`1/${day.exercises.length} bài · Tập ngay`);
    expect(row.kcal).toBe(Math.round((3.5 * 3.5 * 70 * 60) / 200));
    expect(T.toWorkoutFields({ session: s, durationMin: 60, day, variantId: 'vigorous' }).met).toBe(6);
  });
  it('round-trips through storage and rejects garbage', () => {
    expect(T.parseSession(T.serializeSession(s0))).toEqual(s0);
    expect(T.parseSession('nope')).toBeNull();
    expect(T.parseSession(JSON.stringify({ id: 'x' }))).toBeNull();
  });
  it('starts an activity session with its default variant', () => {
    const run = findActivity('running')!;
    const s = T.start({ kind: 'activity', activity: run, ...W }, T0)!;
    expect(s.kind).toBe('activity');
    expect(s.met).toBeGreaterThan(0);
  });
});
