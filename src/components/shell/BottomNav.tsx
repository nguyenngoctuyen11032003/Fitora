import clsx from 'clsx';
import { BookOpen, Dumbbell, Home, ScanLine, TrendingUp, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

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

function Tab({ item }: { item: Item }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        clsx(
          'group relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition-colors',
          isActive ? 'text-gold' : 'text-muted hover:text-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={clsx('h-[22px] w-[22px] transition-transform duration-200', isActive && '-translate-y-0.5')} strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
          <span>{item.label}</span>
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

/** 5-slot bottom navigation with a raised gold Scan FAB in the middle. Absolute inside the frame. */
export function BottomNav() {
  return (
    <nav
      aria-label="Điều hướng"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-3 pb-[calc(var(--safe-bottom)+8px)]"
    >
      <div className="glass-strong pointer-events-auto relative mx-auto flex h-[var(--bottomnav-h)] max-w-[480px] items-center rounded-[28px] px-2 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]">
        {LEFT.map((i) => (
          <Tab key={i.to} item={i} />
        ))}
        <div className="relative flex w-[76px] shrink-0 justify-center">
          <NavLink
            to="/scan"
            aria-label="Quét món ăn bằng AI"
            className={({ isActive }) =>
              clsx(
                'absolute -top-[46px] grid h-[64px] w-[64px] place-items-center rounded-full text-[#1a0e02] transition-transform duration-200 active:scale-95',
                'bg-[radial-gradient(circle_at_30%_25%,#ffe48a_0%,#edb40b_45%,#c27c06_100%)]',
                'shadow-[0_14px_30px_-6px_rgba(237,180,11,0.65),0_0_0_6px_rgba(18,9,6,0.9),inset_0_1px_0_rgba(255,255,255,0.6)]',
                isActive && 'animate-pulse-ring',
              )
            }
          >
            <ScanLine className="h-7 w-7" strokeWidth={2.4} aria-hidden="true" />
          </NavLink>
          <span className="mt-[30px] text-[11px] font-semibold text-gold" aria-hidden="true">
            Scan
          </span>
        </div>
        {RIGHT.map((i) => (
          <Tab key={i.to} item={i} />
        ))}
      </div>
    </nav>
  );
}
