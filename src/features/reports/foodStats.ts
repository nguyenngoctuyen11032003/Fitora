// "What did I eat this period?" — pure aggregation of the period's meal entries (unit-tested in
// foodStats.test.ts). Groups the same dish across spellings ("Phở bò" / "pho bo") and across
// saved-food links, and tells which frequent dishes are not yet in "Món của tôi" so the report can
// offer a one-tap save (next time: pick it, no scan / typing).

import { normalizeFoodName } from '@/services/foods';
import type { CustomFood, MealEntry } from '@/types/db';

export interface FoodStat {
  /** Normalised dish key (diacritics-free). */
  key: string;
  /** Display name: the saved food's name when linked, else the most recent entry's name. */
  name: string;
  /** Number of entries in the period. */
  count: number;
  /** Distinct days it was eaten. */
  days: number;
  kcal: number;
  protein_g: number;
  /** Saved food it matches (by link or by name), if any. */
  savedFood: CustomFood | null;
  /** Most recent entry of the dish (used for "Lưu món"). */
  latest: MealEntry;
}

export interface FoodReport {
  /** Entries considered (in range, not in the future). */
  entryCount: number;
  /** Distinct dishes. */
  dishCount: number;
  /** Most-logged dishes (≥ 2 times), by count then kcal. */
  frequent: FoodStat[];
  /** Biggest protein contributors and their share of the period's protein. */
  proteinTop: { stat: FoodStat; share: number }[];
  totalProtein: number;
  /** Frequent dishes not saved yet → "Lưu món" suggestions. */
  saveSuggestions: FoodStat[];
  /** Entries of the period that came from a saved food (re-logged without scanning/typing). */
  reusedEntries: number;
}

/** A dish needs this many entries in the period to count as "frequent". */
export const FREQUENT_MIN = 2;
/** Minimum entries in the period before the food card is shown at all. */
export const MIN_ENTRIES_FOR_FOODS = 3;
/** A protein source must provide at least this many grams in the period to be listed. */
export const MIN_PROTEIN_SOURCE_G = 5;

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const newer = (a: MealEntry, b: MealEntry) => (a.eaten_on !== b.eaten_on ? a.eaten_on > b.eaten_on : a.created_at > b.created_at);

export function buildFoodReport(
  entries: MealEntry[],
  savedFoods: CustomFood[],
  opts: { from: string; to: string; today: string; max?: number },
): FoodReport {
  const { from, to, today, max = 5 } = opts;
  const byId = new Map(savedFoods.map((f) => [f.id, f]));
  const byKey = new Map<string, CustomFood>();
  for (const f of savedFoods) {
    const k = normalizeFoodName(f.name);
    if (k && !byKey.has(k)) byKey.set(k, f); // list is most-used first
  }

  const groups = new Map<string, { stat: FoodStat; days: Set<string> }>();
  let entryCount = 0;
  let reusedEntries = 0;
  for (const e of entries) {
    const day = String(e.eaten_on).slice(0, 10);
    if (day < from || day > to || day > today) continue;
    const linked = e.custom_food_id ? byId.get(e.custom_food_id) ?? null : null;
    const key = normalizeFoodName(linked?.name ?? e.name);
    if (!key) continue;
    entryCount++;
    // Picked from "Món của tôi" (source 'custom'); a scan or an entry saved afterwards is not a re-log.
    if (linked && e.source === 'custom') reusedEntries++;
    let g = groups.get(key);
    if (!g) {
      g = {
        stat: { key, name: e.name, count: 0, days: 0, kcal: 0, protein_g: 0, savedFood: linked ?? byKey.get(key) ?? null, latest: e },
        days: new Set(),
      };
      groups.set(key, g);
    }
    const s = g.stat;
    s.count++;
    s.kcal += num(e.kcal);
    s.protein_g += num(e.protein_g);
    g.days.add(day);
    if (!s.savedFood && linked) s.savedFood = linked;
    if (newer(e, s.latest)) s.latest = e;
  }

  const stats = [...groups.values()].map(({ stat, days }) => ({
    ...stat,
    name: stat.savedFood?.name ?? stat.latest.name,
    days: days.size,
    kcal: Math.round(stat.kcal),
    protein_g: r1(stat.protein_g),
  }));

  const frequent = stats
    .filter((s) => s.count >= FREQUENT_MIN)
    .sort((a, b) => b.count - a.count || b.days - a.days || b.kcal - a.kcal || a.name.localeCompare(b.name, 'vi'))
    .slice(0, max);

  const totalProtein = r1(stats.reduce((a, s) => a + s.protein_g, 0));
  const proteinTop =
    totalProtein > 0
      ? stats
          .filter((s) => s.protein_g >= MIN_PROTEIN_SOURCE_G)
          .sort((a, b) => b.protein_g - a.protein_g || a.name.localeCompare(b.name, 'vi'))
          .slice(0, 3)
          .map((stat) => ({ stat, share: Math.round((stat.protein_g / totalProtein) * 100) }))
      : [];

  return {
    entryCount,
    dishCount: stats.length,
    frequent,
    proteinTop,
    totalProtein,
    saveSuggestions: frequent.filter((s) => !s.savedFood),
    reusedEntries,
  };
}
