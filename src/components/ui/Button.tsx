import clsx from 'clsx';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = gold filled · secondary = glass · ghost = text only · danger = red. Default primary. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** sm 44px · md 50px · lg 56px (all ≥ 44px touch targets). Default md. */
  size?: 'sm' | 'md' | 'lg';
  /** Full width. */
  block?: boolean;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const SIZES = {
  sm: 'min-h-[44px] px-4 text-sm gap-1.5 rounded-full',
  md: 'min-h-[50px] px-5 text-[15px] gap-2 rounded-full',
  lg: 'min-h-[56px] px-6 text-base gap-2.5 rounded-full',
} as const;

const VARIANTS = {
  primary:
    'bg-gold text-[#1a0e02] font-bold shadow-[0_10px_30px_-10px_rgba(237,180,11,0.7),inset_0_1px_0_rgba(255,255,255,0.45)] hover:brightness-105 active:brightness-95',
  secondary: 'glass font-semibold text-text',
  ghost: 'bg-transparent font-semibold text-text hover:bg-white/[0.06]',
  danger: 'bg-danger/90 text-white font-bold hover:bg-danger shadow-[0_10px_30px_-12px_rgba(225,6,0,0.8)]',
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', block, loading, icon, iconRight, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        'relative inline-flex select-none items-center justify-center whitespace-nowrap tracking-[-0.01em] transition-[transform,filter,background-color] duration-150 touch-manipulation active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        SIZES[size],
        VARIANTS[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 20 : 18} /> : icon}
      {children && <span className={clsx(loading && 'opacity-80')}>{children}</span>}
      {!loading && iconRight}
    </button>
  );
});
