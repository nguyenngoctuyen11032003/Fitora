// Step components shared by /onboarding (one per screen) and /goals (stacked sections).
import clsx from 'clsx';
import {
  Activity,
  Armchair,
  Bike,
  Cake,
  Dumbbell,
  Flame,
  Footprints,
  Mars,
  RotateCcw,
  Scale,
  SlidersHorizontal,
  Target,
  TrendingDown,
  TrendingUp,
  Venus,
  Droplets,
  Zap,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { BigNumber } from '@/components/ui/BigNumber';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MACROS } from '@/components/ui/MacroBar';
import { NumberField } from '@/components/ui/NumberField';
import { ACTIVITY_FACTORS, calcAge, calcBMI, bmiCategory, type Macros } from '@/lib/energy';
import { formatKg, formatMl, formatNumber, formatSigned } from '@/lib/format';
import type { ActivityLevel, Goal, GoalPace, Sex } from '@/types/db';
import {
  GAIN_KG_WEEK,
  LIMITS,
  birthDateBounds,
  goalWarnings,
  PACE_KG_WEEK,
  kgPerWeek,
  macroPercents,
  scaleMacrosToKcal,
  setMacro,
  targetDateLabel,
  type GoalDraft,
  type Plan,
  type StepErrors,
} from './logic';
import { radioGroupKeys } from './a11y';
import { BMI_COLORS, BmiGauge, MacroDonut, MacroLegend, OptionCard, RangeSlider, SectionTitle, StatTile } from './parts';

export interface StepProps {
  draft: GoalDraft;
  onChange: (patch: Partial<GoalDraft>) => void;
  errors?: StepErrors;
  /** Stacked inside /goals: smaller headings, no entrance stagger. */
  compact?: boolean;
}

const ErrorText = ({ children }: { children?: ReactNode }) =>
  children ? (
    <p role="alert" className="mt-2 pl-1 text-[13px] font-medium text-[var(--danger-text)]">
      {children}
    </p>
  ) : null;

const stagger = (compact: boolean | undefined, i: number) => (compact ? undefined : 120 + i * 70);

/* ================================================================== */
/* 1 · Giới tính + ngày sinh                                          */
/* ================================================================== */

const SEX_OPTIONS: { value: Sex; label: string; icon: ReactNode }[] = [
  { value: 'male', label: 'Nam', icon: <Mars /> },
  { value: 'female', label: 'Nữ', icon: <Venus /> },
];

export function BasicsStep({ draft, onChange, errors = {}, compact }: StepProps) {
  const { min: minBirth, max: maxBirth } = birthDateBounds();
  const age = draft.birth_date ? calcAge(draft.birth_date) : null;

  return (
    <div className="flex flex-col gap-7">
      <section>
        <SectionTitle>Giới tính sinh học</SectionTitle>
        <div role="radiogroup" aria-label="Giới tính" onKeyDown={radioGroupKeys} className="grid grid-cols-2 gap-3">
          {SEX_OPTIONS.map((o, i) => {
            const on = draft.sex === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ sex: o.value })}
                className={clsx(
                  'glass-card flex flex-col items-start gap-6 p-4 text-left transition-[transform,box-shadow,background-color] duration-200 active:scale-[0.97]',
                  compact ? 'min-h-[96px]' : 'min-h-[132px] animate-fade-slide-up',
                  on ? 'bg-[rgba(237,180,11,0.1)] ring-1 ring-[rgba(237,180,11,0.70)] shadow-[0_18px_40px_-24px_rgba(237,180,11,0.9)]' : 'hover:bg-white/[0.08]',
                )}
                style={compact ? undefined : { animationDelay: `${stagger(compact, i)}ms` }}
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    'flex h-11 w-11 items-center justify-center rounded-2xl [&>svg]:h-6 [&>svg]:w-6',
                    on ? 'bg-gold text-[#1a0e02]' : 'bg-white/[0.06] text-[rgba(237,228,216,0.80)]',
                  )}
                >
                  {o.icon}
                </span>
                <span className={clsx('display text-text', compact ? 'text-[26px]' : 'text-[34px]')}>{o.label}</span>
              </button>
            );
          })}
        </div>
        <ErrorText>{errors.sex}</ErrorText>
        {!compact && <p className="mt-2.5 pl-1 text-[13px] text-muted">Dùng cho công thức Mifflin–St Jeor để ước tính năng lượng nền.</p>}
      </section>

      <section className={clsx(!compact && 'animate-fade-slide-up animate-delay-300')}>
        <SectionTitle>Ngày sinh</SectionTitle>
        <div className="flex items-end gap-4">
          <Input
            type="date"
            aria-label="Ngày sinh"
            icon={<Cake />}
            value={draft.birth_date ?? ''}
            min={minBirth}
            max={maxBirth}
            onChange={(e) => onChange({ birth_date: e.target.value || null })}
            error={errors.birth_date}
            wrapperClassName="flex-1 min-w-0"
            className="[color-scheme:dark]"
          />
          <div className="flex min-w-[72px] flex-col items-end pb-1" aria-live="polite">
            {age !== null && age > 0 ? <span className="num text-[44px] text-gradient-gold">{age}</span> : <span className="num text-[44px] text-white/20">––</span>}
            <span className="mt-1 text-[12px] font-semibold text-muted">tuổi</span>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ================================================================== */
