import { describe, expect, it } from 'vitest';
import type { RangeSummaryRow } from '@/types/db';
import {
  buildReport,
  dayExpenditure,
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
    expect(periodCaption('week', '2026-09-16', '2026-10-09')).toBe('3 tuần trước');
    expect(periodCaption('month', '2026-07-20', '2026-10-09')).toBe('3 tháng trước');
    expect(periodCaption('month', '2025-12-20', '2026-01-09')).toBe('Tháng trước');
  });
});

describe('estimateMaintenance', () => {
  it('uses Mifflin × activity when the profile is complete', () => {
    // 10*80 + 6.25*175 − 5*30 + 5 = 1748.75 → 1749 × 1.2 = 2099
    expect(estimateMaintenance(profile, 80, '2026-10-09')).toEqual({ kcal: 2099, bmr: 1749, basis: 'profile' });
  });
  it('falls back to inverting the goal target', () => {
    expect(estimateMaintenance({ ...profile, birth_date: null }, null, '2026-10-09')).toEqual({ kcal: 2500, bmr: null, basis: 'target' });
    expect(estimateMaintenance({ ...profile, birth_date: null, goal: 'gain' }, null, '2026-10-09').kcal).toBe(1700);
  });
  it('null without profile', () => {
    expect(estimateMaintenance(null, 70, '2026-10-09')).toEqual({ kcal: null, bmr: null, basis: null });
  });
});

describe('dayExpenditure (no double counting of activity)', () => {
  const m = { kcal: 2621, bmr: 1691, basis: 'profile' as const }; // moderate: 1691 × 1.55
  it('activity covered by the activity level does not add on top of TDEE', () => {
    expect(dayExpenditure(m, 300)).toBe(2621); // 1691×1.2+300 = 2329 < TDEE
  });
  it('activity beyond the usual level raises expenditure above the sedentary baseline', () => {
    expect(dayExpenditure(m, 1100)).toBe(Math.round(1691 * 1.2 + 1100));
  });
  it('target fallback adds logged activity', () => {
    expect(dayExpenditure({ kcal: 2500, bmr: null, basis: 'target' }, 200)).toBe(2700);
    expect(dayExpenditure({ kcal: null, bmr: null, basis: null }, 200)).toBeNull();
  });
});

