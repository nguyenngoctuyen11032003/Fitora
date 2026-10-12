import clsx from 'clsx';
import { BookOpen, Dumbbell, Home, ScanLine, TrendingUp, type LucideIcon } from 'lucide-react';
import type { MouseEvent } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { prefetchHandlers } from './routes';

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
}

const LEFT: Item[] = [
  { to: '/', label: 'Hôm nay', icon: Home },
  { to: '/diary', label: 'Nhật ký', icon: BookOpen },
];
const RIGHT: Item[] = [
  { to: '/workout', label: 'Tập luyện', icon: Dumbbell },
  { to: '/progress', label: 'Tiến trình', icon: TrendingUp },
];

/**
 * Tapping the tab you're already on scrolls that screen back to the top (native tab-bar
 * behaviour) instead of pushing a duplicate history entry.
 */
function useRetap(to: string) {
  const { pathname, search } = useLocation();
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== to || search || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.querySelector<HTMLElement>('#fitora-app main')?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };
}

function Tab({ item }: { item: Item }) {
  const Icon = item.icon;
  const onClick = useRetap(item.to);
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onClick}
      {...prefetchHandlers(item.to)}
      className={({ isActive }) =>
        clsx(
          'group relative flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[rgba(237,180,11,0.7)]',
          isActive ? 'text-gold' : 'text-muted hover:text-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={clsx('h-[22px] w-[22px] transition-transform duration-200', isActive && '-translate-y-0.5')} strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
          <span className="max-w-full truncate">{item.label}</span>
          <span
            aria-hidden="true"
            className={clsx(
              'absolute -top-[9px] h-[3px] rounded-full bg-gold shadow-[0_0_12px_rgba(237,180,11,0.9)] transition-all duration-300',
              isActive ? 'w-6 opacity-100' : 'w-0 opacity-0',
            )}
          />
        </>
      )}
    </NavLink>
  );
}

/** 5-slot bottom navigation with a raised gold "Quét" FAB in the middle. Absolute inside the frame; hidden on laptop (Sidebar). */
export function BottomNav() {
  return (
    <nav
      aria-label="Điều hướng"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 lg:hidden pb-[calc(var(--safe-bottom)+8px)] pl-[max(12px,var(--safe-left))] pr-[max(12px,var(--safe-right))]"
    >
      <div className="glass-strong pointer-events-auto relative mx-auto flex h-[var(--bottomnav-h)] max-w-[480px] items-center rounded-[28px] px-2 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]">
        {LEFT.map((i) => (
          <Tab key={i.to} item={i} />
        ))}
        {/* The whole centre slot (FAB + "Quét" label) is one link, so the label is tappable too. */}
        <NavLink
          to="/scan"
          aria-label="Quét món ăn bằng AI"
          {...prefetchHandlers('/scan')}
          className="group relative flex h-full w-[76px] shrink-0 justify-center rounded-2xl outline-none"
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden="true"
                className={clsx(
                  'absolute -top-[33px] grid h-[64px] w-[64px] place-items-center rounded-full text-[#1a0e02] transition-transform duration-200 group-active:scale-95',
                  'bg-[radial-gradient(circle_at_30%_25%,#ffe48a_0%,#edb40b_45%,#c27c06_100%)]',
                  'shadow-[0_14px_30px_-6px_rgba(237,180,11,0.65),0_0_0_6px_rgba(18,9,6,0.9),inset_0_1px_0_rgba(255,255,255,0.6)]',
                  'group-focus-visible:ring-2 group-focus-visible:ring-text group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-bg',
                  isActive && 'animate-pulse-ring',
                )}
              >
                <ScanLine className="h-7 w-7" strokeWidth={2.4} />
              </span>
              <span className="absolute top-[43px] text-[11px] font-semibold text-gold" aria-hidden="true">
                Quét
              </span>
            </>
          )}
        </NavLink>
        {RIGHT.map((i) => (
          <Tab key={i.to} item={i} />
        ))}
      </div>
    </nav>
  );
}
