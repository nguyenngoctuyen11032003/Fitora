import { describe, expect, it } from 'vitest';
import type { CustomFood, MealEntry } from '@/types/db';
import { buildFoodReport } from './foodStats';

let seq = 0;
const entry = (eaten_on: string, name: string, p: Partial<MealEntry> = {}): MealEntry => ({
  id: `e${++seq}`,
  user_id: 'u',
  eaten_on,
  meal: 'lunch',
  name,
  quantity: 1,
  unit: 'phần',
  grams: 300,
  kcal: 500,
  protein_g: 20,
  carbs_g: 60,
  fat_g: 15,
  fiber_g: 2,
  source: 'manual',
  custom_food_id: null,
  photo_path: null,
  ai_meta: null,
  created_at: `${eaten_on}T12:00:${String(seq).padStart(2, '0')}Z`,
  updated_at: `${eaten_on}T12:00:00Z`,
  ...p,
});

const food = (id: string, name: string, p: Partial<CustomFood> = {}): CustomFood => ({
  id,
  user_id: 'u',
  name,
  brand: null,
  serving_label: '1 tô',
  serving_grams: 500,
  kcal_100g: 100,
  protein_100g: 5,
  carbs_100g: 12,
  fat_100g: 3,
  fiber_100g: 0,
  source: 'ai',
  photo_path: null,
  use_count: 1,
  last_used_at: null,
  default_meal: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...p,
});

const range = { from: '2026-10-05', to: '2026-10-11', today: '2026-10-12' };

describe('buildFoodReport', () => {
  it('groups the same dish across spellings and counts distinct days', () => {
    const r = buildFoodReport(
      [
        entry('2026-10-05', 'Phở bò'),
        entry('2026-10-06', 'pho bo '),
        entry('2026-10-06', 'PHỞ-BÒ', { kcal: 450, protein_g: 25 }),
        entry('2026-10-07', 'Cơm tấm'),
      ],
      [],
      range,
    );
    expect(r.entryCount).toBe(4);
    expect(r.dishCount).toBe(2);
    expect(r.frequent).toHaveLength(1);
    const pho = r.frequent[0];
    expect(pho.count).toBe(3);
    expect(pho.days).toBe(2);
    expect(pho.kcal).toBe(1450);
    expect(pho.protein_g).toBe(65);
    expect(pho.name).toBe('PHỞ-BÒ'); // latest entry's name when not saved
    expect(r.saveSuggestions.map((s) => s.key)).toEqual(['pho bo']);
  });

  it('ignores entries outside the range and in the future', () => {
    const r = buildFoodReport(
      [entry('2026-10-04', 'Phở bò'), entry('2026-10-05', 'Phở bò'), entry('2026-10-12', 'Phở bò')],
      [],
      { from: '2026-10-05', to: '2026-10-18', today: '2026-10-11' },
    );
    expect(r.entryCount).toBe(1);
    expect(r.frequent).toHaveLength(0);
  });

  it('matches saved foods by link and by name; saved dishes are not suggested again', () => {
    const saved = [food('f1', 'Bún bò Huế'), food('f2', 'Sữa chua Hy Lạp', { source: 'manual' })];
    const r = buildFoodReport(
      [
        entry('2026-10-05', 'Bún bò (scan)', { custom_food_id: 'f1', source: 'custom' }),
        entry('2026-10-06', 'bun bo hue'),
        entry('2026-10-06', 'Sữa chua hy lạp', { custom_food_id: 'f2', source: 'ai' }), // linked by a scan → not a re-log
        entry('2026-10-07', 'Sua chua Hy Lap'),
        entry('2026-10-08', 'Bánh mì'),
        entry('2026-10-09', 'Bánh mì'),
      ],
      saved,
      range,
    );
    const names = r.frequent.map((s) => s.name);
    expect(names).toContain('Bún bò Huế'); // linked + name match merged under the saved name
    expect(r.frequent.find((s) => s.name === 'Bún bò Huế')?.count).toBe(2);
    expect(r.frequent.find((s) => s.name === 'Bún bò Huế')?.savedFood?.id).toBe('f1');
    expect(r.frequent.find((s) => s.key === 'sua chua hy lap')?.savedFood?.id).toBe('f2');
    expect(r.saveSuggestions.map((s) => s.name)).toEqual(['Bánh mì']);
    expect(r.reusedEntries).toBe(1);
  });

  it('a link to a deleted saved food falls back to the entry name', () => {
    const r = buildFoodReport([entry('2026-10-05', 'Gỏi cuốn', { custom_food_id: 'gone', source: 'custom' }), entry('2026-10-06', 'Gỏi cuốn')], [], range);
    expect(r.frequent[0].count).toBe(2);
    expect(r.frequent[0].savedFood).toBeNull();
    expect(r.reusedEntries).toBe(0);
  });

  it('ranks protein sources with their share of the period protein', () => {
    const r = buildFoodReport(
      [
        entry('2026-10-05', 'Ức gà', { protein_g: 60 }),
        entry('2026-10-06', 'Ức gà', { protein_g: 40 }),
        entry('2026-10-06', 'Trứng', { protein_g: 30 }),
        entry('2026-10-07', 'Cơm', { protein_g: 8 }),
        entry('2026-10-07', 'Trà', { protein_g: 2 }),
      ],
      [],
      range,
    );
    expect(r.totalProtein).toBe(140);
    expect(r.proteinTop.map((p) => [p.stat.name, p.share])).toEqual([
      ['Ức gà', 71],
      ['Trứng', 21],
      ['Cơm', 6],
    ]);
  });

  it('frequent list ordered by count, then days, then kcal; capped by max', () => {
    const es = [
      ...['a', 'a', 'a'].map((n, i) => entry(`2026-10-0${5 + i}`, n)),
      entry('2026-10-05', 'b'),
      entry('2026-10-05', 'b'),
      entry('2026-10-05', 'c'),
      entry('2026-10-06', 'c'),
    ];
    const r = buildFoodReport(es, [], { ...range, max: 2 });
    expect(r.frequent.map((s) => s.key)).toEqual(['a', 'c']);
  });

  it('handles bad numbers and empty input', () => {
    const r = buildFoodReport([entry('2026-10-05', 'X', { kcal: NaN as unknown as number, protein_g: -5 })], [], range);
    expect(r.frequent).toEqual([]);
    expect(r.proteinTop).toEqual([]);
    expect(buildFoodReport([], [], range).entryCount).toBe(0);
  });
});
