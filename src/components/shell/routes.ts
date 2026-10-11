import type { ComponentType } from 'react';

type Loader = () => Promise<{ default: ComponentType }>;

/**
 * Lazy page loaders, shared by App.tsx (React.lazy) and the prefetcher below so a prefetched
 * chunk is exactly the one the route renders. Paths follow PLAN §4.
 */
export const ROUTE_LOADERS = {
  '/login': () => import('@/features/auth/LoginPage'),
  '/register': () => import('@/features/auth/RegisterPage'),
  '/forgot': () => import('@/features/auth/ForgotPage'),
  '/reset': () => import('@/features/auth/ResetPage'),
  '/onboarding': () => import('@/features/onboarding/OnboardingPage'),
  '/goals': () => import('@/features/onboarding/GoalSettingsPage'),
  '/': () => import('@/features/today/TodayPage'),
  '/diary': () => import('@/features/food/DiaryPage'),
  '/food/search': () => import('@/features/food/FoodSearchPage'),
  '/scan': () => import('@/features/scan/ScanPage'),
  '/workout': () => import('@/features/workout/WorkoutPage'),
  '/progress': () => import('@/features/reports/ReportsPage'),
  '/body': () => import('@/features/body/BodyPage'),
  '/profile': () => import('@/features/profile/ProfilePage'),
} satisfies Record<string, Loader>;

export type RoutePath = keyof typeof ROUTE_LOADERS;

const started = new Set<string>();

/** Starts downloading a route's chunk (no-op if unknown or already started). Safe to call often. */
export function prefetchRoute(to: string): void {
  const path = to.split(/[?#]/)[0] || '/';
  const load = (ROUTE_LOADERS as Record<string, Loader>)[path];
  if (!load || started.has(path)) return;
  started.add(path);
  load().catch(() => started.delete(path));
}

/** True when the user asked to save data or is on a very slow connection. */
function constrainedNetwork(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(c?.saveData || (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)));
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Prefetches routes one at a time while the browser is idle (after the current screen settled).
 * Skipped on Save-Data / 2G. Returns a cancel function.
 */
export function prefetchOnIdle(paths: string[], delayMs = 1500): () => void {
  if (typeof window === 'undefined' || constrainedNetwork()) return () => {};
  const w = window as IdleWindow;
  const queue = paths.filter((p) => !started.has(p));
  let cancelled = false;
  let idleId: number | undefined;
  const next = () => {
    if (cancelled) return;
    const path = queue.shift();
    if (!path) return;
    prefetchRoute(path);
    schedule();
  };
  const schedule = () => {
    if (w.requestIdleCallback) idleId = w.requestIdleCallback(next, { timeout: 4000 });
    else idleId = window.setTimeout(next, 250);
  };
  const timer = window.setTimeout(schedule, delayMs);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (idleId !== undefined) {
      if (w.cancelIdleCallback) w.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    }
  };
}

/** Props that prefetch a link's route on hover / focus / touch (spread onto Link / NavLink). */
export function prefetchHandlers(to: string) {
  const go = () => prefetchRoute(to);
  return { onPointerEnter: go, onFocus: go, onTouchStart: go };
}

/**
 * Whether a menu link points at the current location. Like NavLink (prefix match, '/' exact),
 * but a link carrying a query (e.g. '/food/search?tab=mine') is only active when every one of
 * its params matches too — so "Món của tôi" is not highlighted on the plain food-search screen.
 */
export function isLinkActive(to: string, pathname: string, search = ''): boolean {
  const [path, query = ''] = to.split('?');
  const target = path || '/';
  const pathOk = target === '/' ? pathname === '/' : pathname === target || pathname.startsWith(`${target}/`);
  if (!pathOk) return false;
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(search);
  for (const [k, v] of want) if (have.get(k) !== v) return false;
  return true;
}
