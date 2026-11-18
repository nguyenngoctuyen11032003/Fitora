import clsx from 'clsx';
import { ChevronRight, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BottomSheet, Input } from '@/components/ui';
import { ACTIVITIES, type ActivityDef } from '@/data/activities';
import { TRAINING_DAYS, planDayFor, type PlanDay } from '@/data/workoutPlan';
import { useDebounced } from '@/lib/hooks';
import { formatNumber } from '@/lib/format';
import { WORKOUT_CATEGORY_LABELS } from '@/types/db';
import { ActivityIcon } from '../ActivityIcon';
import { searchActivities } from '../lib';
import { useActiveSession, useSessionWeight } from './SessionContext';
import type { StartInput } from './timer';

/** Activities offered before the user types anything. */
const SUGGESTED = ['running', 'walking', 'cycling', 'swimming', 'yoga', 'bodyweight', 'circuit_training', 'badminton']
  .map((k) => ACTIVITIES.find((a) => a.key === k))
  .filter((a): a is ActivityDef => !!a);

export interface StartSessionSheetProps {
  open: boolean;
  onClose: () => void;
  /** After the session exists (open the session screen). */
  onStarted: () => void;
}

/** "Tập ngay": pick a day of the weekly plan (shows the exercise list while training) or any other activity. */
export function StartSessionSheet({ open, onClose, onStarted }: StartSessionSheetProps) {
  const s = useActiveSession();
  const weight = useSessionWeight();
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 120);
  const today = planDayFor();
  const results = useMemo(() => (q ? searchActivities(q).slice(0, 12) : SUGGESTED), [q]);

  const begin = (input: Omit<StartInput, 'weightKg' | 'weightSource'>) => {
    const started = s.start({ ...input, weightKg: weight.kg, weightSource: weight.source });
    if (started) {
      setQuery('');
      onClose();
      onStarted();
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Bắt đầu tập" description="Chọn buổi trong giáo án hoặc một hoạt động khác. Đồng hồ chạy ngay khi bạn chọn.">
      <div className="flex flex-col gap-6 text-text">
        <section aria-label="Giáo án tuần" className="flex flex-col gap-2">
          <p className="eyebrow">Giáo án tuần</p>
          {today?.isRestDay && <p className="text-[13px] text-muted">Hôm nay là ngày nghỉ phục hồi — vẫn có thể tập bù một buổi bên dưới.</p>}
          <ul className="flex flex-col gap-2">
            {TRAINING_DAYS.map((d) => (
              <li key={d.id}>
                <DayCard day={d} isToday={today?.id === d.id} onPick={() => begin({ kind: 'plan', day: d })} />
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Hoạt động khác" className="flex flex-col gap-3">
          <p className="eyebrow">Hoạt động khác</p>
          <Input
            type="search"
            aria-label="Tìm hoạt động"
            placeholder="Tìm: chạy bộ, bơi, yoga, cầu lông…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            icon={<Search className="h-5 w-5" />}
            autoComplete="off"
            enterKeyHint="search"
            trailing={
              query ? (
                <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery('')} className="grid h-11 w-11 place-items-center rounded-full text-muted hover:text-text">
                  <X className="h-5 w-5" />
                </button>
              ) : undefined
            }
          />
          {results.length ? (
            <ul className="flex flex-col gap-1">
              {results.map((a) => (
                <li key={a.key}>
                  <button
                    type="button"
                    onClick={() => begin({ kind: 'activity', activity: a })}
                    className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                  >
                    <ActivityIcon activity={a.key} category={a.category} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-text">{a.name}</span>
                      <span className="block truncate text-[12px] text-muted">
                        {WORKOUT_CATEGORY_LABELS[a.category]} · MET {formatNumber(a.variants[a.defaultVariant]?.met ?? a.variants[0].met, 1)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-3 text-center text-[13px] text-muted">Không thấy “{q}”. Thử từ khóa khác.</p>
          )}
        </section>
      </div>
    </BottomSheet>
  );
}

function DayCard({ day, isToday, onPick }: { day: PlanDay; isToday: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={clsx(
        'flex min-h-[64px] w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors active:scale-[0.99]',
        isToday ? 'border-[rgba(237,180,11,0.55)] bg-[rgba(237,180,11,0.1)]' : 'border-line bg-white/[0.03] hover:bg-white/[0.06]',
      )}
    >
      <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-[14px] text-[12px] font-bold', isToday ? 'bg-gold text-[#1a0e02]' : 'bg-white/[0.06] text-text')}>{day.shortLabel}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-text">
          {day.title}
          {isToday && <span className="ml-2 text-[11px] font-bold uppercase tracking-wide text-gold">Hôm nay</span>}
        </span>
        <span className="block truncate text-[12px] text-muted">
          {day.exercises.length} bài · {day.muscleGroups.join(', ')}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}
