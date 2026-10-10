import clsx from 'clsx';
import type { ReactNode } from 'react';
import { formatNumber } from '@/lib/format';
import { CountUp } from './CountUp';

export interface BigNumberProps {
  value: number;
  /** Small unit after the number ("kcal", "kg"). */
  unit?: ReactNode;
  /** Eyebrow label above the number. */
  label?: ReactNode;
  /** Caption below. */
  caption?: ReactNode;
  /** sm 48px · md 72px · lg 96px · xl 120px (default lg). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Gradient tone. */
  tone?: 'default' | 'gold' | 'ember' | 'cool';
  decimals?: 0 | 1 | 2;
  /** Animate with CountUp (default true). */
  countUp?: boolean;
  /** Speed-reveal entrance (default true). */
  reveal?: boolean;
  prefix?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}

const SIZE = {
  sm: 'text-[48px]',
  md: 'text-[72px]',
  lg: 'text-[96px]',
  xl: 'text-[120px]',
} as const;
const TONE = {
  default: 'text-gradient',
  gold: 'text-gradient-gold',
  ember: 'text-gradient-ember',
  cool: 'text-gradient-cool',
} as const;

/** F1-style huge display number: tight tracking, gradient fill, optional count-up + speed-reveal. */
export function BigNumber({
  value,
  unit,
  label,
  caption,
  size = 'lg',
  tone = 'default',
  decimals = 0,
  countUp = true,
  reveal = true,
  prefix,
  align = 'left',
  className,
}: BigNumberProps) {
  return (
    <div className={clsx('flex flex-col', align === 'center' ? 'items-center text-center' : 'items-start', className)}>
      {label && <span className="eyebrow mb-3">{label}</span>}
      <div className={clsx('flex items-end gap-2', reveal && 'animate-speed-reveal')}>
        <span className={clsx('num pb-[0.06em] pr-[0.04em]', SIZE[size], TONE[tone])}>
          {prefix}
          {countUp ? <CountUp value={value} decimals={decimals} /> : formatNumber(value, decimals)}
        </span>
        {unit && (
          <span className={clsx('mb-[0.12em] font-bold tracking-[-0.02em] text-muted', size === 'sm' ? 'text-sm' : 'text-lg')}>{unit}</span>
        )}
      </div>
      {caption && <div className="mt-2 text-sm text-muted">{caption}</div>}
    </div>
  );
}
