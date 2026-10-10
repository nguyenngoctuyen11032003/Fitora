import { Activity, Bike, Check, Dumbbell, Flower2, Footprints, HeartPulse, Plus, Trophy, Waves, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { formatTime } from '@/lib/date';
import { formatMinutes, formatNumber } from '@/lib/format';
import type { Workout, WorkoutCategory } from '@/types/db';
import { SectionHeader } from './SectionHeader';

const ICONS: Record<WorkoutCategory, typeof Dumbbell> = {
  gym: Dumbbell,
  cardio: HeartPulse,
  yoga: Flower2,
  running: Zap,
  swimming: Waves,
  cycling: Bike,
  team_sport: Trophy,
  walking: Footprints,
  other: Activity,
};

interface Props {
  workouts: Workout[];
  onComplete: (w: Workout) => Promise<unknown>;
  className?: string;
}

/** Today's workouts (planned / done). Planned ones can be checked off inline. */
export function WorkoutsSection({ workouts, onComplete, className }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const sorted = [...workouts].sort((a, b) => (a.status === b.status ? 0 : a.status === 'planned' ? -1 : 1));

  const complete = async (w: Workout) => {
    setBusy(w.id);
    try {
      await onComplete(w);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="today-workouts" className={className}>
      <SectionHeader id="today-workouts" title="Tập luyện" to="/workout" linkLabel="Lịch tập" />
      {sorted.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            compact
            icon={Dumbbell}
            title="Chưa có buổi tập"
            description="Thêm một buổi tập để cộng calo tiêu hao vào ngân sách hôm nay."
            action={
              <Link to="/workout" className="glass pill text-[14px] font-semibold text-text">
                <Plus className="h-4 w-4 text-gold" aria-hidden="true" />
                Thêm buổi tập
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="glass-card divide-y divide-white/[0.06] overflow-hidden p-0">
          {sorted.map((w) => {
            const Icon = ICONS[w.category] ?? Activity;
            const planned = w.status === 'planned';
            const time = formatTime(w.start_time);
            return (
              <li key={w.id} className="flex items-center">
                <Link
                  to="/workout"
                  className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/[0.08] ${planned ? 'bg-white/[0.03] text-muted' : 'bg-burn/15 text-burn'}`}
                    aria-hidden="true"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-text">{w.title}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {[time, formatMinutes(w.duration_min)].filter(Boolean).join(' · ')}
                      {' · '}
                      <span className={planned ? 'text-gold' : 'text-ok'}>{planned ? 'Kế hoạch' : 'Đã tập'}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`num block text-[20px] ${planned ? 'text-muted' : 'text-text'}`}>{formatNumber(w.kcal)}</span>
                    <span className="text-[10px] font-semibold text-muted">kcal</span>
                  </span>
                </Link>
                {planned && (
                  <button
                    type="button"
                    onClick={() => void complete(w)}
                    disabled={busy === w.id}
                    aria-label={`Đánh dấu đã tập: ${w.title}`}
                    className="glass circle mr-3 text-ok disabled:opacity-60"
                  >
                    {busy === w.id ? <Spinner size={16} /> : <Check className="h-[18px] w-[18px]" />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