/* 2 · Chiều cao + cân nặng                                           */
/* ================================================================== */

function Measure({
  label,
  icon,
  value,
  onChange,
  unit,
  min,
  max,
  sliderMax,
  step,
  decimals,
  error,
  ticks,
}: {
  label: string;
  icon: ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  unit: string;
  min: number;
  max: number;
  sliderMax: number;
  step: number;
  decimals: 0 | 1;
  error?: string;
  ticks: string[];
}) {
  return (
    <section className="glass-card p-4">
      <SectionTitle>
        <span className="inline-flex items-center gap-1.5 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
          {label}
        </span>
      </SectionTitle>
      <NumberField
        label={<span className="sr-only">{label}</span>}
        value={value}
        onChange={onChange}
        unit={unit}
        min={min}
        max={max}
        step={step}
        decimals={decimals}
        stepper
        size="lg"
        error={error}
      />
      <div className="mt-2">
        <RangeSlider
          label={`${label} (thanh trượt)`}
          value={value ?? min}
          min={min}
          max={sliderMax}
          step={decimals ? 0.5 : 1}
          valueText={`${formatNumber(value ?? min, decimals)} ${unit}`}
          onChange={(v) => onChange(v)}
          ticks={ticks}
        />
      </div>
    </section>
  );
}

export function BodyStep({ draft, onChange, errors = {}, compact }: StepProps) {
  const bmi = draft.weight_kg && draft.height_cm ? calcBMI(draft.weight_kg, draft.height_cm) : 0;
  const cat = bmi ? bmiCategory(bmi) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className={clsx(!compact && 'animate-fade-slide-up animate-delay-100')}>
        <Measure
          label="Chiều cao"
          icon={<Activity />}
          value={draft.height_cm}
          onChange={(v) => onChange({ height_cm: v })}
          unit="cm"
          min={LIMITS.height.min}
          max={LIMITS.height.max}
          sliderMax={LIMITS.height.max}
          step={1}
          decimals={0}
          error={errors.height}
          ticks={['120', '150', '175', '200', '230']}
        />
      </div>
      <div className={clsx(!compact && 'animate-fade-slide-up animate-delay-200')}>
        <Measure
          label={compact ? 'Cân nặng hiện tại' : 'Cân nặng'}
          icon={<Scale />}
          value={draft.weight_kg}
          onChange={(v) => onChange({ weight_kg: v })}
          unit="kg"
          min={LIMITS.weight.min}
          max={LIMITS.weight.max}
          sliderMax={180}
          step={0.5}
          decimals={1}
          error={errors.weight}
          ticks={['30', '67', '105', '142', '180']}
        />
      </div>
      {cat && (
        <p
          className={clsx('flex items-center gap-2 pl-1 text-[13px] text-muted', !compact && 'animate-fade-in animate-delay-400')}
          aria-live="polite"
        >
          <span className="h-2 w-2 rounded-full" style={{ background: BMI_COLORS[cat.key] }} aria-hidden="true" />
          BMI hiện tại <b className="tabular text-text">{formatNumber(bmi, 1)}</b> · {cat.label}
        </p>
      )}
    </div>
  );
}

