// Pure helpers behind <NumberField> (kept React-free so they are unit-testable).
import { formatNumber } from '@/lib/format';

export interface NumberBounds {
  min?: number;
  max?: number;
  /** Max decimals kept (0 = integers). */
  decimals: number;
}

/** Clamp to [min, max] and round to `decimals`; never returns -0 or NaN (NaN → min ?? 0). */
export function clampNumber(v: number, { min, max, decimals }: NumberBounds): number {
  let x = Number.isFinite(v) ? v : (min ?? 0);
  if (min !== undefined && Number.isFinite(min)) x = Math.max(min, x);
  if (max !== undefined && Number.isFinite(max)) x = Math.min(max, x);
  const f = 10 ** Math.max(0, Math.min(6, Math.floor(decimals)));
  const r = Math.round(x * f) / f;
  return r === 0 ? 0 : r;
}

/**
 * Keep only what a number can contain while typing: digits, one leading "-"
 * (when negatives are allowed) and — for decimals > 0 — "." / "," separators.
 * Integers drop the fraction typed after a separator ("68,5" → "68") instead of
 * gluing the digits together ("685").
 */
export function sanitizeNumberInput(raw: string, decimals: number, allowNegative = false): string {
  const neg = allowNegative && raw.trimStart().startsWith('-');
  let s: string;
  if (decimals === 0) {
    // A single separator followed by 1–2 digits is a decimal mark, not thousands.
    const m = raw.match(/^[^\d]*(\d+)[.,](\d{0,2})$/);
    s = m ? m[1] : raw.replace(/[^\d]/g, '');
  } else {
    s = raw.replace(/[^\d.,]/g, '');
  }
  return neg ? `-${s}` : s;
}

/** Text shown for a value: vi decimal comma, no thousands dots (easier to edit). */
export function formatNumberInput(v: number | null | undefined, decimals: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  return formatNumber(v, Math.max(0, Math.min(2, decimals)) as 0 | 1 | 2).replace(/\./g, '');
}