describe('buildReport', () => {
  const base = { from: '2026-10-05', to: '2026-10-11', period: 'week' as const, today: '2026-10-09', refWeightKg: 80 };

  it('handles an empty period', () => {
    const s = buildReport({ ...base, rows: [], profile });
    expect(s.days).toHaveLength(7);
    expect(s.elapsedDays).toBe(5);
    expect(s.loggedDays).toBe(0);
    expect(s.countedDays).toBe(0);
    expect(s.balance).toBe(0);
    expect(s.avgMacros).toEqual({ protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(s.verdict.tone).toBe('neutral');
    expect(s.days[6].future).toBe(true);
    expect(s.days[6].kcalIn).toBeNull();
  });

  it("today's step kcal uses the latest weigh-in overall (refWeightKg), past days the period weight", () => {
    // Past period (no today inside) with an in-range weigh-in of 70 kg; latest overall is 80 kg.
    const rows = [
      row('2026-10-05', { steps: 7000, weight_kg: 70 }),
      row('2026-10-09', { steps: 7000 }), // today
    ];
    const s = buildReport({ ...base, rows, profile });
    expect(s.days[0].stepsKcal).toBe(280); // 7000*0.04*70/70
    expect(s.days[4].isToday).toBe(true);
    expect(s.days[4].stepsKcal).toBe(320); // 7000*0.04*80/70, same as Today/Workout
  });

  it('computes balance vs estimated expenditure, only over complete logged days', () => {
    const rows = [
      row('2026-10-05', { kcal_in: 1900, protein_g: 150, carbs_g: 180, fat_g: 60, workout_kcal: 300 }),
      row('2026-10-06', { kcal_in: 2000, protein_g: 170, carbs_g: 200, fat_g: 60 }),
      row('2026-10-07', { kcal_in: 2100, protein_g: 160, carbs_g: 220, fat_g: 60, steps: 7000 }),
      row('2026-10-08'), // nothing logged → ignored (NOT counted as 0 kcal eaten)
    ];
    const s = buildReport({ ...base, rows, profile });
    // steps kcal: 7000*0.04*80/70 = 320
    expect(s.days[2].stepsKcal).toBe(320);
    expect(s.loggedDays).toBe(3);
    expect(s.countedDays).toBe(3);
    // TDEE 2099, sedentary base 1749×1.2 = 2098.8 → 2399 / 2099 / 2419
    expect(s.days.slice(0, 3).map((d) => d.expenditure)).toEqual([2399, 2099, 2419]);
    expect(s.balance).toBe(6000 - (2399 + 2099 + 2419));
    expect(s.avgDailyBalance).toBe(Math.round(-917 / 3));
    expect(s.estWeightChangeKg).toBeCloseTo(-917 / 7700, 2);
    // food-only comparison with the target
    expect(s.vsTarget).toBe(0);
    expect(s.avgDailyVsTarget).toBe(0);
    expect(s.avgIn).toBe(2000);
    expect(s.plannedDailyBalance).toBe(2000 - 2099);
    expect(s.avgMacros).toEqual({ protein_g: 160, carbs_g: 200, fat_g: 60 });
    expect(s.longestStreak).toBe(3);
  });

  it('excludes today (still in progress) from balance and averages', () => {
    const rows = [
      row('2026-10-07', { kcal_in: 2000, protein_g: 150 }),
      row('2026-10-08', { kcal_in: 2000, protein_g: 150 }),
      row('2026-10-09', { kcal_in: 450, protein_g: 25 }), // today, only breakfast so far
    ];
    const s = buildReport({ ...base, rows, profile });
    expect(s.loggedDays).toBe(3);
    expect(s.countedDays).toBe(2);
    expect(s.todayPending).toBe(true);
    expect(s.avgIn).toBe(2000);
    expect(s.avgMacros.protein_g).toBe(150);
    expect(s.balance).toBe(2 * (2000 - 2099));
  });

  it('only today logged → averages fall back to today, no balance', () => {
    const s = buildReport({ ...base, rows: [row('2026-10-09', { kcal_in: 900, protein_g: 40 })], profile });
    expect(s.countedDays).toBe(0);
    expect(s.balance).toBe(0);
    expect(s.avgIn).toBe(900);
    expect(s.avgBasisIncomplete).toBe(true);
    expect(s.verdict.title).toBe('Chưa đủ dữ liệu');
  });

  it('skips past days with implausibly low intake (partial logging)', () => {
    const rows = [
      row('2026-10-05', { kcal_in: 2000 }),
      row('2026-10-06', { kcal_in: 450 }), // breakfast only → below 40 % of 2000
      row('2026-10-07', { kcal_in: 2000 }),
    ];
    const s = buildReport({ ...base, rows, profile });
    expect(s.partialThreshold).toBe(800);
    expect(s.partialDays).toBe(1);
    expect(s.days[1].partial).toBe(true);
    expect(s.countedDays).toBe(2);
    expect(s.avgIn).toBe(2000);
    expect(s.longestStreak).toBe(3); // still a logged day for the streak
  });

  it('uses the weigh-in of the period for maintenance (not only the latest overall)', () => {
    const rows = [row('2026-10-05', { kcal_in: 2000, weight_kg: 90 })];
    const s = buildReport({ ...base, rows, profile, refWeightKg: 70 });
    // 10*90 + 1093.75 − 150 + 5 = 1848.75 → 1849 × 1.2 = 2219
    expect(s.maintenance).toBe(2219);
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

  it('water / steps / streak stats; future rows ignored', () => {
    const rows = [
      row('2026-10-05', { kcal_in: 100, water_ml: 2000, steps: 9000 }),
      row('2026-10-06', { water_ml: 1500, steps: 3000 }),
      row('2026-10-07', { kcal_in: 100, water_ml: 2500 }),
      row('2026-10-08', { kcal_in: 100 }),
      row('2026-10-11', { kcal_in: 5000, water_ml: 9999, steps: 20000, weight_kg: 60 }), // future → ignored
    ];
    const s = buildReport({ ...base, rows, profile });
    expect(s.waterHitDays).toBe(2);
    expect(s.stepDays).toBe(2);
    expect(s.avgSteps).toBe(6000);
    expect(s.stepHitDays).toBe(1);
    expect(s.longestStreak).toBe(2);
    expect(s.loggedDays).toBe(3);
    expect(s.weightPoints).toHaveLength(0);
  });

  it('average activity ignores untracked days (unknown ≠ 0)', () => {
    const rows = [row('2026-10-05', { kcal_in: 2000, workout_kcal: 400 }), row('2026-10-06', { steps: 7000 })];
    const s = buildReport({ ...base, rows, profile });
    expect(s.trackedDays).toBe(2);
    expect(s.avgBurned).toBe(Math.round((400 + 320) / 2));
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

  it('seeded persona (moderate, 2000 kcal, eats ~1.650 and trains) is not reported as an extreme deficit', () => {
    // Mirrors seed_fitora_local.sql: male 31y, 172 cm, 76.6 kg, moderate, lose/medium, target 2000.
    const persona: ProfileTargets = { ...profile, birth_date: '1995-05-10', height_cm: 172, activity_level: 'moderate', start_weight_kg: 78 };
    const today = '2026-10-11';
    const rows: RangeSummaryRow[] = [];
    for (let d = 6; d >= 0; d--) {
      const day = `2026-10-${String(11 - d).padStart(2, '0')}`;
      const kcal = 450 + 650 + (d > 0 ? 420 + (d % 3) * 60 : 0) + (d % 2 === 0 ? 145.5 : 0);
      const workout = (d % 2 === 1 ? 410 : 0) + (d % 3 === 0 && d > 0 ? 380 : 0);
      rows.push(row(day, { kcal_in: kcal, workout_kcal: workout, steps: d === 0 ? 3200 : 6000 + (d % 5) * 900, weight_kg: d % 2 === 0 ? 76.6 + d * 0.1 : null }));
    }
    const s = buildReport({ rows, from: '2026-10-05', to: today, period: 'week', today, profile: persona, refWeightKg: 76.6 });
    expect(s.maintenance).toBe(2621); // BMR 1691 × 1.55
    expect(s.countedDays).toBe(6); // today excluded
    expect(s.avgDailyBalance).toBeGreaterThan(-1300);
    expect(s.avgDailyBalance).toBeLessThan(-800);
    expect(s.avgDailyVsTarget).toBeLessThan(0); // eats below the 2000 target
    expect(s.verdict.text).toMatch(/thâm hụt ~/);
  });
});

describe('makeVerdict', () => {
  // TDEE 2500, target 2000 → planned −500/day
  const s = (bal: number, protein = 160, plan = -500) => ({
    countedDays: 5,
    target: 2000,
    maintenance: 2500,
    plannedDailyBalance: plan,
    avgDailyBalance: bal,
    avgDailyVsTarget: bal - plan,
    avgIn: 2500 + bal,
    avgMacros: { protein_g: protein, carbs_g: 0, fat_g: 0 },
  });
  it('needs complete days', () => {
    expect(makeVerdict('lose', { ...s(0), countedDays: 2 }, profile).tone).toBe('neutral');
  });
  it('needs a goal + maintenance', () => {
    expect(makeVerdict('lose', { ...s(-500), maintenance: null, plannedDailyBalance: null }, profile).title).toBe('Chưa có mục tiêu');
  });
  it('lose', () => {
    const good = makeVerdict('lose', s(-450), profile);
    expect(good.tone).toBe('good');
    expect(good.text).toContain('thâm hụt ~450 kcal/ngày');
    expect(good.text).toContain('giảm 0,4 kg/tuần');
    expect(makeVerdict('lose', s(-150), profile).title).toBe('Thâm hụt ít hơn kế hoạch');
    expect(makeVerdict('lose', s(100), profile).tone).toBe('bad');
    expect(makeVerdict('lose', s(-1200), profile).title).toBe('Thâm hụt quá sâu');
    expect(makeVerdict('lose', s(-950), profile).tone).toBe('good'); // within max(plan+500, 1000)
    expect(makeVerdict('lose', s(-950), profile).text).toContain('sâu hơn kế hoạch');
    expect(good.text).toContain('sát kế hoạch');
    expect(makeVerdict('lose', s(-450, 100), profile).tone).toBe('warn'); // protein low
  });
  it('gain', () => {
    expect(makeVerdict('gain', s(300, 160, 300), profile).tone).toBe('good');
    expect(makeVerdict('gain', s(50, 160, 300), profile).tone).toBe('warn');
    expect(makeVerdict('gain', s(-200, 160, 300), profile).tone).toBe('bad');
    expect(makeVerdict('gain', s(900, 160, 300), profile).title).toBe('Dư thừa nhiều');
  });
  it('maintain', () => {
    expect(makeVerdict('maintain', s(120, 160, 0), profile).tone).toBe('good');
    expect(makeVerdict('maintain', s(-300, 160, 0), profile).title).toBe('Hơi thiếu hụt');
    expect(makeVerdict('maintain', s(500, 160, 0), profile).tone).toBe('bad');
  });
  it('recomp checks protein', () => {
    expect(makeVerdict('recomp', s(-250, 160, -250), profile).tone).toBe('good');
    expect(makeVerdict('recomp', s(-250, 100, -250), profile).tone).toBe('warn');
    expect(makeVerdict('recomp', s(-1000, 160, -250), profile).tone).toBe('bad');
  });
});
