import clsx from 'clsx';
import { useEffect, useId, useState, type ReactNode } from 'react';

export interface RingProps {
  value: number;
  max: number;
  /** Outer diameter px (default 160). */
  size?: number;
  /** Stroke width px (default 12). */
  stroke?: number;
  /** Solid colour (CSS) — ignored when `gradient` is set. Default gold. */
  color?: string;
  /** Two-stop gradient [from, to]. */
  gradient?: [string, string];
  trackColor?: string;
  /** Centre content. */
  children?: ReactNode;
  label?: string;
  className?: string;
}

/** Circular progress (SVG) with animated sweep; overflow turns ember. */
export function Ring({
  value,
  max,
  size = 160,
  stroke = 12,
  color = 'var(--gold)',
  gradient,
  trackColor = 'rgba(255,255,255,0.08)',
  children,
  label,
  className,
}: RingProps) {
  const gid = useId().replace(/:/g, '');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = max > 0 ? value / max : 0;
  const target = Math.max(0, Math.min(1, ratio));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  const over = ratio > 1;
  const stroke1 = over ? `url(#over-${gid})` : gradient ? `url(#g-${gid})` : color;

  return (
    <div
      className={clsx('relative inline-grid place-items-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(ratio * 100)}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          {gradient && (
            <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={gradient[0]} />
              <stop offset="1" stopColor={gradient[1]} />
            </linearGradient>
          )}
          <linearGradient id={`over-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--ember)" />
            <stop offset="1" stopColor="var(--danger)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke1}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      {children !== undefined && <div className="absolute inset-0 grid place-items-center text-center">{children}</div>}
    </div>
  );
}
