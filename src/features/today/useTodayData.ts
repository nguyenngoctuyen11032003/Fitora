import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, todayISO } from '@/lib/date';
import { notifyDataChanged, onDataChanged, type DataKind } from '@/lib/events';
import { latestWeight } from '@/services/body';
import { getDailyLog, setSteps as saveSteps, setWater as saveWater } from '@/services/daily';
import { listMeals } from '@/services/meals';
import { getDaySummary, getRangeSummary } from '@/services/summary';
import { listWorkouts, updateWorkout } from '@/services/workouts';
import type { DaySummary, MealEntry, RangeSummaryRow, Workout } from '@/types/db';
import { summaryFromParts } from './metrics';

export interface TodayData {
  summary: DaySummary;
  meals: MealEntry[];
  workouts: Workout[];
  latestWeightKg: number | null;
  /** Past days (today excluded, newest last) for streaks; empty when it could not be loaded. */
  history: RangeSummaryRow[];
}

/** Parts of the dashboard that may fail independently. */
export type TodayPart = 'summary' | 'meals' | 'workouts';

interface State {
  date: string;
  data: TodayData | null;
  loading: boolean;
  error: unknown;
  /** Parts whose last load failed (their values are stale or empty). */
  failed: TodayPart[];
}

/** How often the clock (hour-based insights) and the day-rollover check tick. */
const CLOCK_MS = 30_000;

/** Ignore our own data-changed broadcasts for this long. */
const SELF_ECHO_MS = 1500;

/** Coalesce bursts of data-changed events (e.g. saving 3 scanned dishes) into one refetch. */
const EVENT_DEBOUNCE_MS = 300;

/** Days of history loaded for streaks. */
const HISTORY_DAYS = 60;

/** Event kinds that cannot change anything shown on the dashboard. */
const IGNORED_KINDS: ReadonlySet<DataKind> = new Set<DataKind>(['foods', 'profile']);

const EMPTY_FAILED: TodayPart[] = [];

/**
 * Loads everything the dashboard needs for today (all requests in parallel) and exposes
 * optimistic mutations. Refetches on window focus / tab visibility, on data-changed events
 * from other features, and when the local date rolls over. A failing part keeps the last
 * known values (or is rebuilt from the raw rows) and is reported in `failed` for a retry.
 */
