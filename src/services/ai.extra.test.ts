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

describe('normalizeDish plausibility', () => {
  it('a consistent dish keeps its numbers and confidence', () => {
    const d = normalizeDish({ name: 'Phở bò', grams: 500, kcal: 450, protein_g: 25, carbs_g: 55, fat_g: 12, confidence: 0.82 });
    expect(d).toMatchObject({ kcal: 450, protein_g: 25, carbs_g: 55, fat_g: 12, confidence: 0.82 });
  });

  it('scales macros down when they outweigh the dish and flags low confidence', () => {
    const d = normalizeDish({ name: 'Xôi', grams: 100, kcal: 400, protein_g: 80, carbs_g: 80, fat_g: 40, confidence: 0.9 });
    expect(d.protein_g + d.carbs_g + d.fat_g).toBeLessThanOrEqual(100.1);
    expect(d.protein_g).toBeCloseTo(40);
    expect(d.fat_g).toBeCloseTo(20);
    expect(d.confidence).toBeLessThanOrEqual(0.4);
  });

  it('recomputes kcal when the macros guarantee more energy (4/4/9)', () => {
    const d = normalizeDish({ name: 'Cơm gà', grams: 300, kcal: 90, protein_g: 10, carbs_g: 60, fat_g: 10, confidence: 0.8 });
    expect(d.kcal).toBe(370); // 10·4 + 60·4 + 10·9
    expect(d.confidence).toBeLessThanOrEqual(0.4);
  });

  it('keeps kcal but lowers confidence when kcal dwarfs the macros', () => {
    const d = normalizeDish({ name: 'Bánh', kcal: 500, protein_g: 2, carbs_g: 10, fat_g: 1, confidence: 0.9 });
    expect(d.kcal).toBe(500);
    expect(d.confidence).toBeLessThanOrEqual(0.4);
  });

  it('tolerates a small kcal/macro mismatch without touching confidence', () => {
    const d = normalizeDish({ name: 'Bún', grams: 400, kcal: 480, protein_g: 20, carbs_g: 70, fat_g: 12, confidence: 0.85 });
    expect(d.kcal).toBe(480); // macros ≈ 468 — within tolerance
    expect(d.confidence).toBe(0.85);
  });

  it('caps impossible energy density (over 9 kcal/g) when there are no macros', () => {
    const d = normalizeDish({ name: 'Kẹo', grams: 20, kcal: 900, confidence: 0.9 });
    expect(d.kcal).toBe(180);
    expect(d.confidence).toBeLessThanOrEqual(0.4);
  });

  it('clamps fiber to the dish weight', () => {
    const d = normalizeDish({ name: 'Rau luộc', grams: 50, kcal: 20, fiber_g: 80 });
    expect(d.fiber_g).toBe(50);
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
