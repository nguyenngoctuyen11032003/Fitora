import { BarChart3, NotebookPen, RefreshCw, ScanLine } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { Button, EmptyState, GlassCard, ScreenHeader, Skeleton, useToast } from '@/components/ui';
import { useProfile } from '@/context/ProfileContext';
import { todayISO } from '@/lib/date';
import { onDataChanged } from '@/lib/events';
import { useAsync, useReducedMotion } from '@/lib/hooks';
import { latestWeight, listMeasurements } from '@/services/body';
import { listCustomFoods, saveEntryAsFood } from '@/services/foods';
import { listMealsRange } from '@/services/meals';
import { getRangeSummary } from '@/services/summary';
import { GOAL_LABELS } from '@/types/db';
import { buildFoodReport, type FoodStat } from './foodStats';
import { buildReport, canGoNext, isCurrentPeriod, periodCaption, periodLabel, periodRange, shiftPeriod, type Period } from './lib';
import { CalorieSection, CompletionSection, FoodSection, Headline, InsightsSection, LinkCards, MacroSection, PeriodNav, WeightSection } from './sections';

const PERIOD_KEY = 'fitora.reports.period';

function readPeriod(): Period {
  try {
    return localStorage.getItem(PERIOD_KEY) === 'month' ? 'month' : 'week';
  } catch {
    return 'week';
  }
}

