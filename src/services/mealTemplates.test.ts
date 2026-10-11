import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MealTemplate, MealTemplateItem } from '@/types/db';
import { createFakeDb, type FakeDb } from './fakeDb.testutil';

let fake: FakeDb;
vi.mock('@/lib/supabase', () => ({ db: () => fake }));
vi.mock('./storage', () => ({ removeImages: vi.fn(), signedUrl: vi.fn(), uploadImage: vi.fn() }));

import {
  cleanTemplateItems,
  createMealTemplate,
  deleteMealTemplate,
  listMealTemplates,
  logMealTemplate,
  MAX_TEMPLATE_ITEMS,
  templateEntries,
  templateItemsFromEntries,
  templateTotalKcal,
  updateMealTemplate,
} from './mealTemplates';

const FOOD_ID = '11111111-1111-4111-8111-111111111111';
const GONE_ID = '22222222-2222-4222-8222-222222222222';
const item = (o: Partial<MealTemplateItem> = {}): MealTemplateItem => ({
  name: 'Phở bò', quantity: 1, unit: 'bát', grams: 500, kcal: 450, protein_g: 25, carbs_g: 55, fat_g: 12, fiber_g: 2, custom_food_id: null, ...o,
});
const tpl = (o: Partial<MealTemplate> = {}): MealTemplate => ({
  id: 't1', user_id: 'me', name: 'Sáng quen thuộc', meal: 'breakfast', items: [item()], total_kcal: 450,
  use_count: 0, last_used_at: null, created_at: '', updated_at: '', ...o,
});

beforeEach(() => {
  fake = createFakeDb();
});

describe('cleanTemplateItems / templateTotalKcal', () => {
  it('validates count and names, rounds and defaults values, drops bad food ids', () => {
    expect(() => cleanTemplateItems([])).toThrow('Bữa mẫu cần ít nhất 1 món.');
    expect(() => cleanTemplateItems(Array.from({ length: MAX_TEMPLATE_ITEMS + 1 }, () => item()))).toThrow(/tối đa 30/);
    expect(() => cleanTemplateItems([item({ name: ' ' })])).toThrow('Món trong bữa mẫu cần có tên.');
    const [c] = cleanTemplateItems([{ name: ' Cơm ', quantity: 0, unit: '', kcal: 123.456, protein_g: -3, custom_food_id: 'not-a-uuid' }]);
    expect(c).toEqual({ name: 'Cơm', quantity: 1, unit: 'phần', grams: 0, kcal: 123.5, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, custom_food_id: null });
    expect(templateTotalKcal([item({ kcal: 450 }), item({ kcal: 145.55 })])).toBe(595.6);
  });
});

describe('CRUD', () => {
  it('create computes total_kcal and validates name / meal', async () => {
    const t = await createMealTemplate(' Trưa  văn phòng ', 'lunch', [item(), item({ kcal: 100 })]);
    expect(t).toMatchObject({ name: 'Trưa văn phòng', meal: 'lunch', total_kcal: 550 });
    await expect(createMealTemplate('', null, [item()])).rejects.toThrow('Hãy đặt tên cho bữa mẫu.');
    await expect(createMealTemplate('x', 'brunch' as never, [item()])).rejects.toThrow('Bữa ăn không hợp lệ.');
    const u = await updateMealTemplate(t.id, { items: [item({ kcal: 300 })], meal: null });
    expect(u).toMatchObject({ total_kcal: 300, meal: null });
    expect((await listMealTemplates()).map((x) => x.id)).toEqual([t.id]);
    await deleteMealTemplate(t.id);
    expect(await listMealTemplates()).toEqual([]);
  });

  it('lists recently used first', async () => {
    fake.tables.fit_meal_templates = [tpl({ id: 'a', name: 'A' }), tpl({ id: 'b', name: 'B', last_used_at: '2026-10-11T00:00:00Z' })];
    expect((await listMealTemplates()).map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('templateItemsFromEntries / templateEntries', () => {
  it('round-trips entries and keeps only links to existing foods', () => {
    const items = templateItemsFromEntries([
      { ...item(), custom_food_id: FOOD_ID },
      { ...item({ name: 'Trà đá', kcal: 0 }), custom_food_id: GONE_ID },
    ]);
    const entries = templateEntries({ items }, '2026-10-12', 'lunch', new Map([[FOOD_ID, 'me/meals/p.webp']]));
    expect(entries[0]).toMatchObject({ eaten_on: '2026-10-12', meal: 'lunch', name: 'Phở bò', source: 'custom', custom_food_id: FOOD_ID, photo_path: 'me/meals/p.webp', kcal: 450 });
    expect(entries[1]).toMatchObject({ name: 'Trà đá', source: 'manual', custom_food_id: null, photo_path: null });
  });
});

describe('logMealTemplate', () => {
  it('inserts all items, defaults to the template meal and bumps template + food usage', async () => {
    fake.tables.fit_custom_foods = [{ id: FOOD_ID, name: 'Sữa chua', photo_path: null, use_count: 2 }];
    fake.tables.fit_meal_templates = [{ ...tpl(), items: [item(), item({ name: 'Sữa chua', kcal: 145.5, custom_food_id: FOOD_ID }), item({ name: 'X', custom_food_id: GONE_ID })] }];
    const t = (await listMealTemplates())[0];
    const created = await logMealTemplate(t, '2026-10-12');
    expect(created).toHaveLength(3);
    expect(created.map((e) => [e.meal, e.source, e.custom_food_id])).toEqual([
      ['breakfast', 'manual', null],
      ['breakfast', 'custom', FOOD_ID],
      ['breakfast', 'manual', null],
    ]);
    expect(fake.tables.fit_meal_templates[0].use_count).toBe(1);
    expect(fake.tables.fit_custom_foods[0].use_count).toBe(3);
    expect(fake.tables.fit_custom_foods[0].default_meal).toBeUndefined(); // template meal does not override the food's own
  });

  it('uses the explicit meal, requires one when the template has none, validates the date', async () => {
    const created = await logMealTemplate(tpl({ meal: null }), '2026-10-12', 'dinner');
    expect(created[0].meal).toBe('dinner');
    await expect(logMealTemplate(tpl({ meal: null }), '2026-10-12')).rejects.toThrow('Hãy chọn bữa ăn.');
    await expect(logMealTemplate(tpl(), '2026-13-01')).rejects.toThrow('Ngày ăn không hợp lệ.');
  });

  it('a failing usage bump does not fail the log', async () => {
    fake.failNext = { rpc: 'fit_mark_meal_template_used', error: { message: 'x' } };
    expect(await logMealTemplate(tpl(), '2026-10-12')).toHaveLength(1);
  });
});
