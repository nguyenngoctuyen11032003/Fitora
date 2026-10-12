import clsx from 'clsx';
import { Flame, Target, Utensils } from 'lucide-react';
import { memo, useEffect, useId, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { CountUp } from '@/components/ui/CountUp';
import { formatNumber } from '@/lib/format';
import { ACTIVITY_LABELS, type ActivityLevel } from '@/types/db';
import { heroSummary, progressPercent, type EnergyBalance } from '../metrics';

// 240° arc gauge: starts lower-left (150°), sweeps clockwise over the top to lower-right (30°).
const CX = 150;
const CY = 150;
const R = 128;
const STROKE = 14;
const START = 150;
const SWEEP = 240;
const VIEW_H = 232;

const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (deg: number) => ({ x: CX + R * Math.cos(rad(deg)), y: CY + R * Math.sin(rad(deg)) });
const ARC = (() => {
  const a = pt(START);
  const b = pt(START + SWEEP);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 1 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
})();

/** Gauge tick marks: static geometry, built once instead of on every animation frame. */
const TICKS = Array.from({ length: 25 }, (_, i) => {
  const deg = START + (SWEEP * i) / 24;
  const major = i % 6 === 0;
  const inR = R - (major ? 27 : 23);
  return {
    x1: CX + (R - 18) * Math.cos(rad(deg)),
    y1: CY + (R - 18) * Math.sin(rad(deg)),
    x2: CX + inR * Math.cos(rad(deg)),
    y2: CY + inR * Math.sin(rad(deg)),
    major,
  };
});

/** Ring + count-up share one duration so the number lands when the arc does. */
const ANIM_MS = 1600;

/** Digit size shrinks with length so "−1.250" still fits a 360px screen. */
function heroSize(text: string): string {
  const len = text.length;
  if (len <= 3) return 'text-[104px]';
  if (len <= 4) return 'text-[92px]';
  if (len <= 5) return 'text-[80px]';
  return 'text-[66px]';
}

interface Props {
  energy: EnergyBalance;
  /** Profile activity level, named in the note about activity already in the target. */
  activityLevel?: ActivityLevel | null;
}

export const CalorieHero = memo(function CalorieHero({ energy, activityLevel }: Props) {
  // With an activity allowance only the activity beyond it is added ("Cộng thêm");
  // the hint shows everything burned today so the user sees both numbers.
  const hasAllowance = energy.allowance > 0;
  const burnHint = hasAllowance
    ? energy.burned > 0
      ? `đã đốt ${formatNumber(energy.burned)}`
      : undefined
    : energy.stepsKcal > 0
      ? `${formatNumber(energy.stepsKcal)} từ bước`
      : undefined;
  const gid = useId().replace(/:/g, '');
  const { over, remaining, progress } = energy;
  const shownValue = Math.abs(remaining);
  // Measure with the "+" sign shown when over budget so the digits never overflow.
  const sizeCls = heroSize((over ? '+' : '') + formatNumber(shownValue));

  // Sweep from 0 on mount; JS tween so the glowing tip follows the arc.
  const p = useTween(over ? 1 : progress, ANIM_MS);
  const tip = pt(START + SWEEP * Math.max(0.0001, p));
  // Same rule as the other progress labels: never "100 %" before the budget is actually used.
  const pctLabel = progressPercent(energy.eaten, energy.budget);

  return (
    <section
      aria-label="Calo hôm nay"
      className="glass-card relative overflow-hidden px-5 pb-5 pt-4 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-center lg:gap-x-12 lg:px-10 lg:py-7 min-[1400px]:gap-x-16 min-[1400px]:px-12"
    >
      {/* warm glow behind the gauge */}
      <div
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute left-1/2 top-6 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl transition-colors duration-700 lg:left-[190px] lg:top-10 min-[1400px]:left-[198px]',
          over ? 'bg-danger/25' : 'bg-gold/15',
        )}
      />

      <div className="relative mx-auto w-full max-w-[300px]">
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {heroSummary(energy)}
        </p>
        <svg viewBox={`0 0 300 ${VIEW_H}`} className="block w-full" aria-hidden="true">
          <defs>
            <linearGradient id={`arc-${gid}`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#c27c06" />
              <stop offset="0.55" stopColor="#EDB40B" />
              <stop offset="1" stopColor="#ffe48a" />
            </linearGradient>
            <linearGradient id={`over-${gid}`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="var(--ember)" />
              <stop offset="1" stopColor="var(--danger)" />
            </linearGradient>
            <filter id={`glow-${gid}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          {/* track + tick marks */}
          <path d={ARC} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={STROKE} strokeLinecap="round" />
          {TICKS.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke={t.major ? 'rgba(237,228,216,0.35)' : 'rgba(237,228,216,0.12)'}
              strokeWidth={t.major ? 2 : 1.25}
              strokeLinecap="round"
            />
          ))}
          {/* progress */}
          <path
            d={ARC}
            fill="none"
            stroke={over ? `url(#over-${gid})` : `url(#arc-${gid})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${Math.max(0.001, p * 100)} 100`}
            strokeOpacity={p < 0.002 ? 0 : 1}
          />
          {/* glowing tip */}
          {p > 0.005 && (
            <g>
              <circle cx={tip.x} cy={tip.y} r={9} fill={over ? 'var(--danger)' : 'var(--gold)'} opacity={0.55} filter={`url(#glow-${gid})`} />
              <circle cx={tip.x} cy={tip.y} r={4.5} fill="#fff6e6" />
            </g>
          )}
        </svg>

        {/* number inside the bowl */}
        <div className="absolute inset-x-0 top-[22%] flex flex-col items-center text-center">
          <span className={clsx('eyebrow', over ? '!text-[var(--danger-text)]' : '!text-gold')}>
            {over ? 'Đã vượt mức' : 'Calo còn lại'}
          </span>
          <div className="mt-3 animate-speed-reveal">
            <span
              className={clsx(
                'num block pb-[0.08em] pr-[0.04em]',
                sizeCls,
                over ? 'text-gradient-ember' : 'text-gradient-gold',
              )}
            >
              {over && <span aria-hidden="true">+</span>}
              <CountUp value={shownValue} duration={ANIM_MS} />
            </span>
          </div>
          <span className="mt-1 text-[13px] font-semibold tracking-[0.02em] text-muted">
            kcal · đã ăn {pctLabel}% ngân sách
          </span>
        </div>
      </div>

      {/* Laptop: equation + note sit in a column beside the gauge (box-less on phone). */}
      <div className="contents lg:relative lg:block lg:min-w-0">
      <div className="relative mb-5 hidden lg:block" aria-hidden="true">
        <p className="eyebrow">Ngân sách hôm nay</p>
        <p className="mt-2 text-[15px] font-semibold text-text">
          Còn lại = Mục tiêu − Đã ăn + {hasAllowance ? 'Cộng thêm' : 'Tiêu hao'}
        </p>
      </div>
      {/* Equation: Mục tiêu − Đã ăn + Tiêu hao (tập luyện + bước chân vượt mức đã tính trong mục tiêu) */}
      <div className="relative mt-1 flex items-stretch justify-between gap-1 lg:mt-0 lg:gap-3" role="group" aria-label="Công thức calo còn lại">
        <EqItem icon={Target} color="var(--text)" label="Mục tiêu" value={energy.target} />
        <Op>−</Op>
        <EqItem icon={Utensils} color="var(--gold)" label="Đã ăn" value={energy.eaten} />
        <Op>+</Op>
        <EqItem
          icon={Flame}
          color="var(--burn)"
          label={hasAllowance ? 'Cộng thêm' : 'Tiêu hao'}
          value={energy.bonus}
          hint={burnHint}
        />
      </div>
      {hasAllowance && (
        <p className="relative mt-2.5 text-center text-[11.5px] leading-snug text-muted lg:mt-4 lg:text-left lg:text-[12.5px]">
          Mục tiêu đã tính sẵn ~{formatNumber(energy.allowance)} kcal vận động/ngày
          {activityLevel ? ` (mức “${ACTIVITY_LABELS[activityLevel]}”)` : ''}. Chỉ phần đốt vượt mức này mới được cộng thêm.
        </p>
      )}
      </div>
    </section>
  );
});

function Op({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="self-center pt-3 text-lg font-bold text-muted lg:pt-0 lg:text-2xl lg:font-semibold">
      {children}
    </span>
  );
}

function EqItem({
  icon: Icon,
  color,
  label,
  value,
  hint,
}: {
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  color: string;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center rounded-2xl border border-white/[0.06] bg-white/[0.035] px-1 py-2.5 text-center lg:items-start lg:rounded-[20px] lg:px-5 lg:py-4 lg:text-left">
      {/* One line at 360 px and in the desktop phone frame too ("Cộng thêm" used to wrap and misalign the three boxes). */}
      <span className="flex max-w-full items-center gap-0.5 whitespace-nowrap text-[10.5px] font-semibold text-muted lg:gap-1.5 lg:text-[12.5px]">
        <Icon className="h-3.5 w-3.5 shrink-0 lg:h-4 lg:w-4" style={{ color }} aria-hidden="true" />
        {label}
      </span>
      <span className="num mt-1.5 text-[22px] leading-none text-text lg:mt-3 lg:text-[34px]">{formatNumber(value)}</span>
      {hint ? (
        <span className="mt-1 max-w-full truncate text-[10px] text-muted lg:mt-1.5 lg:text-[11.5px]">{hint}</span>
      ) : (
        <span className="mt-1 text-[10px] text-muted lg:mt-1.5 lg:text-[11.5px]">kcal</span>
      )}
    </div>
  );
}

/** Eased (out-quart) tween toward `target`; instant under prefers-reduced-motion. */
function useTween(target: number, duration: number): number {
  const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Under reduced motion start at the target: no one-frame flash of an empty ring.
  const [v, setV] = useState(() => (reduced() ? target : 0));
  const cur = useRef(v);
  useEffect(() => {
    if (reduced()) {
      cur.current = target;
      setV(target);
      return;
    }
    const from = cur.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - k, 4);
      cur.current = from + (target - from) * e;
      setV(cur.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}
