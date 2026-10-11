import { History, Plus, Sparkles } from 'lucide-react';
import { diffDays, formatTime, weekdayLong } from '@/lib/date';
import { formatNumber } from '@/lib/format';
import type { Workout } from '@/types/db';
import { ActivityIcon } from './ActivityIcon';
import { splitDistanceNote, formatKm, type Suggestion } from './lib';

interface Props {
  date: string;
  suggestions: Suggestion<Workout>[];
  /** kcal estimate of a suggestion at the current weight. */
  estimate: (w: Workout) => number;
  busyId: string | null;
  /** True when the selected day has no session yet (wording + emphasis). */
  emptyDay: boolean;
  /** One tap: add to the selected day. */
  onApply: (w: Workout) => void;
  /** Tap the row: open the sheet prefilled to adjust first. */
  onCustomize: (w: Workout) => void;
}

function reasonText(s: Suggestion<Workout>, date: string): string {
  if (s.reason === 'last') {
    const ago = diffDays(s.source.workout_on, date);
    return ago <= 1 ? 'Buổi gần nhất · hôm trước' : `Buổi gần nhất · ${ago} ngày trước`;
  }
  const day = weekdayLong(date);
  return s.count >= 2 ? `Thường tập vào ${day} · ${s.count} tuần gần đây` : `Đã tập ${day} tuần trước`;
}

/** "Bạn thường tập…": sessions of this weekday (or the last session) re-logged in one tap. */
export function SuggestionsCard({ date, suggestions, estimate, busyId, emptyDay, onApply, onCustomize }: Props) {
  if (!suggestions.length) return null;
  const habit = suggestions[0].reason === 'weekday';
  return (
    <section aria-labelledby="sug-h" className="flex flex-col gap-2">
      <p id="sug-h" className="eyebrow flex items-center gap-1.5 pl-1">
        {habit ? <Sparkles className="h-3.5 w-3.5 text-gold" aria-hidden="true" /> : <History className="h-3.5 w-3.5 text-gold" aria-hidden="true" />}
        {habit ? (emptyDay ? 'Bạn thường tập' : 'Bạn cũng hay tập') : 'Lặp lại buổi gần nhất'}
      </p>
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => {
          const w = s.source;
          const time = formatTime(w.start_time);
          const { km } = splitDistanceNote(w.notes);
          const facts = [time, `${w.duration_min} phút`, km ? `${formatKm(km)} km` : '', `~${formatNumber(estimate(w))} kcal`].filter(Boolean).join(' · ');
          return (
            <li key={w.id} className="flex items-center gap-1 rounded-[24px] border border-dashed border-gold/35 bg-gold/[0.04] p-1.5">
              <button
                type="button"
                onClick={() => onCustomize(w)}
                className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 rounded-[18px] px-1.5 text-left hover:bg-white/[0.04]"
                aria-label={`Chỉnh rồi thêm ${w.title}`}
              >
                <ActivityIcon activity={w.activity} category={w.category} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold tracking-[-0.01em] text-text">{w.title}</span>
                  <span className="block truncate text-[12.5px] text-muted">{facts}</span>
                  <span className="block truncate text-[12px] font-semibold text-gold/85">{reasonText(s, date)}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onApply(w)}
                disabled={busyId === w.id}
                aria-label={`Thêm ngay ${w.title}`}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-[#1a0e02] shadow-[0_8px_20px_-10px_rgba(237,180,11,0.9)] transition-transform active:scale-90 disabled:opacity-50 motion-reduce:transition-none"
              >
                <Plus className="h-5 w-5" strokeWidth={2.6} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
