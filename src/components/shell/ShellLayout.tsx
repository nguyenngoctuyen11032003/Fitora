import clsx from 'clsx';
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { BottomNav } from './BottomNav';
import { ShellContext } from './ShellContext';
import { Sidebar } from './Sidebar';

/**
 * Route layout: lazy page outlet (+ skeleton while the chunk loads) and optional bottom nav.
 * On laptop (≥1024px) the sidebar takes over navigation (BottomNav hides itself there) and the
 * page area starts after it; `sidebar={false}` keeps a flow (onboarding) full-window.
 */
export function ShellLayout({ bottomNav = true, sidebar = true }: { bottomNav?: boolean; sidebar?: boolean }) {
  return (
    <ShellContext.Provider value={{ hasBottomNav: bottomNav }}>
      {sidebar && <Sidebar className="absolute inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] lg:flex" />}
      <div className={clsx('absolute inset-0', sidebar && 'lg:left-[var(--sidebar-w)]')}>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </div>
      {bottomNav && <BottomNav />}
    </ShellContext.Provider>
  );
}
