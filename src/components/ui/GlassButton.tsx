import clsx from 'clsx';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** circle (44×44 icon), square (44×44 rounded 16) or pill (text + icon). Default circle. */
  variant?: 'circle' | 'pill' | 'square';
  /** Accessible name — required for icon-only buttons. */
  label?: string;
  /** Highlight (gold tint) e.g. a toggled state. */
  active?: boolean;
}

/** Liquid-glass button. Children = lucide icon and/or text. */
export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { variant = 'circle', label, active, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={variant !== 'pill' ? label : undefined}
      aria-pressed={active === undefined ? undefined : active}
      className={clsx(
        'glass text-text disabled:pointer-events-none disabled:opacity-40',
        variant,
        variant === 'pill' && 'text-sm font-semibold',
        active && '!border-gold/50 !bg-gold/15 text-gold',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
