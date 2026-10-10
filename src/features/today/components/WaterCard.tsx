import { Droplet, Undo2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { CountUp } from '@/components/ui/CountUp';
import { formatMl, formatNumber } from '@/lib/format';
import { dropletFills } from '../metrics';

interface Props {
  waterMl: number;
  targetMl: number;
  date: string;
  onSet: (ml: number) => void;
  className?: string;
}

const DROP = 'M12 1.5C12 1.5 3 12.6 3 20.2a9 9 0 0 0 18 0C21 12.6 12 1.5 12 1.5Z';

/** Glass droplets that fill up, +250/+500 quick adds and a one-tap undo. */
export function WaterCard({ waterMl, targetMl, date, onSet, className }: Props) {
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => setHistory([]), [date]);
  const fills = dropletFills(waterMl, targetMl);
  const done = waterMl >= targetMl;
  const per = Math.round(targetMl / fills.length);

  const add = (delta: number) => {
    setHistory((h) => [...h.slice(-19), waterMl]);
    onSet(waterMl + delta);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (prev === undefined) return;
    setHistory((h) => h.slice(0, -1));
    onSet(prev);
  };

  return (
    <section aria-label="Nước uống" className={`glass-card relative overflow-hidden p-5 ${className ?? ''}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-water/15 blur-3xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
            <Droplet className="h-4 w-4 text-water" aria-hidden="true" />
            Nước
          </span>
          <div className="mt-3 flex items-end gap-1.5">
            <span className="num text-gradient-cool pb-[0.06em] text-[48px]">
              <CountUp value={waterMl} duration={900} />
            </span>
            <span className="mb-1 text-[13px] font-semibold text-muted">/ {formatNumber(targetMl)} ml</span>
          </div>
        </div>
        <span className={`mt-0.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${done ? 'bg-water/20 text-water' : 'bg-white/[0.06] text-muted'}`}>
          {done ? 'Đã đủ' : `Còn ${formatMl(Math.max(0, targetMl - waterMl))}`}
        </span>
      </div>

      <div
        className="relative mt-4 flex items-end justify-between gap-1"
        role="img"
        aria-label={`Đã uống ${formatNumber(waterMl)} trên ${formatNumber(targetMl)} ml`}
      >
        {fills.map((f, i) => (
          <DropletGlass key={i} fill={f} index={i} />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">Mỗi giọt ≈ {formatNumber(per)} ml</p>

      <div className="relative mt-4 flex items-center gap-2">
        <button type="button" onClick={() => add(250)} className="glass pill flex-1 !px-3 text-[14px] font-bold text-text">
          <span className="text-water">+</span>250 ml
        </button>
        <button type="button" onClick={() => add(500)} className="glass pill flex-1 !px-3 text-[14px] font-bold text-text">
          <span className="text-water">+</span>500 ml
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!history.length}
          aria-label="Hoàn tác lần thêm nước gần nhất"
          className="glass circle text-text disabled:pointer-events-none disabled:opacity-30"
        >
          <Undo2 className="h-[18px] w-[18px]" />
        </button>
      </div>
    </section>
  );
}

function DropletGlass({ fill, index }: { fill: number; index: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 32" className="h-9 w-[26px] min-w-0 flex-1" style={{ maxWidth: 30 }} aria-hidden="true">
      <defs>
        <clipPath id={`d-${id}`}>
          <path d={DROP} />
        </clipPath>
        <linearGradient id={`w-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#bfeaff" />
          <stop offset="0.5" stopColor="#5ec8f2" />
          <stop offset="1" stopColor="#2f7fb0" />
        </linearGradient>
      </defs>
      <path d={DROP} fill="rgba(255,255,255,0.04)" />
      <g clipPath={`url(#d-${id})`}>
        <rect
          x="0"
          y="0"
          width="24"
          height="32"
          fill={`url(#w-${id})`}
          style={{
            transform: `translateY(${(1 - fill) * 31}px)`,
            transition: `transform 0.7s cubic-bezier(0.22,1,0.36,1) ${index * 40}ms`,
          }}
        />
      </g>
      <path d={DROP} fill="none" stroke={fill > 0 ? 'rgba(94,200,242,0.7)' : 'rgba(255,255,255,0.18)'} strokeWidth="1.2" />
      <path d="M8 18.5c0-2.2 1.2-4.6 2.4-6.4" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
