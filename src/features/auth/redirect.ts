// Where to send the user after signing in: the protected page they originally asked
// for (RequireAuth stores it in location.state.from), never an auth page or an
// external URL.

const AUTH_PAGES = ['/login', '/register', '/forgot', '/reset'];

export function returnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null | undefined)?.from;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return '/';
  const path = from.split(/[?#]/)[0];
  if (AUTH_PAGES.includes(path)) return '/';
  return from;
}
