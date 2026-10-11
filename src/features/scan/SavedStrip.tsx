import clsx from 'clsx';
import { ChevronRight, History, Utensils } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatNumber } from '@/lib/format';
import type { CustomFood } from '@/types/db';
import { servingNutrients, savedServing } from './saved';

interface Props {
  foods: CustomFood[];
  urls: Record<string, string>;
  onPick: (food: CustomFood) => void;
  /** "Xem tất cả" target (food search with the saved foods). */
  allHref?: string;
  title?: string;
  className?: string;
}

/** Thumbnail of a saved food: its scan photo, or a neutral icon. */
export function SavedThumb({ food, url, size = 44 }: { food: Pick<CustomFood, 'source'>; url?: string; size?: number }) {
  if (url) return <img src={url} alt="" className="shrink-0 rounded-[14px] object-cover" style={{ width: size, height: size }} loading="lazy" />;
  return (
    <span
      aria-hidden="true"
      className={clsx('grid shrink-0 place-items-center rounded-[14px] border border-line', food.source === 'ai' ? 'bg-[rgba(237,180,11,0.1)] text-gold' : 'bg-white/[0.06] text-text/70')}
      style={{ width: size, height: size }}
    >
      <Utensils className="h-5 w-5" />
    </span>
  );
}

/** "Ăn lại món đã lưu": horizontal strip, one tap opens the quick portion sheet. */
export function SavedStrip({ foods, urls, onPick, allHref, title = 'Ăn lại món đã lưu', className }: Props) {
  if (!foods.length) return null;
  return (
    <section className={clsx('flex min-w-0 flex-col gap-2', className)} aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-text/90">
          <History className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          <span className="truncate">{title}</span>
        </h2>
        {allHref && (
          <Link to={allHref} className="inline-flex min-h-[44px] shrink-0 items-center gap-0.5 pl-2 text-[12px] font-semibold text-muted hover:text-gold">
            Tất cả <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      <ul className="no-scrollbar -mx-5 flex snap-x scroll-px-5 gap-2 overflow-x-auto px-5 pb-0.5" role="list">
        {foods.map((f) => {
          const kcal = servingNutrients(f).kcal;
          const { unit, grams } = savedServing(f);
          return (
            <li key={f.id} className="snap-start">
              <button
                type="button"
                onClick={() => onPick(f)}
                className="glass-strong flex min-h-[56px] w-[164px] items-center gap-2.5 rounded-[18px] p-1.5 pr-3 text-left transition-transform active:scale-[0.97] motion-reduce:transition-none"
                aria-label={`Ăn lại ${f.name}, ${formatNumber(kcal)} kcal mỗi ${unit === 'g' ? `${Math.round(grams)} g` : unit}`}
              >
                <SavedThumb food={f} url={f.photo_path ? urls[f.photo_path] : undefined} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-bold leading-tight">{f.name}</span>
                  <span className="mt-1 truncate text-[12px] leading-tight text-muted">
                    <span className="tabular font-bold text-gold">{formatNumber(kcal)}</span> kcal · {unit === 'g' ? `${Math.round(grams)} g` : `1 ${unit}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
