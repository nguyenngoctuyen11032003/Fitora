import { Repeat, RotateCw } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { addDays, formatDayVi } from '@/lib/date';
import { weekRangeLabel } from './lib';

interface Props {
  open: boolean;
  onClose: () => void;
  selected: string;
  today: string;
  weekStart: string;
  weekEnd: string;
  dayCount: number;
  weekCount: number;
  repeating: 'day' | 'week' | null;
  onRepeat: (scope: 'day' | 'week') => void;
}

/** Copy the selected day or the whole shown week, one week ahead, as planned sessions. */
export function RepeatSheet({ open, onClose, selected, today, weekStart, weekEnd, dayCount, weekCount, repeating, onRepeat }: Props) {
  const target = weekRangeLabel(addDays(weekStart, 7), today);
  const isThisWeek = weekRangeLabel(weekStart, today) === 'tuần này';
  const thisWeek = weekRangeLabel(weekStart, today);
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Lặp lại sang ${target}`}
      description={`Sao chép thành các buổi “Lên lịch”. Buổi đã có sẵn ở ${target} và ngày đã qua sẽ được bỏ qua.`}
    >
      <div className="flex flex-col gap-2.5 pb-2">
        <RepeatOption
          title={`Chỉ ${formatDayVi(selected).toLowerCase()}`}
          sub={`${dayCount} buổi → ${formatDayVi(addDays(selected, 7), 'long')}`}
          loading={repeating === 'day'}
          disabled={!!repeating || !dayCount}
          onClick={() => onRepeat('day')}
        />
        <RepeatOption
          title={isThisWeek ? 'Cả tuần này' : `Cả ${thisWeek}`}
          sub={`${weekCount} buổi → tuần ${formatDayVi(addDays(weekStart, 7), 'short')}–${formatDayVi(addDays(weekEnd, 7), 'short')}`}
          loading={repeating === 'week'}
          disabled={!!repeating || !weekCount}
          onClick={() => onRepeat('week')}
        />
      </div>
    </BottomSheet>
  );
}

function RepeatOption({ title, sub, loading, disabled, onClick }: { title: string; sub: string; loading: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading || undefined}
      className="glass-card flex min-h-[64px] w-full items-center gap-3 p-3 text-left transition-transform active:scale-[0.98] disabled:opacity-50 motion-reduce:transition-none"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-gold/15 text-gold">
        {loading ? <RotateCw className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Repeat className="h-5 w-5" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-text">{title}</span>
        <span className="block truncate text-[12.5px] text-muted">{sub}</span>
      </span>
    </button>
  );
}
