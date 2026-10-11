// One-tap logging with undo (saved foods, suggestions, meal templates) + the meal
// template list shared by the diary and the search page.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui';
import { notifyDataChanged, onDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { compareByUse, markCustomFoodUsed } from '@/services/foods';
import { createMealTemplate, deleteMealTemplate, listMealTemplates, logMealTemplate, updateMealTemplate } from '@/services/mealTemplates';
import { addMealEntries, deleteMeal } from '@/services/meals';
import { MEAL_LABELS, type CustomFood, type MealEntry, type MealTemplate, type MealTemplateItem, type MealType } from '@/types/db';
import { bumpUsage, toNewEntry, type FoodOption } from './lib';
import { formatQty } from './components/parts';
import { deferredDelete } from './undo';

export interface LogCallbacks {
  /** Rows just inserted (optimistic lists). */
  onAdded?: (rows: MealEntry[]) => void;
  /** Rows removed again by "Hoàn tác". */
  onRemoved?: (ids: string[]) => void;
  /** Saved food whose usage was bumped (local re-sort). */
  onFoodUsed?: (food: CustomFood) => void;
}

const kcalOf = (rows: MealEntry[]) => Math.round(rows.reduce((a, r) => a + (Number(r.kcal) || 0), 0));

/** "Hoàn tác" for logged rows: delete them all, tell the page, refresh other screens. */
function useUndoRows() {
  const toast = useToast();
  return useCallback(
    (rows: MealEntry[], cb: LogCallbacks) => async () => {
      const res = await Promise.allSettled(rows.map((r) => deleteMeal(r.id)));
      const removed = rows.filter((_, i) => res[i].status === 'fulfilled').map((r) => r.id);
      if (removed.length) cb.onRemoved?.(removed);
      notifyDataChanged('meals');
      const err = res.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (err) toast.error(err.reason);
    },
    [toast],
  );
}

/** Logs `qty × unit` of an option right away (no sheet), with an undo toast. */
export function useQuickLog() {
  const toast = useToast();
  const undoRows = useUndoRows();
  return useCallback(
    async (opt: FoodOption, portion: { quantity: number; unit: string }, date: string, meal: MealType, cb: LogCallbacks = {}): Promise<MealEntry | null> => {
      try {
        const [row] = await addMealEntries([toNewEntry(opt, portion.quantity, portion.unit, meal, date)]);
        cb.onAdded?.([row]);
        notifyDataChanged('meals');
        if (opt.origin === 'custom' && opt.customFoodId) {
          // Best effort, never throws: usage stats + remember the meal it is eaten at.
          void markCustomFoodUsed(opt.customFoodId, meal).then(([f]) => {
            if (f) {
              cb.onFoodUsed?.(f);
              notifyDataChanged('foods');
            }
          });
        }
        toast.success(
          `Đã thêm ${opt.name} (${formatQty(row.quantity, row.unit)} · ${formatNumber(row.kcal)} kcal) vào ${MEAL_LABELS[meal].toLowerCase()}.`,
          { duration: 6000, action: { label: 'Hoàn tác', onClick: () => void undoRows([row], cb)() } },
        );
        return row;
      } catch (e) {
        toast.error(e);
        return null;
      }
    },
    [toast, undoRows],
  );
}

/** Meal templates ("Bữa mẫu"): list + log / create / rename / delete (with undo). */
export function useMealTemplates() {
  const toast = useToast();
  const undoRows = useUndoRows();
  const q = useAsync(() => listMealTemplates(), []);
  const { reload, setData } = q;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => onDataChanged((k) => (k === 'foods' || k === 'any') && void reload()), [reload]);

  const templates = useMemo(() => (q.data ?? []).filter((t) => !hidden.has(t.id)), [q.data, hidden]);
  const replace = useCallback(
    (t: MealTemplate) => setData((list) => [...(list ?? []).filter((x) => x.id !== t.id), t].sort(compareByUse)),
    [setData],
  );

  const log = useCallback(
    async (t: MealTemplate, date: string, meal: MealType, cb: LogCallbacks = {}): Promise<MealEntry[] | null> => {
      try {
        const rows = await logMealTemplate(t, date, meal);
        cb.onAdded?.(rows);
        replace(bumpUsage(t));
        notifyDataChanged('meals');
        toast.success(`Đã ghi “${t.name}” (${rows.length} món · ${formatNumber(kcalOf(rows))} kcal) vào ${MEAL_LABELS[meal].toLowerCase()}.`, {
          duration: 6000,
          action: { label: 'Hoàn tác', onClick: () => void undoRows(rows, cb)() },
        });
        return rows;
      } catch (e) {
        toast.error(e);
        return null;
      }
    },
    [replace, toast, undoRows],
  );

  const create = useCallback(
    async (name: string, meal: MealType | null, items: MealTemplateItem[]): Promise<MealTemplate | null> => {
      try {
        const t = await createMealTemplate(name, meal, items);
        replace(t);
        notifyDataChanged('foods');
        toast.success(`Đã lưu bữa mẫu “${t.name}”. Lần sau ghi cả bữa bằng một chạm.`);
        return t;
      } catch (e) {
        toast.error(e);
        return null;
      }
    },
    [replace, toast],
  );

  const rename = useCallback(
    async (t: MealTemplate, patch: { name?: string; meal?: MealType | null }): Promise<boolean> => {
      try {
        replace(await updateMealTemplate(t.id, patch));
        notifyDataChanged('foods');
        toast.success('Đã cập nhật bữa mẫu.');
        return true;
      } catch (e) {
        toast.error(e);
        return false;
      }
    },
    [replace, toast],
  );

  const remove = useCallback(
    (t: MealTemplate) => {
      setHidden((s) => new Set(s).add(t.id));
      const unhide = () =>
        setHidden((s) => {
          const n = new Set(s);
          n.delete(t.id);
          return n;
        });
      deferredDelete({
        toast,
        message: `Đã xóa bữa mẫu “${t.name}”.`,
        commit: () => deleteMealTemplate(t.id),
        restore: unhide,
        done: () => {
          setData((list) => list?.filter((x) => x.id !== t.id));
          notifyDataChanged('foods');
          unhide();
        },
      });
    },
    [setData, toast],
  );

  return { templates, loading: q.loading && !q.data, error: q.error, log, create, rename, remove, reload };
}
