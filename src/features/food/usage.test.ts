import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomFood } from '@/types/db';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ db: () => ({ rpc }) }));

const { undoUsage, unmarkMealTemplateUsed, usageSnapshots } = await import('./usage');

const food = (id: string, extra: Partial<CustomFood> = {}): CustomFood =>
  ({
    id,
    user_id: 'u',
    name: id,
    brand: null,
    serving_label: '1 phần',
    serving_grams: 100,
    kcal_100g: 100,
    protein_100g: 0,
    carbs_100g: 0,
    fat_100g: 0,
    fiber_100g: 0,
    source: 'manual',
    photo_path: null,
    use_count: 3,
    last_used_at: '2026-10-01T05:00:00Z',
    default_meal: 'lunch',
    default_servings: null,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...extra,
  }) as CustomFood;

beforeEach(() => rpc.mockReset());

describe('usageSnapshots', () => {
  it('takes the pre-bump usage of each distinct known id, skipping unknown ones', () => {
    const foods = [food('a'), food('b', { last_used_at: null, default_meal: null })];
    expect(usageSnapshots(['a', 'a', 'b', 'zzz', null], foods)).toEqual([
      { id: 'a', last_used_at: '2026-10-01T05:00:00Z', default_meal: 'lunch' },
      { id: 'b', last_used_at: null, default_meal: null },
    ]);
  });

  it('is empty without a loaded list (never guesses a snapshot)', () => {
    expect(usageSnapshots(['a'], null)).toEqual([]);
    expect(usageSnapshots(['a'], [])).toEqual([]);
  });
});

describe('unmarkMealTemplateUsed', () => {
  it('calls the undo RPC with the snapshot and returns the updated row', async () => {
    rpc.mockResolvedValue({ data: [{ id: 't1', use_count: 1 }], error: null });
    const row = await unmarkMealTemplateUsed({ id: 't1', last_used_at: '2026-10-02T00:00:00Z' });
    expect(rpc).toHaveBeenCalledWith('fit_unmark_meal_template_used', { p_id: 't1', p_prev_last_used_at: '2026-10-02T00:00:00Z' });
    expect(row).toEqual({ id: 't1', use_count: 1 });
  });

  it('never throws (error or exception → null)', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    expect(await unmarkMealTemplateUsed({ id: 't1', last_used_at: null })).toBeNull();
    rpc.mockRejectedValueOnce(new Error('offline'));
    expect(await unmarkMealTemplateUsed({ id: 't1', last_used_at: null })).toBeNull();
  });
});

describe('undoUsage', () => {
  it('gives back one use per food and the template', async () => {
    rpc.mockImplementation(async (_fn: string, args?: { p_id: string }) => ({ data: [{ id: args?.p_id }], error: null }));
    const changed = await undoUsage({
      foods: [{ id: 'a', last_used_at: null, default_meal: 'dinner' }],
      template: { id: 't1', last_used_at: null },
    });
    expect(changed).toBe(true);
    expect(rpc.mock.calls.map((c) => c[0]).sort()).toEqual(['fit_unmark_food_used', 'fit_unmark_meal_template_used']);
    expect(rpc).toHaveBeenCalledWith('fit_unmark_food_used', { p_id: 'a', p_prev_last_used_at: null, p_prev_default_meal: 'dinner' });
  });

  it('does nothing when there is nothing to give back', async () => {
    expect(await undoUsage({ foods: [], template: null })).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
