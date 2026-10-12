// One-tap logging with undo (saved foods, suggestions, meal templates) + the meal
// template list shared by the diary and the search page.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/ui';
import { notifyDataChanged, onDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { compareByUse, listCustomFoods, markCustomFoodUsed, type CustomFoodUsage } from '@/services/foods';
import { createMealTemplate, deleteMealTemplate, listMealTemplates, logMealTemplate, updateMealTemplate } from '@/services/mealTemplates';
import { addMealEntries, deleteMeal, listMeals } from '@/services/meals';
import { MEAL_LABELS, type CustomFood, type MealEntry, type MealTemplate, type MealTemplateItem, type MealType } from '@/types/db';
import { bumpUsage, normalizeVi, templateDuplicates, toNewEntry, type FoodOption } from './lib';
import { formatQty } from './components/parts';
import { deferredDelete } from './undo';
import { undoUsage, usageSnapshots } from './usage';

/** What a log bumped, to give back on "Hoàn tác" (resolved once the best-effort bump is done). */
export interface UsageUndo {
  foods?: CustomFoodUsage[];
  template?: Pick<MealTemplate, 'id' | 'last_used_at'> | null;
}

export interface LogCallbacks {
  /** Rows just inserted (optimistic lists). */
  onAdded?: (rows: MealEntry[]) => void;
  /** Rows removed again by "Hoàn tác". */
  onRemoved?: (ids: string[]) => void;
  /** Saved food whose usage was bumped (local re-sort). */
  onFoodUsed?: (food: CustomFood) => void;
}

const kcalOf = (rows: MealEntry[]) => Math.round(rows.reduce((a, r) => a + (Number(r.kcal) || 0), 0));

/**
 * "Hoàn tác" for logged rows: delete them all, tell the page, refresh other screens. When
 * every row is gone the usage bumps of that log are given back too (`usage`), so an undone
 * re-log does not count as "đã ăn" nor reorder "Món của tôi" / "Bữa mẫu".
 */
function useUndoRows() {
  const toast = useToast();
  return useCallback(
    (rows: MealEntry[], cb: LogCallbacks, usage?: Promise<UsageUndo | null>, onUsageUndone?: () => void) => async () => {
      const res = await Promise.allSettled(rows.map((r) => deleteMeal(r.id)));
      const removed = rows.filter((_, i) => res[i].status === 'fulfilled').map((r) => r.id);
      if (removed.length) cb.onRemoved?.(removed);
      notifyDataChanged('meals');
      if (usage && removed.length === rows.length) {
        void usage
          .then((u) => (u ? undoUsage(u) : false))
          .then((changed) => {
            if (!changed) return;
            onUsageUndone?.();
            notifyDataChanged('foods');
          })
          .catch(() => undefined);
      }
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
        let usage: Promise<UsageUndo | null> | undefined;
        if (opt.origin === 'custom' && opt.customFoodId) {
          const before: CustomFoodUsage = { id: opt.customFoodId, last_used_at: opt.lastUsedAt ?? null, default_meal: opt.defaultMeal ?? null };
          // Best effort, never throws: usage stats + remember the meal it is eaten at.
          usage = markCustomFoodUsed(opt.customFoodId, meal).then(([f]) => {
            if (!f) return null;
            cb.onFoodUsed?.(f);
            notifyDataChanged('foods');
            return { foods: [before] };
          });
        }
        toast.success(
          `Đã thêm ${opt.name} (${formatQty(row.quantity, row.unit)} · ${formatNumber(row.kcal)} kcal) vào ${MEAL_LABELS[meal].toLowerCase()}.`,
          { duration: 6000, action: { label: 'Hoàn tác', onClick: () => void undoRows([row], cb, usage)() } },
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

/** 'all' = log every dish again, 'missing' = only the dishes not yet in the meal. */
export type TemplateDupChoice = 'all' | 'missing' | 'cancel';
export interface TemplateDupPrompt {
  template: MealTemplate;
  meal: MealType;
  /** Template dishes already logged in that meal. */
  names: string[];
  total: number;
  /** Dishes of the template not logged yet. */
  missing: number;
  resolve: (choice: TemplateDupChoice) => void;
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

  // "Bữa trưa đã có Cơm gà — ghi thêm?" — answered in <TemplateDupDialog>.
  const [dupPrompt, setDupPrompt] = useState<TemplateDupPrompt | null>(null);
  const askDup = useCallback(
    (p: Omit<TemplateDupPrompt, 'resolve'>) =>
      new Promise<TemplateDupChoice>((resolve) =>
        setDupPrompt({
          ...p,
          resolve: (c) => {
            setDupPrompt(null);
            resolve(c);
          },
        }),
      ),
    [],
  );

  const log = useCallback(
    async (t: MealTemplate, date: string, meal: MealType, cb: LogCallbacks = {}): Promise<MealEntry[] | null> => {
      let template = t;
      let skipped = 0;
      // Dishes of the template already in that meal → ask instead of silently doubling them.
      // Best effort: if the check itself fails, log as before (undo is still offered).
      // Linked saved foods as they are now: what "Hoàn tác" gives their usage back to.
      const linked = t.items.map((i) => i.custom_food_id).filter((x): x is string => !!x);
      const [existing, foodsBefore] = await Promise.all([
        listMeals(date).catch(() => null),
        linked.length ? listCustomFoods().catch(() => null) : Promise.resolve(null),
      ]);
      const dups = existing ? templateDuplicates(t.items, existing, meal) : [];
      if (dups.length) {
        const dupKeys = new Set(dups.map(normalizeVi));
        const items = t.items.filter((i) => !dupKeys.has(normalizeVi(i.name)));
        const choice = await askDup({ template: t, meal, names: dups, total: t.items.length, missing: items.length });
        if (choice === 'cancel') return null;
        if (choice === 'missing') {
          skipped = t.items.length - items.length;
          template = { ...t, items };
        }
      }
      try {
        const rows = await logMealTemplate(template, date, meal);
        cb.onAdded?.(rows);
        replace(bumpUsage(t));
        // logMealTemplate awaited its (best-effort) bumps: the template and the linked foods logged.
        const usage = Promise.resolve<UsageUndo>({
          template: { id: t.id, last_used_at: t.last_used_at },
          foods: usageSnapshots(template.items.map((i) => i.custom_food_id), foodsBefore),
        });
        notifyDataChanged('meals');
        const skippedNote = skipped ? `, bỏ qua ${skipped} món đã có` : '';
        toast.success(`Đã ghi “${t.name}” (${rows.length} món · ${formatNumber(kcalOf(rows))} kcal${skippedNote}) vào ${MEAL_LABELS[meal].toLowerCase()}.`, {
          duration: 6000,
          action: { label: 'Hoàn tác', onClick: () => void undoRows(rows, cb, usage, () => replace(t))() },
        });
        return rows;
      } catch (e) {
        toast.error(e);
        return null;
      }
    },
    [askDup, replace, toast, undoRows],
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

  return { templates, loading: q.loading && !q.data, error: q.error, log, create, rename, remove, reload, dupPrompt };
}
