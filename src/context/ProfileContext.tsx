import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { onDataChanged } from '@/lib/events';
import { getFitProfile, getSharedProfile } from '@/services/profile';
import type { FitProfile, SharedProfile } from '@/types/db';
import { useAuth } from './AuthContext';

export interface ProfileState {
  /** fit_profiles row (null = not started onboarding). */
  fit: FitProfile | null;
  /** public.profiles row shared with Note_mytasks (display_name, avatar_url). */
  shared: SharedProfile | null;
  /** True while the first load for the current user is in flight (false when served from cache). */
  loading: boolean;
  error: unknown;
  /** Re-fetch both rows. */
  refresh: () => Promise<void>;
  /** Optimistically replace the fit row (e.g. with the value returned by upsertFitProfile). */
  setFit: (fit: FitProfile | null) => void;
  /** Friendly display name ("bạn" fallback). */
  displayName: string;
}

const Ctx = createContext<ProfileState | null>(null);
const CACHE_KEY = 'fitora.ctx';

interface Cache {
  uid: string;
  fit: FitProfile | null;
  shared: SharedProfile | null;
}

function readCache(uid: string): Cache | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as Cache | null;
    return c && c.uid === uid ? c : null;
  } catch {
    return null;
  }
}
function writeCache(c: Cache | null) {
  try {
    if (c) localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* private mode / quota */
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [fit, setFitState] = useState<FitProfile | null>(null);
  const [shared, setShared] = useState<SharedProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(uid));
  const [error, setError] = useState<unknown>(null);
  // uid whose data (cache or network) is in state — avoids a frame where fit=null looks like 'not onboarded'.
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const token = useRef(0);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!uid) return;
      const t = ++token.current;
      if (!opts.silent) setLoading(true);
      try {
        const [f, s] = await Promise.all([getFitProfile(), getSharedProfile().catch(() => null)]);
        if (t !== token.current) return;
        setFitState(f);
        setShared(s);
        setError(null);
        writeCache({ uid, fit: f, shared: s });
      } catch (e) {
        if (t === token.current) setError(e);
      } finally {
        if (t === token.current) {
          setLoading(false);
          setLoadedUid(uid);
        }
      }
    },
    [uid],
  );

  useEffect(() => {
    if (!uid) {
      token.current++;
      setFitState(null);
      setShared(null);
      setLoading(false);
      setError(null);
      writeCache(null);
      return;
    }
    const cached = readCache(uid);
    if (cached) {
      // Paint from cache instantly, revalidate in the background.
      setFitState(cached.fit);
      setShared(cached.shared);
      setLoading(false);
      setLoadedUid(uid);
      void load({ silent: true });
    } else {
      setFitState(null);
      setShared(null);
      void load();
    }
  }, [uid, load]);

  useEffect(() => onDataChanged((kind) => kind === 'profile' && void load({ silent: true })), [load]);

  const setFit = useCallback(
    (f: FitProfile | null) => {
      setFitState(f);
      if (uid) writeCache({ uid, fit: f, shared });
    },
    [uid, shared],
  );

  const refresh = useCallback(() => load({ silent: true }), [load]);

  const displayName =
    shared?.display_name?.trim() || (user?.user_metadata?.display_name as string | undefined)?.trim() || user?.email?.split('@')[0] || 'bạn';

  const value = useMemo<ProfileState>(
    () => ({ fit, shared, loading: loading || (uid !== null && loadedUid !== uid), error, refresh, setFit, displayName }),
    [fit, shared, loading, loadedUid, uid, error, refresh, setFit, displayName],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