/* ================================================================== */
/* 3 · Mức vận động                                                   */
/* ================================================================== */

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; desc: string; icon: ReactNode }[] = [
  { value: 'sedentary', label: 'Ít vận động', desc: 'Ngồi nhiều, hầu như không tập luyện', icon: <Armchair /> },
  { value: 'light', label: 'Nhẹ', desc: 'Đi lại nhẹ nhàng, tập 1–3 buổi/tuần', icon: <Footprints /> },
  { value: 'moderate', label: 'Vừa', desc: 'Tập 3–5 buổi/tuần, cường độ vừa', icon: <Bike /> },
  { value: 'active', label: 'Cao', desc: 'Tập nặng 6–7 buổi/tuần', icon: <Dumbbell /> },
  { value: 'very_active', label: 'Rất cao', desc: 'Lao động chân tay hoặc tập 2 lần/ngày', icon: <Flame /> },
];

export function ActivityStep({ draft, onChange, errors = {}, compact }: StepProps) {
  return (
    <div>
      <div role="radiogroup" aria-label="Mức vận động" onKeyDown={radioGroupKeys} className="flex flex-col gap-2.5">
        {ACTIVITY_OPTIONS.map((o, i) => (
          <OptionCard
            key={o.value}
            selected={draft.activity_level === o.value}
            onSelect={() => onChange({ activity_level: o.value })}
            icon={o.icon}
            title={o.label}
            description={o.desc}
            meta={`×${ACTIVITY_FACTORS[o.value].toLocaleString('vi-VN', { maximumFractionDigits: 3 })}`}
            delay={stagger(compact, i)}
          />
        ))}
      </div>
      <ErrorText>{errors.activity}</ErrorText>
      {!compact && (
        <p className="mt-3 pl-1 text-[13px] leading-relaxed text-muted">
          Hệ số nhân với năng lượng nền (BMR) để ra tổng năng lượng tiêu hao mỗi ngày (TDEE). Chọn thấp hơn nếu phân vân.
        </p>
      )}
    </div>
  );
}

/* ================================================================== */
/* 4 · Mục tiêu                                                       */
/* ================================================================== */

const GOAL_OPTIONS: { value: Goal; label: string; desc: string; icon: ReactNode }[] = [
  { value: 'lose', label: 'Giảm cân', desc: 'Thâm hụt calo có kiểm soát', icon: <TrendingDown /> },
  { value: 'gain', label: 'Tăng cân', desc: `Dư ~300 kcal/ngày · ~${formatNumber(GAIN_KG_WEEK, 2)} kg/tuần`, icon: <TrendingUp /> },
  { value: 'maintain', label: 'Giữ cân', desc: 'Ăn bằng mức tiêu hao', icon: <Scale /> },
  { value: 'recomp', label: 'Tăng cơ / Giảm mỡ', desc: 'Thâm hụt nhẹ 10%, ưu tiên đạm cao', icon: <Dumbbell /> },
];

const PACE_OPTIONS: { value: GoalPace; label: string }[] = [
  { value: 'slow', label: 'Chậm' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'fast', label: 'Nhanh' },
];

/** Explains why the real deficit is smaller than the chosen pace (safety floor / low TDEE). */
export function floorNote(plan: Plan): string | undefined {
  if (!plan.floored) return undefined;
  if (plan.delta > -30)
    return `TDEE của bạn (${formatNumber(plan.tdee)} kcal) đã ${plan.tdee < plan.minKcal ? "thấp hơn" : "sát"} mức tối thiểu an toàn ${formatNumber(plan.minKcal)} kcal, nên kế hoạch giữ ở mức tiêu hao. Tăng vận động để tạo thâm hụt.`;
  return `Để không xuống dưới mức tối thiểu an toàn ${formatNumber(plan.minKcal)} kcal, thâm hụt thực tế là ${formatNumber(-plan.delta)} kcal/ngày (~${formatNumber(kgPerWeek(plan.delta), 2)} kg/tuần).`;
}

