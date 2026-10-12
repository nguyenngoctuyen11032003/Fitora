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

/**
 * Plain accessible name out of a field label: a string as is, or for an element tree the FIRST
 * text leaf (e.g. "Đạm" from <span><dot/>Đạm<span>30% · 600 kcal</span></span>). '' when none.
 */
export function labelText(node: unknown): string {
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    for (const n of node) {
      const t = labelText(n);
      if (t) return t;
    }
    return '';
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: unknown; 'aria-hidden'?: unknown } }).props;
    if (props?.['aria-hidden'] === true || props?.['aria-hidden'] === 'true') return '';
    return labelText(props?.children);
  }
  return '';
}

/** aria-label of a stepper button: "Giảm Đạm" / "Tăng Nước mỗi ngày" (bare verb when unnamed). */
export function stepperAriaLabel(verb: 'Giảm' | 'Tăng', name: string): string {
  return name ? `${verb} ${name}` : verb;
}

/** Text shown for a value: vi decimal comma, no thousands dots (easier to edit). */
export function formatNumberInput(v: number | null | undefined, decimals: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  return formatNumber(v, Math.max(0, Math.min(2, decimals)) as 0 | 1 | 2).replace(/\./g, '');
}

/**
 * Inline message when `v` is outside [min, max] ("Tối đa 300 kg", "Tối thiểu 25 kg"),
 * otherwise null. `checkMin` = false while the user is still typing ("2" on the
 * way to "25" is not an error yet); a value above max can only grow, so it is
 * always reported.
 */
export function rangeMessage(
  v: number | null | undefined,
  { min, max }: { min?: number; max?: number },
  unit?: string,
  checkMin = true,
): string | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const u = unit ? ` ${unit}` : '';
  if (max !== undefined && Number.isFinite(max) && v > max) return `Tối đa ${formatNumber(max, 2)}${u}`;
  if (checkMin && min !== undefined && Number.isFinite(min) && v < min) return `Tối thiểu ${formatNumber(min, 2)}${u}`;
  return null;
}
