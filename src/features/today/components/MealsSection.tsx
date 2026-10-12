import { ArrowRight, ChevronRight, Coffee, Cookie, Moon, Plus, ScanLine, Soup } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatNumber } from '@/lib/format';
import { MEAL_LABELS, type MealType } from '@/types/db';
import type { MealGroup } from '../metrics';
import { SectionHeader } from './SectionHeader';
import { memo } from 'react';

const ICONS: Record<MealType, typeof Coffee> = { breakfast: Coffee, lunch: Soup, dinner: Moon, snack: Cookie };

interface Props {
  groups: MealGroup[];
  date: string;
  suggestedMeal: MealType;
  className?: string;
}

/** Prominent "Quét bữa ăn" CTA + 4-meal summary (tap → /diary). */
export const MealsSection = memo(function MealsSection({ groups, date, suggestedMeal, className }: Props) {
  const diary = `/diary?date=${date}`;
  return (
    <section aria-labelledby="today-meals" className={className}>
      <SectionHeader id="today-meals" title="Bữa ăn" to={diary} linkLabel="Nhật ký" />

      <Link
        to={`/scan?meal=${suggestedMeal}&date=${date}`}
        className="group relative flex min-h-[76px] items-center gap-4 overflow-hidden rounded-card px-5 py-4 text-[#1a0e02] shadow-[0_18px_40px_-18px_rgba(237,180,11,0.85)] transition-transform active:scale-[0.985]"
        style={{ background: 'linear-gradient(120deg, #ffd65a 0%, #EDB40B 45%, #E1500A 130%)' }}
      >
        {/* speed lines */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-14 w-24 -skew-x-[18deg] bg-white/15" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 w-6 -skew-x-[18deg] bg-white/10" />
        <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#1a0e02] text-gold shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
          <ScanLine className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block text-[18px] font-extrabold leading-tight tracking-[-0.03em]">Quét bữa ăn</span>
          <span className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-[#1a0e02]/75">
            AI tính calo · <span className="whitespace-nowrap">{MEAL_LABELS[suggestedMeal].toLowerCase()}</span>
          </span>
        </span>
        <ArrowRight className="relative h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>

      <ul className="glass-card mt-3 divide-y divide-white/[0.06] overflow-hidden p-0">
        {groups.map((g) => {
          const Icon = ICONS[g.meal];
          const empty = g.count === 0;
          return (
            <li key={g.meal} className="flex items-center">
              <Link
                to={diary}
                className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/[0.08] ${empty ? 'bg-white/[0.03] text-muted' : 'bg-gold/10 text-gold'}`}
                  aria-hidden="true"
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-text">{MEAL_LABELS[g.meal]}</span>
                  <span className="block truncate text-[12px] text-muted">
                    {empty ? 'Chưa ghi món nào' : g.names.join(', ')}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`num block text-[20px] ${empty ? 'text-muted/60' : 'text-text'}`}>{empty ? '—' : formatNumber(g.kcal)}</span>
                  {!empty && <span className="text-[10px] font-semibold text-muted">kcal</span>}
                </span>
                {!empty && <ChevronRight className="h-4 w-4 shrink-0 text-muted/70" aria-hidden="true" />}
              </Link>
              {empty && (
                <Link
                  to={`/scan?meal=${g.meal}&date=${date}`}
                  aria-label={`Thêm ${MEAL_LABELS[g.meal].toLowerCase()}`}
                  className="glass circle mr-3 text-gold"
                >
                  <Plus className="h-[18px] w-[18px]" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
});
