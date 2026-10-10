// Dates are always local-time 'YYYY-MM-DD' strings (never UTC ISO), so a meal
// eaten at 23:30 in Hà Nội stays on that day.

const pad = (n: number) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD' in local time. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → local Date at 00:00 (invalid input → today). */
export function parseISODate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return new Date(new Date().setHours(0, 0, 0, 0));
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseISODate(s)) === s;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(date: string, n: number): string {
  const d = parseISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: string): string {
  const d = parseISODate(date);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

export function endOfWeek(date: string): string {
  return addDays(startOfWeek(date), 6);
}

export function startOfMonth(date: string): string {
  const d = parseISODate(date);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(date: string): string {
  const d = parseISODate(date);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Inclusive list of days from → to (empty if from > to). */
export function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 4000) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Whole days between a and b (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAY_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export function weekdayShort(date: string): string {
  return WEEKDAY_SHORT[parseISODate(date).getDay()];
}
export function weekdayLong(date: string): string {
  return WEEKDAY_LONG[parseISODate(date).getDay()];
}

/**
 * Vietnamese day label.
 *  - 'relative' (default): "Hôm nay", "Hôm qua", "Ngày mai", else "Thứ Ba, 7/10"
 *  - 'long': "Thứ Ba, 7 tháng 10, 2026"
 *  - 'short': "7/10"
 */
export function formatDayVi(date: string, style: 'relative' | 'long' | 'short' = 'relative'): string {
  const d = parseISODate(date);
  const dm = `${d.getDate()}/${d.getMonth() + 1}`;
  if (style === 'short') return dm;
  if (style === 'long') return `${WEEKDAY_LONG[d.getDay()]}, ${d.getDate()} tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
  const today = todayISO();
  if (date === today) return 'Hôm nay';
  if (date === addDays(today, -1)) return 'Hôm qua';
  if (date === addDays(today, 1)) return 'Ngày mai';
  const yr = d.getFullYear() !== parseISODate(today).getFullYear() ? `/${d.getFullYear()}` : '';
  return `${WEEKDAY_LONG[d.getDay()]}, ${dm}${yr}`;
}

/** "Tháng 10, 2026" */
export function formatMonthVi(date: string): string {
  const d = parseISODate(date);
  return `Tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
}

/** Greeting by local hour. */
export function greetingVi(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Khuya rồi';
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/** 'HH:MM[:SS]' → 'HH:MM' */
export function formatTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '';
}
