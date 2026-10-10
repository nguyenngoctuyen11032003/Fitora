import { describe, expect, it } from 'vitest';
import type { RangeSummaryRow } from '@/types/db';
import {
  buildReport,
  canGoNext,
  estimateMaintenance,
  makeVerdict,
  periodCaption,
  periodLabel,
  periodRange,
  shiftPeriod,
  type ProfileTargets,
} from './lib';

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

describe('period helpers', () => {
  it('week range is Monday–Sunday', () => {
    expect(periodRange('week', '2026-10-01')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(periodLabel('week', '2026-10-01')).toBe('28/09 – 04/10');
  });
  it('month range + label', () => {
    expect(periodRange('month', '2026-02-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodLabel('month', '2026-10-09')).toBe('Tháng 10, 2026');
  });
  it('shifts periods across year boundaries', () => {
    expect(shiftPeriod('week', '2026-10-09', -1)).toBe('2026-09-28');
    expect(shiftPeriod('month', '2026-01-31', -1)).toBe('2025-12-01');
    expect(shiftPeriod('month', '2026-12-05', 1)).toBe('2027-01-01');
  });
  it('blocks navigating into the future', () => {
    expect(canGoNext('week', '2026-10-09', '2026-10-09')).toBe(false);
    expect(canGoNext('week', '2026-10-01', '2026-10-09')).toBe(true);
    expect(canGoNext('month', '2026-09-10', '2026-10-09')).toBe(true);
  });
  it('captions', () => {
    expect(periodCaption('week', '2026-10-09', '2026-10-09')).toBe('Tuần này');
    expect(periodCaption('week', '2026-09-30', '2026-10-09')).toBe('Tuần trước');
    expect(periodCaption('month', '2026-09-03', '2026-10-09')).toBe('Tháng trước');
  });
});

describe('estimateMaintenance', () => {
  it('uses Mifflin × activity when the profile is complete', () => {
    // 10*80 + 6.25*175 − 5*30 + 5 = 1748.75 → 1749 × 1.2 = 2099
    const m = estimateMaintenance(profile, 80, '2026-10-09');
    expect(m).toEqual({ kcal: 2099, basis: 'profile' });
  });
  it('falls back to inverting the goal target', () => {
    const m = estimateMaintenance({ ...profile, birth_date: null }, null, '2026-10-09');
    expect(m).toEqual({ kcal: 2500, basis: 'target' });
    expect(estimateMaintenance({ ...profile, birth_date: null, goal: 'gain' }, null, '2026-10-09').kcal).toBe(1700);
  });
  it('null without profile', () => {
    expect(estimateMaintenance(null, 70, '2026-10-09')).toEqual({ kcal: null, basis: null });
  });
});

describe('buildReport', () => {
  const base = { from: '2026-10-05', to: '2026-10-11', period: 'week' as const, today: '2026-10-09', refWeightKg: 80 };

  it('handles an empty period', () => {
    const s = buildReport({ ...base, rows: [], profile });
    expect(s.days).toHaveLength(7);
    expect(s.elapsedDays).toBe(5);
    expect(s.loggedDays).toBe(0);
    expect(s.balance).toBe(0);
    expect(s.avgMacros).toEqual({ protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(s.verdict.tone).toBe('neutral');
    expect(s.days[6].future).toBe(true);
    expect(s.days[6].kcalIn).toBeNull();
  });

  it('computes balance vs maintenance, only over logged days', () => {
    const rows = [
      row('2026-10-05', { kcal_in: 1900, protein_g: 150, carbs_g: 180, fat_g: 60, workout_kcal: 300 }),
      row('2026-10-06', { kcal_in: 2000, protein_g: 170, carbs_g: 200, fat_g: 60 }),
      row('2026-10-07', { kcal_in: 2100, protein_g: 160, carbs_g: 220, fat_g: 60, steps: 7000 }),
      row('2026-10-08'), // nothing logged → ignored in balance
    ];
    const s = buildReport({ ...base, rows, profile });
    // steps kcal: 7000*0.04*80/70 = 320
    expect(s.days[2].stepsKcal).toBe(320);
    expect(s.loggedDays).toBe(3);
    // in 6000 − burned 620 − 3*2099
    expect(s.balance).toBe(6000 - 620 - 3 * 2099);
    expect(s.estWeightChangeKg).toBeCloseTo((6000 - 620 - 6297) / 7700, 2);
    expect(s.vsTarget).toBe(6000 - 620 - 6000);
    expect(s.avgMacros).toEqual({ protein_g: 160, carbs_g: 200, fat_g: 60 });
    expect(s.longestStreak).toBe(3);
  });

  it('counts on-target days against target + burned (±10%)', () => {
    const rows = [
      row('2026-10-05', { kcal_in: 2250, workout_kcal: 300 }), // budget 2300 → ok
      row('2026-10-06', { kcal_in: 1750 }), // 2000 −12.5% → miss
      row('2026-10-07', { kcal_in: 2190 }), // +9.5% → ok
    ];
    const s = buildReport({ ...base, rows, profile });
    expect(s.onTargetDays).toBe(2);
  });

  it('water / steps / streak stats', () => {
    const rows = [
      row('2026-10-05', { kcal_in: 100, water_ml: 2000, steps: 9000 }),
      row('2026-10-06', { water_ml: 1500, steps: 3000 }),
      row('2026-10-07', { kcal_in: 100, water_ml: 2500 }),
      row('2026-10-08', { kcal_in: 100 }),
      row('2026-10-11', { kcal_in: 5000, water_ml: 9999 }), // future → ignored
    ];
    const s = buildReport({ ...base, rows, profile });
    expect(s.waterHitDays).toBe(2);
    expect(s.stepDays).toBe(2);
    expect(s.avgSteps).toBe(6000);
    expect(s.stepHitDays).toBe(1);
    expect(s.longestStreak).toBe(2);
    expect(s.loggedDays).toBe(3);
  });

  it('weight trend + BMI', () => {
    const rows = [row('2026-10-05', { weight_kg: 80 }), row('2026-10-08', { weight_kg: 79.4 })];
    const s = buildReport({ ...base, rows, profile });
    expect(s.weightPoints).toHaveLength(2);
    expect(s.weightDelta).toBe(-0.6);
    expect(s.bmiLast).toBe(25.9);
    expect(s.days[0].bmi).toBe(26.1);
  });

  it('single weigh-in → no delta', () => {
    const s = buildReport({ ...base, rows: [row('2026-10-06', { weight_kg: 70 })], profile: null });
    expect(s.weightDelta).toBeNull();
    expect(s.bmiLast).toBeNull();
    expect(s.target).toBeNull();
  });
});

describe('makeVerdict', () => {
  const s = (dev: number, protein = 160) => ({ loggedDays: 5, target: 2000, avgDailyVsTarget: dev, avgMacros: { protein_g: protein, carbs_g: 0, fat_g: 0 } });
  it('needs data', () => {
    expect(makeVerdict('lose', { ...s(0), loggedDays: 2 }, profile).tone).toBe('neutral');
  });
  it('lose', () => {
    expect(makeVerdict('lose', s(-100), profile).tone).toBe('good');
    expect(makeVerdict('lose', s(300), profile).tone).toBe('warn');
    expect(makeVerdict('lose', s(600), profile).tone).toBe('bad');
    expect(makeVerdict('lose', s(-800), profile).title).toBe('Thâm hụt quá sâu');
  });
  it('gain', () => {
    expect(makeVerdict('gain', s(100), profile).tone).toBe('good');
    expect(makeVerdict('gain', s(-300), profile).tone).toBe('warn');
    expect(makeVerdict('gain', s(-600), profile).tone).toBe('bad');
    expect(makeVerdict('gain', s(800), profile).tone).toBe('warn');
  });
  it('maintain', () => {
    expect(makeVerdict('maintain', s(120), profile).tone).toBe('good');
    expect(makeVerdict('maintain', s(-300), profile).title).toBe('Hơi thiếu hụt');
    expect(makeVerdict('maintain', s(500), profile).tone).toBe('bad');
  });
  it('recomp checks protein', () => {
    expect(makeVerdict('recomp', s(0), profile).tone).toBe('good');
    expect(makeVerdict('recomp', s(0, 100), profile).tone).toBe('warn');
  });
});
