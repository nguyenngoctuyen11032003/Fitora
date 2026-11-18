import clsx from 'clsx';
import { Check, Dumbbell, Flag, Flame, Pause, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { Button, EmptyState, ScreenHeader, Segmented } from '@/components/ui';
import type { PlanExercise } from '@/data/workoutPlan';
import { formatNumber } from '@/lib/format';
import { ActivityIcon } from '../ActivityIcon';
import { FinishSheet } from './FinishSheet';
import { useActiveSession } from './SessionContext';
import { StartSessionSheet } from './StartSessionSheet';
import { exercisesDone, formatClock } from './timer';

/** Keeps the screen on while `active` (Wake Lock API); silently ignored when unsupported or refused. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (!active || !wl) return;
    let sentinel: { release(): Promise<void> } | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await wl.request('screen');
        if (cancelled) await s.release().catch(() => {});
        else sentinel = s;
      } catch {
        /* battery saver / hidden tab */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      sentinel?.release().catch(() => {});
    };
  }, [active]);
}

export default function SessionPage() {
  const s = useActiveSession();
  const navigate = useNavigate();
  const [finishOpen, setFinishOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  useWakeLock(s.running);
  const session = s.session;

  if (!session) {
    return (
      <Page topBar={false} label="Đang tập">
        <ScreenHeader back="/workout" eyebrow="Tập ngay" title="Chưa có buổi tập" size="md" />
        <div className="glass-card mt-6">
          <EmptyState
            icon={Dumbbell}
            title="Bạn chưa bắt đầu buổi tập nào"
            description="Chọn một buổi trong giáo án hoặc hoạt động khác — đồng hồ và kcal sẽ chạy ngay."
            action={
              <Button icon={<Play className="h-4 w-4" fill="currentColor" strokeWidth={0} />} onClick={() => setStartOpen(true)}>
                Bắt đầu tập
              </Button>
            }
          />
        </div>
        <StartSessionSheet open={startOpen} onClose={() => setStartOpen(false)} onStarted={() => setStartOpen(false)} />
      </Page>
    );
  }

  const clock = formatClock(s.elapsedMs);
  const started = new Date(session.startedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const day = s.day;
  const variants = s.activity?.variants ?? [];

  return (
    <Page
      topBar={false}
      label="Đang tập"
      footer={
        <div className="grid grid-cols-2 gap-2.5 lg:ml-auto lg:max-w-[460px]">
          <Button variant="secondary" size="lg" icon={s.paused ? <Play className="h-5 w-5" fill="currentColor" strokeWidth={0} /> : <Pause className="h-5 w-5" fill="currentColor" strokeWidth={0} />} onClick={s.paused ? s.resume : s.pause}>
            {s.paused ? 'Tiếp tục' : 'Tạm dừng'}
          </Button>
          <Button size="lg" icon={<Flag className="h-5 w-5" />} onClick={() => setFinishOpen(true)}>
            Kết thúc
          </Button>
        </div>
      }
    >
      <ScreenHeader back="/workout" eyebrow={`${session.kind === 'plan' ? 'Theo giáo án' : 'Hoạt động'} · bắt đầu ${started}`} title={session.title} size="md" className="lg:[&_h1]:text-[40px]" />

      <section aria-label="Đồng hồ" className="mt-6 lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end lg:gap-x-14">
        <div>
          <p className={clsx('flex items-center gap-2 text-[14px] font-semibold', s.running ? 'text-gold' : 'text-muted')}>
            {s.running ? <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-gold" /> : <Pause aria-hidden="true" className="h-4 w-4" fill="currentColor" strokeWidth={0} />}
            <span aria-live="polite">{s.running ? 'Đang chạy' : 'Đã tạm dừng'}</span>
          </p>
          <p
            role="timer"
            aria-live="off"
            aria-label={`Thời gian tập ${clock}`}
            className={clsx('num mt-4 whitespace-nowrap pb-2 transition-colors duration-500', clock.length > 5 ? 'text-[76px]' : 'text-[104px]', s.running ? 'text-gold' : 'text-text/55')}
          >
            {clock}
          </p>
        </div>
        <div className="mt-3 lg:mt-0 lg:pb-3">
          <p className="tabular flex items-center gap-2 text-[30px] font-bold leading-none tracking-[-0.03em] text-gold">
            <Flame className="h-6 w-6" aria-hidden="true" />≈ {formatNumber(s.kcal)} kcal
          </p>
          <p className="mt-2 text-[13px] text-muted">
            Ước lượng · {formatNumber(session.weightKg, 1)} kg{s.variant ? ` · ${s.variant.label}` : ''} · MET {formatNumber(session.met, 1)}. Sai số khoảng ±20%.
          </p>
        </div>
      </section>

      {variants.length > 1 && (
        <section aria-label="Cường độ" className="mt-6">
          <p className="eyebrow mb-2">Cường độ</p>
          <Segmented ariaLabel="Cường độ buổi tập" size="sm" value={session.variant} onChange={s.setVariant} options={variants.map((v) => ({ value: v.id, label: v.label }))} />
        </section>
      )}

      {session.kind === 'plan' && day ? (
        <section aria-label="Bài tập hôm nay" className="mt-7">
          <div className="mb-2 flex items-end justify-between gap-3 pl-1">
            <h2 className="text-[15px] font-bold tracking-[-0.02em] text-text">Bài tập</h2>
            <p className="tabular text-[13px] text-muted">
              {exercisesDone(session, day)}/{day.exercises.length} bài xong
            </p>
          </div>
          <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
            {day.exercises.map((ex, i) => (
              <ExerciseCard key={ex.id} index={i} exercise={ex} done={session.sets[ex.id] ?? 0} onSets={(n) => s.setSets(ex.id, n, ex.sets)} />
            ))}
          </ul>
        </section>
      ) : (
        <section aria-label="Hoạt động" className="glass-card mt-7 flex items-center gap-3 p-4">
          <ActivityIcon activity={session.activity} category={session.category} size={44} />
          <p className="text-[13.5px] leading-snug text-muted">
            Tập xong bấm <b className="text-text">Kết thúc</b> để lưu buổi tập vào lịch và tính vào năng lượng đã đốt hôm nay.
          </p>
        </section>
      )}

      <FinishSheet
        open={finishOpen}
        onClose={() => setFinishOpen(false)}
        onDone={() => {
          setFinishOpen(false);
          navigate('/workout', { replace: true });
        }}
      />
    </Page>
  );
}

function ExerciseCard({ index, exercise: ex, done, onSets }: { index: number; exercise: PlanExercise; done: number; onSets: (n: number) => void }) {
  const complete = done >= ex.sets;
  return (
    <li className={clsx('glass-card flex flex-col gap-3 p-3.5 transition-opacity', complete && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold', complete ? 'bg-gold text-[#1a0e02]' : 'bg-white/[0.07] text-text')} aria-hidden="true">
          {complete ? <Check className="h-4 w-4" strokeWidth={3} /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className={clsx('text-[15px] font-semibold leading-snug text-text', complete && 'line-through decoration-white/30')}>{ex.vietnameseName}</p>
          <p className="truncate text-[12px] text-muted">
            {ex.name} · {ex.muscleGroups.join(', ')}
          </p>
          <p className="mt-1 text-[12.5px] text-text/85">
            {ex.sets} hiệp · <span className="tabular">{ex.reps}</span>
          </p>
          {ex.note && <p className="mt-1 text-[12px] text-muted">{ex.note}</p>}
        </div>
      </div>
      <div role="group" aria-label={`Hiệp đã xong của ${ex.vietnameseName}`} className="flex flex-wrap gap-2 pl-12">
        {Array.from({ length: ex.sets }, (_, i) => {
          const on = i < done;
          return (
            <button
              key={i}
              type="button"
              aria-pressed={on}
              aria-label={`Hiệp ${i + 1}${on ? ', đã xong' : ''}`}
              // Tapping the last finished set undoes it; tapping any other marks sets up to it as done.
              onClick={() => onSets(on && i === done - 1 ? i : i + 1)}
              className={clsx(
                'relative grid h-11 min-w-11 place-items-center rounded-full border text-[14px] font-bold transition-[transform,background-color] active:scale-95',
                on ? 'border-[rgba(237,180,11,0.6)] bg-gold text-[#1a0e02]' : 'border-line bg-white/[0.04] text-text/80 hover:bg-white/[0.08]',
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </li>
  );
}
