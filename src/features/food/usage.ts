// "Hoàn tác" for usage stats: a re-log that is undone must not leave the saved foods / meal
// template with an extra use (it would inflate "đã ăn N lần", the profile figures and the
// "dùng nhiều xếp trước" order). Everything here is BEST-EFFORT and never throws: the
// entries themselves are already deleted by the caller.
import { db } from '@/lib/supabase';
import { unmarkCustomFoodUsed, type CustomFoodUsage } from '@/services/foods';
import type { CustomFood, MealTemplate } from '@/types/db';

/**
 * The "before" rows for unmarkCustomFoodUsed: one per distinct id that is found in `foods`
 * (the list as it was BEFORE the bump). Unknown ids are skipped — guessing a snapshot would
 * wipe the food's real last_used_at.
 */
export function usageSnapshots(ids: ReadonlyArray<string | null | undefined>, foods: ReadonlyArray<CustomFood> | null | undefined): CustomFoodUsage[] {
  if (!foods?.length) return [];
  const byId = new Map(foods.map((f) => [f.id, f]));
  const out: CustomFoodUsage[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const f = byId.get(id);
    if (f) out.push({ id: f.id, last_used_at: f.last_used_at ?? null, default_meal: f.default_meal ?? null });
  }
  return out;
}

/**
 * Undo of ONE fit_mark_meal_template_used bump: use_count −1, last_used_at back to the
 * snapshot (RPC fit_unmark_meal_template_used). Returns the updated row, or null.
 * TODO(services): belongs next to logMealTemplate in services/mealTemplates.ts.
 */
export async function unmarkMealTemplateUsed(before: Pick<MealTemplate, 'id' | 'last_used_at'>): Promise<MealTemplate | null> {
  if (!before?.id) return null;
  try {
    const { data, error } = await db().rpc('fit_unmark_meal_template_used', {
      p_id: before.id,
      p_prev_last_used_at: before.last_used_at ?? null,
    });
    if (error) return null;
    const rows = (data as MealTemplate[] | null) ?? [];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Gives back the usage of the saved foods (snapshots) and / or the template of an undone log. */
export async function undoUsage(opts: { foods?: CustomFoodUsage[]; template?: Pick<MealTemplate, 'id' | 'last_used_at'> | null }): Promise<boolean> {
  const [foods, template] = await Promise.all([
    opts.foods?.length ? unmarkCustomFoodUsed(opts.foods) : Promise.resolve([]),
    opts.template ? unmarkMealTemplateUsed(opts.template) : Promise.resolve(null),
  ]);
  return foods.length > 0 || !!template;
}
