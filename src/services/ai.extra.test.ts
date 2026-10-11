import { FunctionsFetchError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({ db: () => ({ functions: { invoke } }) }));

const { AI_TIMEOUT_MESSAGE, normalizeDish, scanFood } = await import('./ai');
const IMG = 'data:image/jpeg;base64,AAAA';
const abortedFetch = () => new FunctionsFetchError(Object.assign(new Error('aborted'), { name: 'AbortError' }));

beforeEach(() => invoke.mockReset());

describe('normalizeDish', () => {
  it('treats gram-like units as grams', () => {
    expect(normalizeDish({ name: 'Cơm', quantity: 150, unit: 'Gram', kcal: 195 })).toMatchObject({ unit: 'g', grams: 150 });
    expect(normalizeDish({ name: 'Cơm', quantity: 150, unit: 'gr.', grams: 140 })).toMatchObject({ unit: 'g', grams: 140 });
    expect(normalizeDish({ name: 'Cơm', quantity: 100, unit: 'GR' })).toMatchObject({ unit: 'g', grams: 100 });
    expect(normalizeDish({ name: 'Phở', quantity: 1, unit: 'bát' })).toMatchObject({ unit: 'bát', grams: 0 });
  });
  it('derives kcal from macros when missing or zero', () => {
    expect(normalizeDish({ protein_g: 10, carbs_g: 20, fat_g: 5 }).kcal).toBe(165);
    expect(normalizeDish({ kcal: 0, protein_g: 10, carbs_g: 0, fat_g: 0 }).kcal).toBe(40);
    expect(normalizeDish({ kcal: 300, protein_g: 10 }).kcal).toBe(300);
  });
});

describe('scanFood cancel / timeout', () => {
  it('a caller abort surfaces as AbortError (not a network error)', async () => {
    const ctrl = new AbortController();
    invoke.mockImplementation(async () => {
      ctrl.abort();
      return { data: null, error: abortedFetch() };
    });
    await expect(scanFood(IMG, { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('our own timeout is reported as AI too slow', async () => {
    invoke.mockResolvedValue({ data: null, error: abortedFetch() });
    await expect(scanFood(IMG)).rejects.toMatchObject({ code: 'ai_unavailable', message: AI_TIMEOUT_MESSAGE });
    expect(invoke.mock.calls[0][1].timeout).toBeGreaterThan(0);
  });

  it('an already-aborted signal does not call the server', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(scanFood(IMG, { signal: ctrl.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(invoke).not.toHaveBeenCalled();
  });
});
