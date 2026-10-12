import { describe, expect, it } from 'vitest';
import { guessMeal } from '@/features/food/lib';
import { parseDateParam, parseMealParam } from './meal';
import { frameDiff, meanLuma, toLuma } from './frame';

describe('parseMealParam', () => {
  const at = (h: number, m: number) => parseMealParam(null, new Date(2026, 9, 12, h, m));
  // Must agree with Today (mealForHour) and Diary / Search (guessMeal): one table for every screen.
  it.each([
    [4, 0, 'breakfast'],
    [10, 15, 'breakfast'],
    [10, 30, 'lunch'],
    [14, 15, 'lunch'],
    [14, 30, 'snack'],
    [16, 59, 'snack'],
    [17, 0, 'dinner'],
    [21, 29, 'dinner'],
    [22, 30, 'snack'],
    [2, 0, 'snack'],
  ])('%i:%i → %s', (h, m, meal) => {
    expect(at(h, m)).toBe(meal);
    expect(guessMeal(new Date(2026, 9, 12, h, m))).toBe(meal);
  });

  it('params fall back to sensible defaults', () => {
    expect(parseMealParam('lunch')).toBe('lunch');
    expect(parseMealParam('brunch', new Date(2026, 0, 1, 8))).toBe('breakfast');
    expect(parseDateParam('2026-10-01')).toBe('2026-10-01');
    expect(parseDateParam('hôm qua')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('frame stability', () => {
  it('computes luma and diff', () => {
    const white = toLuma(new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]));
    const black = toLuma(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]));
    expect(white[0]).toBeGreaterThan(250);
    expect(frameDiff(white, white)).toBe(0);
    expect(frameDiff(white, black)).toBeGreaterThan(250);
    expect(frameDiff(white, null)).toBe(Infinity);
    expect(meanLuma(black)).toBe(0);
  });
});

describe('parseDateParam', () => {
  it('clamps future days to today', () => {
    expect(parseDateParam('2026-12-31', '2026-10-11')).toBe('2026-10-11');
    expect(parseDateParam('2026-10-11', '2026-10-11')).toBe('2026-10-11');
    expect(parseDateParam('2025-01-02', '2026-10-11')).toBe('2025-01-02');
    expect(parseDateParam(null, '2026-10-11')).toBe('2026-10-11');
    expect(parseDateParam('2026-02-30', '2026-10-11')).toBe('2026-10-11');
  });
});
