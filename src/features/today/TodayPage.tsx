import clsx from 'clsx';
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Page } from '@/components/shell/Page';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/context/ProfileContext';
import { greetingVi, weekdayLong } from '@/lib/date';
import { MEAL_TYPES } from '@/types/db';
import { CalorieHero } from './components/CalorieHero';
import { InsightStrip } from './components/InsightStrip';
import { MacroCards } from './components/MacroCards';
import { MealsSection } from './components/MealsSection';
import { QuickActions } from './components/QuickActions';
import { QuickRelogStrip } from './components/QuickRelogStrip';
import { StepsCard } from './components/StepsCard';
import { WaterCard } from './components/WaterCard';
import { WorkoutsSection } from './components/WorkoutsSection';
import { buildInsights } from './insights';
import {
  activityModel,
  computeStreaks,
  dateEyebrow,
  effectiveWeight,
  energyBalance,
  greetingName,
  groupMeals,
  mealForHour,
  overBudgetStreak,
  targetsFromProfile,
} from './metrics';
import { useTodayData, type TodayPart } from './useTodayData';

const PART_LABELS: Record<TodayPart, string> = { summary: 'tổng calo', meals: 'bữa ăn', workouts: 'buổi tập' };

/** Staggered entrance wrapper (fade-slide-up; disabled by the global reduced-motion rule). */
function Reveal({ delay, children, className }: { delay: number; children: ReactNode; className?: string }) {
  return (
    <div className={clsx('animate-fade-slide-up', className)} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export default function TodayPage() {
  const toast = useToast();
  const { fit, displayName } = useProfile();
  const onError = useCallback((e: unknown) => toast.error(e), [toast]);
  const { date, now, data, loading, error, failed, reload, retry, addWater, setSteps, completeWorkout, applyMeals } = useTodayData(onError);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const waterToast = useRef<number | null>(null);

  const hour = now.getHours();
  const suggestedMeal = mealForHour(hour, now.getMinutes());
  const targets = useMemo(() => targetsFromProfile(fit), [fit]);
  const weight = effectiveWeight(data?.latestWeightKg, fit?.start_weight_kg);
  const model = useMemo(() => activityModel(fit, weight, date), [fit, weight, date]);
  const energy = useMemo(
    () => (data ? energyBalance(data.summary, targets.kcal, weight, model) : null),
    [data, targets.kcal, weight, model],
  );
  const groups = useMemo(() => groupMeals(data?.meals ?? [], MEAL_TYPES), [data?.meals]);
  const streaks = useMemo(
    () =>
      data
        ? computeStreaks(data.history, {
            date,
            kcalIn: data.summary.kcal_in,
            waterMl: data.summary.water_ml,
            waterTarget: targets.water_ml,
          })
        : null,
    [data, date, targets.water_ml],
  );
  const insights = useMemo(() => {
    if (!data || !energy) return [];
    const s = data.summary;
    return buildInsights({
      hour,
      kcalTarget: targets.kcal,
      eaten: energy.eaten,
      remaining: energy.remaining,
      protein: s.protein_g,
      proteinTarget: targets.protein_g,
      fat: s.fat_g,
      fatTarget: targets.fat_g,
      fiber: s.fiber_g,
      fiberTarget: targets.fiber_g,
      water: s.water_ml,
      waterTarget: targets.water_ml,
      steps: s.steps,
      stepTarget: targets.steps,
      mealCount: data.meals.length,
      weightKg: weight,
      plannedWorkouts: data.workouts.filter((w) => w.status === 'planned').map((w) => w.title),
      doneWorkouts: data.workouts.filter((w) => w.status === 'done').length,
      loggedMeals: groups.filter((g) => g.count > 0).map((g) => g.meal),
      uncreditedActivity: Math.max(0, energy.allowance - energy.burned),
      loggingStreak: streaks?.logging,
      waterStreak: streaks?.water,
      overStreak: overBudgetStreak(data.history, { date, over: energy.remaining < 0 }, targets.kcal),
    });
  }, [data, energy, targets, weight, hour, groups, streaks, date]);

  // Stable handlers so memoised cards don't re-render on unrelated updates.
  const onWaterAdd = useCallback((delta: number) => void addWater(delta), [addWater]);
  const onStepsSave = useCallback((n: number) => void setSteps(n), [setSteps]);
  const openSteps = useCallback(() => setStepsOpen(true), []);
  const quickWater = useCallback(() => {
    addWater(250);
    if (waterToast.current !== null) toast.dismiss(waterToast.current);
    const id = toast.success('Đã thêm 250 ml nước', {
      action: {
        label: 'Hoàn tác',
        onClick: () => {
          toast.dismiss(id);
          addWater(-250);
        },
      },
    });
    waterToast.current = id;
  }, [addWater, toast]);
  const onRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await retry();
    } finally {
      setRetrying(false);
    }
  }, [retry]);

  const topBar = useMemo(
    () => ({
      eyebrow: dateEyebrow(weekdayLong(date), date),
      title: `${greetingVi(now)}, ${greetingName(displayName)}`,
    }),
    [date, now, displayName],
  );

  if (loading) {
    return (
      <Page topBar={topBar} label="Hôm nay">
        <TodaySkeleton />
      </Page>
    );
  }

  if (!data || !energy) {
    return (
      <Page topBar={topBar} label="Hôm nay">
        <div className="glass-card mt-6">
          <EmptyState
            icon={CloudOff}
            title="Chưa tải được dữ liệu"
            description={error ? 'Kiểm tra kết nối mạng rồi thử lại nhé.' : undefined}
            action={
              <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void reload()}>
                Thử lại
              </Button>
            }
          />
        </div>
      </Page>
    );
  }

  const s = data.summary;
  return (
    <Page topBar={topBar} label="Hôm nay">
      <h1 className="sr-only">Hôm nay</h1>
      <div className="flex flex-col gap-4">
        <Reveal delay={0}>
          <CalorieHero energy={energy} activityLevel={fit?.activity_level} />
        </Reveal>
        {failed.length > 0 && (
          <div
            role="alert"
            className="glass-card flex items-center gap-3 border border-[rgba(225,80,10,0.35)] px-4 py-3"
          >
            <WifiOff className="h-5 w-5 shrink-0 text-ember" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-text">
              Chưa tải được {failed.map((f) => PART_LABELS[f]).join(', ')}. Số liệu có thể chưa mới nhất.
            </p>
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className={clsx('h-4 w-4', retrying && 'animate-spin')} />}
              onClick={() => void onRetry()}
              disabled={retrying}
            >
              Thử lại
            </Button>
          </div>
        )}
        <Reveal delay={80}>
          <QuickActions date={date} suggestedMeal={suggestedMeal} onAddWater={quickWater} onLogSteps={openSteps} />
        </Reveal>
        <Reveal delay={110}>
          <QuickRelogStrip date={date} meal={suggestedMeal} meals={data.meals} onApplied={applyMeals} />
        </Reveal>
        <Reveal delay={140}>
          <InsightStrip insights={insights} />
        </Reveal>
        <Reveal delay={220}>
          <MacroCards summary={s} targets={targets} />
        </Reveal>
        <Reveal delay={320} className="mt-3">
          <MealsSection groups={groups} date={date} suggestedMeal={suggestedMeal} />
        </Reveal>
        <Reveal delay={420} className="mt-3">
          <h2 className="display mb-3 text-[26px] text-text">Nước &amp; vận động</h2>
          <div className="flex flex-col gap-3">
            <WaterCard waterMl={s.water_ml} targetMl={targets.water_ml} date={date} onAdd={onWaterAdd} />
            <StepsCard
              steps={s.steps}
              target={targets.steps}
              kcal={energy.stepsKcal}
              onSave={onStepsSave}
              open={stepsOpen}
              onOpenChange={setStepsOpen}
            />
          </div>
        </Reveal>
        <Reveal delay={520} className="mt-3">
          <WorkoutsSection workouts={data.workouts} onComplete={completeWorkout} />
        </Reveal>
      </div>
    </Page>
  );
}

