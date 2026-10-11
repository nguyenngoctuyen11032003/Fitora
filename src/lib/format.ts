// vi-VN number formatting helpers. Vietnamese uses '.' for thousands and ',' for decimals.

const nf0 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

const finite = (n: unknown): number => {
  const v = typeof n === 'string' ? Number(n) : (n as number);
  return Number.isFinite(v) ? v : 0;
};

/** Number with vi-VN separators; `digits` = max fraction digits (0–2). */
export function formatNumber(n: number | string | null | undefined, digits: 0 | 1 | 2 = 0): string {
  // Round first and drop the sign of a zero result: Intl prints -0.3 → "-0".
  const r = round(finite(n), digits);
  return (digits === 0 ? nf0 : digits === 1 ? nf1 : nf2).format(r);
}

/** "1.850 kcal" */
export function formatKcal(n: number | string | null | undefined, withUnit = true): string {
  const s = formatNumber(n, 0);
  return withUnit ? `${s} kcal` : s;
}

/** "25 g" / "2,5 g" (≥ 10 g rounded, below 1 decimal) */
export function formatGrams(n: number | string | null | undefined, withUnit = true): string {
  const v = finite(n);
  const s = formatNumber(v, Math.abs(v) >= 9.95 ? 0 : 1);
  return withUnit ? `${s} g` : s;
}

/** "68,5 kg" */
export function formatKg(n: number | string | null | undefined, withUnit = true): string {
  const s = formatNumber(n, 1);
  return withUnit ? `${s} kg` : s;
}

/** "1,5 L" for ≥ 1000 ml, else "250 ml" */
export function formatMl(n: number | string | null | undefined): string {
  const v = Math.round(finite(n)); // 999,6 ml → "1 L", not "1.000 ml"
  return Math.abs(v) >= 1000 ? `${formatNumber(v / 1000, 2)} L` : `${formatNumber(v)} ml`;
}

/** "45 phút" / "1 giờ 30 phút" */
export function formatMinutes(min: number | string | null | undefined): string {
  const v = Math.round(finite(min));
  if (v < 60) return `${v} phút`;
  const h = Math.floor(v / 60);
  const m = v % 60;
  return m ? `${h} giờ ${m} phút` : `${h} giờ`;
}

/** "12%" */
export function formatPercent(ratio: number, digits: 0 | 1 = 0): string {
  return `${formatNumber(finite(ratio) * 100, digits)}%`;
}

/** Signed: "+120" / "−80" (true minus sign). */
export function formatSigned(n: number, digits: 0 | 1 = 0): string {
  const v = round(finite(n), digits); // the sign follows what is shown: 0.4 → "0", not "+0"
  const s = formatNumber(Math.abs(v), digits);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

/**
 * Parse user-typed numbers in either "1.234,5" (vi) or "1234.5" form.
 * Returns null for empty/invalid input.
 */
export function parseDecimal(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = input.trim().replace(/\s/g, '');
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // the last separator is the decimal one
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    // "1,234,567" → thousands; "68,5" → decimal
    s = (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot && (s.match(/\./g)?.length ?? 0) > 1) {
    // "1.234.567" (vi thousands) → 1234567
    s = s.replace(/\./g, '');
  }
  // Plain decimals only: Number() would also accept '0x10', '1e5', 'Infinity'.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** Round to `digits` decimals (for storing nutrients). */
export function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  const r = Math.round(finite(n) * f) / f;
  return r === 0 ? 0 : r; // never -0
}

/** Initials for an avatar fallback. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'F';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
