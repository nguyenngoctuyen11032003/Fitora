import clsx from 'clsx';

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

/** Thin rounded progress bar with animated width. */
export function ProgressBar({ value, max = 100, color = 'var(--gold)', height = 8, label, showOver = true, className }: ProgressBarProps) {
  const ratio = max > 0 ? value / max : 0;
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  const over = showOver && ratio > 1;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      className={clsx('relative w-full overflow-hidden rounded-full bg-white/[0.08]', className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${pct}%`,
          background: over ? 'linear-gradient(90deg, var(--ember), var(--danger))' : color,
          boxShadow: `0 0 12px -2px ${over ? 'var(--ember)' : color}`,
        }}
      />
    </div>
  );
}
