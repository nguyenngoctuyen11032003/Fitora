import { useCallback, useEffect, useRef, useState } from 'react';
import { onDataChanged } from '@/lib/events';
import { listCustomFoods } from '@/services/foods';
import { listMealTemplates } from '@/services/mealTemplates';
import type { CustomFood, MealTemplate } from '@/types/db';

export interface QuickRelogData {
  foods: CustomFood[];
  templates: MealTemplate[];
  /** First load still running. */
  loading: boolean;
  /** Both lists failed on the last load (the strip hides itself; it is a shortcut, not data). */
  failed: boolean;
  reload: () => Promise<void>;
}

/** Saved foods + meal templates for "Ăn lại nhanh"; refetched when foods / meals change elsewhere. */
export function useQuickRelog(): QuickRelogData {
  const [foods, setFoods] = useState<CustomFood[]>([]);
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const token = useRef(0);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    const t = ++token.current;
    const [f, m] = await Promise.allSettled([listCustomFoods(), listMealTemplates()]);
    if (!alive.current || t !== token.current) return;
    if (f.status === 'fulfilled') setFoods(f.value);
    if (m.status === 'fulfilled') setTemplates(m.value);
    setFailed(f.status === 'rejected' && m.status === 'rejected');
    setLoading(false);
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    let debounce = 0;
    const off = onDataChanged((kind) => {
      if (kind !== 'foods' && kind !== 'meals' && kind !== 'any') return;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void reload(), 400);
    });
    return () => {
      alive.current = false;
      token.current++;
      window.clearTimeout(debounce);
      off();
    };
  }, [reload]);

  return { foods, templates, loading, failed, reload };
}
