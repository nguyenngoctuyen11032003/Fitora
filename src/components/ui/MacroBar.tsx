import clsx from 'clsx';
import { formatGrams, formatNumber } from '@/lib/format';
import { ProgressBar } from './ProgressBar';

export interface MacroValues {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface MacroBarProps extends MacroValues {
  /** Daily targets → rows show "eaten / target g" with progress. */
  targets?: Partial<MacroValues> | null;
  /** 'rows' (3 progress rows, default) · 'stacked' (single bar split by kcal share) · 'compact' (inline dots P·C·F). */
  variant?: 'rows' | 'stacked' | 'compact';
  className?: string;
}

export const MACROS = [
  { key: 'protein_g', label: 'Đạm', short: 'P', color: 'var(--protein)', kcal: 4 },
  { key: 'carbs_g', label: 'Tinh bột', short: 'C', color: 'var(--carbs)', kcal: 4 },
  { key: 'fat_g', label: 'Chất béo', short: 'F', color: 'var(--fat)', kcal: 9 },
] as const;

/** Protein / carbs / fat visualisation in the macro colours. */
export function MacroBar({ protein_g, carbs_g, fat_g, targets, variant = 'rows', className }: MacroBarProps) {
  const vals: MacroValues = { protein_g, carbs_g, fat_g };

  if (variant === 'compact') {
    return (
      <div className={clsx('flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted', className)}>
        {MACROS.map((m) => (
          <span key={m.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: m.color }} aria-hidden="true" />
            <span className="sr-only">{m.label}</span>
            <span aria-hidden="true">{m.short}</span>
            <span className="tabular font-semibold text-text">{formatGrams(vals[m.key])}</span>
          </span>
        ))}
      </div>
    );
  }

  if (variant === 'stacked') {
    const kc = MACROS.map((m) => Math.max(0, vals[m.key]) * m.kcal);
    const total = kc.reduce((a, b) => a + b, 0) || 1;
    return (
      <div className={clsx('flex flex-col gap-3', className)}>
        <div className="flex h-3 w-full gap-1 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label="Tỉ lệ năng lượng từ đạm, tinh bột, chất béo">
          {MACROS.map((m, i) => (
            <div
              key={m.key}
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${(kc[i] / total) * 100}%`, background: m.color }}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MACROS.map((m, i) => (
            <div key={m.key} className="flex flex-col">
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: m.color }} aria-hidden="true" />
                {m.label}
              </span>
              <span className="tabular text-[15px] font-bold">
                {formatGrams(vals[m.key])} <span className="text-[12px] font-medium text-muted">· {formatNumber((kc[i] / total) * 100)}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col gap-3.5', className)}>
      {MACROS.map((m) => {
        const v = vals[m.key];
        const t = targets?.[m.key] ?? 0;
        return (
          <div key={m.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="flex items-center gap-2 font-semibold">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} aria-hidden="true" />
                {m.label}
              </span>
              <span className="tabular text-muted">
                <span className="font-bold text-text">{formatNumber(v)}</span>
                {t > 0 ? ` / ${formatNumber(t)} g` : ' g'}
              </span>
            </div>
            {t > 0 && <ProgressBar value={v} max={t} color={m.color} height={6} label={m.label} />}
          </div>
        );
      })}
    </div>
  );
}
