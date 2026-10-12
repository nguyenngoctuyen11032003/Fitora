import clsx from 'clsx';
import { forwardRef, type HTMLAttributes } from 'react';

export interface GlassCardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'li' | 'header';
  /** Inner padding (default 'md' = 20px). */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Denser, darker surface (glass-strong). */
  strong?: boolean;
  /** Hover / press feedback (use with onClick or a wrapping link). */
  interactive?: boolean;
  /** Gold hairline accent. */
  accent?: boolean;
}

const PAD = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' } as const;

/** Rounded 24px glass surface — the basic content container. */
export const GlassCard = forwardRef<HTMLElement, GlassCardProps>(function GlassCard(
  { as = 'div', padding = 'md', strong, interactive, accent, className, children, ...rest },
  ref,
) {
  const Tag = as as 'div';
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={clsx(
        'relative',
        strong ? 'glass-strong rounded-card' : 'glass-card',
        PAD[padding],
        interactive && 'cursor-pointer transition-transform duration-200 hover:bg-white/[0.08] active:scale-[0.985]',
        accent && 'ring-1 ring-[rgba(237,180,11,0.4)]',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
});
