import { useCallback, useEffect, useRef, useState } from 'react';
import { todayISO } from '@/lib/date';
import { notifyDataChanged, onDataChanged } from '@/lib/events';
import { latestWeight } from '@/services/body';
import { setSteps as saveSteps, setWater as saveWater } from '@/services/daily';
import { listMeals } from '@/services/meals';
import { getDaySummary } from '@/services/summary';
import { listWorkouts, updateWorkout } from '@/services/workouts';
import type { DaySummary, MealEntry, Workout } from '@/types/db';

export interface TodayData {
  summary: DaySummary;
  meals: MealEntry[];
  workouts: Workout[];
  latestWeightKg: number | null;
}

interface State {
  date: string;
  data: TodayData | null;
  loading: boolean;
  error: unknown;
}

/** Ignore our own data-changed broadcasts for this long. */
const SELF_ECHO_MS = 1500;

/**
 * Loads everything the dashboard needs for today and exposes optimistic mutations.
 * Refetches on window focus / tab visibility, on data-changed events from other
 * features, and when the local date rolls over.
 */
export function useTodayData(onError: (err: unknown) => void) {
  const [state, setState] = useState<State>(() => ({ date: todayISO(), data: null, loading: true, error: null }));
  const token = useRef(0);
  const pending = useRef(0); // in-flight optimistic writes
  const lastSelfNotify = useRef(0);
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());
  const needsResync = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(async (silent = false) => {
    const date = todayISO();
    const t = ++token.current;
    if (!silent) setState((s) => ({ ...s, date, loading: true, error: null }));
    const [sum, meals, workouts, weight] = await Promise.allSettled([
      getDaySummary(date),
      listMeals(date),
      listWorkouts(date, date),
      latestWeight(),
    ]);
    if (t !== token.current) return;
    const firstErr = [sum, meals, workouts].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    setState((s) => {
      const prev = s.date === date ? s.data : null;
      if (sum.status === 'rejected' && !prev) {
        return { date, data: null, loading: false, error: sum.reason };
      }
      let summary = sum.status === 'fulfilled' ? sum.value : prev!.summary;
      // Keep optimistic water/steps while writes are still in flight.
      if (pending.current > 0 && prev) summary = { ...summary, water_ml: prev.summary.water_ml, steps: prev.summary.steps };
      return {
        date,
        loading: false,
        error: null,
        data: {
          summary,
          meals: meals.status === 'fulfilled' ? meals.value : (prev?.meals ?? []),
          workouts: workouts.status === 'fulfilled' ? workouts.value : (prev?.workouts ?? []),
          latestWeightKg:
            weight.status === 'fulfilled' ? (weight.value?.weight_kg ?? null) : (prev?.latestWeightKg ?? null),
        },
      };
    });
    if (firstErr && (silent || sum.status === 'fulfilled')) onErrorRef.current(firstErr.reason);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Focus / visibility / other features' writes → silent refresh.
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (pending.current > 0) return;
      // Throttle focus storms (focus + visibilitychange fire together).
      if (Date.now() - last < 800) return;
      last = Date.now();
      void load(true);
    };
    const onVis = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    const off = onDataChanged(() => {
      if (Date.now() - lastSelfNotify.current < SELF_ECHO_MS) return;
      if (pending.current > 0) return;
      void load(true);
    });
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
      off();
    };
  }, [load]);

  const patchSummary = (patch: Partial<DaySummary>) =>
    setState((s) => (s.data ? { ...s, data: { ...s.data, summary: { ...s.data.summary, ...patch } } } : s));

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
            onErrorRef.current(err);
            needsResync.current = true;
            return false;
          },
        )
        .finally(() => {
          pending.current = Math.max(0, pending.current - 1);
          // Roll back optimistic values to the server truth once the queue drains.
          if (pending.current === 0 && needsResync.current) {
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
      const date = state.date;
      const v = Math.max(0, Math.min(20000, Math.round(ml)));
      patchSummary({ water_ml: v });
      return enqueue(() => saveWater(date, v), 'daily');
    },
    [state.date, enqueue],
  );

  const setSteps = useCallback(
    (steps: number) => {
      const date = state.date;
      const v = Math.max(0, Math.min(200000, Math.round(steps)));
      patchSummary({ steps: v });
      return enqueue(() => saveSteps(date, v), 'daily');
    },
    [state.date, enqueue],
  );

  /** Mark a planned workout as done (optimistic), then refresh burned kcal. */
  const completeWorkout = useCallback(
    (w: Workout) => {
      setState((s) =>
        s.data
          ? {
              ...s,
              data: {
                ...s.data,
                workouts: s.data.workouts.map((x) => (x.id === w.id ? { ...x, status: 'done' } : x)),
                summary: { ...s.data.summary, workout_kcal: s.data.summary.workout_kcal + (w.kcal || 0) },
              },
            }
          : s,
      );
      return enqueue(() => updateWorkout(w.id, { status: 'done' }), 'workouts').then((ok) => {
        if (ok) void load(true);
        return ok;
      });
    },
    [enqueue, load],
  );

  return {
    date: state.date,
    data: state.data,
    loading: state.loading && !state.data,
    error: state.error,
    reload: () => load(false),
    setWater,
    setSteps,
    completeWorkout,
  };
}
