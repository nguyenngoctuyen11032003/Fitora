import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { clampNumber, formatNumberInput, labelText, rangeMessage, sanitizeNumberInput, stepperAriaLabel } from './numberFieldLogic';
import { clampRatio } from './progress';

describe('clampNumber', () => {
  it('clamps to [min, max] and rounds to decimals', () => {
    expect(clampNumber(250, { min: 30, max: 200, decimals: 1 })).toBe(200);
    expect(clampNumber(10, { min: 30, max: 200, decimals: 1 })).toBe(30);
    expect(clampNumber(68.56, { decimals: 1 })).toBe(68.6);
    expect(clampNumber(0.1 + 0.2, { decimals: 2 })).toBe(0.3);
    expect(clampNumber(72.4, { decimals: 0 })).toBe(72);
  });
  it('never returns NaN or -0', () => {
    expect(clampNumber(Number.NaN, { min: 5, decimals: 0 })).toBe(5);
    expect(clampNumber(Number.NaN, { decimals: 1 })).toBe(0);
    expect(Object.is(clampNumber(-0.01, { decimals: 1 }), -0)).toBe(false);
  });
});

describe('sanitizeNumberInput', () => {
  it('keeps decimal separators when decimals > 0', () => {
    expect(sanitizeNumberInput('68,5 kg', 1)).toBe('68,5');
    expect(sanitizeNumberInput('68.5', 1)).toBe('68.5');
  });
  it('drops the typed fraction for integers instead of gluing digits', () => {
    expect(sanitizeNumberInput('68,5', 0)).toBe('68');
    expect(sanitizeNumberInput('68,', 0)).toBe('68');
    expect(sanitizeNumberInput('1.850', 0)).toBe('1850');
    expect(sanitizeNumberInput('abc', 0)).toBe('');
  });
  it('accepts a leading minus only when allowed', () => {
    expect(sanitizeNumberInput('-2,5', 1)).toBe('2,5');
    expect(sanitizeNumberInput('-2,5', 1, true)).toBe('-2,5');
    expect(sanitizeNumberInput('2-5', 0, true)).toBe('25');
  });
});

describe('formatNumberInput', () => {
  it('uses the vi decimal comma without thousands dots', () => {
    expect(formatNumberInput(1234.5, 1)).toBe('1234,5');
    expect(formatNumberInput(68, 1)).toBe('68');
    expect(formatNumberInput(null, 1)).toBe('');
    expect(formatNumberInput(Number.NaN, 1)).toBe('');
  });
});

describe('clampRatio', () => {
  it('handles NaN, zero/negative max, overflow and negatives', () => {
    expect(clampRatio(50, 100)).toEqual({ ratio: 0.5, clamped: 0.5, over: false });
    expect(clampRatio(150, 100)).toEqual({ ratio: 1.5, clamped: 1, over: true });
    expect(clampRatio(-20, 100)).toEqual({ ratio: 0, clamped: 0, over: false });
    expect(clampRatio(Number.NaN, 100)).toEqual({ ratio: 0, clamped: 0, over: false });
    expect(clampRatio(10, 0)).toEqual({ ratio: 0, clamped: 0, over: false });
    expect(clampRatio(10, Number.POSITIVE_INFINITY)).toEqual({ ratio: 0, clamped: 0, over: false });
  });
});

describe('rangeMessage', () => {
  it('reports values above max with the unit (vi format)', () => {
    expect(rangeMessage(999, { min: 25, max: 300 }, 'kg')).toBe('Tối đa 300 kg');
    expect(rangeMessage(9999999, { min: 0, max: 200000 }, 'bước')).toBe('Tối đa 200.000 bước');
    expect(rangeMessage(60, { min: 0.25, max: 50 })).toBe('Tối đa 50');
  });
  it('reports values below min unless the user is still typing', () => {
    expect(rangeMessage(2, { min: 25, max: 300 }, 'kg')).toBe('Tối thiểu 25 kg');
    expect(rangeMessage(0.1, { min: 0.25 })).toBe('Tối thiểu 0,25');
    expect(rangeMessage(2, { min: 25, max: 300 }, 'kg', false)).toBeNull();
    expect(rangeMessage(301, { min: 25, max: 300 }, 'kg', false)).toBe('Tối đa 300 kg');
  });
  it('is null for in-range, empty or unbounded values', () => {
    expect(rangeMessage(76.6, { min: 25, max: 300 }, 'kg')).toBeNull();
    expect(rangeMessage(300, { min: 25, max: 300 })).toBeNull();
    expect(rangeMessage(null, { min: 25, max: 300 })).toBeNull();
    expect(rangeMessage(1e9, {})).toBeNull();
  });
});

describe('labelText / stepperAriaLabel', () => {
  it('lấy tên dễ đọc cho nút Giảm/Tăng để trình đọc màn hình phân biệt các ô', () => {
    expect(labelText('Nước mỗi ngày')).toBe('Nước mỗi ngày');
    expect(labelText(createElement('span', null, createElement('i', { 'aria-hidden': true }), 'Đạm', createElement('b', null, '30% · 600 kcal')))).toBe('Đạm');
    expect(labelText(undefined)).toBe('');
    expect(stepperAriaLabel('Giảm', 'Đạm')).toBe('Giảm Đạm');
    expect(stepperAriaLabel('Tăng', '')).toBe('Tăng');
  });
});
