import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { BottomNav } from './BottomNav';
import { ShellContext } from './ShellContext';

/** Route layout: lazy page outlet (+ skeleton while the chunk loads) and optional bottom nav. */
export function ShellLayout({ bottomNav = true }: { bottomNav?: boolean }) {
  return (
    <ShellContext.Provider value={{ hasBottomNav: bottomNav }}>
      <div className="absolute inset-0">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </div>
      {bottomNav && <BottomNav />}
    </ShellContext.Provider>
  );
}