export default function ReportsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { fit } = useProfile();
  const today = todayISO();

  const [period, setPeriod] = useState<Period>(readPeriod);
  const [anchor, setAnchor] = useState(today);
  const { from, to } = periodRange(period, anchor);
  const prevRange = periodRange(period, shiftPeriod(period, anchor, -1));
  const key = `${from}|${to}`;

  // useAsync drops stale responses (token), and `fresh` below is keyed by range, so rapid
  // prev/next/period switching never shows data from a superseded request.
  const { data, error, loading, reload } = useAsync(async () => {
    const [rows, prevRows, latest, measurements, entries, savedFoods] = await Promise.all([
      getRangeSummary(from, to),
      // Comparison is a nice-to-have: never fail the whole report because of it.
      getRangeSummary(prevRange.from, prevRange.to).catch(() => null),
      latestWeight().catch(() => null),
      listMeasurements(from, to).catch(() => []),
      // Food insights are optional as well.
      listMealsRange(from, to).catch(() => null),
      listCustomFoods().catch(() => []),
    ]);
    return { key: `${from}|${to}`, rows, prevRows, prev: prevRange, latest, measurements, entries, savedFoods };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => onDataChanged(() => void reload()), [reload]);
  useEffect(() => {
    if (error) toast.error(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const changePeriod = (p: Period) => {
    setPeriod(p);
    try {
      localStorage.setItem(PERIOD_KEY, p);
    } catch {
      /* ignore */
    }
  };

  const fresh = data && data.key === key ? data : undefined;

  const summary = useMemo(() => {
    if (!fresh) return null;
    return buildReport({
      rows: fresh.rows,
      from,
      to,
      period,
      today,
      profile: fit,
      refWeightKg: fresh.latest?.weight_kg ?? null,
    });
  }, [fresh, from, to, period, today, fit]);

  const prevSummary = useMemo(() => {
    if (!fresh?.prevRows) return null;
    return buildReport({
      rows: fresh.prevRows,
      from: fresh.prev.from,
      to: fresh.prev.to,
      period,
      today,
      profile: fit,
      refWeightKg: fresh.latest?.weight_kg ?? null,
    });
  }, [fresh, period, today, fit]);

  const foodReport = useMemo(
    () => (fresh?.entries ? buildFoodReport(fresh.entries, fresh.savedFoods, { from, to, today }) : null),
    [fresh, from, to, today],
  );

  // "Lưu" on a frequent dish → it becomes a saved food, re-loggable with one tap next time.
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const saveFood = async (stat: FoodStat) => {
    if (savingKey) return;
    setSavingKey(stat.key);
    try {
      const food = await saveEntryAsFood(stat.latest);
      toast.success(`Đã lưu “${food.name}” vào Món của tôi. Lần sau chỉ cần chọn.`);
      await reload();
    } catch (e) {
      toast.error(e);
    } finally {
      setSavingKey(null);
    }
  };

  const waistDelta = useMemo(() => {
    const ws = (fresh?.measurements ?? []).filter((m) => m.waist_cm != null);
    return ws.length >= 2 ? Math.round(((ws[ws.length - 1].waist_cm as number) - (ws[0].waist_cm as number)) * 10) / 10 : null;
  }, [fresh]);

  const isCurrent = isCurrentPeriod(period, anchor, today);
  const monthly = period === 'month';
  const animate = !reduced;
  const goalLabel = fit?.goal ? GOAL_LABELS[fit.goal] : null;
  const empty = summary && summary.loggedDays === 0 && summary.weightPoints.length === 0 && summary.days.every((d) => !d.steps && !d.water && !d.workoutKcal);

  return (
    <Page label="Tiến trình">
      <ScreenHeader eyebrow="Tiến trình" title="Báo cáo" subtitle={goalLabel ? `Mục tiêu: ${goalLabel}` : undefined} />

      <div className="mt-6">
        <PeriodNav
          period={period}
          onPeriod={changePeriod}
          label={periodLabel(period, anchor)}
          caption={periodCaption(period, anchor, today)}
          onPrev={() => setAnchor((a) => shiftPeriod(period, a, -1))}
          onNext={() => setAnchor((a) => (canGoNext(period, a, today) ? shiftPeriod(period, a, 1) : a))}
          nextDisabled={!canGoNext(period, anchor, today)}
          onReset={() => setAnchor(today)}
          isCurrent={isCurrent}
        />
      </div>

      <div className="mt-5 flex flex-col gap-4" aria-busy={loading}>
        {!summary && loading && <ReportSkeleton />}

        {!summary && !loading && error != null && (
          <GlassCard>
            <EmptyState
              icon={BarChart3}
              title="Không tải được báo cáo"
              description="Kiểm tra kết nối mạng rồi thử lại."
              action={
                <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void reload()}>
                  Thử lại
                </Button>
              }
            />
          </GlassCard>
        )}

        {summary && empty && (
          <GlassCard className="animate-fade-slide-up">
            <EmptyState
              icon={BarChart3}
              title={isCurrent ? 'Chưa có gì để báo cáo' : 'Kỳ này trống'}
              description={
                isCurrent
                  ? 'Ghi bữa ăn, buổi tập hoặc cân nặng — Fitora sẽ tổng hợp thâm hụt, xu hướng cân nặng và đánh giá tiến độ cho bạn.'
                  : 'Không có bữa ăn, buổi tập hay số cân nào trong khoảng thời gian này.'
              }
              action={
                isCurrent ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button icon={<ScanLine className="h-4 w-4" />} onClick={() => navigate('/scan')}>
                      Scan món ăn
                    </Button>
                    <Button variant="secondary" icon={<NotebookPen className="h-4 w-4" />} onClick={() => navigate('/diary')}>
                      Mở nhật ký
                    </Button>
                  </div>
                ) : (
                  <Button variant="secondary" onClick={() => setAnchor(today)}>
                    Về kỳ hiện tại
                  </Button>
                )
              }
            />
          </GlassCard>
        )}

        {summary && !empty && (
          <>
            <Headline s={summary} goalLabel={goalLabel} />
            <div className="animate-fade-slide-up animate-delay-100">
              <InsightsSection s={summary} prev={prevSummary} period={period} goal={fit?.goal ?? null} proteinTarget={fit?.protein_g ?? null} />
            </div>
            <div className="animate-fade-slide-up animate-delay-100">
              <CalorieSection s={summary} animate={animate} monthly={monthly} />
            </div>
            <div className="animate-fade-slide-up animate-delay-200">
              <MacroSection s={summary} fit={fit} />
            </div>
            {foodReport && (
              <div className="animate-fade-slide-up animate-delay-200">
                <FoodSection report={foodReport} period={period} onSave={(f) => void saveFood(f)} savingKey={savingKey} />
              </div>
            )}
            <div className="animate-fade-slide-up animate-delay-300">
              <WeightSection
                s={summary}
                goal={fit?.goal ?? null}
                animate={animate}
                monthly={monthly}
                waistDelta={waistDelta}
                latestKnown={fresh?.latest?.weight_kg ? { kg: fresh.latest.weight_kg, on: fresh.latest.measured_on } : null}
              />
            </div>
            <div className="mt-2 animate-fade-slide-up animate-delay-400">
              <CompletionSection s={summary} />
            </div>
          </>
        )}

        <div className="mt-2">
          <LinkCards />
        </div>
      </div>
    </Page>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Đang tải báo cáo">
      <div className="glass-card p-6">
        <Skeleton width={180} height={11} />
        <Skeleton width="72%" height={72} className="mt-5" />
        <Skeleton width={160} height={14} className="mt-3" />
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      </div>
      <div className="glass-card p-5">
        <Skeleton width={120} height={11} />
        <Skeleton width={190} height={22} className="mt-2" />
        <Skeleton height={200} className="mt-5" />
      </div>
      <Skeleton height={170} rounded="card" />
    </div>
  );
}
