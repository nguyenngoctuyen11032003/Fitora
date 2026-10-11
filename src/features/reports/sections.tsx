import clsx from 'clsx';
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Footprints,
  Info,
  Lightbulb,
  Ruler,
  Scale,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button, CountUp, GlassButton, GlassCard, MacroBar, ProgressBar, Segmented, Skeleton } from '@/components/ui';
import { bmiCategory } from '@/lib/energy';
import { formatKcal, formatKg, formatMl, formatNumber, formatSigned } from '@/lib/format';
import { formatDayVi } from '@/lib/date';
import type { FitProfile, Goal } from '@/types/db';
import { MIN_ENTRIES_FOR_FOODS, type FoodReport, type FoodStat } from './foodStats';
import { buildInsights, comparePeriods, type Insight, type InsightKind } from './insights';
import { ddmm, type DayPoint, type Period, type ReportSummary, type VerdictTone } from './lib';

// recharts is heavy → its own chunk; the headline and stats paint before it arrives.
const CalorieChart = lazy(() => import('./charts').then((m) => ({ default: m.CalorieChart })));
const WeightChart = lazy(() => import('./charts').then((m) => ({ default: m.WeightChart })));

// ───────────────────────── Shared bits ─────────────────────────

export function SectionTitle({ eyebrow, title, right }: { eyebrow?: string; title: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="display text-[22px] text-text">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted">
      {dashed ? (
        <span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: color }} aria-hidden="true" />
      ) : (
        <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

/**
 * Fixed-height chart slot (no CLS while recharts loads), with a text summary for screen readers
 * and a visually hidden data table as the accessible equivalent of the chart.
 */
function ChartFrame({
  height,
  label,
  caption,
  columns,
  rows,
  children,
}: {
  height: number;
  label: string;
  caption: string;
  columns: string[];
  rows: (string | number)[][];
  children: ReactNode;
}) {
  return (
    <div className="-mx-1 min-w-0">
      <div className="w-full min-w-0 overflow-hidden" style={{ height }} role="img" aria-label={label}>
        <Suspense fallback={<Skeleton height={height} className="w-full" />}>{children}</Suspense>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])}>
              {r.map((v, i) => (i === 0 ? <th key={i} scope="row">{v}</th> : <td key={i}>{v}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const elapsedOnly = (days: DayPoint[]) => days.filter((d) => !d.future);

// ───────────────────────── Period navigation ─────────────────────────

export function PeriodNav({
  period,
  onPeriod,
  label,
  caption,
  onPrev,
  onNext,
  nextDisabled,
  onReset,
  isCurrent,
}: {
  period: Period;
  onPeriod: (p: Period) => void;
  label: string;
  caption: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  onReset: () => void;
  isCurrent: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Segmented<Period>
        ariaLabel="Chọn kỳ báo cáo"
        value={period}
        onChange={onPeriod}
        options={[
          { value: 'week', label: 'Tuần' },
          { value: 'month', label: 'Tháng' },
        ]}
      />
      <div className="flex items-center justify-between gap-2">
        <GlassButton label={period === 'week' ? 'Tuần trước' : 'Tháng trước'} onClick={onPrev}>
          <ChevronLeft className="h-5 w-5" />
        </GlassButton>
        <button
          type="button"
          onClick={onReset}
          disabled={isCurrent}
          className="flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center rounded-2xl px-2 transition-colors enabled:hover:bg-white/[0.04]"
          aria-label={isCurrent ? `${caption}: ${label}` : `${label}. Chạm để về kỳ hiện tại`}
        >
          <span className="tabular truncate text-[17px] font-extrabold tracking-[-0.02em] text-text" aria-live="polite">
            {label}
          </span>
          <span className={clsx('text-[12px] font-semibold', isCurrent ? 'text-gold' : 'text-muted')}>
            {isCurrent ? caption : `${caption} · Về hiện tại`}
          </span>
        </button>
        <GlassButton label={period === 'week' ? 'Tuần sau' : 'Tháng sau'} onClick={onNext} disabled={nextDisabled}>
          <ChevronRight className="h-5 w-5" />
        </GlassButton>
      </div>
    </div>
  );
}

// ───────────────────────── (1) Headline ─────────────────────────

const TONE: Record<VerdictTone, { icon: LucideIcon; cls: string; num: string }> = {
  good: { icon: CheckCircle2, cls: 'border-[rgba(127,209,139,0.3)] bg-[rgba(127,209,139,0.08)] text-ok', num: 'text-gradient-gold' },
  warn: { icon: AlertTriangle, cls: 'border-[rgba(237,180,11,0.3)] bg-[rgba(237,180,11,0.08)] text-gold', num: 'text-gradient-gold' },
  bad: { icon: XCircle, cls: 'border-[rgba(255,107,94,0.3)] bg-[rgba(225,6,0,0.1)] text-[var(--danger-text)]', num: 'text-gradient-ember' },
  neutral: { icon: Info, cls: 'border-line bg-white/[0.04] text-muted', num: 'text-gradient' },
};

export function Headline({ s, goalLabel }: { s: ReportSummary; goalLabel: string | null }) {
  const t = TONE[s.verdict.tone];
  const VIcon = t.icon;
  const hasBalance = s.countedDays > 0 && s.maintenance != null;
  const deficit = s.balance < 0;
  const digits = formatNumber(Math.abs(s.balance)).length + 1;
  const numSize = digits <= 5 ? 'text-[84px]' : digits <= 6 ? 'text-[72px]' : 'text-[60px]';

  const notes: string[] = [];
  if (s.todayPending) notes.push('chưa tính hôm nay (chưa hết ngày)');
  if (s.partialDays > 0) notes.push(`bỏ qua ${s.partialDays} ngày ghi dưới ${formatNumber(s.partialThreshold)} kcal (có thể thiếu bữa)`);

  let emptyText: string;
  if (s.loggedDays === 0) emptyText = 'Chưa có bữa ăn nào được ghi trong kỳ này.';
  else if (s.maintenance == null) emptyText = 'Cần thông tin hồ sơ (giới tính, ngày sinh, chiều cao, cân nặng, mức vận động) để tính thâm hụt.';
  else if (s.partialDays > 0)
    emptyText = `Các ngày đã qua đều ghi dưới ${formatNumber(s.partialThreshold)} kcal nên chưa đủ tin cậy để tính thâm hụt. Hãy ghi đủ các bữa trong ngày.`;
  else emptyText = 'Hôm nay chưa kết thúc — cân bằng năng lượng sẽ được tính từ ngày mai, khi có ngày ghi trọn vẹn.';

  return (
    <GlassCard padding="lg" className="overflow-hidden animate-fade-slide-up">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[rgba(225,80,10,0.2)] blur-3xl" aria-hidden="true" />
      <p className="eyebrow relative">
        Cân bằng năng lượng
      </p>

      {hasBalance ? (
        <>
          <div className="relative mt-4 flex items-end gap-2 animate-speed-reveal">
            <span className={clsx('num pb-[0.06em] pr-[0.04em]', numSize, t.num)}>
              {s.balance === 0 ? '' : deficit ? '−' : '+'}
              <CountUp value={Math.abs(s.balance)} />
            </span>
            <span className="mb-[0.3em] text-lg font-bold text-muted">kcal</span>
          </div>
          <p className="relative mt-2 text-[15px] font-semibold text-text">
            {s.balance === 0 ? 'Cân bằng' : deficit ? 'Thâm hụt' : 'Dư thừa'}
            <span className="font-medium text-muted">
              {' '}
              so với tiêu hao ước tính · {s.countedDays} ngày
            </span>
          </p>

          <dl className="relative mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-white/[0.03] px-3.5 py-3">
              <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                {deficit ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                Cân nặng ước tính
              </dt>
              <dd className="tabular mt-1 text-[22px] font-extrabold tracking-[-0.03em] text-text">
                <span className="mr-0.5 text-[15px] text-muted">≈</span>
                {Math.abs(s.estWeightChangeKg) < 0.05 ? '±0' : formatSigned(s.estWeightChangeKg, 1)}
                <span className="ml-1 text-[13px] font-bold text-muted">kg</span>
              </dd>
              {s.countedDays !== 7 && Math.abs(s.estWeeklyChangeKg) >= 0.05 && (
                <p className="tabular text-[11.5px] text-muted">≈ {formatSigned(s.estWeeklyChangeKg, 1)} kg/tuần</p>
              )}
            </div>
            <div className="rounded-2xl border border-line bg-white/[0.03] px-3.5 py-3">
              <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                <Target className="h-3.5 w-3.5" />
                Nạp TB vs mục tiêu
              </dt>
              <dd className="tabular mt-1 text-[22px] font-extrabold tracking-[-0.03em] text-text">
                {s.target != null ? formatSigned(s.avgDailyVsTarget) : '—'}
                <span className="ml-1 text-[13px] font-bold text-muted">kcal/ngày</span>
              </dd>
              {s.target != null && (
                <p className="tabular text-[11.5px] text-muted">
                  {formatNumber(s.avgIn)} / {formatNumber(s.target)} kcal
                </p>
              )}
            </div>
          </dl>
        </>
      ) : (
        <p className="relative mt-3 text-[15px] text-muted">{emptyText}</p>
      )}

      <div className={clsx('relative mt-4 flex gap-3 rounded-2xl border px-3.5 py-3', t.cls)} role="status">
        <VIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[15px] font-bold">
            {s.verdict.title}
            {goalLabel && s.verdict.tone !== 'neutral' && <span className="font-medium text-muted"> · {goalLabel}</span>}
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-[rgba(237,228,216,0.82)]">{s.verdict.text}</p>
        </div>
      </div>

      {hasBalance && (
        <p className="relative mt-3 text-[11.5px] leading-relaxed text-muted">
          Tiêu hao ước tính TB ~{formatKcal(s.avgExpenditure)}/ngày: nhu cầu duy trì ~{formatKcal(s.maintenance)}
          {s.maintenanceBasis === 'target' ? ' (suy từ mục tiêu)' : ' theo hồ sơ'}, cộng thêm khi vận động ghi lại vượt mức thường ngày. Chỉ
          tính ngày ghi đủ{notes.length ? `; ${notes.join('; ')}` : ''}. 7.700 kcal ≈ 1 kg.
        </p>
      )}
    </GlassCard>
  );
}

// ───────────────────────── (2) Calorie trend ─────────────────────────

export function CalorieSection({ s, animate, monthly }: { s: ReportSummary; animate: boolean; monthly: boolean }) {
  return (
    <GlassCard padding="md" as="section" aria-labelledby="rp-cal">
      <SectionTitle eyebrow="Xu hướng calo" title={<span id="rp-cal">Nạp vào & tiêu hao</span>} />
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
        <LegendDot color="var(--gold)" label="Nạp vào" />
        <LegendDot color="var(--burn)" label="Tiêu hao (tập + bước)" />
        {s.target != null && <LegendDot color="var(--text)" label="Mục tiêu" dashed />}
      </div>
      <CalorieFrame s={s} animate={animate} monthly={monthly} />
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
        <Stat
          label="TB nạp vào / ngày"
          value={s.loggedDays ? formatNumber(s.avgIn) : '—'}
          unit="kcal"
          sub={s.avgBasisDays ? avgBasisText(s) : undefined}
        />
        <Stat
          label="TB vận động / ngày"
          value={s.trackedDays ? formatNumber(s.avgBurned) : '—'}
          unit="kcal"
          sub={s.trackedDays ? `Tập + bước · ${s.trackedDays} ngày có dữ liệu` : 'Tập luyện + bước chân'}
        />
      </div>
    </GlassCard>
  );
}

/** Explicit averaging basis — the same day count as the macro eyebrow ("Trung bình N ngày"). */
function avgBasisText(s: ReportSummary): string {
  return s.avgBasisIncomplete ? 'Gồm hôm nay (chưa hết ngày)' : `Trên ${s.avgBasisDays} ngày ghi đủ`;
}

function CalorieFrame({ s, animate, monthly }: { s: ReportSummary; animate: boolean; monthly: boolean }) {
  const rows = useMemo(
    () =>
      elapsedOnly(s.days).map((d) => [
        `${d.tick} ${ddmm(d.day)}`,
        d.logged ? formatKcal(d.kcalIn) : 'Chưa ghi',
        formatKcal(d.burned),
        d.budget != null ? formatKcal(d.budget) : '—',
      ]),
    [s.days],
  );
  const label =
    s.loggedDays > 0
      ? `Biểu đồ calo theo ngày: nạp trung bình ${formatNumber(s.avgIn)} kcal${s.target != null ? `, mục tiêu ${formatNumber(s.target)} kcal` : ''}, ${s.loggedDays}/${s.elapsedDays} ngày có ghi.`
      : 'Biểu đồ calo theo ngày: chưa có dữ liệu.';
  return (
    <ChartFrame height={monthly ? 220 : 232} label={label} caption="Calo theo ngày" columns={['Ngày', 'Nạp vào', 'Vận động', 'Ngân sách']} rows={rows}>
      <CalorieChart days={s.days} target={s.target} animate={animate} monthly={monthly} />
    </ChartFrame>
  );
}

function Stat({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <p className="tabular mt-0.5 text-[22px] font-extrabold tracking-[-0.03em] text-text">
        {value}
        {unit && <span className="ml-1 text-[12px] font-bold text-muted">{unit}</span>}
      </p>
      {sub && <p className="text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

// ───────────────────────── (3) Macros ─────────────────────────

export function MacroSection({ s, fit }: { s: ReportSummary; fit: FitProfile | null }) {
  const targets = fit ? { protein_g: fit.protein_g ?? 0, carbs_g: fit.carbs_g ?? 0, fat_g: fit.fat_g ?? 0 } : null;
  return (
    <GlassCard padding="md" as="section" aria-labelledby="rp-macro">
      <SectionTitle
        eyebrow={s.avgBasisIncomplete ? 'Trung bình · gồm hôm nay' : `Trung bình ${s.avgBasisDays} ngày`}
        title={<span id="rp-macro">Dinh dưỡng</span>}
        right={
          s.target != null && s.loggedDays > 0 ? (
            <span className="tabular shrink-0 text-right text-[13px] text-muted">
              <span className="font-bold text-text">{formatNumber(s.avgIn)}</span> / {formatNumber(s.target)} kcal
            </span>
          ) : undefined
        }
      />
      {s.loggedDays === 0 ? (
        <p className="text-sm text-muted">Chưa có dữ liệu dinh dưỡng trong kỳ này.</p>
      ) : (
        <>
          <MacroBar {...s.avgMacros} targets={targets} variant="rows" />
          {s.macroSplit && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="mb-2 text-[12px] font-semibold text-muted">Tỷ lệ năng lượng từ macro</p>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                <span style={{ width: `${s.macroSplit.protein}%`, background: 'var(--protein)' }} />
                <span style={{ width: `${s.macroSplit.carbs}%`, background: 'var(--carbs)' }} />
                <span style={{ width: `${s.macroSplit.fat}%`, background: 'var(--fat)' }} />
              </div>
              <p className="tabular mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-semibold text-muted">
                <LegendDot color="var(--protein)" label={`Đạm ${s.macroSplit.protein}%`} />
                <LegendDot color="var(--carbs)" label={`Tinh bột ${s.macroSplit.carbs}%`} />
                <LegendDot color="var(--fat)" label={`Chất béo ${s.macroSplit.fat}%`} />
              </p>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}

// ───────────────────────── (4) Weight & BMI ─────────────────────────

export function WeightSection({
  s,
  animate,
  monthly,
  waistDelta,
  latestKnown,
  goal,
}: {
  goal: Goal | null;
  s: ReportSummary;
  animate: boolean;
  monthly: boolean;
  waistDelta: number | null;
  latestKnown: { kg: number; on: string } | null;
}) {
  const n = s.weightPoints.length;
  const bmi = s.bmiLast;
  const cat = bmi ? bmiCategory(bmi) : null;
  // Colour the weight change by whether it moves toward the goal.
  const toward = (d: number | null) =>
    d == null || d === 0 || !goal || goal === 'recomp' || goal === 'maintain' ? undefined : (goal === 'lose') === d < 0 ? 'text-ok' : 'text-gold';
  return (
    <GlassCard padding="md" as="section" aria-labelledby="rp-weight">
      <SectionTitle
        eyebrow="Cân nặng & BMI"
        title={<span id="rp-weight">Cơ thể</span>}
        right={
          <Link to="/body" className="glass pill min-h-[44px] shrink-0 text-[13px] font-semibold" aria-label="Ghi cân nặng">
            <Scale className="h-4 w-4" /> Ghi cân
          </Link>
        }
      />
      {n >= 2 ? (
        <>
          {s.weightTrend && (
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
              <LegendDot color="var(--gold)" label="Cân nặng" />
              <LegendDot color="var(--ember)" label="Xu hướng" dashed />
            </div>
          )}
          <ChartFrame
            height={monthly ? 180 : 194}
            label={`Biểu đồ cân nặng: ${n} lần cân, từ ${formatKg(s.weightFirst)} đến ${formatKg(s.weightLast)}${
              s.weightTrend ? `, xu hướng ${formatSigned(s.weightTrend.slopeKgPerWeek, 1)} kg/tuần` : ''
            }.`}
            caption="Cân nặng theo ngày"
            columns={['Ngày', 'Cân nặng', 'BMI']}
            rows={s.weightPoints.map((p) => [ddmm(p.day), formatKg(p.weight), p.bmi != null ? formatNumber(p.bmi, 1) : '—'])}
          >
            <WeightChart days={s.days} animate={animate} monthly={monthly} />
          </ChartFrame>
        </>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-4 text-[13px] leading-relaxed text-muted">
          <Scale className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
          {n === 1
            ? 'Mới có 1 lần cân trong kỳ. Cân thêm để thấy xu hướng.'
            : latestKnown
              ? `Chưa cân trong kỳ này. Lần gần nhất: ${formatKg(latestKnown.kg)} (${formatDayVi(latestKnown.on, 'long')}).`
              : 'Chưa có số cân nào. Cân 2–3 lần mỗi tuần, cùng giờ buổi sáng để xu hướng chính xác.'}
        </div>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4">
        <Stat label="Lần cân cuối" value={s.weightLast != null ? formatNumber(s.weightLast, 1) : '—'} unit={s.weightLast != null ? 'kg' : undefined} />
        <Stat
          label="Thay đổi"
          value={
            s.weightDelta != null ? (
              <span className={toward(s.weightDelta)}>{formatSigned(s.weightDelta, 1)}</span>
            ) : (
              '—'
            )
          }
          unit={s.weightDelta != null ? 'kg' : undefined}
        />
        <Stat label="BMI" value={bmi ? formatNumber(bmi, 1) : '—'} sub={cat?.label} />
      </div>
      {s.weightTrend && (
        <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-muted">
          {s.weightTrend.slopeKgPerWeek < 0 ? (
            <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          ) : (
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          )}
          <span className="min-w-0">
            Xu hướng{' '}
            <span className={clsx('tabular whitespace-nowrap font-bold text-text', toward(s.weightTrend.slopeKgPerWeek))}>
              {Math.abs(s.weightTrend.slopeKgPerWeek) < 0.05 ? '±0' : formatSigned(s.weightTrend.slopeKgPerWeek, 1)} kg/tuần
            </span>{' '}
            <span className="text-[11.5px]">· tính trên {n} lần cân, ít bị nhiễu hơn so sánh đầu–cuối</span>
          </span>
        </p>
      )}
      {waistDelta != null && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
          <Ruler className="h-4 w-4 text-gold" aria-hidden="true" />
          Vòng eo: <span className="tabular font-bold text-text">{formatSigned(waistDelta, 1)} cm</span> trong kỳ
        </p>
      )}
    </GlassCard>
  );
}

// ───────────────────────── (5) Goal completion ─────────────────────────

function Tile({
  icon: Icon,
  color,
  label,
  value,
  of,
  progress,
  caption,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: ReactNode;
  of?: ReactNode;
  progress?: number;
  caption?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-[20px] border border-line bg-white/[0.03] p-3.5">
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
        <Icon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </span>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="num text-[34px] text-text">{value}</span>
        {of && <span className="tabular text-[14px] font-bold text-muted">{of}</span>}
      </p>
      {progress != null && <ProgressBar value={progress} max={1} color={color} height={5} showOver={false} className="mt-2.5" label={label} />}
      {caption && <p className="mt-2 text-[11.5px] leading-snug text-muted">{caption}</p>}
    </div>
  );
}

export function CompletionSection({ s }: { s: ReportSummary }) {
  const e = Math.max(1, s.elapsedDays);
  return (
    <section aria-labelledby="rp-done">
      <SectionTitle eyebrow="Hoàn thành mục tiêu" title={<span id="rp-done">Kỷ luật</span>} />
      <div className="grid grid-cols-2 gap-3">
        <Tile
          icon={Target}
          color="var(--gold)"
          label="Đúng calo"
          value={s.onTargetDays}
          of={`/${s.elapsedDays}`}
          progress={s.onTargetDays / e}
          caption="Ngày nạp trong ±10% ngân sách"
        />
        <Tile
          icon={CalendarCheck}
          color="var(--ember)"
          label="Chuỗi ghi nhật ký"
          value={s.longestStreak}
          of="ngày"
          caption={`Dài nhất trong kỳ · ${s.loggedDays} ngày có ghi`}
        />
        <Tile
          icon={Droplets}
          color="var(--water)"
          label="Đủ nước"
          value={s.waterHitDays}
          of={`/${s.elapsedDays}`}
          progress={s.waterHitDays / e}
          caption={`Mục tiêu ${formatMl(s.waterTarget)}/ngày`}
        />
        <Tile
          icon={Footprints}
          color="var(--fiber)"
          label="Bước TB / ngày"
          value={s.stepDays ? (s.avgSteps >= 10000 ? `${formatNumber(s.avgSteps / 1000, 1)}k` : formatNumber(s.avgSteps)) : '—'}
          progress={s.stepTarget ? Math.min(1, s.avgSteps / s.stepTarget) : undefined}
          caption={`${s.stepHitDays} ngày đạt ${formatNumber(s.stepTarget)} bước`}
        />
      </div>
    </section>
  );
}

// ───────────────────────── Insights ─────────────────────────

const INSIGHT_ICON: Record<InsightKind, LucideIcon> = {
  consistency: CalendarCheck,
  best: Trophy,
  protein: Target,
  trend: TrendingDown,
  compare: Sparkles,
  nudge: Lightbulb,
};

function Delta({ label, value, unit, digits = 0 }: { label: string; value: number | null; unit: string; digits?: 0 | 1 }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white/[0.03] px-3 py-2.5">
      <p className="truncate text-[11.5px] font-semibold text-muted">{label}</p>
      <p className="tabular mt-0.5 text-[16px] font-extrabold tracking-[-0.02em] text-text">
        {value == null ? '—' : value === 0 ? '±0' : formatSigned(value, digits)}
        {value != null && <span className="ml-1 text-[11px] font-bold text-muted">{unit}</span>}
      </p>
    </div>
  );
}

/** Short summary of the period + comparison with the previous one. Wording is never shaming. */
export function InsightsSection({
  s,
  prev,
  period,
  goal,
  proteinTarget,
}: {
  s: ReportSummary;
  prev: ReportSummary | null;
  period: Period;
  goal: Goal | null;
  proteinTarget: number | null;
}) {
  const insights: Insight[] = useMemo(() => buildInsights(s, { period, goal, proteinTarget, prev }), [s, period, goal, proteinTarget, prev]);
  const cmp = useMemo(() => comparePeriods(s, prev), [s, prev]);
  const hasCmp = cmp.avgIn != null || cmp.loggingPts != null || cmp.weight != null || cmp.protein != null;
  if (!insights.length && !hasCmp) return null;
  const prevName = period === 'week' ? 'tuần trước' : 'tháng trước';
  return (
    <GlassCard padding="md" as="section" aria-labelledby="rp-insights">
      <SectionTitle eyebrow="Tóm tắt kỳ" title={<span id="rp-insights">Điểm nổi bật</span>} />
      {insights.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {insights.map((it) => {
            const Icon = it.kind === 'trend' && /tăng/.test(it.text) ? TrendingUp : INSIGHT_ICON[it.kind];
            return (
              <li key={it.kind} className="flex gap-3 text-[13.5px] leading-relaxed text-[rgba(237,228,216,0.88)]">
                <span
                  className={clsx(
                    'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl border',
                    it.tone === 'good' ? 'border-[rgba(127,209,139,0.3)] bg-[rgba(127,209,139,0.08)] text-ok' : 'border-line bg-white/[0.04] text-gold',
                  )}
                  aria-hidden="true"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">{it.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      {hasCmp && (
        <div className={clsx(insights.length > 0 && 'mt-4 border-t border-line pt-4')}>
          <p className="mb-2 text-[12px] font-semibold text-muted">So với {prevName}</p>
          <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-4">
            <Delta label="Nạp TB/ngày" value={cmp.avgIn} unit="kcal" />
            <Delta label="Đạm TB/ngày" value={cmp.protein} unit="g" digits={1} />
            <Delta label="Tỉ lệ ngày ghi" value={cmp.loggingPts} unit="%" />
            <Delta label="Cân nặng" value={cmp.weight} unit="kg" digits={1} />
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// ───────────────────────── Foods of the period ─────────────────────────

/**
 * Most-logged dishes and main protein sources of the period. Frequent dishes that are not in
 * "Món của tôi" yet get a one-tap "Lưu" so next time they are picked, not scanned or typed again.
 */
export function FoodSection({
  report,
  onSave,
  savingKey,
}: {
  report: FoodReport;
  /** Kept for callers; copy is period-neutral. */
  period?: Period;
  onSave: (stat: FoodStat) => void;
  savingKey: string | null;
}) {
  if (report.entryCount < MIN_ENTRIES_FOR_FOODS || (!report.frequent.length && !report.proteinTop.length)) return null;
  return (
    <GlassCard padding="md" as="section" aria-labelledby="rp-foods">
      <SectionTitle
        eyebrow="Thói quen ăn"
        title={<span id="rp-foods">Món hay ăn</span>}
        right={
          <Link to="/food/search?tab=mine" className="glass pill min-h-[44px] shrink-0 text-[13px] font-semibold">
            <Bookmark className="h-4 w-4" aria-hidden="true" /> Món của tôi
          </Link>
        }
      />

      {report.frequent.length > 0 && (
        <>
          <p className="tabular mb-2 text-[12px] font-semibold text-muted">
            Ăn nhiều nhất · {report.dishCount} món, {report.entryCount} lần ghi
          </p>
          <ul className="flex flex-col gap-2">
            {report.frequent.map((f, i) => (
              <li key={f.key} className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-3 py-2">
                <span className="tabular grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-[13px] font-extrabold text-gold" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold text-text" title={f.name}>
                    {f.name}
                  </span>
                  <span className="tabular block text-[12px] text-muted">
                    {f.count} lần{f.days !== f.count ? ` · ${f.days} ngày` : ''} · ~{formatNumber(Math.round(f.kcal / f.count))} kcal/lần
                  </span>
                </span>
                {f.savedFood ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-ok" title="Đã có trong Món của tôi">
                    <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
                    Đã lưu
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="min-h-[44px] shrink-0"
                    loading={savingKey === f.key}
                    disabled={savingKey != null && savingKey !== f.key}
                    icon={<Bookmark className="h-4 w-4" />}
                    onClick={() => onSave(f)}
                    aria-label={`Lưu ${f.name} vào Món của tôi`}
                  >
                    Lưu
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {report.saveSuggestions.length > 0 && (
            <p className="mt-2 text-[12px] leading-snug text-muted">
              Lưu món hay ăn để lần sau chỉ cần chọn, không phải quét hay nhập lại.
            </p>
          )}
        </>
      )}

      {report.proteinTop.length > 0 && (
        <div className={clsx(report.frequent.length > 0 && 'mt-4 border-t border-line pt-4')}>
          <p className="mb-2 text-[12px] font-semibold text-muted">
            Nguồn đạm chính · tổng {formatNumber(report.totalProtein)} g
          </p>
          <ul className="flex flex-col gap-2.5">
            {report.proteinTop.map(({ stat, share }) => (
              <li key={stat.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="min-w-0 truncate font-semibold text-text" title={stat.name}>
                    {stat.name}
                  </span>
                  <span className="tabular shrink-0 text-muted">
                    <span className="font-bold text-text">{formatNumber(stat.protein_g)} g</span> · {share}%
                  </span>
                </div>
                <ProgressBar value={share} max={100} color="var(--protein)" height={5} showOver={false} className="mt-1.5" label={`${stat.name}: ${share}% lượng đạm`} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.reusedEntries > 0 && (
        <p className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-[12px] text-muted">
          <Zap className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
          {report.reusedEntries} lần ghi nhanh từ Món của tôi, không cần quét hay nhập lại.
        </p>
      )}
    </GlassCard>
  );
}

// ───────────────────────── (6) Links ─────────────────────────

export function LinkCards() {
  const items = [
    { to: '/body', icon: Ruler, title: 'Số đo & ảnh', desc: 'Cân nặng, vòng eo và ảnh tiến trình' },
    { to: '/goals', icon: Target, title: 'Mục tiêu', desc: 'Điều chỉnh calo, macro, nước và bước' },
  ];
  return (
    <nav aria-label="Liên kết nhanh" className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
      {items.map(({ to, icon: Icon, title, desc }) => (
        <Link
          key={to}
          to={to}
          className="glass-card group flex min-h-[72px] items-center gap-3 p-4 transition-transform duration-200 hover:bg-white/[0.08] active:scale-[0.985]"
        >
          <span className="glass grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-gold">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-text">{title}</span>
            <span className="block text-[12px] leading-snug text-muted">{desc}</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
