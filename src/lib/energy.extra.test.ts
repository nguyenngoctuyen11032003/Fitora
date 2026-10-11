import { describe, expect, it } from 'vitest';
import { calcBMR, exerciseBonus } from './energy';
import { parseDecimal } from './format';

describe('calcBMR guards', () => {
  it('returns 0 instead of a nonsense value when weight/height is missing', () => {
    expect(calcBMR('male', 0, 175, 30)).toBe(0);
    expect(calcBMR('female', 60, NaN, 30)).toBe(0);
  });
  it('treats a negative / missing age as 0', () => {
    expect(calcBMR('male', 70, 175, -3)).toBe(calcBMR('male', 70, 175, 0));
  });
});

describe('exerciseBonus (PLAN §4)', () => {
  it('only counts burn beyond the activity already in the target', () => {
    // BMR 1600, moderate TDEE 2480 → allowance 560: 300 kcal of exercise earns nothing.
    expect(exerciseBonus(1600, 2480, 300)).toBe(0);
    expect(exerciseBonus(1600, 2480, 760)).toBe(200);
    // Sedentary: TDEE = BMR·1.2 → whole burn counts.
    expect(exerciseBonus(1600, 1920, 250)).toBe(250);
  });
  it('without a model the whole burn counts', () => {
    expect(exerciseBonus(null, null, 320)).toBe(320);
    expect(exerciseBonus(0, 2000, -5)).toBe(0);
  });
});

describe('parseDecimal strictness', () => {
  it('rejects hex, exponents and words that Number() would accept', () => {
    expect(parseDecimal('0x10')).toBeNull();
    expect(parseDecimal('1e3')).toBeNull();
    expect(parseDecimal('Infinity')).toBeNull();
    expect(parseDecimal('12abc')).toBeNull();
    expect(parseDecimal('-2,5')).toBe(-2.5);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('5.')).toBe(5);
  });
});
