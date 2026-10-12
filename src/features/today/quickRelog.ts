// "Ăn lại nhanh": which saved foods / meal templates to offer for the current meal.
// Pure (tested in quickRelog.test.ts). Data comes from services/foods + services/mealTemplates.
import { formatNumber } from '@/lib/format';
import { compareByUse, customFoodEntry, servingUnitOf } from '@/services/foods';
import type { CustomFood, MealEntry, MealTemplate, MealType } from '@/types/db';

export const QUICK_LIMIT = 8;
export const QUICK_MAX_TEMPLATES = 3;

const DAY_MS = 86_400_000;

export interface QuickFoodItem {
  kind: 'food';
  key: string;
  food: CustomFood;
  /** kcal of one default serving (what a tap logs). */
  kcal: number;
  /** "1 bát · 350 g" */
  portion: string;
  score: number;
  /** Usually eaten at this meal (default_meal matches). */
  usual: boolean;
}

export interface QuickTemplateItem {
  kind: 'template';
  key: string;
  template: MealTemplate;
  kcal: number;
  /** "3 món" */
  portion: string;
  score: number;
  usual: boolean;
}

export type QuickItem = QuickFoodItem | QuickTemplateItem;

const fin = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// NOTE: the saved-food formula below is deliberately identical to scan/saved.ts
// savedFoodScore (the Scan screen), so Today and Scan offer the same "best" dish for a
// meal. quickRelog.test.ts asserts the parity; change both together.

/** 0..3 bonus by the age of the last use (never used / invalid -> 0): stepped like Scan. */
export function recencyScore(iso: string | null | undefined, now: Date): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  const age = Math.max(0, now.getTime() - t);
  return age < DAY_MS ? 3 : age < 3 * DAY_MS ? 2 : age < 7 * DAY_MS ? 1.5 : age < 30 * DAY_MS ? 0.5 : 0;
}

/** 0..3: diminishing returns (eaten 30x is not 10x more relevant than 3x). */
export function frequencyScore(useCount: number | null | undefined): number {
  return Math.min(3, Math.log2(1 + Math.max(0, fin(useCount))));
}

/** Relevance of a saved food for `meal`: usual meal 4, then how often and how recently. */
export function foodScore(food: Pick<CustomFood, 'default_meal' | 'use_count' | 'last_used_at'>, meal: MealType, now: Date): number {
  return (food.default_meal === meal ? 4 : 0) + frequencyScore(food.use_count) + recencyScore(food.last_used_at, now);
}

/** Relevance of a template for `meal`; null = not offered (made for another meal). */
export function templateScore(t: Pick<MealTemplate, 'meal' | 'use_count' | 'last_used_at'>, meal: MealType, now: Date): number | null {
  if (t.meal && t.meal !== meal) return null;
  // Slightly ahead of a food with the same usual meal: a whole meal in one tap.
  return (t.meal === meal ? 4.5 : 0) + frequencyScore(t.use_count) + recencyScore(t.last_used_at, now);
}

/** "1 bát · 350 g" (grams omitted for a pseudo 100 g "phần" that has no real weight info). */
export function foodPortionLabel(food: Pick<CustomFood, 'serving_label' | 'serving_grams'>): string {
  const unit = servingUnitOf(food.serving_label);
  const g = fin(food.serving_grams);
  const grams = g > 0 ? ` · ${formatNumber(g, 0)} g` : '';
  // "2 lát" is already a full serving label; only bare units get the "1 " prefix.
  return `${/^\d/.test(unit) ? unit : `1 ${unit}`}${grams}`;
}

export interface RankInput {
  foods: CustomFood[];
  templates: MealTemplate[];
  meal: MealType;
  date: string;
  now: Date;
  limit?: number;
  maxTemplates?: number;
}

/**
 * Saved foods + templates for the strip, most relevant first: what is usually eaten at
 * this meal, then how often and how recently. Templates made for another meal are left
 * out (logging "Sáng quen thuộc" at dinner is never what the user wants), at most
 * `maxTemplates` of them. Ties keep the services' recent-first order.
 */
export function rankQuickItems({ foods, templates, meal, date, now, limit = QUICK_LIMIT, maxTemplates = QUICK_MAX_TEMPLATES }: RankInput): QuickItem[] {
  const items: QuickItem[] = [];
  for (const food of foods) {
    if (!food?.id || !String(food.name ?? '').trim()) continue;
    items.push({
      kind: 'food',
      key: `food:${food.id}`,
      food,
      kcal: Math.round(customFoodEntry(food, date, meal, 1).kcal ?? 0),
      portion: foodPortionLabel(food),
      score: foodScore(food, meal, now),
      usual: food.default_meal === meal,
    });
  }
  for (const template of templates) {
    if (!template?.id || !Array.isArray(template.items) || !template.items.length) continue;
    const score = templateScore(template, meal, now);
    if (score === null) continue;
    const kcal = template.items.reduce((a, it) => a + Math.max(0, fin(it?.kcal)), 0);
    items.push({
      kind: 'template',
      key: `template:${template.id}`,
      template,
      kcal: Math.round(kcal),
      portion: `${template.items.length} món`,
      score,
      usual: template.meal === meal,
    });
  }
  const named = (x: QuickItem) => (x.kind === 'food' ? x.food : x.template);
  items.sort((a, b) => b.score - a.score || compareByUse(named(a), named(b)));
  const out: QuickItem[] = [];
  let tpl = 0;
  for (const it of items) {
    if (out.length >= Math.max(0, limit)) break;
    if (it.kind === 'template') {
      if (tpl >= maxTemplates) continue;
      tpl++;
    }
    out.push(it);
  }
  return out;
}

/** Saved-food ids already logged today at `meal` (shown as "đã ghi" on the tile). */
export function loggedFoodIds(meals: Pick<MealEntry, 'meal' | 'custom_food_id'>[], meal: MealType): Set<string> {
  const s = new Set<string>();
  for (const m of meals) if (m.meal === meal && m.custom_food_id) s.add(m.custom_food_id);
  return s;
}

/** Toast line after a one-tap log: "Đã thêm Phở bò (450 kcal) vào bữa trưa". */
export function loggedMessage(name: string, kcal: number, mealLabel: string): string {
  return `Đã thêm ${name} (${formatNumber(kcal)} kcal) vào ${mealLabel.toLowerCase()}`;
}

/**
 * Keeps the tiles where they were while the screen stays open: items still present keep
 * their previous position (a tap must not make the row jump under the finger), new ones
 * are appended in rank order, removed ones disappear. `prevKeys` empty → plain rank order.
 */
export function stableOrder<T extends { key: string }>(ranked: T[], prevKeys: readonly string[]): T[] {
  if (!prevKeys.length) return ranked;
  const byKey = new Map(ranked.map((x) => [x.key, x]));
  const out: T[] = [];
  for (const k of prevKeys) {
    const x = byKey.get(k);
    if (x) {
      out.push(x);
      byKey.delete(k);
    }
  }
  for (const x of ranked) if (byKey.has(x.key)) out.push(x);
  return out;
}