function PacePicker({ value, onChange, note }: { value: GoalPace; onChange: (p: GoalPace) => void; note?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-semibold text-muted">Tốc độ giảm</span>
      <div role="radiogroup" aria-label="Tốc độ giảm cân" onKeyDown={radioGroupKeys} className="grid grid-cols-3 gap-2">
        {PACE_OPTIONS.map((p) => {
          const on = value === p.value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(p.value)}
              className={clsx(
                'flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border px-1 transition-colors active:scale-[0.97]',
                on ? 'border-gold bg-gold text-[#1a0e02]' : 'border-line bg-white/[0.04] text-text hover:bg-white/[0.08]',
              )}
            >
              <span className="tabular text-[20px] font-extrabold leading-none tracking-[-0.04em]">
                {formatNumber(PACE_KG_WEEK[p.value], 2)}
              </span>
              <span className={clsx('text-[11px] font-semibold', on ? 'text-[#1a0e02]/75' : 'text-muted')}>kg/tuần</span>
              <span className={clsx('text-[12px] font-bold', on ? 'text-[#1a0e02]' : 'text-[rgba(237,228,216,0.85)]')}>{p.label}</span>
            </button>
          );
        })}
      </div>
      {value === 'fast' && (
        <p className="text-[12px] leading-snug text-muted">Tốc độ nhanh khó duy trì — hãy đảm bảo đủ đạm và ngủ đủ giấc.</p>
      )}
      {note && <p className="text-[12px] leading-snug text-[rgba(237,180,11,0.9)]">{note}</p>}
    </div>
  );
}

