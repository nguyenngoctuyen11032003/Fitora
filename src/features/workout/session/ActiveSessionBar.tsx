import clsx from 'clsx';
import { ChevronRight, Pause } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { prefetchHandlers } from '@/components/shell/routes';
import { formatNumber } from '@/lib/format';
import { useActiveSession } from './SessionContext';
import { formatClock } from './timer';

export const SESSION_PATH = '/workout/session';

/** Floating "Đang tập" strip above the bottom nav: shows the running clock and returns to the session screen. */
export function ActiveSessionBar() {
  const { pathname } = useLocation();
  const s = useActiveSession();
  if (!s.session || pathname === SESSION_PATH) return null;
  const clock = formatClock(s.elapsedMs);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3 md:absolute lg:left-[var(--sidebar-w)] lg:z-40"
      style={{ bottom: 'calc(var(--bottomnav-h) + var(--safe-bottom) + 20px)' }}
    >
      <Link
        to={SESSION_PATH}
        {...prefetchHandlers(SESSION_PATH)}
        aria-label={`${s.paused ? 'Buổi tập đang tạm dừng' : 'Đang tập'}: ${s.session.title}, ${clock}. Mở màn hình tập.`}
        className="glass-strong pointer-events-auto flex min-h-[56px] w-full max-w-[480px] items-center gap-3 rounded-[22px] px-4 py-2 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)] transition-transform active:scale-[0.98]"
      >
        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center">
          {s.paused ? <Pause className="h-5 w-5 text-muted" fill="currentColor" strokeWidth={0} /> : <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-gold shadow-[0_0_12px_rgba(237,180,11,0.9)]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-text">{s.session.title}</span>
          <span className="block truncate text-[12px] text-muted">{s.paused ? 'Đã tạm dừng' : 'Đang tập'} · ≈ {formatNumber(s.kcal)} kcal</span>
        </span>
        <span className={clsx('num tabular shrink-0 text-[22px]', s.paused ? 'text-text/60' : 'text-gold')}>{clock}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </Link>
    </div>
  );
}
