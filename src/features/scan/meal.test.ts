import { describe, expect, it } from 'vitest';
import { defaultMealForHour, parseDateParam, parseMealParam } from './meal';
import { frameDiff, meanLuma, toLuma } from './frame';

describe('defaultMealForHour', () => {
  it.each([
    [0, 'breakfast'],
    [9, 'breakfast'],
    [10, 'lunch'],
    [13, 'lunch'],
    [14, 'snack'],
    [16, 'snack'],
    [17, 'dinner'],
    [23, 'dinner'],
  ])('%i h → %s', (h, meal) => expect(defaultMealForHour(h)).toBe(meal));

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
