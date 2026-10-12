import { describe, expect, it } from 'vitest';
import { savedFoodScore } from '@/features/scan/saved';
import type { CustomFood, MealTemplate } from '@/types/db';
import {
  foodPortionLabel,
  foodScore,
  frequencyScore,
  loggedFoodIds,
  loggedMessage,
  rankQuickItems,
  recencyScore,
  stableOrder,
  templateScore,
} from './quickRelog';

const NOW = new Date('2026-10-12T12:00:00+07:00');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

let seq = 0;
function food(p: Partial<CustomFood> = {}): CustomFood {
  seq++;
  return {
    id: `f${seq}`,
    user_id: 'u',
    name: `Món ${seq}`,
    brand: null,
    serving_label: '1 bát',
    serving_grams: 500,
    kcal_100g: 90,
    protein_100g: 5,
    carbs_100g: 12,
    fat_100g: 2,
    fiber_100g: 0.5,
    source: 'ai',
    photo_path: null,
    use_count: 0,
    last_used_at: null,
    default_meal: null,
    created_at: daysAgo(30),
    updated_at: daysAgo(30),
    ...p,
  };
}
function tpl(p: Partial<MealTemplate> = {}): MealTemplate {
  seq++;
  return {
    id: `t${seq}`,
    user_id: 'u',
    name: `Bữa ${seq}`,
    meal: null,
    items: [
      { name: 'Trứng', quantity: 2, unit: 'quả', grams: 100, kcal: 155, protein_g: 13, carbs_g: 1, fat_g: 11, fiber_g: 0, custom_food_id: null },
      { name: 'Bánh mì', quantity: 1, unit: 'ổ', grams: 80, kcal: 210.6, protein_g: 7, carbs_g: 40, fat_g: 2, fiber_g: 2, custom_food_id: null },
    ],
    total_kcal: 365.6,
    use_count: 0,
    last_used_at: null,
    created_at: daysAgo(30),
    updated_at: daysAgo(30),
    ...p,
  };
}

