import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { stepsKcal } from '@/lib/energy';
import { todayISO } from '@/lib/date';
import { useMediaQuery } from '@/lib/hooks';
import { onDataChanged } from '@/lib/events';
import { latestWeight } from '@/services/body';
import { getDaySummary } from '@/services/summary';
import type { DaySummary } from '@/types/db';

export interface TodayGlance {
  /** null until the first load (render "—"). */
  kcalIn: number | null;
  /** Same "Tiêu hao" as the Today screen: workouts done + walking (steps). */
  burned: number | null;
  waterMl: number | null;
}

/**
 * Today's three headline numbers for the laptop sidebar. Only fetches while `query` matches
 * (the sidebar is visible), refreshes on data changes and when the window regains focus.
 */
export function useTodayGlance(query = '(min-width: 1024px)'): TodayGlance {
  const { session } = useAuth();
  const { fit } = useProfile();
  const uid = session?.user.id ?? null;
  const [sum, setSum] = useState<DaySummary | null>(null);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const visible = useMediaQuery(query);

  useEffect(() => {
    if (!uid) {
      setSum(null);
      setWeightKg(null);
      return;
    }
    if (!visible) return;
    let alive = true;
    const load = () => {
      getDaySummary(todayISO())
        .then((s) => alive && setSum(s))
        .catch(() => {});
      latestWeight()
        .then((m) => alive && setWeightKg(m?.weight_kg ?? null))
        .catch(() => {});
    };
    void load();
    // Saved foods / profile edits don't change today's numbers.
    const off = onDataChanged((kind) => kind !== 'foods' && kind !== 'profile' && void load());
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      off();
      window.removeEventListener('focus', onFocus);
    };
  }, [uid, visible]);

  const weight = Number(weightKg ?? fit?.start_weight_kg) || 0;
  if (!sum) return { kcalIn: null, burned: null, waterMl: null };
  return { kcalIn: sum.kcal_in, burned: Math.round(sum.workout_kcal) + stepsKcal(sum.steps, weight), waterMl: sum.water_ml };
}