export function GoalStep({ draft, onChange, errors = {}, compact, plan }: StepProps & { plan?: Plan | null }) {
  const showTarget = draft.goal && draft.goal !== 'maintain';
  const diff = draft.target_weight_kg != null && draft.weight_kg != null ? draft.target_weight_kg - draft.weight_kg : null;
  const warnings = goalWarnings(draft);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div role="radiogroup" aria-label="Mục tiêu" onKeyDown={radioGroupKeys} className="flex flex-col gap-2.5">
          {GOAL_OPTIONS.map((o, i) => (
            <OptionCard
              key={o.value}
              selected={draft.goal === o.value}
              onSelect={() => onChange({ goal: o.value })}
              icon={o.icon}
              title={o.label}
              description={o.desc}
              delay={stagger(compact, i)}
            >
              {o.value === 'lose' && (
                <PacePicker value={draft.goal_pace} onChange={(p) => onChange({ goal_pace: p })} note={plan ? floorNote(plan) : undefined} />
              )}
            </OptionCard>
          ))}
        </div>
        <ErrorText>{errors.goal}</ErrorText>
      </div>

      {warnings.length > 0 && (
        <div role="status" className="rounded-2xl border border-[rgba(237,180,11,0.35)] bg-[rgba(237,180,11,0.08)] px-4 py-3 text-[13px] leading-snug text-[rgba(237,228,216,0.9)]">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      {showTarget && (
        <section className={clsx(!compact && 'animate-fade-slide-up')}>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <Target className="h-4 w-4" aria-hidden="true" />
              Cân nặng mục tiêu
            </span>
          </SectionTitle>
          <NumberField
            value={draft.target_weight_kg}
            onChange={(v) => onChange({ target_weight_kg: v })}
            unit="kg"
            min={LIMITS.weight.min}
            max={LIMITS.weight.max}
            step={0.5}
            decimals={1}
            stepper
            placeholder={draft.weight_kg ? formatNumber(draft.weight_kg, 1) : '—'}
            error={errors.target}
            hint={
              errors.target
                ? undefined
                : diff !== null && Math.abs(diff) >= 0.1
                  ? `${formatSigned(Math.round(diff * 10) / 10, 1)} kg so với hiện tại${
                      plan?.weeksToTarget ? ` · dự kiến ~${plan.weeksToTarget} tuần (${targetDateLabel(plan.weeksToTarget)})` : ''
                    }`
                  : 'Không bắt buộc — để trống nếu chưa có con số cụ thể.'
            }
          />
          {draft.target_weight_kg != null && (
            <button
              type="button"
              onClick={() => onChange({ target_weight_kg: null })}
              className="mt-1 min-h-[44px] px-1 text-[13px] font-semibold text-muted hover:text-text"
            >
              Bỏ cân nặng mục tiêu
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/* ================================================================== */
/* 5 · Kết quả & kế hoạch                                            */
/* ================================================================== */

function deltaCaption(plan: Plan): string {
  const d = plan.delta;
  if (Math.abs(d) < 30) return 'Bằng mức tiêu hao hằng ngày (TDEE)';
  const rate = formatNumber(kgPerWeek(d), 2);
  return d < 0
    ? `Thâm hụt ${formatNumber(-d)} kcal so với TDEE · ~${rate} kg/tuần`
    : `Dư ${formatNumber(d)} kcal so với TDEE · ~${rate} kg/tuần`;
}

export function PlanStep({
  draft,
  plan,
  onChange,
  compact,
  error,
}: {
  draft: GoalDraft;
  plan: Plan;
  onChange: (patch: Partial<GoalDraft>) => void;
  compact?: boolean;
  /** Plan-level validation message (e.g. custom total out of range). */
  error?: string;
}) {
  const [editing, setEditing] = useState(false);
  const note = floorNote(plan);
  const reset = () => onChange({ custom: null, water_ml: null, steps: null });
  const anyCustom = plan.custom || draft.water_ml !== null || draft.steps !== null;
  const a = (cls: string) => (compact ? undefined : cls);

  return (
    <div className="flex flex-col gap-4">
      {/* Hero kcal */}
      <section className="relative px-1 pb-2 pt-1">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-5 -top-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(237,180,11,0.22),transparent_65%)]"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow text-[rgba(237,180,11,0.9)]">Mục tiêu mỗi ngày</span>
          {plan.custom && <span className="rounded-full bg-[rgba(237,180,11,0.15)] px-2.5 py-1 text-[11px] font-bold text-gold">Đã tùy chỉnh</span>}
        </div>
        <BigNumber
          value={plan.kcal}
          unit="kcal"
          size={compact ? 'md' : 'xl'}
          tone="gold"
          reveal={!compact}
          className="mt-3"
          caption={
            <span className="flex flex-col gap-1">
              <span>{deltaCaption(plan)}</span>
              {note && <span className="text-[rgba(237,180,11,0.9)]">{note}</span>}
              {plan.custom && plan.kcal >= LIMITS.kcal.min && plan.kcal < plan.minKcal && (
                <span className="text-[rgba(237,180,11,0.9)]">
                  Thấp hơn mức tối thiểu khuyến nghị {formatNumber(plan.minKcal)} kcal/ngày cho {draft.sex === 'female' ? 'nữ' : 'nam'} — chỉ nên áp dụng khi có hướng dẫn chuyên môn.
                </span>
              )}
              {plan.weeksToTarget && draft.target_weight_kg && (
                <span className="text-[rgba(237,228,216,0.85)]">
                  Dự kiến đạt <b className="tabular">{formatKg(draft.target_weight_kg)}</b> sau ~
                  <b className="tabular">{plan.weeksToTarget}</b> tuần · khoảng {targetDateLabel(plan.weeksToTarget)}
                </span>
              )}
            </span>
          }
        />
        <ErrorText>{error}</ErrorText>
      </section>

      {/* BMR / TDEE */}
      <div className={clsx('grid grid-cols-2 gap-3', a('animate-fade-slide-up animate-delay-300'))}>
        <StatTile label="BMR" icon={<Zap />} value={formatNumber(plan.bmr)} unit="kcal" hint="Năng lượng nền khi nghỉ" />
        <StatTile label="TDEE" icon={<Flame />} value={formatNumber(plan.tdee)} unit="kcal" hint="Tổng tiêu hao mỗi ngày" />
      </div>

      {/* BMI */}
      <section className={clsx('glass-card p-5', a('animate-fade-slide-up animate-delay-400'))}>
        <SectionTitle>Chỉ số khối cơ thể</SectionTitle>
        <BmiGauge bmi={plan.bmi} label={plan.bmiLabel} colorKey={plan.bmiKey} />
        <p className="mt-3 text-[12px] leading-snug text-muted">Theo ngưỡng châu Á (WHO): bình thường 18,5–22,9.</p>
      </section>

      {/* Macros */}
      <section className={clsx('glass-card p-5', a('animate-fade-slide-up animate-delay-500'))}>
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="-mr-2 inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-bold text-gold hover:bg-white/[0.06]"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Điều chỉnh
            </button>
          }
        >
          Phân bổ dinh dưỡng
        </SectionTitle>
        <div className="flex items-center gap-5">
          <MacroDonut
            macros={plan.macros}
            center={
              <>
                <span className="tabular text-[22px] font-extrabold leading-none tracking-[-0.04em]">{formatNumber(plan.kcal)}</span>
                <span className="mt-1 text-[11px] font-semibold text-muted">kcal</span>
              </>
            }
          />
          <MacroLegend macros={plan.macros} />
        </div>
      </section>

      {/* Water / steps */}
      <div className={clsx('grid grid-cols-2 gap-3', a('animate-fade-slide-up animate-delay-600'))}>
        <StatTile label="Nước" icon={<Droplets />} value={formatMl(plan.water_ml)} tone="var(--water)" hint="mỗi ngày" />
        <StatTile label="Bước chân" icon={<Footprints />} value={formatNumber(plan.steps)} tone="var(--fiber)" hint="bước mỗi ngày" />
      </div>

      {anyCustom && (
        <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={reset} block>
          Khôi phục đề xuất
        </Button>
      )}

      <PlanEditorSheet open={editing} onClose={() => setEditing(false)} plan={plan} onChange={onChange} onReset={reset} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Manual adjust sheet                                                */
/* ------------------------------------------------------------------ */

function PlanEditorSheet({
  open,
  onClose,
  plan,
  onChange,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  plan: Plan;
  onChange: (patch: Partial<GoalDraft>) => void;
  onReset: () => void;
}) {
  // Local kcal so typing "2" doesn't immediately clamp to 800 and rescale.
  const [kcal, setKcal] = useState<number | null>(plan.kcal);
  useEffect(() => setKcal(plan.kcal), [plan.kcal]);

  const applyKcal = (v: number | null) => {
    setKcal(v);
    if (v !== null && v >= LIMITS.kcal.min && v <= LIMITS.kcal.max && v !== plan.kcal) {
      onChange({ custom: scaleMacrosToKcal(plan.macros, v) });
    }
  };
  const applyMacro = (key: keyof Macros, v: number | null) => {
    if (v === null) return;
    onChange({ custom: setMacro(plan.macros, key, v) });
  };
  const pct = macroPercents(plan.macros);
  const s = plan.suggested;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Điều chỉnh kế hoạch"
      description="Calo luôn khớp với đạm × 4 + tinh bột × 4 + chất béo × 9."
      height="full"
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={onReset} className="flex-1">
            Khôi phục đề xuất
          </Button>
          <Button onClick={onClose} className="flex-1">
            Xong
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <NumberField
          label="Calo mỗi ngày"
          value={kcal}
          onChange={applyKcal}
          onBlur={() => kcal === null && setKcal(plan.kcal)}
          unit="kcal"
          min={LIMITS.kcal.min}
          max={LIMITS.kcal.max}
          step={50}
          decimals={0}
          stepper
          size="lg"
          hint={`Đề xuất: ${formatNumber(s.kcal)} kcal · đổi calo sẽ giữ nguyên tỉ lệ macro`}
          error={
            plan.kcal < LIMITS.kcal.min || plan.kcal > LIMITS.kcal.max
              ? `Tổng hiện tại ${formatNumber(plan.kcal)} kcal — cần từ ${formatNumber(LIMITS.kcal.min)} đến ${formatNumber(LIMITS.kcal.max)} kcal.`
              : undefined
          }
        />

        <div className="flex h-2.5 w-full gap-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
          {MACROS.map((m) => (
            <span
              key={m.key}
              className="h-full rounded-full transition-[flex-grow] duration-500"
              style={{ flexGrow: Math.max(0.001, pct[m.key]), background: m.color }}
            />
          ))}
        </div>

        {MACROS.map((m) => (
          <NumberField
            key={m.key}
            label={
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} aria-hidden="true" />
                {m.label}
                <span className="tabular ml-auto font-bold" style={{ color: m.color }}>
                  {pct[m.key]}% · {formatNumber(plan.macros[m.key] * m.kcal)} kcal
                </span>
              </span>
            }
            value={plan.macros[m.key]}
            onChange={(v) => applyMacro(m.key, v)}
            unit="g"
            min={LIMITS.macro.min}
            max={LIMITS.macro.max}
            step={5}
            decimals={0}
            stepper
            hint={`Đề xuất ${formatNumber(s[m.key])} g`}
          />
        ))}

        <div className="mt-1 h-px bg-line" />

        <NumberField
          label="Nước mỗi ngày"
          value={plan.water_ml}
          onChange={(v) => v !== null && onChange({ water_ml: v })}
          unit="ml"
          min={LIMITS.water.min}
          max={LIMITS.water.max}
          step={250}
          decimals={0}
          stepper
        />
        <NumberField
          label="Bước chân mỗi ngày"
          value={plan.steps}
          onChange={(v) => v !== null && onChange({ steps: v })}
          unit="bước"
          min={LIMITS.steps.min}
          max={LIMITS.steps.max}
          step={500}
          decimals={0}
          stepper
        />
      </div>
    </BottomSheet>
  );
}
