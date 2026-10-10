import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface ChipProps {
  children: ReactNode;
  /** Renders a toggle button when provided. */
  onClick?: () => void;
  selected?: boolean;
  icon?: ReactNode;
  /** Dot colour (CSS) shown before the label, e.g. 'var(--protein)'. */
  dot?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/** Small pill: filter toggle (button) or static tag (span). md = 44px tall touch target. */
export function Chip({ children, onClick, selected, icon, dot, size = 'md', disabled, className, ariaLabel }: ChipProps) {
  const cls = clsx(
    'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold transition-colors duration-150',
    size === 'sm' ? 'min-h-[28px] px-2.5 text-[12px]' : 'min-h-[44px] px-4 text-sm',
    selected
      ? 'border-gold/60 bg-gold/15 text-gold'
      : 'border-line bg-white/[0.04] text-text/85',
    onClick && !selected && 'hover:bg-white/[0.08]',
    onClick && 'active:scale-[0.97]',
    disabled && 'opacity-40',
    className,
  );
  const inner = (
    <>
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} aria-hidden="true" />}
      {icon}
      {children}
    </>
  );
  if (!onClick) return <span className={cls}>{inner}</span>;
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={ariaLabel} className={cls}>
      {inner}
    </button>
  );
}
