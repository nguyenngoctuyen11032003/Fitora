import clsx from 'clsx';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Footprints,
  Info,
  Ruler,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CountUp, GlassButton, GlassCard, MacroBar, ProgressBar, Segmented } from '@/components/ui';
import { bmiCategory } from '@/lib/energy';
import { formatKcal, formatKg, formatMl, formatNumber, formatSigned } from '@/lib/format';
import type { FitProfile } from '@/types/db';
import { CalorieChart, WeightChart } from './charts';
import type { Period, ReportSummary, VerdictTone } from './lib';

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
  const hasBalance = s.loggedDays > 0 && s.maintenance != null;
  const deficit = s.balance < 0;
  const digits = formatNumber(Math.abs(s.balance)).length + 1;
  const numSize = digits <= 5 ? 'text-[84px]' : digits <= 6 ? 'text-[72px]' : 'text-[60px]';

  return (
    <GlassCard padding="lg" className="overflow-hidden animate-fade-slide-up">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[rgba(225,80,10,0.2)] blur-3xl" aria-hidden="true" />
      <p className="eyebrow relative">
        Cân bằng năng lượng · {s.loggedDays}/{s.elapsedDays} ngày đã ghi
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
            <span className="font-medium text-muted"> so với nhu cầu duy trì</span>
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
            </div>
            <div className="rounded-2xl border border-line bg-white/[0.03] px-3.5 py-3">
              <dt className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                <Target className="h-3.5 w-3.5" />
                So với mục tiêu
              </dt>
              <dd className="tabular mt-1 text-[22px] font-extrabold tracking-[-0.03em] text-text">
                {s.target != null ? formatSigned(s.avgDailyVsTarget) : '—'}
                <span className="ml-1 text-[13px] font-bold text-muted">kcal/ngày</span>
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="relative mt-3 text-[15px] text-muted">
          {s.loggedDays === 0 ? 'Chưa có bữa ăn nào được ghi trong kỳ này.' : 'Cần thông tin hồ sơ (cân nặng, chiều cao, mục tiêu) để tính thâm hụt.'}
        </p>
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
          Ước tính từ nhu cầu duy trì ~{formatKcal(s.maintenance)}/ngày
          {s.maintenanceBasis === 'target' ? ' (suy từ mục tiêu)' : ''} + vận động, chỉ tính ngày đã ghi. 7.700 kcal ≈ 1 kg.
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
      <div className="-mx-1">
        <CalorieChart days={s.days} target={s.target} animate={animate} monthly={monthly} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
        <Stat label="TB nạp vào / ngày" value={s.loggedDays ? formatNumber(s.avgIn) : '—'} unit="kcal" />
        <Stat label="TB tiêu hao / ngày" value={s.elapsedDays ? formatNumber(s.avgBurned) : '—'} unit="kcal" />
      </div>
    </GlassCard>
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
        eyebrow="Trung bình mỗi ngày đã ghi"
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
        <MacroBar {...s.avgMacros} targets={targets} variant="rows" />
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
}: {
  s: ReportSummary;
  animate: boolean;
  monthly: boolean;
  waistDelta: number | null;
  latestKnown: { kg: number; on: string } | null;
}) {
  const n = s.weightPoints.length;
  const bmi = s.bmiLast;
  const cat = bmi ? bmiCategory(bmi) : null;
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
        <div className="-mx-1">
          <WeightChart days={s.days} animate={animate} monthly={monthly} />
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-4 text-[13px] leading-relaxed text-muted">
          <Scale className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
          {n === 1
            ? 'Mới có 1 lần cân trong kỳ. Cân thêm để thấy xu hướng.'
            : latestKnown
              ? `Chưa cân trong kỳ này. Lần gần nhất: ${formatKg(latestKnown.kg)}.`
              : 'Chưa có số cân nào. Cân 2–3 lần mỗi tuần, cùng giờ buổi sáng để xu hướng chính xác.'}
        </div>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4">
        <Stat label="Hiện tại" value={s.weightLast != null ? formatNumber(s.weightLast, 1) : '—'} unit={s.weightLast != null ? 'kg' : undefined} />
        <Stat
          label="Thay đổi"
          value={
            s.weightDelta != null ? (
              <span className={s.weightDelta < 0 ? 'text-ok' : s.weightDelta > 0 ? 'text-gold' : undefined}>{formatSigned(s.weightDelta, 1)}</span>
            ) : (
              '—'
            )
          }
          unit={s.weightDelta != null ? 'kg' : undefined}
        />
        <Stat label="BMI" value={bmi ? formatNumber(bmi, 1) : '—'} sub={cat?.label} />
      </div>
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
