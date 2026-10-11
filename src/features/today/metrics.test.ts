import { describe, expect, it } from 'vitest';
import type { FitProfile, MealEntry } from '@/types/db';
import {
  activityModel,
  computeStreaks,
  heroSummary,
  nn,
  summaryFromParts,
  dateEyebrow,
  dropletCount,
  dropletFills,
  effectiveWeight,
  energyBalance,
  fiberTarget,
  greetingName,
  groupMeals,
  macroStatus,
  progressPercent,
  mealForHour,
  targetsFromProfile,
} from './metrics';

describe('energyBalance', () => {
  it('remaining = target − eaten + workout + steps', () => {
    const e = energyBalance({ kcal_in: 1200, workout_kcal: 300, steps: 7000 }, 2000, 70);
    expect(e.stepsKcal).toBe(280);
    expect(e.burned).toBe(580);
    expect(e.remaining).toBe(1380);
    expect(e.over).toBe(false);
    expect(e.budget).toBe(2580);
    expect(e.progress).toBeCloseTo(1200 / 2580);
  });

  it('does not count activity the activity level already includes in the target', () => {
    // Male 70 kg, 175 cm, 30 y: BMR 1649; moderate TDEE 2556; BMR×1.2 = 1978.8 → allowance 577.
    const fit = { sex: 'male', birth_date: '1996-01-01', height_cm: 175, activity_level: 'moderate' } as FitProfile;
    const m = activityModel(fit, 70, '2026-10-11')!;
    expect(m).toMatchObject({ bmr: 1649, tdee: 2556, allowance: 577 });
    const e = energyBalance({ kcal_in: 1200, workout_kcal: 300, steps: 7000 }, 2000, 70, m);
    expect(e.burned).toBe(580);
    expect(e.bonus).toBe(3); // 1979 + 580 − 2556
    expect(e.remaining).toBe(803);
    expect(e.budget).toBe(2003);
    // Below the allowance nothing is added on top of the target.
    expect(energyBalance({ kcal_in: 1200, workout_kcal: 100, steps: 0 }, 2000, 70, m).bonus).toBe(0);
  });

  it('credits all activity for a sedentary profile and without a model', () => {
    const fit = { sex: 'male', birth_date: '1996-01-01', height_cm: 175, activity_level: 'sedentary' } as FitProfile;
    const m = activityModel(fit, 70, '2026-10-11')!;
    expect(m.allowance).toBe(0);
    expect(energyBalance({ kcal_in: 1200, workout_kcal: 300, steps: 7000 }, 2000, 70, m).bonus).toBe(580);
    expect(energyBalance({ kcal_in: 1200, workout_kcal: 300, steps: 7000 }, 2000, 70, null).bonus).toBe(580);
  });

  it('has no model for an incomplete profile', () => {
    expect(activityModel(null, 70, '2026-10-11')).toBeNull();
    expect(activityModel({ sex: 'male', birth_date: null, height_cm: 175, activity_level: 'moderate' } as unknown as FitProfile, 70, '2026-10-11')).toBeNull();
  });

  it('flags over budget and clamps progress', () => {
    const e = energyBalance({ kcal_in: 2500, workout_kcal: 0, steps: 0 }, 2000, 70);
    expect(e.remaining).toBe(-500);
    expect(e.over).toBe(true);
    expect(e.progress).toBe(1);
  });
});

describe('targets', () => {
  it('falls back when profile is missing', () => {
    const t = targetsFromProfile(null);
    expect(t.kcal).toBe(2000);
    expect(t.protein_g).toBe(100);
    expect(t.water_ml).toBe(2000);
    expect(t.steps).toBe(8000);
  });
  it('uses profile values', () => {
    const t = targetsFromProfile({ calorie_target: 1800, protein_g: 130, carbs_g: 180, fat_g: 55, water_target_ml: 2500, step_target: 10000 } as FitProfile);
    expect(t).toMatchObject({ kcal: 1800, protein_g: 130, carbs_g: 180, fat_g: 55, water_ml: 2500, steps: 10000, fiber_g: 25 });
  });
  it('fiber is 14 g / 1000 kcal, min 20', () => {
    expect(fiberTarget(2000)).toBe(28);
    expect(fiberTarget(1000)).toBe(20);
  });
  it('effective weight prefers the latest measurement', () => {
    expect(effectiveWeight(72.5, 80)).toBe(72.5);
    expect(effectiveWeight(null, 80)).toBe(80);
    expect(effectiveWeight(null, null)).toBe(65);
  });
});

describe('water droplets', () => {
  it('one droplet per 250 ml, 4–10', () => {
    expect(dropletCount(2000)).toBe(8);
    expect(dropletCount(500)).toBe(4);
    expect(dropletCount(4000)).toBe(10);
  });
  it('fills droplets in order with a partial last one', () => {
    expect(dropletFills(625, 2000)).toEqual([1, 1, 0.5, 0, 0, 0, 0, 0]);
    expect(dropletFills(5000, 2000).every((f) => f === 1)).toBe(true);
  });
});

