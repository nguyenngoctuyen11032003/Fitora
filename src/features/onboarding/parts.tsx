// Small presentational pieces used by the onboarding steps and /goals.
import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { MACROS } from '@/components/ui/MacroBar';
import type { Macros } from '@/lib/energy';
import { formatNumber } from '@/lib/format';
import { bmiGaugePos, macroPercents } from './logic';

/* ------------------------------------------------------------------ */
/* Selectable card (radio)                                            */
/* ------------------------------------------------------------------ */

export interface OptionCardProps {
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned meta (e.g. "×1,55"). */
  meta?: ReactNode;
  /** Extra content shown under the card when selected. */
  children?: ReactNode;
  className?: string;
  delay?: number;
}

/** Big tappable glass card acting as a radio button. */
export function OptionCard({ selected, onSelect, icon, title, description, meta, children, className, delay }: OptionCardProps) {
  return (
    <div
      className={clsx(
        'glass-card overflow-hidden transition-[box-shadow,background-color] duration-200',
        selected ? 'bg-[rgba(237,180,11,0.09)] ring-1 ring-[rgba(237,180,11,0.60)] shadow-[0_14px_40px_-22px_rgba(237,180,11,0.9)]' : 'hover:bg-white/[0.08]',
        delay !== undefined && 'animate-fade-slide-up',
        className,
      )}
      style={delay !== undefined ? { animationDelay: `${delay}ms` } : undefined}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className="flex min-h-[64px] w-full items-center gap-3.5 px-4 py-3.5 text-left transition-transform duration-150 active:scale-[0.985]"
      >
        {icon && (
          <span
            className={clsx(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors [&>svg]:h-[22px] [&>svg]:w-[22px]',
              selected ? 'bg-gold text-[#1a0e02]' : 'bg-white/[0.06] text-[rgba(237,228,216,0.85)]',
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[16px] font-bold tracking-[-0.01em] text-text">{title}</span>
          {description && <span className="mt-0.5 text-[13px] leading-snug text-muted">{description}</span>}
        </span>
        {meta && <span className="tabular shrink-0 text-[13px] font-bold text-muted">{meta}</span>}
        <span
          aria-hidden="true"
          className={clsx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors',
            selected ? 'border-gold bg-gold text-[#1a0e02]' : 'border-white/25',
          )}
        >
          {selected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </span>
      </button>
      {selected && children && <div className="animate-fade-in px-4 pb-4">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Range slider                                                       */
/* ------------------------------------------------------------------ */

export interface RangeSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
  /** Text for aria-valuetext. */
  valueText?: string;
  ticks?: string[];
}

/** Gold-filled native range input (44px touch height). */
export function RangeSlider({ value, min, max, step, onChange, label, valueText, ticks }: RangeSliderProps) {
  const pct = ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        className={clsx(
          'h-11 w-full cursor-pointer appearance-none bg-transparent',
          '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(90deg,var(--gold)_0_var(--fill),rgba(255,255,255,0.1)_var(--fill)_100%)]',
          '[&::-webkit-slider-thumb]:-mt-[11px] [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-[#1a0e02] [&::-webkit-slider-thumb]:bg-gold [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(237,180,11,0.6),0_6px_18px_rgba(237,180,11,0.45)]',
          '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/10',
          '[&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-gold',
          '[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-[#1a0e02] [&::-moz-range-thumb]:bg-gold',
          'focus-visible:outline-none [&:focus-visible::-webkit-slider-thumb]:ring-4 [&:focus-visible::-webkit-slider-thumb]:ring-[rgba(237,180,11,0.30)]',
        )}
        style={{
          // WebKit track fill (Firefox uses ::-moz-range-progress).
          ['--fill' as string]: `${pct}%`,
        }}
      />
      {ticks && (
        <div className="tabular flex justify-between px-0.5 text-[11px] font-semibold text-muted" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BMI gauge                                                          */
/* ------------------------------------------------------------------ */

// Asian cut-offs on a 15–35 scale: 15–18.5 | 18.5–23 | 23–25 | 25–35
const BMI_BANDS = [
  { w: 3.5, color: '#7FB2FF', label: 'Thiếu cân' },
  { w: 4.5, color: '#7FD18B', label: 'Bình thường' },
  { w: 2, color: '#EDB40B', label: 'Thừa cân' },
  { w: 10, color: '#E1500A', label: 'Béo phì' },
];
export const BMI_COLORS: Record<string, string> = {
  underweight: '#7FB2FF',
  normal: '#7FD18B',
  overweight: '#EDB40B',
  obese: '#FF6A1F',
};

export function BmiGauge({ bmi, label, colorKey }: { bmi: number; label: string; colorKey: string }) {
  const pos = bmiGaugePos(bmi) * 100;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-2">
          <span className="num text-[48px] text-gradient">{formatNumber(bmi, 1)}</span>
          <span className="mb-1 text-sm font-bold text-muted">BMI</span>
        </div>
        <span
          className="mb-1 rounded-full px-3 py-1 text-[13px] font-bold"
          style={{ color: BMI_COLORS[colorKey], background: `${BMI_COLORS[colorKey]}1f` }}
        >
          {label}
        </span>
      </div>
      <div className="relative pt-3" role="img" aria-label={`BMI ${formatNumber(bmi, 1)}, ${label}`}>
        <div className="flex h-2 w-full gap-[3px] overflow-hidden rounded-full">
          {BMI_BANDS.map((b) => (
            <span key={b.label} className="h-full rounded-full opacity-80" style={{ flex: b.w, background: b.color }} />
          ))}
        </div>
        <span
          className="absolute top-0 -ml-[7px] h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent border-t-text transition-[left] duration-700 ease-out"
          style={{ left: `${pos}%` }}
          aria-hidden="true"
        />
        <div className="tabular mt-1.5 flex text-[10px] font-semibold text-muted" aria-hidden="true">
          <span style={{ flex: 3.5 }}>15</span>
          <span style={{ flex: 4.5 }}>18,5</span>
          <span style={{ flex: 2 }}>23</span>
          <span style={{ flex: 9 }}>25</span>
          <span style={{ flex: 1 }} className="text-right">35</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Macro donut                                                        */
/* ------------------------------------------------------------------ */

export function MacroDonut({ macros, size = 136, center }: { macros: Macros; size?: number; center?: ReactNode }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = macroPercents(macros);
  const kc = MACROS.map((m) => Math.max(0, macros[m.key]) * m.kcal);
  const total = kc.reduce((a, b) => a + b, 0) || 1;
  const gap = 4;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`Đạm ${pct.protein_g}%, tinh bột ${pct.carbs_g}%, chất béo ${pct.fat_g}%`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        {MACROS.map((m, i) => {
          const len = Math.max(0, (kc[i] / total) * c - gap);
          const el = (
            <circle
              key={m.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={m.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${len} ${c}`}
              strokeDashoffset={-offset}
              className="transition-[stroke-dasharray,stroke-dashoffset] duration-700 ease-out"
            />
          );
          offset += (kc[i] / total) * c;
          return el;
        })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}

/** Legend rows: colour · label · grams · %. */
export function MacroLegend({ macros }: { macros: Macros }) {
  const pct = macroPercents(macros);
  return (
    <ul className="flex min-w-0 flex-1 flex-col gap-3">
      {MACROS.map((m) => (
        <li key={m.key} className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[12px] font-semibold text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} aria-hidden="true" />
            {m.label}
          </span>
          <span className="tabular flex items-baseline gap-1.5">
            <span className="text-[22px] font-extrabold tracking-[-0.04em] text-text">{formatNumber(macros[m.key])}</span>
            <span className="text-[13px] font-semibold text-muted">g</span>
            <span className="ml-auto text-[13px] font-bold" style={{ color: m.color }}>
              {pct[m.key]}%
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                          */
/* ------------------------------------------------------------------ */

export function StatTile({
  label,
  value,
  unit,
  icon,
  hint,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={clsx('glass-card flex flex-col gap-2 p-4', className)}>
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted [&>svg]:h-4 [&>svg]:w-4">
        {icon}
        {label}
      </span>
      <span className="tabular flex items-baseline gap-1">
        <span className="text-[28px] font-extrabold leading-none tracking-[-0.05em]" style={tone ? { color: tone } : undefined}>
          {value}
        </span>
        {unit && <span className="text-[12px] font-semibold text-muted">{unit}</span>}
      </span>
      {hint && <span className="text-[12px] leading-snug text-muted">{hint}</span>}
    </div>
  );
}

/** Section heading inside a step / the goals page. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-[28px] items-center justify-between gap-3">
      <h2 className="eyebrow text-[rgba(237,228,216,0.80)]">{children}</h2>
      {action}
    </div>
  );
}
