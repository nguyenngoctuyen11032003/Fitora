import { describe, expect, it } from 'vitest';
import type { FitProfile, MealEntry } from '@/types/db';
import {
  dateEyebrow,
  dropletCount,
  dropletFills,
  effectiveWeight,
  energyBalance,
  fiberTarget,
  greetingName,
  groupMeals,
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
