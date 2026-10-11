import clsx from 'clsx';
import { ChefHat, Cookie, Layers, MoonStar, Sparkles, Sun, Sunrise, Utensils, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatGrams, formatNumber } from '@/lib/format';
import { signedUrls } from '@/services/storage';
import type { MealEntry, MealType } from '@/types/db';

export const MEAL_ICONS: Record<MealType, LucideIcon> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: MoonStar,
  snack: Cookie,
};

/** "1,5 bát" · "200 g" */
export function formatQty(qty: number, unit: string): string {
  return `${formatNumber(qty, 2)} ${unit}`;
}

/** "1,5 bát · 750 g" (grams only when meaningful and not already the unit). */
export function portionLabel(qty: number, unit: string, grams: number): string {
  const base = formatQty(qty, unit);
  return grams > 0 && unit !== 'g' && unit !== 'ml' ? `${base} · ${formatGrams(grams)}` : base;
}

const MACRO_TILES = [
  { key: 'protein_g', label: 'Đạm', color: 'var(--protein)' },
  { key: 'carbs_g', label: 'Tinh bột', color: 'var(--carbs)' },
  { key: 'fat_g', label: 'Béo', color: 'var(--fat)' },
  { key: 'fiber_g', label: 'Xơ', color: 'var(--fiber)' },
] as const;

/** Four small macro tiles (P / C / F / fiber) with live values. */
export function MacroTiles({
  protein_g,
  carbs_g,
  fat_g,
  fiber_g,
  className,
}: {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  className?: string;
}) {
  const vals = { protein_g, carbs_g, fat_g, fiber_g };
  return (
    <dl className={clsx('grid grid-cols-4 gap-2', className)}>
      {MACRO_TILES.map((m) => (
        <div key={m.key} className="rounded-2xl border border-line bg-white/[0.04] px-2 py-2.5 text-center">
          <dt className="flex items-center justify-center gap-1 text-[11px] font-semibold text-muted">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} aria-hidden="true" />
            {m.label}
          </dt>
          <dd className="tabular mt-1 text-[17px] font-bold tracking-[-0.02em] text-text">
            {formatNumber(vals[m.key], vals[m.key] < 10 ? 1 : 0)}
            <span className="ml-0.5 text-[11px] font-semibold text-muted">g</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Inline "P 25 · C 55 · F 13" with macro-coloured letters. */
export function MacroInline({ p, c, f, className }: { p: number; c: number; f: number; className?: string }) {
  const parts = [
    { s: 'P', v: p, color: 'var(--protein)', label: 'Đạm' },
    { s: 'C', v: c, color: 'var(--carbs)', label: 'Tinh bột' },
    { s: 'F', v: f, color: 'var(--fat)', label: 'Béo' },
  ];
  return (
    <span className={clsx('tabular inline-flex items-center gap-2 text-[12px] text-muted', className)}>
      {parts.map((x) => (
        <span key={x.s} aria-label={`${x.label} ${formatNumber(x.v)} gam`}>
          <span aria-hidden="true" className="font-bold" style={{ color: x.color }}>
            {x.s}
          </span>
          <span aria-hidden="true"> {formatNumber(x.v)}</span>
        </span>
      ))}
    </span>
  );
}

/** 48px thumbnail: signed photo, else a source icon tile. */
export function EntryThumb({ entry, url, size = 48 }: { entry: Pick<MealEntry, 'source' | 'meal'>; url?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const Icon = entry.source === 'ai' ? Sparkles : entry.source === 'manual' ? MEAL_ICONS[entry.meal] : Utensils;
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-2xl border border-line object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'grid shrink-0 place-items-center rounded-2xl border border-line',
        entry.source === 'ai' ? 'bg-gold/10 text-gold' : 'bg-white/[0.05] text-text/70',
      )}
      style={{ width: size, height: size }}
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** Signed URLs for the photos of the given entries (batched + cached by the storage service). */
export function useMealPhotoUrls(entries: Array<Pick<MealEntry, 'photo_path'>>): Record<string, string> {
  const paths = useMemo(() => [...new Set(entries.map((e) => e.photo_path).filter((p): p is string => !!p))].sort(), [entries]);
  const key = paths.join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!paths.length) return;
    let alive = true;
    signedUrls(paths)
      .then((map) => alive && setUrls((u) => ({ ...u, ...map })))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

/** Thumbnail for a food option / saved food: its photo, else an icon tile (scan = sparkles). */
export function FoodThumb({
  url,
  kind,
  size = 44,
}: {
  url?: string;
  /** 'ai' = saved from a scan, 'saved' = other saved food, 'template' = meal template, 'food' = database / history. */
  kind: 'ai' | 'saved' | 'template' | 'food';
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-xl border border-line object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const Icon = kind === 'ai' ? Sparkles : kind === 'template' ? Layers : kind === 'saved' ? ChefHat : Utensils;
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'grid shrink-0 place-items-center rounded-xl border border-line',
        kind === 'food' ? 'bg-white/[0.04] text-text/60' : 'bg-gold/10 text-gold',
      )}
      style={{ width: size, height: size }}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}