describe('scores', () => {
  it('recency is stepped by age and 0 when never used / invalid', () => {
    expect(recencyScore(null, NOW)).toBe(0);
    expect(recencyScore('nope', NOW)).toBe(0);
    expect(recencyScore(daysAgo(0), NOW)).toBe(3);
    expect(recencyScore(daysAgo(2), NOW)).toBe(2);
    expect(recencyScore(daysAgo(5), NOW)).toBe(1.5);
    expect(recencyScore(daysAgo(20), NOW)).toBe(0.5);
    expect(recencyScore(daysAgo(60), NOW)).toBe(0);
    // a timestamp slightly in the future (clock skew) is treated as "now"
    expect(recencyScore(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe(3);
  });
  it('frequency has diminishing returns, is capped and ignores junk', () => {
    expect(frequencyScore(0)).toBe(0);
    expect(frequencyScore(-3)).toBe(0);
    expect(frequencyScore(Number.NaN)).toBe(0);
    expect(frequencyScore(3)).toBe(2);
    expect(frequencyScore(31)).toBe(3);
  });
  it('Today scores a saved food exactly like Scan (same best dish for the same meal)', () => {
    const cases: Array<Pick<CustomFood, 'default_meal' | 'use_count' | 'last_used_at'>> = [
      { default_meal: null, use_count: 3, last_used_at: daysAgo(10) },
      { default_meal: 'dinner', use_count: 1, last_used_at: daysAgo(0.04) },
      { default_meal: 'lunch', use_count: 40, last_used_at: daysAgo(2) },
      { default_meal: null, use_count: 0, last_used_at: null },
    ];
    for (const c of cases) for (const m of ['breakfast', 'lunch', 'dinner', 'snack'] as const) expect(foodScore(c, m, NOW)).toBeCloseTo(savedFoodScore(c, m, NOW.getTime()), 10);
  });
  it('at lunch an unset food used 10 days ago ranks below a dinner food used 1 h ago, as in Scan', () => {
    const a = food({ name: 'Cơm gà', default_meal: null, use_count: 3, last_used_at: daysAgo(10) });
    const b = food({ name: 'Bún chả', default_meal: 'dinner', use_count: 1, last_used_at: new Date(NOW.getTime() - 3_600_000).toISOString() });
    const out = rankQuickItems({ foods: [a, b], templates: [], meal: 'lunch', date: '2026-10-12', now: NOW });
    expect(out.map((x) => (x.kind === 'food' ? x.food.name : ''))).toEqual(['Bún chả', 'Cơm gà']);
  });
  it('a food usually eaten at this meal beats one usually eaten at another meal', () => {
    const lunch = foodScore({ default_meal: 'lunch', use_count: 1, last_used_at: daysAgo(3) }, 'lunch', NOW);
    const breakfast = foodScore({ default_meal: 'breakfast', use_count: 1, last_used_at: daysAgo(3) }, 'lunch', NOW);
    expect(lunch).toBeGreaterThan(breakfast);
  });
  it('templates for another meal are not offered', () => {
    expect(templateScore({ meal: 'breakfast', use_count: 9, last_used_at: daysAgo(0) }, 'dinner', NOW)).toBeNull();
    expect(templateScore({ meal: null, use_count: 0, last_used_at: null }, 'dinner', NOW)).toBe(0);
    expect(templateScore({ meal: 'dinner', use_count: 0, last_used_at: null }, 'dinner', NOW)).toBe(4.5);
  });
});

describe('rankQuickItems', () => {
  it('puts what is usually eaten at this meal first, then frequency / recency', () => {
    const yogurt = food({ name: 'Sữa chua', default_meal: 'snack', use_count: 7, last_used_at: daysAgo(1) });
    const bun = food({ name: 'Bún bò Huế', default_meal: 'lunch', use_count: 3, last_used_at: daysAgo(2) });
    const never = food({ name: 'Bánh mới', default_meal: null });
    const out = rankQuickItems({ foods: [yogurt, never, bun], templates: [], meal: 'lunch', date: '2026-10-12', now: NOW });
    expect(out.map((x) => x.key)).toEqual([`food:${bun.id}`, `food:${yogurt.id}`, `food:${never.id}`]);
    expect(out[0]).toMatchObject({ kind: 'food', usual: true, kcal: 450, portion: '1 bát · 500 g' });
    expect(out[1].usual).toBe(false);
  });

  it('kcal of a tile is exactly what one tap logs (one default serving)', () => {
    const f = food({ serving_label: '1 phần', serving_grams: 333, kcal_100g: 123.4 });
    const [it] = rankQuickItems({ foods: [f], templates: [], meal: 'dinner', date: '2026-10-12', now: NOW });
    expect(it.kcal).toBe(Math.round((123.4 * 333) / 100));
  });

  it('includes matching / any-meal templates with their total and item count, caps templates and total', () => {
    const morning = tpl({ name: 'Sáng quen thuộc', meal: 'breakfast', use_count: 5, last_used_at: daysAgo(1) });
    const anyMeal = tpl({ name: 'Salad', meal: null });
    const lunchT = Array.from({ length: 5 }, () => tpl({ meal: 'lunch' }));
    const foods = Array.from({ length: 12 }, () => food());
    const out = rankQuickItems({ foods, templates: [morning, anyMeal, ...lunchT], meal: 'lunch', date: '2026-10-12', now: NOW });
    expect(out).toHaveLength(8);
    const templates = out.filter((x) => x.kind === 'template');
    expect(templates).toHaveLength(3);
    expect(templates.some((x) => x.kind === 'template' && x.template.id === morning.id)).toBe(false);
    expect(templates[0]).toMatchObject({ kcal: 366, portion: '2 món', usual: true });
  });

  it('a breakfast template shows at breakfast', () => {
    const morning = tpl({ name: 'Sáng quen thuộc', meal: 'breakfast', use_count: 2, last_used_at: daysAgo(1) });
    const out = rankQuickItems({ foods: [food({ use_count: 1, last_used_at: daysAgo(5) })], templates: [morning], meal: 'breakfast', date: '2026-10-12', now: NOW });
    expect(out[0]).toMatchObject({ kind: 'template', key: `template:${morning.id}` });
  });

  it('skips broken rows (no id / name / items) and respects limit 0', () => {
    const out = rankQuickItems({
      foods: [food({ name: '  ' }), food({ id: '' })],
      templates: [tpl({ items: [] })],
      meal: 'snack',
      date: '2026-10-12',
      now: NOW,
    });
    expect(out).toEqual([]);
    expect(rankQuickItems({ foods: [food()], templates: [], meal: 'snack', date: '2026-10-12', now: NOW, limit: 0 })).toEqual([]);
  });

  it('ties fall back to the recent-first service order', () => {
    const a = food({ name: 'A', last_used_at: daysAgo(400), use_count: 1 });
    const b = food({ name: 'B', last_used_at: daysAgo(400), use_count: 1 });
    const out = rankQuickItems({ foods: [b, a], templates: [], meal: 'snack', date: '2026-10-12', now: NOW });
    expect(out.map((x) => (x.kind === 'food' ? x.food.name : ''))).toEqual(['A', 'B']);
  });
});

describe('helpers', () => {
  it('portion label', () => {
    expect(foodPortionLabel({ serving_label: '1 bát', serving_grams: 350 })).toBe('1 bát · 350 g');
    expect(foodPortionLabel({ serving_label: '', serving_grams: 0 })).toBe('1 phần');
    expect(foodPortionLabel({ serving_label: '2 lát', serving_grams: 1234.4 })).toBe('2 lát · 1.234 g');
  });
  it('logged food ids are per meal', () => {
    const s = loggedFoodIds(
      [
        { meal: 'lunch', custom_food_id: 'x' },
        { meal: 'dinner', custom_food_id: 'y' },
        { meal: 'lunch', custom_food_id: null },
      ],
      'lunch',
    );
    expect([...s]).toEqual(['x']);
  });
  it('toast message', () => {
    expect(loggedMessage('Phở bò', 450.4, 'Bữa trưa')).toBe('Đã thêm Phở bò (450 kcal) vào bữa trưa');
  });
  it('stableOrder keeps positions, appends new, drops removed', () => {
    const k = (key: string) => ({ key });
    expect(stableOrder([k('a'), k('b')], [])).toEqual([k('a'), k('b')]);
    expect(stableOrder([k('c'), k('a'), k('d')], ['a', 'b', 'c'])).toEqual([k('a'), k('c'), k('d')]);
  });
});
