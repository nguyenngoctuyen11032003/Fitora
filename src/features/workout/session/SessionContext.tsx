import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { findActivity, type ActivityDef, type ActivityVariant } from '@/data/activities';
import { findPlanDay, type PlanDay } from '@/data/workoutPlan';
import { useProfile } from '@/context/ProfileContext';
import { useAsync } from '@/lib/hooks';
import { onDataChanged } from '@/lib/events';
import { latestWeight } from '@/services/body';
import { resolveWeight } from '../lib';
import * as T from './timer';

interface SessionStore {
  session: T.ActiveSession | null;
  /** Starts a session; when one is already running it is returned unchanged (one at a time). */
  start(input: T.StartInput): T.ActiveSession | null;
  pause(): void;
  resume(): void;
  setSets(exerciseId: string, count: number, total: number): void;
  setVariant(variantId: string): void;
  /** Drops the session (after it was saved, or "Hủy buổi tập"). */
  clear(): void;
}

const Ctx = createContext<SessionStore | null>(null);

function read(): T.ActiveSession | null {
  try {
    return T.parseSession(localStorage.getItem(T.ACTIVE_SESSION_KEY));
  } catch {
    return null;
  }
}
function persist(s: T.ActiveSession | null) {
  try {
    if (s) localStorage.setItem(T.ACTIVE_SESSION_KEY, T.serializeSession(s));
    else localStorage.removeItem(T.ACTIVE_SESSION_KEY);
  } catch {
    /* private mode / quota: the session still runs in memory */
  }
}

/** Keeps the one running "Tập ngay" session in localStorage so it survives reloads and other tabs. */
export function ActiveSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<T.ActiveSession | null>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === T.ACTIVE_SESSION_KEY) setSession(T.parseSession(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((fn: (s: T.ActiveSession) => T.ActiveSession) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      persist(next);
      return next;
    });
  }, []);

  const value = useMemo<SessionStore>(
    () => ({
      session,
      start(input) {
        const current = read();
        if (current) {
          setSession(current);
          return current;
        }
        const s = T.start(input, Date.now());
        if (s) {
          persist(s);
          setSession(s);
        }
        return s;
      },
      pause: () => update((s) => T.pause(s, Date.now())),
      resume: () => update((s) => T.resume(s, Date.now())),
      setSets: (id, count, total) => update((s) => T.setSetsDone(s, id, count, total)),
      setVariant: (v) => update((s) => T.setVariant(s, v)),
      clear() {
        persist(null);
        setSession(null);
      },
    }),
    [session, update],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export interface ActiveSessionApi extends SessionStore {
  running: boolean;
  paused: boolean;
  /** Elapsed ms, re-rendered every second while running. */
  elapsedMs: number;
  /** Live kcal for the elapsed time. */
  kcal: number;
  activity: ActivityDef | null;
  variant: ActivityVariant | null;
  day: PlanDay | null;
  summary: T.FinishSummary | null;
}

/** The single active session + a live clock (every caller ticks on its own, which is cheap). */
export function useActiveSession(): ActiveSessionApi {
  const store = useContext(Ctx);
  if (!store) throw new Error('useActiveSession must be used inside <ActiveSessionProvider>');
  const { session } = store;
  const running = !!session && !session.pausedAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, session?.id]);
  const at = session ? Math.max(now, Date.parse(session.startedAt)) : now;
  const activity = session ? findActivity(session.activity) ?? null : null;
  return {
    ...store,
    running,
    paused: !!session?.pausedAt,
    elapsedMs: session ? T.elapsedMs(session, at) : 0,
    kcal: session ? T.liveKcal(session.met, session.weightKg, T.elapsedMs(session, at)) : 0,
    activity,
    variant: activity?.variants.find((v) => v.id === session?.variant) ?? null,
    day: findPlanDay(session?.dayId) ?? null,
    summary: session ? T.finish(session, at) : null,
  };
}

/** Weight for kcal maths: latest weigh-in → onboarding weight → 65 kg (same rule as the workout page). */
export function useSessionWeight() {
  const { fit } = useProfile();
  const q = useAsync(() => latestWeight(), []);
  const reload = q.reload;
  useEffect(() => onDataChanged((k) => (k === 'body' || k === 'any' ? void reload() : undefined)), [reload]);
  return useMemo(() => resolveWeight(q.data?.weight_kg, fit?.start_weight_kg), [q.data?.weight_kg, fit?.start_weight_kg]);
}
