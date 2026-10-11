import clsx from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { GlassButton } from '@/components/ui/GlassButton';
import { addDays, formatDayVi, parseISODate, weekdayShort } from '@/lib/date';
import type { DayMark } from './lib';

interface Props {
  days: string[];
  selected: string;
  today: string;
  marks: Record<string, DayMark>;
  onSelect: (date: string) => void;
  onShiftWeek: (dir: -1 | 1) => void;
  onToday: () => void;
  loading?: boolean;
}

/** Mon–Sun strip with done (gold dot) / planned (ring) markers. */
export function WeekStrip({ days, selected, today, marks, onSelect, onShiftWeek, onToday, loading }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const first = parseISODate(days[0]);
  const last = parseISODate(days[6]);
  const range =
    first.getMonth() === last.getMonth()
      ? `${first.getDate()}–${last.getDate()} tháng ${last.getMonth() + 1}`
      : `${first.getDate()}/${first.getMonth() + 1} – ${last.getDate()}/${last.getMonth() + 1}`;
  const isThisWeek = days.includes(today);

  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const j = i + (e.key === 'ArrowRight' ? 1 : -1);
    if (j < 0) onShiftWeek(-1);
    else if (j > 6) onShiftWeek(1);
    else {
      onSelect(days[j]);
      refs.current[j]?.focus();
    }
  };

  return (
    <section aria-label="Lịch tuần" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <GlassButton label="Tuần trước" onClick={() => onShiftWeek(-1)}>
          <ChevronLeft className="h-5 w-5" />
        </GlassButton>
        <div className="min-w-0 flex-1 text-center">
          <p className="eyebrow">{isThisWeek ? 'Tuần này' : addDays(days[0], 7) <= today ? 'Tuần đã qua' : 'Tuần tới'}</p>
          <p className="mt-0.5 truncate text-[15px] font-bold tracking-[-0.02em] text-text">{range}</p>
        </div>
        {!isThisWeek ? (
          <button type="button" onClick={onToday} className="min-h-[44px] rounded-full px-3 text-[13px] font-bold text-gold hover:bg-white/[0.06]">
            Hôm nay
          </button>
        ) : null}
        <GlassButton label="Tuần sau" onClick={() => onShiftWeek(1)}>
          <ChevronRight className="h-5 w-5" />
        </GlassButton>
      </div>

      <div role="listbox" aria-label="Chọn ngày" className="grid grid-cols-7 gap-0.5 min-[380px]:gap-1.5">
        {days.map((d, i) => {
          const on = d === selected;
          const isToday = d === today;
          const m = marks[d];
          const label = `${formatDayVi(d, 'long')}${m ? `, ${m.done} buổi đã tập, ${m.planned} buổi lên lịch` : ''}`;
          return (
            <button
              key={d}
              ref={(el) => (refs.current[i] = el)}
              type="button"
              role="option"
              aria-selected={on}
              aria-current={isToday ? 'date' : undefined}
              aria-label={label}
              tabIndex={on ? 0 : -1}
              onClick={() => onSelect(d)}
              onKeyDown={(e) => onKey(e, i)}
              className={clsx(
                'relative flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-[18px] border transition-[background-color,transform,border-color] duration-200 active:scale-[0.95]',
                on
                  ? 'border-gold/70 bg-gold text-[#1a0e02] shadow-[0_10px_26px_-12px_rgba(237,180,11,0.9)]'
                  : isToday
                    ? 'border-gold/40 bg-white/[0.05] text-text'
                    : 'border-line bg-white/[0.03] text-text/85 hover:bg-white/[0.07]',
              )}
            >
              <span className={clsx('text-[11px] font-bold uppercase tracking-[0.08em]', on ? 'text-[#1a0e02]/70' : isToday ? 'text-gold' : 'text-muted')}>
                {weekdayShort(d)}
              </span>
              <span className="num text-[22px] leading-none">{parseISODate(d).getDate()}</span>
              <span className="flex h-1.5 items-center gap-1" aria-hidden="true">
                {loading ? null : (
                  <>
                    {m?.done ? <span className={clsx('h-1.5 w-1.5 rounded-full', on ? 'bg-[#1a0e02]' : 'bg-gold')} /> : null}
                    {m?.planned ? (
                      <span className={clsx('h-1.5 w-1.5 rounded-full border', on ? 'border-[#1a0e02]' : 'border-text/70')} />
                    ) : null}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4 text-[11px] font-semibold text-muted" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" /> Đã tập
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full border border-text/70" /> Lên lịch
        </span>
      </div>
    </section>
  );
}
