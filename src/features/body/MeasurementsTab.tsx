import clsx from 'clsx';
import { ChevronRight, Flame, RefreshCw, Ruler, Scale, Target } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BigNumber } from '@/components/ui/BigNumber';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassCard } from '@/components/ui/GlassCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDayVi, parseISODate, weekdayShort } from '@/lib/date';
import { bmiCategory, calcBMI } from '@/lib/energy';
import { formatKg, formatNumber } from '@/lib/format';
import { errorMessage } from '@/services/errors';
import type { BodyMeasurement, FitProfile } from '@/types/db';
import { DeltaBadge } from './DeltaBadge';
import { CIRCUMFERENCES, deltaTone, fieldDelta, groupByMonth, latestValue, num, planRefresh, targetStatus, waistToHeight, weightStats, type WhtrKey } from './lib';
import { WeightChart } from './WeightChart';

const BMI_STYLE: Record<string, string> = {
  underweight: 'text-water border-[rgba(94,200,242,0.35)] bg-[rgba(94,200,242,0.1)]',
  normal: 'text-ok border-[rgba(127,209,139,0.35)] bg-[rgba(127,209,139,0.1)]',
  overweight: 'text-gold border-[rgba(237,180,11,0.35)] bg-[rgba(237,180,11,0.1)]',
  obese: 'text-[var(--danger-text)] border-[rgba(255,107,94,0.35)] bg-[rgba(255,107,94,0.1)]',
};

const WHTR_STYLE: Record<WhtrKey, string> = {
  low: BMI_STYLE.underweight,
  healthy: BMI_STYLE.normal,
  elevated: BMI_STYLE.overweight,
  high: BMI_STYLE.obese,
};

export interface MeasurementsTabProps {
  rows: BodyMeasurement[];
  loading: boolean;
  error: unknown;
  fit: FitProfile | null;
  onAdd: () => void;
  onEdit: (row: BodyMeasurement) => void;
  onRetry: () => void;
}

