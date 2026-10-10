import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatSigned } from '@/lib/format';
import type { DeltaTone } from './lib';

const TONE: Record<DeltaTone, string> = {
  // NB: Tailwind can't apply /opacity to var() colours, hence explicit rgba.
  good: 'bg-[rgba(127,209,139,0.12)] text-ok border-[rgba(127,209,139,0.3)]',
  bad: 'bg-[rgba(255,107,94,0.1)] text-[var(--danger-text)] border-[rgba(255,107,94,0.3)]',
  neutral: 'bg-white/[0.05] text-text/80 border-line',
};

const TONE_WORD: Record<DeltaTone, string> = { good: 'tốt', bad: 'chưa tốt', neutral: '' };

/** "▼ −0,4 kg" pill. Colour reflects good/bad for the user's goal, the arrow carries the direction. */
export function DeltaBadge({
  delta,
  unit,
  tone = 'neutral',
  size = 'md',
  className,
}: {
  delta: number | null;
  unit?: string;
  tone?: DeltaTone;
  size?: 'sm' | 'md';
  className?: string;
}) {
  if (delta === null) return null;
  const flat = Math.abs(delta) < 0.05;
  const Icon = flat ? Minus : delta < 0 ? ArrowDownRight : ArrowUpRight;
  const t = flat ? 'neutral' : tone;
  return (
    <span
      className={clsx(
        'tabular inline-flex items-center gap-0.5 whitespace-nowrap rounded-full border font-bold',
        size === 'sm' ? 'px-1.5 py-[1px] text-[11px]' : 'px-2 py-0.5 text-[12px]',
        TONE[t],
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden="true" />
      {flat ? '0' : formatSigned(delta, 1)}
      {unit && <span className="font-semibold opacity-80">&nbsp;{unit}</span>}
      {TONE_WORD[t] && <span className="sr-only"> ({TONE_WORD[t]})</span>}
    </span>
  );
}
