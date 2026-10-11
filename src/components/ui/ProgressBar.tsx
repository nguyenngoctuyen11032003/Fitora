import clsx from 'clsx';
import { memo } from 'react';
import { clampRatio } from './progress';

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Fill colour — any CSS colour or var, e.g. 'var(--protein)'. Default gold. */
  color?: string;
  /** Track height in px (default 8). */
  height?: number;
  /** Accessible label. */
  label?: string;
  /** Colour the overflow part in ember/red when value > max (default true). */
  showOver?: boolean;
  className?: string;
}

/**
 * Thin rounded progress bar. The fill slides in with a GPU transform
 * (translateX of a full-width bar inside the rounded, clipped track) instead of
 * animating `width`, so it never triggers layout.
 */
export const ProgressBar = memo(function ProgressBar({ value, max = 100, color = 'var(--gold)', height = 8, label, showOver = true, className }: ProgressBarProps) {
  const r = clampRatio(value, max);
  const clamped = r.clamped;
  const over = showOver && r.over;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const now = Number.isFinite(value) ? Math.min(Math.max(0, value), safeMax) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={Math.round(now)}
      className={clsx('relative w-full overflow-hidden rounded-full bg-white/[0.08]', className)}
      style={{ height }}
    >
      <div
        className="h-full w-full rounded-full transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
        style={{
          transform: `translateX(${(clamped - 1) * 100}%)`,
          background: over ? 'linear-gradient(90deg, var(--ember), var(--danger))' : color,
          boxShadow: clamped > 0 ? `0 0 12px -2px ${over ? 'var(--ember)' : color}` : undefined,
        }}
      />
    </div>
  );
});
