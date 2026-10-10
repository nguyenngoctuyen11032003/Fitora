import clsx from 'clsx';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
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
import { StepsCard } from './components/StepsCard';
import { WaterCard } from './components/WaterCard';
import { WorkoutsSection } from './components/WorkoutsSection';
import { buildInsights } from './insights';
import { dateEyebrow, effectiveWeight, energyBalance, greetingName, groupMeals, mealForHour, targetsFromProfile } from './metrics';
import { useTodayData } from './useTodayData';

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
  const { date, data, loading, error, reload, setWater, setSteps, completeWorkout } = useTodayData((e) => toast.error(e));

  const hour = new Date().getHours();
  const targets = useMemo(() => targetsFromProfile(fit), [fit]);
  const weight = effectiveWeight(data?.latestWeightKg, fit?.start_weight_kg);
  const energy = useMemo(
    () => (data ? energyBalance(data.summary, targets.kcal, weight) : null),
    [data, targets.kcal, weight],
  );
  const groups = useMemo(() => groupMeals(data?.meals ?? [], MEAL_TYPES), [data?.meals]);
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
    });
  }, [data, energy, targets, weight, hour]);

  const topBar = {
    eyebrow: dateEyebrow(weekdayLong(date), date),
    title: `${greetingVi()}, ${greetingName(displayName)}`,
  };

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
          <CalorieHero energy={energy} />
        </Reveal>
        <Reveal delay={120}>
          <InsightStrip insights={insights} />
        </Reveal>
        <Reveal delay={220}>
          <MacroCards summary={s} targets={targets} />
        </Reveal>
        <Reveal delay={320} className="mt-3">
          <MealsSection groups={groups} date={date} suggestedMeal={mealForHour(hour)} />
        </Reveal>
        <Reveal delay={420} className="mt-3">
          <h2 className="display mb-3 text-[26px] text-text">Nước &amp; vận động</h2>
          <div className="flex flex-col gap-3">
            <WaterCard waterMl={s.water_ml} targetMl={targets.water_ml} date={date} onSet={(ml) => void setWater(ml)} />
            <StepsCard steps={s.steps} target={targets.steps} kcal={energy.stepsKcal} onSave={(n) => void setSteps(n)} />
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
      <div className="glass-card flex flex-col items-center px-5 pb-5 pt-8">
        <Skeleton width={110} height={11} />
        <Skeleton width={190} height={76} className="mt-5" />
        <Skeleton width={150} height={12} className="mt-4" />
        <div className="mt-10 grid w-full grid-cols-3 gap-2">
          <Skeleton height={68} />
          <Skeleton height={68} />
          <Skeleton height={68} />
        </div>
      </div>
      <Skeleton height={68} rounded="card" />
      <div className="grid grid-cols-3 gap-2.5">
        <Skeleton height={124} rounded="card" />
        <Skeleton height={124} rounded="card" />
        <Skeleton height={124} rounded="card" />
      </div>
      <Skeleton height={76} rounded="card" className="mt-3" />
      <Skeleton height={256} rounded="card" />
    </div>
  );
}
