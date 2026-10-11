import clsx from 'clsx';
import { Check, ChevronRight, Clock } from 'lucide-react';
import { formatTime } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import type { Workout } from '@/types/db';
import { ActivityIcon } from './ActivityIcon';
import { formatKm, splitDistanceNote } from './lib';

interface Props {
  workout: Workout;
  pending?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  index?: number;
}

/** One session: status toggle (left) · tap body to edit · kcal on the right. */
export function SessionRow({ workout: w, pending, onToggle, onOpen, index = 0 }: Props) {
  const done = w.status === 'done';
  const time = formatTime(w.start_time);
  const { km } = splitDistanceNote(w.notes);
  return (
    <li
      className={clsx('glass-card flex items-stretch gap-1 p-1.5 pr-2 animate-fade-slide-up motion-reduce:animate-none', pending && 'opacity-60')}
      style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={done ? `Đánh dấu "${w.title}" là chưa tập` : `Đánh dấu "${w.title}" là đã tập`}
        className="grid h-auto min-h-[56px] w-12 shrink-0 place-items-center rounded-[18px] transition-transform active:scale-90 disabled:cursor-wait motion-reduce:transition-none"
      >
        <span
          className={clsx(
            'grid h-7 w-7 place-items-center rounded-full border-2 transition-colors duration-200',
            done ? 'border-gold bg-gold text-[#1a0e02] shadow-[0_0_16px_-2px_rgba(237,180,11,0.7)]' : 'border-white/30 text-transparent',
          )}
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-[18px] py-2 pl-1 pr-1 text-left transition-colors hover:bg-white/[0.04]"
        aria-label={`Sửa ${w.title}, ${w.duration_min} phút, ${km ? `${formatKm(km)} km, ` : ''}${formatNumber(w.kcal)} kcal${done ? '' : ', lên lịch'}`}
      >
        <ActivityIcon activity={w.activity} category={w.category} size={40} muted={!done} />
        <span className="min-w-0 flex-1">
          <span className={clsx('block truncate text-[15px] font-bold tracking-[-0.01em]', done ? 'text-text' : 'text-text/80')}>{w.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 whitespace-nowrap text-[12.5px] leading-[1.45] text-muted">
            {time && (
              <>
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="tabular">{time}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span className="tabular">{w.duration_min} phút</span>
            {km ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular">{formatKm(km)} km</span>
              </>
            ) : null}
            {!done && <span className="rounded-full bg-white/[0.08] px-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-text/75">Lên lịch</span>}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className={clsx('num text-[22px] leading-none', done ? 'text-gradient-ember' : 'text-text/50')}>
            {formatNumber(w.kcal)}
          </span>
          <span className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">kcal</span>
        </span>
        <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted min-[380px]:block" aria-hidden="true" />
      </button>
    </li>
  );
}