describe('labels', () => {
  it('formats the date eyebrow', () => {
    expect(dateEyebrow('Thứ Sáu', '2026-10-09')).toBe('Thứ Sáu, 09/10');
  });
  it('greets by given name', () => {
    expect(greetingName('Nguyễn Bá Tuyến')).toBe('Tuyến');
    expect(greetingName('')).toBe('bạn');
  });
});

describe('meals', () => {
  it('suggests a meal by hour', () => {
    expect(mealForHour(7)).toBe('breakfast');
    expect(mealForHour(12)).toBe('lunch');
    expect(mealForHour(15)).toBe('snack');
    expect(mealForHour(19)).toBe('dinner');
    expect(mealForHour(23)).toBe('snack');
  });
  it('groups entries per meal in order', () => {
    const e = (meal: MealEntry['meal'], name: string, kcal: number) => ({ meal, name, kcal }) as MealEntry;
    const g = groupMeals([e('lunch', 'Cơm tấm', 600), e('breakfast', 'Phở bò', 450), e('lunch', 'Trà đá', 0.4)], ['breakfast', 'lunch', 'dinner', 'snack']);
    expect(g.map((x) => x.kcal)).toEqual([450, 600, 0, 0]);
    expect(g[1]).toMatchObject({ count: 2, names: ['Cơm tấm', 'Trà đá'] });
  });
});

describe('macro & progress display maths', () => {
  it('macro left is computed on the rounded shown values', () => {
    expect(macroStatus(73.5, 156)).toEqual({ eaten: 74, target: 156, left: 82 });
    expect(macroStatus(43.6, 62)).toEqual({ eaten: 44, target: 62, left: 18 });
    expect(macroStatus(70, 62).left).toBe(-8);
  });
  it('progressPercent never shows 100 % before the target is reached', () => {
    expect(progressPercent(7970, 8000)).toBe(99);
    expect(progressPercent(8000, 8000)).toBe(100);
    expect(progressPercent(12000, 8000)).toBe(150);
    expect(progressPercent(100, 0)).toBe(0);
  });
});

describe('nn', () => {
  it('turns junk into 0 and keeps finite positives', () => {
    expect(nn(NaN)).toBe(0);
    expect(nn(null)).toBe(0);
    expect(nn(-5)).toBe(0);
    expect(nn('12.5')).toBe(12.5);
    expect(nn(Infinity)).toBe(0);
  });
});

describe('summaryFromParts', () => {
  it('sums meals, only done workouts, and takes water/steps from the daily log', () => {
    const s = summaryFromParts(
      [
        { kcal: 500, protein_g: 30, carbs_g: 60, fat_g: 10, fiber_g: 4 },
        { kcal: 250.5, protein_g: 10, carbs_g: 20, fat_g: 12, fiber_g: NaN as unknown as number },
      ],
      [
        { kcal: 300, status: 'done' },
        { kcal: 400, status: 'planned' },
      ],
      { water_ml: 750, steps: 4200 },
    );
    expect(s).toEqual({ kcal_in: 750.5, protein_g: 40, carbs_g: 80, fat_g: 22, fiber_g: 4, workout_kcal: 300, water_ml: 750, steps: 4200 });
  });
});

describe('computeStreaks', () => {
  const row = (day: string, kcal_in: number, water_ml = 0) => ({ day, kcal_in, water_ml });
  const today = { date: '2026-10-11', kcalIn: 0, waterMl: 0, waterTarget: 2000 };

  it('counts consecutive past days and does not break while today is open', () => {
    const h = [row('2026-10-10', 1800), row('2026-10-09', 1500), row('2026-10-08', 0), row('2026-10-07', 2000)];
    expect(computeStreaks(h, today)).toEqual({ logging: 2, water: 0, loggedToday: false });
    expect(computeStreaks(h, { ...today, kcalIn: 300 }).logging).toBe(3);
  });

  it('water streak needs the target reached each day; order of rows does not matter', () => {
    const h = [row('2026-10-09', 1, 2100), row('2026-10-10', 1, 2000)];
    expect(computeStreaks(h, { ...today, waterMl: 2000 }).water).toBe(3);
    expect(computeStreaks(h, { ...today, waterMl: 1999 }).water).toBe(2);
  });

  it('a gap ends the streak', () => {
    expect(computeStreaks([row('2026-10-09', 1000)], today).logging).toBe(0);
    expect(computeStreaks([], { ...today, kcalIn: 10 }).logging).toBe(1);
  });
});

describe('heroSummary', () => {
  it('reads remaining / over and the budget share', () => {
    expect(heroSummary({ remaining: 1234, eaten: 800, budget: 2034, over: false })).toBe(
      'Còn 1.234 kcal. Đã ăn 800 trên ngân sách 2.034 kcal (39%).',
    );
    expect(heroSummary({ remaining: -150, eaten: 2150, budget: 2000, over: true })).toBe(
      'Đã vượt 150 kcal. Đã ăn 2.150 trên ngân sách 2.000 kcal (107%).',
    );
  });
});
