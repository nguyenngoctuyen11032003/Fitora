import { describe, expect, it } from 'vitest';
import { buildInsights, chickenGramsFor, expectedWaterByHour, isLateNight, walkMinutesFor, type InsightInput } from './insights';

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

  it('flags calorie overrun first; walk minutes match the overrun', () => {
    // 70 kg brisk walk ≈ 257 kcal/h → 150 kcal ≈ 35 min (nearest 5)
    const r = buildInsights({ ...base, eaten: 2150, remaining: -150, hour: 20 });
    expect(r[0].id).toBe('kcal-over');
    expect(r[0].tone).toBe('warn');
    expect(r[0].text).toBe('Đã vượt 150 kcal. Đi bộ nhanh khoảng 35 phút là bù lại được.');
  });

  it('walk suggestion also covers activity the target already assumes', () => {
    // 150 over + 50 still inside the activity allowance = 200 kcal ≈ 45 min at 70 kg
    const r = buildInsights({ ...base, eaten: 2150, remaining: -150, hour: 20, uncreditedActivity: 50 });
    expect(r[0].text).toBe('Đã vượt 150 kcal. Đi bộ nhanh khoảng 45 phút là bù lại được.');
    // Too much allowance left → no unrealistic walk
    const far = buildInsights({ ...base, eaten: 2150, remaining: -150, hour: 20, uncreditedActivity: 500 })[0];
    expect(far.text).not.toMatch(/phút/);
  });

  it('does not suggest an unrealistic walk for a big overrun', () => {
    const late = buildInsights({ ...base, eaten: 2600, remaining: -600, hour: 20 })[0];
    expect(late.id).toBe('kcal-over');
    expect(late.text).not.toMatch(/phút/);
    expect(late.text).toContain('đừng nhịn bữa');
    const early = buildInsights({ ...base, eaten: 2600, remaining: -600, hour: 12 })[0];
    expect(early.text).toContain('Các bữa còn lại');
  });

  it('walkMinutesFor rounds to 5 and is 0 without weight', () => {
    expect(walkMinutesFor(150, 70)).toBe(35);
    expect(walkMinutesFor(10, 70)).toBe(10);
    expect(walkMinutesFor(100, 0)).toBe(0);
  });

  it('protein gap uses the displayed (rounded) numbers', () => {
    // card shows 74/156 → gap must read 82, not 83
    const p = buildInsights({ ...base, hour: 15, protein: 73.5, proteinTarget: 156 }).find((x) => x.id === 'protein-low');
    expect(p?.text).toContain('82 g');
  });

  it('never asks for more water than is still missing', () => {
    const w = buildInsights({ ...base, hour: 22, water: 2400, waterTarget: 2500 }).find((x) => x.id === 'water-low');
    expect(w).toBeUndefined();
    const w2 = buildInsights({ ...base, hour: 22, water: 2150, waterTarget: 2500 }).find((x) => x.id === 'water-low');
    expect(w2?.text).toContain('350 ml');
  });

  it('no morning nudge in the middle of the night', () => {
    const r = ids({ mealCount: 0, eaten: 0, protein: 0, hour: 2, water: 0 });
    expect(r).not.toContain('morning');
    expect(r).not.toContain('no-meals');
  });

  it('tells how much is left for dinner when it is not logged in the evening', () => {
    const r = buildInsights({ ...base, hour: 20, remaining: 894, loggedMeals: ['breakfast', 'lunch', 'snack'] });
    expect(r.find((x) => x.id === 'dinner-open')?.text).toBe('Chưa ghi bữa tối — bạn còn 894 kcal cho bữa tối.');
    expect(ids({ hour: 20, remaining: 894, loggedMeals: ['breakfast', 'dinner'] })).not.toContain('dinner-open');
  });

  it('warns about eating far too little late in the day', () => {
    const r = ids({ hour: 21, eaten: 700, remaining: 1300, loggedMeals: ['breakfast', 'dinner'] });
    expect(r).toContain('kcal-low');
  });

  it('step copy is honest about how far the target is', () => {
    const far = buildInsights({ ...base, hour: 20, steps: 1000 }).find((x) => x.id === 'steps-low');
    expect(far?.text).not.toContain('là đủ');
    const near = buildInsights({ ...base, hour: 20, steps: 2850, stepTarget: 5800 }).find((x) => x.id === 'steps-low');
    expect(near?.text).toContain('là đủ');
    expect(buildInsights({ ...base, steps: 8000 }).find((x) => x.id === 'steps-done')?.text).toContain('vừa đạt');
  });

  it('all-good replaces the separate water-done line', () => {
    const r = ids({ protein: 115, water: 2000, hour: 20, steps: 9000 });
    expect(r).toContain('all-good');
    expect(r).not.toContain('water-done');
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

  it('treats a tiny overrun as on target, without a warning', () => {
    const r = buildInsights({ ...base, eaten: 2030, remaining: -30, hour: 20 });
    expect(r.map((x) => x.id)).not.toContain('kcal-over');
    const slight = r.find((x) => x.id === 'kcal-slight');
    expect(slight?.tone).toBe('info');
    expect(slight?.text).toContain('30 kcal');
  });

  it('does not suggest a walk late at night', () => {
    const r = buildInsights({ ...base, eaten: 2150, remaining: -150, hour: 22 })[0];
    expect(r.id).toBe('kcal-over');
    expect(r.text).not.toMatch(/Đi bộ/);
    expect(r.text).toContain('đừng nhịn bữa');
  });

  it('protein tip gives a concrete chicken amount for a real gap', () => {
    const p = buildInsights({ ...base, hour: 15, protein: 40 }).find((x) => x.id === 'protein-low');
    // gap 80 g → 80 / 0.31 ≈ 258 → 260 g
    expect(p?.text).toBe('Còn thiếu 80 g đạm — thêm khoảng 260 g ức gà, hoặc trứng, cá, đậu phụ vào bữa tới.');
    expect(chickenGramsFor(0)).toBe(0);
    expect(chickenGramsFor(5)).toBe(50);
  });

  it('late-night water reminder asks for one glass at most, softly', () => {
    const w = buildInsights({ ...base, hour: 22, water: 800, waterTarget: 2000 }).find((x) => x.id === 'water-low');
    expect(w?.tone).toBe('info');
    expect(w?.text).toContain('1.200 ml');
    expect(w?.text).toContain('500 ml');
    expect(isLateNight(23)).toBe(true);
    expect(isLateNight(2)).toBe(true);
    expect(isLateNight(12)).toBe(false);
  });

  it('no step nudge after 21h', () => {
    expect(ids({ hour: 22, steps: 1000 })).not.toContain('steps-low');
    expect(ids({ hour: 21, steps: 1000 })).toContain('steps-low');
  });

  it('celebrates logging streaks, louder on milestones', () => {
    const plain = buildInsights({ ...base, loggingStreak: 4 }).find((x) => x.id === 'streak-logging');
    expect(plain?.text).toBe('Chuỗi 4 ngày ghi bữa liên tiếp. Giữ nhịp nhé!');
    const ms = buildInsights({ ...base, loggingStreak: 7 }).find((x) => x.id === 'streak-logging');
    expect(ms?.text).toContain('7 ngày liên tiếp');
    expect(ms!.priority).toBeGreaterThan(plain!.priority);
    expect(ids({ loggingStreak: 1 })).not.toContain('streak-logging');
  });

  it('gently reminds to keep an open streak, never at night or before noon', () => {
    const empty = { mealCount: 0, eaten: 0, protein: 0, remaining: 2000, loggingStreak: 5 };
    expect(buildInsights({ ...base, ...empty, hour: 15 }).find((x) => x.id === 'streak-keep')?.text).toContain('chuỗi 5 ngày');
    expect(ids({ ...empty, hour: 9 })).not.toContain('streak-keep');
    expect(ids({ ...empty, hour: 23 })).not.toContain('streak-keep');
  });

  it('mentions a water streak when today is done', () => {
    const r = buildInsights({ ...base, water: 2000, waterStreak: 4, protein: 10 }).find((x) => x.id === 'water-done');
    expect(r?.text).toBe('Đủ nước 4 ngày liên tiếp — cơ thể cảm ơn bạn!');
  });

  it('is deterministic', () => {
    const input = { ...base, hour: 19, protein: 30, loggingStreak: 3, waterStreak: 2 };
    expect(buildInsights(input)).toEqual(buildInsights(input));
  });
});