export function useTodayData(onError: (err: unknown) => void) {
  const [state, setState] = useState<State>(() => ({
    date: todayISO(),
    data: null,
    loading: true,
    error: null,
    failed: EMPTY_FAILED,
  }));
  const token = useRef(0);
  const alive = useRef(true);
  const pending = useRef(0); // in-flight optimistic writes
  const lastSelfNotify = useRef(0);
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());
  const needsResync = useRef(false);
  const loadInFlight = useRef(false);
  /** Last load failed: further silent failures are not toasted again (no spam while offline). */
  const failing = useRef(false);
  /** History cache: only refetched on a new day, an explicit reload or another feature's write. */
  const historyFor = useRef<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  /** Latest state for callbacks that must not go stale between renders (rapid taps). */
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(async (silent = false, refreshHistory = false) => {
    const date = todayISO();
    const t = ++token.current;
    loadInFlight.current = true;
    if (!silent) setState((s) => ({ ...s, date, loading: true, error: null }));
    const wantHistory = refreshHistory || historyFor.current !== date;
    const [sum, meals, workouts, weight, hist] = await Promise.allSettled([
      getDaySummary(date),
      listMeals(date),
      listWorkouts(date, date),
      latestWeight(),
      wantHistory ? getRangeSummary(addDays(date, -HISTORY_DAYS), addDays(date, -1)) : Promise.resolve(null),
    ]);
    if (t !== token.current || !alive.current) return;

    // Summary RPC down but the rows loaded → rebuild it (only water/steps need one more call).
    let summary: DaySummary | null = sum.status === 'fulfilled' ? sum.value : null;
    if (!summary && meals.status === 'fulfilled' && workouts.status === 'fulfilled') {
      try {
        const daily = await getDailyLog(date);
        if (t !== token.current || !alive.current) return;
        summary = summaryFromParts(meals.value, workouts.value, daily);
      } catch {
        if (t !== token.current || !alive.current) return;
      }
    }
    loadInFlight.current = false;
    if (hist.status === 'fulfilled' && hist.value) historyFor.current = date;

    const failed: TodayPart[] = [];
    if (!summary) failed.push('summary');
    if (meals.status === 'rejected') failed.push('meals');
    if (workouts.status === 'rejected') failed.push('workouts');
    const firstErr = [sum, meals, workouts].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;

    setState((s) => {
      const prev = s.date === date ? s.data : null;
      if (!summary && !prev) {
        return { date, data: null, loading: false, error: firstErr?.reason ?? new Error('load failed'), failed };
      }
      let next = summary ?? prev!.summary;
      // Keep optimistic water/steps while writes are still in flight.
      if (pending.current > 0 && prev) next = { ...next, water_ml: prev.summary.water_ml, steps: prev.summary.steps };
      return {
        date,
        loading: false,
        error: null,
        failed: failed.length ? failed : EMPTY_FAILED,
        data: {
          summary: next,
          meals: meals.status === 'fulfilled' ? meals.value : (prev?.meals ?? []),
          workouts: workouts.status === 'fulfilled' ? workouts.value : (prev?.workouts ?? []),
          latestWeightKg:
            weight.status === 'fulfilled' ? (weight.value?.weight_kg ?? null) : (prev?.latestWeightKg ?? null),
          history: hist.status === 'fulfilled' && hist.value ? hist.value : (prev?.history ?? []),
        },
      };
    });
    if (firstErr && (silent || summary) && !failing.current) onErrorRef.current(firstErr.reason);
    failing.current = !!firstErr;
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      // Drop any response that lands after unmount.
      alive.current = false;
      token.current++;
    };
  }, [load]);

  // Clock: keeps hour-based insights fresh and reloads when the local date rolls over
  // while the app stays open (no focus event needed). `now` only changes when the hour
  // does, so the dashboard does not re-render every tick.
  const dateRef = useRef(state.date);
  dateRef.current = state.date;
  const tickClock = useCallback(() => {
    const d = new Date();
    setNow((prev) => (prev.getHours() === d.getHours() && prev.getDate() === d.getDate() ? prev : d));
  }, []);
  useEffect(() => {
    const id = window.setInterval(() => {
      tickClock();
      if (todayISO() !== dateRef.current && pending.current === 0) void load(true);
    }, CLOCK_MS);
    return () => window.clearInterval(id);
  }, [load, tickClock]);

  // Focus / visibility / other features' writes → silent refresh.
  useEffect(() => {
    let last = Date.now();
    let debounce = 0;
    const refresh = () => {
      tickClock();
      if (pending.current > 0) return;
      // Throttle focus storms (focus + visibilitychange fire together).
      if (Date.now() - last < 800) return;
      last = Date.now();
      void load(true);
    };
    const onVis = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    const off = onDataChanged((kind) => {
      if (IGNORED_KINDS.has(kind)) return;
      if (Date.now() - lastSelfNotify.current < SELF_ECHO_MS) return;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        if (pending.current > 0) {
          needsResync.current = true;
          return;
        }
        last = Date.now();
        // Edits elsewhere may touch past days too (diary of yesterday…) → streaks.
        void load(true, true);
      }, EVENT_DEBOUNCE_MS);
    });
    return () => {
      window.clearTimeout(debounce);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
      off();
    };
  }, [load, tickClock]);

  /**
   * A load that started before an optimistic write may still return the old values
   * after the write lands; drop it and resync once the write queue drains.
   */
  const invalidateInFlightLoad = useCallback(() => {
    if (!loadInFlight.current) return;
    token.current++;
    loadInFlight.current = false;
    needsResync.current = true;
  }, []);

  const patchSummary = useCallback((patch: Partial<DaySummary>) => {
    setState((s) => {
      if (!s.data) return s;
      const next = { ...s, data: { ...s.data, summary: { ...s.data.summary, ...patch } } };
      stateRef.current = next; // visible to a second tap before React re-renders
      return next;
    });
  }, []);

  /** Serialises writes so rapid taps land in order; refetches on failure. */
  const enqueue = useCallback(
    (job: () => Promise<unknown>, kind: 'daily' | 'workouts') => {
      pending.current++;
      const p: Promise<boolean> = writeChain.current
        .then(job)
        .then(
          () => {
            lastSelfNotify.current = Date.now();
            notifyDataChanged(kind);
            return true;
          },
          (err) => {
            if (alive.current) onErrorRef.current(err);
            needsResync.current = true;
            return false;
          },
        )
        .finally(() => {
          pending.current = Math.max(0, pending.current - 1);
          // Roll back optimistic values to the server truth once the queue drains.
          if (pending.current === 0 && needsResync.current && alive.current) {
            needsResync.current = false;
            void load(true);
          }
        });
      writeChain.current = p;
      return p;
    },
    [load],
  );

  /** Set water to an absolute amount (optimistic). */
  const setWater = useCallback(
    (ml: number) => {
      const date = stateRef.current.date;
      const v = Math.max(0, Math.min(20000, Math.round(Number(ml) || 0)));
      invalidateInFlightLoad();
      patchSummary({ water_ml: v });
      return enqueue(() => saveWater(date, v), 'daily');
    },
    [enqueue, invalidateInFlightLoad, patchSummary],
  );

  /**
   * Add (or remove) water relative to the latest optimistic value, so two quick taps
   * always add up. Resolves with the amount before the change (for undo).
   */
  const addWater = useCallback(
    (deltaMl: number) => {
      const before = stateRef.current.data?.summary.water_ml ?? 0;
      return { before, saved: setWater(before + deltaMl) };
    },
    [setWater],
  );

  const setSteps = useCallback(
    (steps: number) => {
      const date = stateRef.current.date;
      const v = Math.max(0, Math.min(200000, Math.round(Number(steps) || 0)));
      invalidateInFlightLoad();
      patchSummary({ steps: v });
      return enqueue(() => saveSteps(date, v), 'daily');
    },
    [enqueue, invalidateInFlightLoad, patchSummary],
  );

  /** Mark a planned workout as done (optimistic), then refresh burned kcal. */
  const completeWorkout = useCallback(
    (w: Workout) => {
      invalidateInFlightLoad();
      setState((s) =>
        s.data
          ? {
              ...s,
              data: {
                ...s.data,
                workouts: s.data.workouts.map((x) => (x.id === w.id ? { ...x, status: 'done' } : x)),
                summary: { ...s.data.summary, workout_kcal: s.data.summary.workout_kcal + (Number(w.kcal) || 0) },
              },
            }
          : s,
      );
      return enqueue(() => updateWorkout(w.id, { status: 'done' }), 'workouts').then((ok) => {
        if (ok && alive.current) void load(true);
        return ok;
      });
    },
    [enqueue, invalidateInFlightLoad, load],
  );

  const reload = useCallback(() => load(false, true), [load]);
  /** Retry after a partial failure without blanking what is already on screen. */
  const retry = useCallback(() => load(true, true), [load]);

  return useMemo(
    () => ({
      date: state.date,
      /** Current time; changes when the hour (or day) changes and on focus. */
      now,
      data: state.data,
      loading: state.loading && !state.data,
      error: state.error,
      failed: state.failed,
      reload,
      retry,
      setWater,
      addWater,
      setSteps,
      completeWorkout,
    }),
    [state, now, reload, retry, setWater, addWater, setSteps, completeWorkout],
  );
}