function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Đang tải dữ liệu hôm nay">
      {/* hero: same box as the gauge (300×232 viewBox) + equation row, so nothing jumps */}
      <div className="glass-card px-5 pb-5 pt-4">
        <div className="relative mx-auto aspect-[300/232] w-full max-w-[300px]">
          <div className="absolute inset-x-0 top-[22%] flex flex-col items-center">
            <Skeleton width={96} height={11} />
            <Skeleton width={180} height={80} className="mt-3" />
            <Skeleton width={170} height={13} className="mt-2" />
          </div>
        </div>
        <div className="mt-1 grid grid-cols-3 gap-4">
          <Skeleton height={74} className="!rounded-2xl" />
          <Skeleton height={74} className="!rounded-2xl" />
          <Skeleton height={74} className="!rounded-2xl" />
        </div>
      </div>
      {/* quick actions */}
      <div className="grid grid-cols-3 gap-2.5">
        <Skeleton height={64} className="!rounded-2xl" />
        <Skeleton height={64} className="!rounded-2xl" />
        <Skeleton height={64} className="!rounded-2xl" />
      </div>
      {/* "Ăn lại nhanh" strip */}
      <div>
        <Skeleton width={130} height={18} />
        <Skeleton width={220} height={12} className="mt-2" />
        <div className="mt-3 flex gap-2.5 overflow-hidden">
          <Skeleton width={152} height={112} className="shrink-0 !rounded-2xl" />
          <Skeleton width={152} height={112} className="shrink-0 !rounded-2xl" />
          <Skeleton width={152} height={112} className="shrink-0 !rounded-2xl" />
        </div>
      </div>
      {/* insight */}
      <Skeleton height={68} rounded="card" />
      {/* macros + fiber line */}
      <div>
        <div className="grid grid-cols-3 gap-2.5">
          <Skeleton height={124} rounded="card" />
          <Skeleton height={124} rounded="card" />
          <Skeleton height={124} rounded="card" />
        </div>
        <Skeleton height={16} className="mt-2.5" />
      </div>
      {/* meals: header, scan CTA, list */}
      <div className="mt-3">
        <div className="mb-3 flex h-[44px] items-end justify-between">
          <Skeleton width={110} height={26} />
          <Skeleton width={70} height={14} />
        </div>
        <Skeleton height={76} rounded="card" />
        <Skeleton height={256} rounded="card" className="mt-3" />
      </div>
    </div>
  );
}
