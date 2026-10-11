import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  diffDays,
  endOfMonth,
  endOfWeek,
  formatDayVi,
  greetingVi,
  isISODate,
  parseISODate,
  rangeDays,
  startOfMonth,
  startOfWeek,
  toISODate,
  todayISO,
} from './date';

// The helpers must work in any time zone, including ones with DST transitions
// at local midnight (America/Sao_Paulo used to switch at 00:00).
const ZONES = ['Asia/Ho_Chi_Minh', 'America/Sao_Paulo', 'Europe/London', 'America/New_York', 'Pacific/Auckland'];
const ORIGINAL_TZ = process.env.TZ;

for (const tz of ZONES) {
  describe(`date helpers in ${tz}`, () => {
    beforeAll(() => {
      process.env.TZ = tz;
    });
    afterAll(() => {
      process.env.TZ = ORIGINAL_TZ;
    });

    it('addDays crosses month / year ends and DST changes', () => {
      expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
      expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
      expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      // DST weeks (EU 29/3, US 8/3, NZ 5/4, BR 2018-11-04 at midnight)
      expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
      expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
      expect(addDays('2026-03-07', 2)).toBe('2026-03-09');
      expect(addDays('2018-11-03', 1)).toBe('2018-11-04');
      expect(addDays('2018-11-04', 1)).toBe('2018-11-05');
      expect(addDays('2026-10-25', -1)).toBe('2026-10-24');
    });

    it('rangeDays has one entry per calendar day across DST', () => {
      const days = rangeDays('2026-03-01', '2026-03-31');
      expect(days).toHaveLength(31);
      expect(new Set(days).size).toBe(31);
      expect(rangeDays('2018-11-01', '2018-11-07')).toHaveLength(7);
      expect(rangeDays('2026-10-20', '2026-11-05')).toHaveLength(17);
      expect(rangeDays('2026-05-02', '2026-05-01')).toEqual([]);
    });

    it('diffDays is a whole number across DST', () => {
      expect(diffDays('2026-03-01', '2026-04-01')).toBe(31);
      expect(diffDays('2026-10-01', '2026-11-01')).toBe(31);
      expect(diffDays('2018-11-01', '2018-11-10')).toBe(9);
      expect(diffDays('2026-01-10', '2026-01-03')).toBe(-7);
    });

    it('weeks start on Monday', () => {
      expect(startOfWeek('2026-10-11')).toBe('2026-10-05'); // Sunday → previous Monday
      expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
      expect(endOfWeek('2026-10-05')).toBe('2026-10-11');
      expect(startOfWeek('2026-01-01')).toBe('2025-12-29');
      expect(startOfWeek('2018-11-04')).toBe('2018-10-29');
    });

    it('month bounds', () => {
      expect(startOfMonth('2026-02-17')).toBe('2026-02-01');
      expect(endOfMonth('2026-02-17')).toBe('2026-02-28');
      expect(endOfMonth('2028-02-03')).toBe('2028-02-29');
      expect(endOfMonth('2026-12-31')).toBe('2026-12-31');
      expect(endOfMonth('2026-04-30')).toBe('2026-04-30');
    });

    it('isISODate validates real calendar days', () => {
      expect(isISODate('2026-02-28')).toBe(true);
      expect(isISODate('2026-02-29')).toBe(false);
      expect(isISODate('2026-13-01')).toBe(false);
      expect(isISODate('2026-1-1')).toBe(false);
      expect(isISODate('2018-11-04')).toBe(true);
      expect(isISODate(undefined)).toBe(false);
    });

    it('toISODate uses the local calendar day, not UTC', () => {
      expect(toISODate(new Date(2026, 9, 11, 23, 30))).toBe('2026-10-11');
      expect(toISODate(new Date(2026, 9, 11, 0, 5))).toBe('2026-10-11');
      expect(toISODate(parseISODate('2018-11-04'))).toBe('2018-11-04');
    });
  });
}

describe('relative labels', () => {
  beforeAll(() => {
    process.env.TZ = 'Asia/Ho_Chi_Minh';
    vi.useFakeTimers();
    // 23:30 local on 11/10/2026 — UTC is still the same day, but a UTC-based
    // helper at 00:30 local would be one day behind; check both edges.
    vi.setSystemTime(new Date(2026, 9, 11, 23, 30));
  });
  afterAll(() => {
    vi.useRealTimers();
    process.env.TZ = ORIGINAL_TZ;
  });

  it('todayISO is local', () => {
    expect(todayISO()).toBe('2026-10-11');
    vi.setSystemTime(new Date(2026, 9, 12, 0, 30));
    expect(todayISO()).toBe('2026-10-12');
    vi.setSystemTime(new Date(2026, 9, 11, 23, 30));
  });

  it('formatDayVi', () => {
    expect(formatDayVi('2026-10-11')).toBe('Hôm nay');
    expect(formatDayVi('2026-10-10')).toBe('Hôm qua');
    expect(formatDayVi('2026-10-12')).toBe('Ngày mai');
    expect(formatDayVi('2026-10-07')).toBe('Thứ Tư, 7/10');
    expect(formatDayVi('2025-12-31')).toBe('Thứ Tư, 31/12/2025');
    expect(formatDayVi('2026-10-07', 'long')).toBe('Thứ Tư, 7 tháng 10, 2026');
    expect(formatDayVi('2026-10-07', 'short')).toBe('7/10');
  });

  it('greetingVi', () => {
    expect(greetingVi(new Date(2026, 0, 1, 3))).toBe('Khuya rồi');
    expect(greetingVi(new Date(2026, 0, 1, 7))).toBe('Chào buổi sáng');
    expect(greetingVi(new Date(2026, 0, 1, 12))).toBe('Chào buổi trưa');
    expect(greetingVi(new Date(2026, 0, 1, 15))).toBe('Chào buổi chiều');
    expect(greetingVi(new Date(2026, 0, 1, 20))).toBe('Chào buổi tối');
  });
});
