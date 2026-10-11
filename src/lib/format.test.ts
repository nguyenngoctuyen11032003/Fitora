import { describe, expect, it } from 'vitest';
import { formatGrams, formatKcal, formatKg, formatMinutes, formatMl, formatNumber, formatPercent, formatSigned, initials, parseDecimal, round } from './format';

// Intl may use a narrow no-break space in some locales; normalise for comparisons.
const norm = (s: string) => s.replace(/ | /g, ' ');

describe('formatNumber', () => {
  it('uses vi-VN separators', () => {
    expect(formatNumber(12345)).toBe('12.345');
    expect(formatNumber(68.5, 1)).toBe('68,5');
    expect(formatNumber('1850.4')).toBe('1.850');
  });
  it('never prints a negative zero', () => {
    expect(formatNumber(-0.3)).toBe('0');
    expect(formatNumber(-0.04, 1)).toBe('0');
    expect(formatKcal(-0.4)).toBe('0 kcal');
  });
  it('treats junk as 0', () => {
    expect(formatNumber(null)).toBe('0');
    expect(formatNumber(NaN)).toBe('0');
    expect(formatNumber('abc')).toBe('0');
  });
});

describe('unit formatters', () => {
  it('formatGrams switches to integers from 10 g (incl. values that round to 10)', () => {
    expect(formatGrams(2.54)).toBe('2,5 g');
    expect(formatGrams(9.96)).toBe('10 g');
    expect(formatGrams(25.4)).toBe('25 g');
  });
  it('formatKg', () => expect(formatKg(68.55)).toBe('68,6 kg'));
  it('formatMl rounds before choosing ml vs L', () => {
    expect(formatMl(250)).toBe('250 ml');
    expect(formatMl(999.6)).toBe('1 L');
    expect(formatMl(1500)).toBe('1,5 L');
  });
  it('formatMinutes', () => {
    expect(formatMinutes(45)).toBe('45 phút');
    expect(formatMinutes(59.6)).toBe('1 giờ');
    expect(formatMinutes(90)).toBe('1 giờ 30 phút');
  });
  it('formatPercent', () => expect(norm(formatPercent(0.125, 1))).toBe('12,5%'));
  it('formatSigned follows the displayed value', () => {
    expect(formatSigned(120)).toBe('+120');
    expect(formatSigned(-80)).toBe('−80');
    expect(formatSigned(0.4)).toBe('0');
    expect(formatSigned(-0.4)).toBe('0');
    expect(formatSigned(-0.25, 1)).toBe('−0,2');
  });
});

describe('parseDecimal', () => {
  it('accepts vi and en decimal separators', () => {
    expect(parseDecimal('68,5')).toBe(68.5);
    expect(parseDecimal('68.5')).toBe(68.5);
    expect(parseDecimal(' 1 234,5 ')).toBe(1234.5);
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('1,234.5')).toBe(1234.5);
  });
  it('treats repeated separators as thousands', () => {
    expect(parseDecimal('1.234.567')).toBe(1234567);
    expect(parseDecimal('1,234,567')).toBe(1234567);
  });
  it('returns null for empty / invalid input', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('  ')).toBeNull();
    expect(parseDecimal(',')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(NaN)).toBeNull();
  });
  it('keeps a trailing separator while typing', () => expect(parseDecimal('68,')).toBe(68));
});

describe('round / initials', () => {
  it('round never returns -0', () => {
    expect(Object.is(round(-0.01, 1), 0)).toBe(true);
    expect(round(2.345, 2)).toBeCloseTo(2.35, 2);
  });
  it('initials', () => {
    expect(initials('Nguyễn Văn An')).toBe('NA');
    expect(initials('  ')).toBe('F');
    expect(initials('minh')).toBe('M');
  });
});
