import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onDataChanged } from '@/lib/events';
import { getMyPlan } from '@/services/plan';
import type { MyPlan } from '@/types/db';
import { useAuth } from './AuthContext';

export interface PlanState {
  /** null until the first load (or when the plan RPC is not deployed yet → treated as a free user). */
  plan: MyPlan | null;
  loading: boolean;
  isPro: boolean;
  isAdmin: boolean;
  /** Scans left today (never negative). */
  remaining: number;
  refresh: () => Promise<void>;
}

const Ctx = createContext<PlanState | null>(null);

/** "Pro" = any paid plan, i.e. anything above the built-in free plan. */
export const isPaidPlan = (p: MyPlan | null) => !!p && p.plan !== 'free';

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [plan, setPlan] = useState<MyPlan | null>(null);
  const [loading, setLoading] = useState(Boolean(uid));

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      setPlan(await getMyPlan());
    } catch {
      /* migration not applied / offline: behave as a free user, never block the app */
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    setPlan(null);
    setLoading(Boolean(uid));
    void load();
  }, [uid, load]);

  useEffect(() => onDataChanged((k) => k === 'plan' && void load()), [load]);

  const value = useMemo<PlanState>(
    () => ({
      plan,
      loading,
      isPro: isPaidPlan(plan),
      isAdmin: !!plan?.is_admin,
      remaining: plan ? Math.max(0, plan.daily_limit - plan.used) : 0,
      refresh: load,
    }),
    [plan, loading, load],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlan(): PlanState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlan must be used inside <PlanProvider>');
  return ctx;
}
