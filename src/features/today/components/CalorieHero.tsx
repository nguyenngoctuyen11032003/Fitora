import clsx from 'clsx';
import { Flame, Target, Utensils } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { CountUp } from '@/components/ui/CountUp';
import { formatNumber } from '@/lib/format';
import type { EnergyBalance } from '../metrics';

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
}

export function CalorieHero({ energy }: Props) {
  const gid = useId().replace(/:/g, '');
  const { over, remaining, progress } = energy;
  const shownValue = Math.abs(remaining);
  const sizeCls = heroSize(formatNumber(shownValue));

  // Sweep from 0 on mount; JS tween so the glowing tip follows the arc.
  const p = useTween(over ? 1 : progress, 1600);
  const tip = pt(START + SWEEP * Math.max(0.0001, p));
  const pctLabel = Math.round((energy.budget > 0 ? energy.eaten / energy.budget : 0) * 100);

  return (
    <section
      aria-label="Calo hôm nay"
      className="glass-card relative overflow-hidden px-5 pb-5 pt-4"
    >
      {/* warm glow behind the gauge */}
      <div
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute left-1/2 top-6 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl transition-colors duration-700',
          over ? 'bg-danger/25' : 'bg-gold/15',
        )}
      />

      <div className="relative mx-auto w-full max-w-[300px]">
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
          {Array.from({ length: 25 }, (_, i) => {
            const deg = START + (SWEEP * i) / 24;
            const o = { x: CX + (R - 18) * Math.cos(rad(deg)), y: CY + (R - 18) * Math.sin(rad(deg)) };
            const inner = { x: CX + (R - (i % 6 === 0 ? 27 : 23)) * Math.cos(rad(deg)), y: CY + (R - (i % 6 === 0 ? 27 : 23)) * Math.sin(rad(deg)) };
            return (
              <line
                key={i}
                x1={o.x}
                y1={o.y}
                x2={inner.x}
                y2={inner.y}
                stroke={i % 6 === 0 ? 'rgba(237,228,216,0.35)' : 'rgba(237,228,216,0.12)'}
                strokeWidth={i % 6 === 0 ? 2 : 1.25}
                strokeLinecap="round"
              />
            );
          })}
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
              <CountUp value={shownValue} />
            </span>
          </div>
          <span className="mt-1 text-[13px] font-semibold tracking-[0.02em] text-muted">
            kcal · đã ăn {pctLabel}% ngân sách
          </span>
        </div>
      </div>

      {/* Equation: Mục tiêu − Đã ăn + Đã tập */}
      <div className="relative mt-1 flex items-stretch justify-between gap-1" aria-label="Công thức calo còn lại">
        <EqItem icon={Target} color="var(--text)" label="Mục tiêu" value={energy.target} />
        <Op>−</Op>
        <EqItem icon={Utensils} color="var(--gold)" label="Đã ăn" value={energy.eaten} />
        <Op>+</Op>
        <EqItem
          icon={Flame}
          color="var(--burn)"
          label="Đã tập"
          value={energy.burned}
          hint={energy.stepsKcal > 0 ? `${formatNumber(energy.stepsKcal)} từ bước` : undefined}
        />
      </div>
    </section>
  );
}

function Op({ children }: { children: string }) {
  return (
    <span aria-hidden="true" className="self-center pt-3 text-lg font-bold text-muted">
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
    <div className="flex min-w-0 flex-1 flex-col items-center rounded-2xl border border-white/[0.06] bg-white/[0.035] px-1.5 py-2.5 text-center">
      <span className="flex items-center gap-1 text-[11px] font-semibold text-muted">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden="true" />
        {label}
      </span>
      <span className="num mt-1.5 text-[22px] leading-none text-text">{formatNumber(value)}</span>
      {hint ? (
        <span className="mt-1 max-w-full truncate text-[10px] text-muted">{hint}</span>
      ) : (
        <span className="mt-1 text-[10px] text-muted">kcal</span>
      )}
    </div>
  );
}

/** Eased (out-quart) tween toward `target`; instant under prefers-reduced-motion. */
function useTween(target: number, duration: number): number {
  const [v, setV] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
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