export function MeasurementsTab({ rows, loading, error, fit, onAdd, onEdit, onRetry }: MeasurementsTabProps) {
  const asc = rows; // already ascending
  const stats = useMemo(() => weightStats(asc, fit?.start_weight_kg), [asc, fit?.start_weight_kg]);
  const indexOf = useMemo(() => new Map(asc.map((r, i) => [r.id, i])), [asc]);
  const groups = useMemo(() => groupByMonth(asc, (r) => r.measured_on), [asc]);
  const goal = fit?.goal ?? null;
  const height = num(fit?.height_cm);
  const target = num(fit?.target_weight_kg);
  const derived = useMemo(() => {
    const bmi = stats.current !== null && height ? calcBMI(stats.current, height) : null;
    const waist = latestValue(asc, 'waist_cm');
    return {
      bmi,
      cat: bmi ? bmiCategory(bmi) : null,
      whtr: waist ? waistToHeight(waist.value, height) : null,
      waistDate: waist?.date ?? null,
      toTarget: targetStatus(stats.current, target, goal, stats.start),
      refresh: planRefresh(fit, stats.current),
    };
  }, [stats, height, asc, target, goal, fit]);

  if (loading && !rows.length) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Đang tải số đo">
        <Skeleton height={230} rounded="card" />
        <Skeleton height={210} rounded="card" />
        <Skeleton height={84} rounded="card" />
        <Skeleton height={84} rounded="card" />
      </div>
    );
  }

  if (error && !rows.length) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="Không tải được số đo"
        description={errorMessage(error)}
        action={<Button variant="secondary" onClick={onRetry} icon={<RefreshCw className="h-4 w-4" />}>Thử lại</Button>}
      />
    );
  }

  if (!rows.length) {
    return (
      <GlassCard padding="lg" className="animate-fade-slide-up">
        <EmptyState
          icon={Scale}
          title="Bắt đầu theo dõi cơ thể"
          description="Cân và đo vào cùng một thời điểm mỗi tuần (sáng, sau khi đi vệ sinh, trước ăn) để thấy xu hướng thật."
          action={<Button onClick={onAdd} icon={<Scale className="h-5 w-5" />}>Ghi lần cân đầu tiên</Button>}
        />
      </GlassCard>
    );
  }

  const { bmi, cat, whtr, waistDate, toTarget, refresh } = derived;

  return (
    <div className="flex flex-col gap-4">
      {/* Hero: latest weight */}
      <GlassCard padding="lg" className="overflow-hidden animate-fade-slide-up">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(225,80,10,0.32),transparent_65%)]" />
        {stats.current !== null ? (
          <>
            <BigNumber
              label={`Cân nặng · ${formatDayVi(stats.latest!.measured_on)}`}
              value={stats.current}
              decimals={1}
              unit="kg"
              size="lg"
              tone="gold"
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <DeltaStat label="So với lần trước" sub={stats.previousDate ? formatDayVi(stats.previousDate, 'short') : 'chưa có'} delta={stats.deltaPrev} tone={deltaTone('weight_kg', stats.deltaPrev, goal)} />
              <DeltaStat
                label="So với ban đầu"
                sub={stats.start !== null ? formatKg(stats.start) : 'chưa có'}
                delta={stats.deltaStart}
                tone={deltaTone('weight_kg', stats.deltaStart, goal)}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {bmi && cat ? (
                <span className={clsx('inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold', BMI_STYLE[cat.key])}>
                  BMI <span className="tabular">{formatNumber(bmi, 1)}</span>
                  <span className="font-semibold opacity-90">· {cat.label}</span>
                </span>
              ) : (
                <span className="text-[13px] text-muted">Thêm chiều cao trong Mục tiêu để tính BMI</span>
              )}
              {toTarget !== null && (
                <span className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-line bg-white/[0.04] px-3 text-[13px] font-semibold text-text/85">
                  <Target className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
                  {toTarget.reached
                    ? goal === 'maintain' || goal === 'recomp'
                      ? `Trong mục tiêu ${formatKg(target)}`
                      : `Đã đạt mục tiêu ${formatKg(target)}`
                    : `Còn ${toTarget.direction === 'down' ? 'giảm' : 'tăng'} ${formatKg(toTarget.remaining)} tới ${formatKg(target)}`}
                  {!toTarget.reached && toTarget.pct !== null && toTarget.pct > 0 && (
                    <span className="tabular text-muted">· {Math.round(toTarget.pct * 100)}%</span>
                  )}
                </span>
              )}
              {whtr && (
                <span
                  className={clsx('inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 text-[13px] font-bold', WHTR_STYLE[whtr.key])}
                  title={waistDate ? `Vòng eo ngày ${formatDayVi(waistDate, 'short')}` : undefined}
                >
                  Eo/cao <span className="tabular">{formatNumber(whtr.ratio, 2)}</span>
                  <span className="font-semibold opacity-90">· {whtr.label}</span>
                </span>
              )}
              {cat && cat.key !== 'normal' && (
                <p className="w-full text-[12px] leading-relaxed text-muted">
                  Theo ngưỡng BMI cho người châu Á: bình thường 18,5–22,9 · thừa cân 23–24,9 · béo phì từ 25.
                </p>
              )}
              {whtr && (whtr.key === 'elevated' || whtr.key === 'high') && (
                <p className="w-full text-[12px] leading-relaxed text-muted">Tỉ lệ vòng eo / chiều cao nên dưới 0,5 (eo dưới một nửa chiều cao).</p>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Ruler className="h-6 w-6 text-gold" aria-hidden="true" />
            <p className="text-sm text-muted">Bạn mới ghi vòng đo — thêm cân nặng để thấy xu hướng và BMI.</p>
          </div>
        )}
      </GlassCard>

      {refresh && (
        <Link
          to="/goals"
          className="glass-card flex items-center gap-3 p-3.5 transition-colors hover:bg-white/[0.08] animate-fade-slide-up"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/[0.06] text-gold">
            <Flame className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[14px] font-bold text-text">Cập nhật kế hoạch theo cân nặng mới</span>
            <span className="text-[12px] leading-snug text-muted">
              Mục tiêu hiện lưu <b className="tabular text-text/90">{formatNumber(refresh.from, 0)} kcal</b>, theo{' '}
              {formatKg(stats.current)} nên là <b className="tabular text-text/90">{formatNumber(refresh.to, 0)} kcal</b>.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
        </Link>
      )}

      {stats.count > 0 && (
        <GlassCard className="animate-fade-slide-up animate-delay-100">
          <WeightChart rows={asc} target={target} />
        </GlassCard>
      )}

      {/* History by month */}
      <section aria-label="Lịch sử số đo" className="flex flex-col gap-5 pt-2">
        <div className="flex items-end justify-between">
          <h2 className="display text-[26px] text-text">Lịch sử</h2>
          <span className="pb-1 text-[13px] text-muted">{rows.length} lần ghi</span>
        </div>
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-2.5">
            <h3 className="eyebrow pl-1 !text-[11px]">{g.label}</h3>
            <ul className="flex flex-col gap-2.5">
              {g.items.map((r) => (
                <HistoryRow key={r.id} row={r} idx={indexOf.get(r.id) ?? 0} rows={asc} goal={goal} onEdit={onEdit} />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

function DeltaStat({ label, sub, delta, tone }: { label: string; sub: string; delta: number | null; tone: ReturnType<typeof deltaTone> }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white/[0.03] px-3 py-2.5">
      <span className="text-[12px] font-semibold text-muted">{label}</span>
      {delta === null ? <span className="text-[15px] font-bold text-muted">—</span> : <DeltaBadge delta={delta} unit="kg" tone={tone} className="self-start !text-[13px]" />}
      <span className="text-[11px] text-muted">{sub}</span>
    </div>
  );
}

function HistoryRow({
  row,
  idx,
  rows,
  goal,
  onEdit,
}: {
  row: BodyMeasurement;
  idx: number;
  rows: BodyMeasurement[];
  goal: FitProfile['goal'];
  onEdit: (r: BodyMeasurement) => void;
}) {
  const w = num(row.weight_kg);
  const fat = num(row.body_fat_pct);
  const dW = fieldDelta(rows, idx, 'weight_kg');
  const circ = CIRCUMFERENCES.filter((c) => num(row[c.key]) !== null);
  const d = parseISODate(row.measured_on);
  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(row)}
        aria-label={`Sửa số đo ${formatDayVi(row.measured_on, 'long')}`}
        className="glass-card flex w-full items-stretch gap-3.5 p-3.5 text-left transition-transform duration-150 hover:bg-white/[0.08] active:scale-[0.985]"
      >
        <div className="flex w-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-white/[0.05] py-1.5">
          <span className="text-[10px] font-bold uppercase text-muted">{weekdayShort(row.measured_on)}</span>
          <span className="num text-[22px] text-text">{d.getDate()}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {w !== null ? (
              <>
                <span className="tabular text-[19px] font-extrabold tracking-[-0.03em] text-text">{formatKg(w)}</span>
                <DeltaBadge delta={dW} tone={deltaTone('weight_kg', dW, goal)} size="sm" />
              </>
            ) : (
              <span className="text-[14px] font-semibold text-muted">Chỉ vòng đo</span>
            )}
            {fat !== null && (
              <span className="inline-flex items-center gap-1 text-[12px] text-muted">
                · Mỡ <b className="tabular text-text/90">{formatNumber(fat, 1)}%</b>
                <DeltaBadge delta={fieldDelta(rows, idx, 'body_fat_pct')} tone={deltaTone('body_fat_pct', fieldDelta(rows, idx, 'body_fat_pct'), goal)} size="sm" />
              </span>
            )}
          </div>
          {circ.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {circ.map((c) => {
                const dl = fieldDelta(rows, idx, c.key);
                return (
                  <span key={c.key} className="inline-flex items-center gap-1 text-[12px] text-muted">
                    {c.label} <b className="tabular text-text/90">{formatNumber(num(row[c.key]), 1)}</b>
                    {dl !== null && Math.abs(dl) >= 0.05 && (
                      <span className={clsx('tabular text-[11px] font-bold', deltaTone(c.key, dl, goal) === 'good' ? 'text-ok' : deltaTone(c.key, dl, goal) === 'bad' ? 'text-[var(--danger-text)]' : 'text-text/60')}>
                        {dl > 0 ? '+' : '−'}
                        {formatNumber(Math.abs(dl), 1)}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          )}
          {row.note && <p className="truncate text-[12px] italic text-muted">{row.note}</p>}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 self-center text-muted" aria-hidden="true" />
      </button>
    </li>
  );
}
