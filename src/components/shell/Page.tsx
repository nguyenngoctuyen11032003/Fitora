import clsx from 'clsx';
import { forwardRef, type ReactNode } from 'react';
import { useShell } from './ShellContext';
import { TopBar, type TopBarProps } from './TopBar';

export interface PageProps {
  children: ReactNode;
  /** Show the TopBar (avatar + greeting + menu). Default true. Pass props to customise it. */
  topBar?: boolean | TopBarProps;
  /** Horizontal padding 20px (default true). */
  padded?: boolean;
  /** Sticky footer inside the page (e.g. save button) — sits above the bottom nav. */
  footer?: ReactNode;
  className?: string;
  /** Class for the inner content column. */
  contentClassName?: string;
  /** Accessible label for the main region. */
  label?: string;
}

/**
 * Scroll container for a screen. Handles top safe-area, the bottom nav clearance
 * (when the route shows BottomNav) and an optional sticky footer.
 * Each page scrolls independently inside the frame (h-full overflow-y-auto).
 */
export const Page = forwardRef<HTMLElement, PageProps>(function Page(
  { children, topBar = true, padded = true, footer, className, contentClassName, label },
  ref,
) {
  const { hasBottomNav } = useShell();
  const bottomPad = hasBottomNav ? 'calc(var(--bottomnav-h) + var(--safe-bottom) + 40px)' : 'calc(var(--safe-bottom) + 28px)';
  return (
    <main
      ref={ref}
      aria-label={label}
      className={clsx('no-scrollbar absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain', className)}
    >
      <div
        className={clsx('mx-auto flex min-h-full w-full max-w-[560px] flex-col', padded && 'px-5', contentClassName)}
        style={{ paddingTop: 'calc(var(--safe-top) + 8px)', paddingBottom: footer ? 0 : bottomPad }}
      >
        {topBar && <TopBar {...(typeof topBar === 'object' ? topBar : {})} className="mb-4" />}
        {children}
        {footer && (
          <div
            className="sticky bottom-0 z-10 -mx-5 mt-auto bg-gradient-to-t from-bg via-bg/95 to-transparent px-5 pt-6"
            style={{ paddingBottom: bottomPad }}
          >
            {footer}
          </div>
        )}
      </div>
    </main>
  );
});
