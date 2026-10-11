// Pure helpers for the Profile page (no React, no Supabase) — unit tested in lib.test.ts.
import type { CustomFood, MealTemplate } from '@/types/db';

export interface MemorySummary {
  foodCount: number;
  /** Saved foods that came from an AI scan (re-logged without scanning again). */
  aiCount: number;
  /** Total one-tap re-logs of saved foods + templates (sum of use_count). */
  reuses: number;
  /** Up to `top` saved-food names, most recently / frequently used first (input order kept). */
  topFoods: string[];
  templateCount: number;
  topTemplates: string[];
}

const uses = (n: unknown) => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
};

/**
 * "Dữ liệu đã ghi nhớ" summary. Inputs are expected in the services' compareByUse order
 * (listCustomFoods / listMealTemplates), so the first names are the ones the user reaches for.
 * Never-used items are only listed after used ones (they already sort last).
 */
export function memorySummary(
  foods: ReadonlyArray<Pick<CustomFood, 'name' | 'source' | 'use_count'>> | null | undefined,
  templates: ReadonlyArray<Pick<MealTemplate, 'name' | 'use_count'>> | null | undefined,
  top = 3,
): MemorySummary {
  const f = foods ?? [];
  const t = templates ?? [];
  const names = (rows: ReadonlyArray<{ name: string }>) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      const n = (r.name ?? '').trim();
      const k = n.toLocaleLowerCase('vi');
      if (!n || seen.has(k)) continue;
      seen.add(k);
      out.push(n);
      if (out.length >= top) break;
    }
    return out;
  };
  return {
    foodCount: f.length,
    aiCount: f.filter((x) => x.source === 'ai').length,
    reuses: [...f, ...t].reduce((s, x) => s + uses(x.use_count), 0),
    topFoods: names(f),
    templateCount: t.length,
    topTemplates: names(t),
  };
}

/** "Bún bò Huế, Sữa chua, Phở" (+N) — compact hint line for a nav row. */
export function namesHint(names: string[], total: number): string {
  if (!names.length) return '';
  const more = total - names.length;
  return more > 0 ? `${names.join(', ')} +${more}` : names.join(', ');
}
