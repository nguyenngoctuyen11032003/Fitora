import clsx from 'clsx';
import { Leaf } from 'lucide-react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatNumber } from '@/lib/format';
import type { DaySummary } from '@/types/db';
import type { Targets } from '../metrics';

const ITEMS = [
  { key: 'protein_g', label: 'Đạm', color: 'var(--protein)' },
  { key: 'carbs_g', label: 'Tinh bột', color: 'var(--carbs)' },
  { key: 'fat_g', label: 'Chất béo', color: 'var(--fat)' },
] as const;

/** Protein / Carbs / Fat cards (eaten / target g) + a small fiber line. */
export function MacroCards({ summary, targets, className }: { summary: DaySummary; targets: Targets; className?: string }) {
  return (
    <section aria-label="Dinh dưỡng đa lượng" className={className}>
      <div className="grid grid-cols-3 gap-2.5">
        {ITEMS.map((m) => {
          const eaten = summary[m.key];
          const target = targets[m.key];
          const left = target - eaten;
          const over = left < 0;
          return (
            <div key={m.key} className="glass-card flex min-w-0 flex-col px-3 pb-3.5 pt-3">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }} aria-hidden="true" />
                <span className="truncate">{m.label}</span>
              </span>
              <span className="mt-2.5 flex flex-wrap items-baseline gap-x-0.5">
                <span className="num text-[28px] text-text">{formatNumber(eaten)}</span>
                <span className="text-[12px] font-semibold text-muted">/{formatNumber(target)}g</span>
              </span>
              <ProgressBar value={eaten} max={target} color={m.color} height={6} className="mt-3" label={`${m.label}: ${formatNumber(eaten)} trên ${formatNumber(target)} gam`} />
              <span className={clsx('mt-2 truncate text-[11px] font-medium', over ? 'text-[var(--danger-text)]' : 'text-muted')}>
                {over ? `Vượt ${formatNumber(-left)} g` : left === 0 ? 'Đã đạt' : `Còn ${formatNumber(left)} g`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2.5 flex items-center gap-3 px-1">
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold text-muted">
          <Leaf className="h-3.5 w-3.5 text-fiber" aria-hidden="true" />
          Chất xơ
        </span>
        <ProgressBar value={summary.fiber_g} max={targets.fiber_g} color="var(--fiber)" height={4} showOver={false} className="flex-1" label="Chất xơ" />
        <span className="tabular shrink-0 text-[12px] font-semibold text-text">
          {formatNumber(summary.fiber_g)}
          <span className="text-muted">/{formatNumber(targets.fiber_g)} g</span>
        </span>
      </div>
    </section>
  );
}
