import { describe, expect, it } from 'vitest';
import type { DaySummary, FitProfile, MealEntry } from '@/types/db';
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
  overBudgetStreak,
  targetsFromProfile,
  applyMealDelta,
  clockKey,
  restoreConfirmed,
} from './metrics';
import { guessMeal } from '@/features/food/lib';

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
    expect(mealForHour(10, 15)).toBe('breakfast');
    expect(mealForHour(10, 30)).toBe('lunch');
    expect(mealForHour(21, 29)).toBe('dinner');
    expect(mealForHour(21, 30)).toBe('snack');
    expect(mealForHour(3, 59)).toBe('snack');
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

describe('overBudgetStreak', () => {
  const row = (day: string, kcal_in: number, workout_kcal = 0) => ({ day, kcal_in, workout_kcal });
  const today = { date: '2026-10-11', over: true };

  it('counts consecutive over-budget days ending today', () => {
    const h = [row('2026-10-10', 2300), row('2026-10-09', 2100), row('2026-10-08', 1900)];
    expect(overBudgetStreak(h, today, 2000)).toBe(3);
  });

  it('is 0 while today is not over, even after over days', () => {
    const h = [row('2026-10-10', 2300), row('2026-10-09', 2100)];
    expect(overBudgetStreak(h, { ...today, over: false }, 2000)).toBe(0);
  });

  it('credits the whole workout burn: a training day over target is not flagged', () => {
    const h = [row('2026-10-10', 2300, 400), row('2026-10-09', 2300)];
    expect(overBudgetStreak(h, today, 2000)).toBe(1);
  });

  it('an unlogged or missing day breaks the streak (no data ≠ over)', () => {
    expect(overBudgetStreak([row('2026-10-09', 2500)], today, 2000)).toBe(1);
    expect(overBudgetStreak([row('2026-10-10', 0), row('2026-10-09', 2500)], today, 2000)).toBe(1);
  });

  it('needs a positive target', () => {
    expect(overBudgetStreak([row('2026-10-10', 2300)], today, 0)).toBe(0);
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

describe('meal suggestion consistency', () => {
  it('matches the food search guessMeal() at every minute of the day', () => {
    for (let m = 0; m < 24 * 60; m++) {
      const d = new Date(2026, 9, 12, Math.floor(m / 60), m % 60);
      expect(mealForHour(d.getHours(), d.getMinutes())).toBe(guessMeal(d));
    }
  });
  it('clockKey changes on a meal boundary inside the hour, not every minute', () => {
    const at = (h: number, m: number) => clockKey(new Date(2026, 9, 12, h, m));
    expect(at(10, 5)).toBe(at(10, 29));
    expect(at(10, 29)).not.toBe(at(10, 30));
    expect(at(11, 0)).not.toBe(at(10, 59));
  });
});

describe('applyMealDelta', () => {
  const sum = { kcal_in: 500, protein_g: 20, carbs_g: 60, fat_g: 10, fiber_g: 3, workout_kcal: 100, water_ml: 750, steps: 3000 };
  const entry = (id: string, kcal: number, eaten_on = '2026-10-12') =>
    ({ id, eaten_on, meal: 'lunch', name: id, kcal, protein_g: 10, carbs_g: 30, fat_g: 5, fiber_g: 1.5 }) as MealEntry;
  const a = entry('a', 500);

  it('adds entries and their totals, keeps water / steps / workout', () => {
    const r = applyMealDelta([a], sum, '2026-10-12', [entry('b', 320.4)]);
    expect(r.meals.map((m) => m.id)).toEqual(['a', 'b']);
    expect(r.summary).toMatchObject({ kcal_in: 820.4, protein_g: 30, carbs_g: 90, fat_g: 15, fiber_g: 4.5, water_ml: 750, steps: 3000, workout_kcal: 100 });
  });
  it('removes entries (undo) and never goes negative', () => {
    const r = applyMealDelta([a], { ...sum, kcal_in: 200 }, '2026-10-12', [], ['a']);
    expect(r.meals).toEqual([]);
    expect(r.summary.kcal_in).toBe(0);
  });
  it('is idempotent and ignores other days', () => {
    const meals = [a];
    const r = applyMealDelta(meals, sum, '2026-10-12', [a, entry('y', 100, '2026-10-11')], ['zz']);
    expect(r.meals).toBe(meals);
    expect(r.summary).toBe(sum);
  });
});

describe('restoreConfirmed', () => {
  const sum = { water_ml: 1000, steps: 4000, kcal_eaten: 10 } as unknown as DaySummary;
  it('rolls optimistic water / steps back to the confirmed values', () => {
    const out = restoreConfirmed(sum, { date: '2026-10-12', water_ml: 750, steps: 4000 }, '2026-10-12');
    expect(out).toMatchObject({ water_ml: 750, steps: 4000, kcal_eaten: 10 });
    expect(out).not.toBe(sum);
  });
  it('is a no-op when equal, unknown, or for another day', () => {
    expect(restoreConfirmed(sum, { date: '2026-10-12', water_ml: 1000, steps: 4000 }, '2026-10-12')).toBe(sum);
    expect(restoreConfirmed(sum, null, '2026-10-12')).toBe(sum);
    expect(restoreConfirmed(sum, { date: '2026-10-11', water_ml: 0, steps: 0 }, '2026-10-12')).toBe(sum);
  });
});
