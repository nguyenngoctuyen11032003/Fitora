import { describe, expect, it } from 'vitest';
import { buildInsights, expectedWaterByHour, type InsightInput } from './insights';

const base: InsightInput = {
  hour: 12,
  kcalTarget: 2000,
  eaten: 900,
  remaining: 1100,
  protein: 60,
  proteinTarget: 120,
  fat: 30,
  fatTarget: 60,
  fiber: 10,
  fiberTarget: 28,
  water: 1000,
  waterTarget: 2000,
  steps: 4000,
  stepTarget: 8000,
  mealCount: 2,
  weightKg: 70,
  plannedWorkouts: [],
  doneWorkouts: 0,
};
const ids = (i: Partial<InsightInput>) => buildInsights({ ...base, ...i }).map((x) => x.id);

describe('expectedWaterByHour', () => {
  it('is 0 before 7h, full after 21h, linear between', () => {
    expect(expectedWaterByHour(2000, 6)).toBe(0);
    expect(expectedWaterByHour(2000, 14)).toBe(1000);
    expect(expectedWaterByHour(2000, 23)).toBe(2000);
  });
});

describe('buildInsights', () => {
  it('always returns at least one line', () => {
    const r = buildInsights(base);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].text.length).toBeGreaterThan(0);
  });

  it('flags calorie overrun first, with a walk suggestion', () => {
    const r = buildInsights({ ...base, eaten: 2300, remaining: -300, hour: 20 });
    expect(r[0].id).toBe('kcal-over');
    expect(r[0].tone).toBe('warn');
    expect(r[0].text).toContain('300 kcal');
    expect(r[0].text).toContain('30 phút');
  });

  it('nudges to log meals after 10h when nothing is logged', () => {
    expect(ids({ mealCount: 0, eaten: 0, protein: 0, hour: 11 })[0]).toBe('no-meals');
    expect(ids({ mealCount: 0, eaten: 0, protein: 0, hour: 7, water: 0 })).toContain('morning');
  });

  it('reports missing protein in the afternoon', () => {
    const r = buildInsights({ ...base, hour: 15, protein: 40 });
    const p = r.find((x) => x.id === 'protein-low');
    expect(p?.text).toContain('80 g');
    expect(ids({ hour: 10, protein: 40 })).not.toContain('protein-low');
  });

  it('asks for more water when behind schedule (rounded to 250 ml)', () => {
    const r = buildInsights({ ...base, hour: 17, water: 500 });
    const w = r.find((x) => x.id === 'water-low');
    // expected at 17h = 2000 * 10/14 ≈ 1429 → gap 929 → 1000 ml
    expect(w?.text).toContain('1.000 ml');
    expect(ids({ hour: 17, water: 2000 })).toContain('water-done');
  });

  it('mentions planned workouts', () => {
    const r = buildInsights({ ...base, plannedWorkouts: ['Chạy 5km', 'Yoga'] });
    expect(r.find((x) => x.id === 'workout-planned')?.text).toBe('Buổi tập «Chạy 5km» và 1 buổi khác đang chờ bạn hôm nay.');
  });

  it('praises when protein & water are met', () => {
    expect(ids({ protein: 115, water: 2000, hour: 20, steps: 9000 })).toContain('all-good');
  });

  it('is sorted by priority', () => {
    const r = buildInsights({ ...base, hour: 20, protein: 20, water: 200, steps: 1000, fat: 90, remaining: -50 });
    for (let k = 1; k < r.length; k++) expect(r[k - 1].priority).toBeGreaterThanOrEqual(r[k].priority);
  });
});
