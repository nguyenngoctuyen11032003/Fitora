import clsx from 'clsx';
import { forwardRef, useCallback, useLayoutEffect, useRef, type ForwardedRef, type MutableRefObject, type ReactNode, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
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

/** Scroll offsets per history entry (location.key), kept for the session. */
const scrollPositions = new Map<string, number>();

/**
 * Per-route scroll restoration for the page's own scroll container (the window never scrolls):
 * new navigations start at the top (fresh mount), Back/Forward (POP) returns to where the user was.
 * Content often arrives async, so the restore retries for ~1s until the page is tall enough,
 * and stops as soon as the user scrolls/touches.
 */
function useScrollRestoration(el: RefObject<HTMLElement>) {
  const { key } = useLocation();
  const navType = useNavigationType();
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const saved = navType === 'POP' ? scrollPositions.get(key) : undefined;
    let raf = 0;
    let tries = 0;
    let restoring = Boolean(saved);
    const stop = () => {
      restoring = false;
      cancelAnimationFrame(raf);
    };
    if (saved) {
      const apply = () => {
        if (!restoring) return;
        node.scrollTop = saved;
        if (Math.abs(node.scrollTop - saved) > 2 && tries++ < 60) raf = requestAnimationFrame(apply);
        else restoring = false;
      };
      apply();
    }
    const onScroll = () => {
      if (!restoring) scrollPositions.set(key, node.scrollTop);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    node.addEventListener('wheel', stop, { passive: true });
    node.addEventListener('touchstart', stop, { passive: true });
    return () => {
      stop();
      node.removeEventListener('scroll', onScroll);
      node.removeEventListener('wheel', stop);
      node.removeEventListener('touchstart', stop);
    };
  }, [el, key, navType]);
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
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
  const inner = useRef<HTMLElement>(null);
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      (inner as MutableRefObject<HTMLElement | null>).current = node;
      assignRef(ref, node);
    },
    [ref],
  );
  useScrollRestoration(inner);
  const bottomPad = hasBottomNav ? 'calc(var(--bottomnav-h) + var(--safe-bottom) + 40px)' : 'calc(var(--safe-bottom) + 28px)';
  return (
    <main
      ref={setRef}
      aria-label={label}
      className={clsx('no-scrollbar absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain', className)}
    >
      <div
        className={clsx('mx-auto flex min-h-full w-full max-w-[560px] flex-col lg:max-w-[1180px]', padded && 'px-5 lg:px-10', contentClassName)}
        style={{ paddingTop: 'calc(var(--safe-top) + 8px)', paddingBottom: footer ? 0 : bottomPad }}
      >
        {topBar && <TopBar {...(typeof topBar === 'object' ? topBar : {})} className="mb-4" />}
        {children}
        {footer && (
          <div
            className="sticky bottom-0 z-10 -mx-5 mt-auto bg-gradient-to-t from-bg via-bg/95 to-transparent px-5 pt-6 lg:-mx-10 lg:px-10"
            style={{ paddingBottom: bottomPad }}
          >
            {footer}
          </div>
        )}
      </div>
    </main>
  );
});
