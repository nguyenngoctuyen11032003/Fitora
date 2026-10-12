import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const MARK = 'scanGuard';

/** True when a history state (react-router's `{ usr, key, idx }`) is one of our guard entries. */
export function isGuardState(state: unknown): boolean {
  const usr = (state as { usr?: unknown } | null)?.usr;
  return !!usr && typeof usr === 'object' && (usr as Record<string, unknown>)[MARK] === true;
}

/**
 * While `active`, keeps one extra history entry on top of the current screen so the
 * Android / browser Back button calls `onBack` instead of leaving the page.
 * The entry is pushed again after each Back as long as the guard stays active.
 *
 * `release()` removes the entry before leaving on purpose (save, confirmed discard) and
 * resolves once the browser is back on the screen's own entry; the guard then stays off
 * until `active` turns false.
 */
export function useBackGuard(active: boolean, onBack: () => void) {
  const navigate = useNavigate();
  const location = useLocation();
  const pushed = useRef(false);
  const held = useRef(false);
  const releasing = useRef<(() => void) | null>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  // Bumped after a Back so the push effect runs again.
  const [popped, setPopped] = useState(0);
  const locRef = useRef(location);
  locRef.current = location;

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (releasing.current) {
        const done = releasing.current;
        releasing.current = null;
        done();
        return;
      }
      if (pushed.current && !isGuardState(e.state)) {
        pushed.current = false;
        setPopped((n) => n + 1);
        onBackRef.current();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const release = useCallback((): Promise<void> => {
    held.current = true;
    if (!pushed.current) return Promise.resolve();
    pushed.current = false;
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      releasing.current = finish;
      // Some browsers drop the event when the tab is hidden — never hang the caller.
      window.setTimeout(() => {
        if (releasing.current === finish) releasing.current = null;
        finish();
      }, 400);
      window.history.back();
    });
  }, []);

  useEffect(() => {
    if (!active) {
      held.current = false;
      // The reason for the guard is gone (e.g. a new scan started) → drop the extra entry
      // so the next Back does what the user expects.
      if (pushed.current && isGuardState(window.history.state)) void release().then(() => (held.current = false));
      return;
    }
    if (pushed.current || held.current || isGuardState(window.history.state)) {
      if (isGuardState(window.history.state)) pushed.current = true;
      return;
    }
    pushed.current = true;
    const { pathname, search, state } = locRef.current;
    const base = state && typeof state === 'object' ? (state as Record<string, unknown>) : {};
    navigate({ pathname, search }, { state: { ...base, [MARK]: true } });
  }, [active, popped, navigate, release]);

  return { release };
}
