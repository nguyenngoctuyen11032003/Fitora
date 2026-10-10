// Recharts themed to Ember Glass: no default blue, faint grid, glass tooltip, Albert Sans ticks.
import type { ReactNode } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { formatDayVi } from '@/lib/date';
import { formatKcal, formatKg, formatNumber } from '@/lib/format';
import { bmiCategory } from '@/lib/energy';
import type { DayPoint } from './lib';

// SVG presentation attributes don't reliably resolve CSS vars → hex mirrors of the tokens.
export const C = {
  gold: '#EDB40B',
  goldDeep: '#C27C06',
  ember: '#E1500A',
  burn: '#FF4D2E',
  text: '#EDE4D8',
  muted: 'rgba(235,220,205,0.55)',
  grid: 'rgba(255,255,255,0.06)',
} as const;

const TICK = { fill: C.muted, fontSize: 11, fontFamily: '"Albert Sans", system-ui, sans-serif', fontWeight: 600 } as const;

/** Glass tooltip shell. */
function GlassTip({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="glass-strong min-w-[150px] rounded-2xl bg-[rgba(24,14,10,0.92)] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)]">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{title}</p>
      <div className="flex flex-col gap-1 text-[13px]">{children}</div>
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
        {label}
      </span>
      <span className="tabular font-bold text-text">{value}</span>
    </div>
  );
}

// ───────────────────────── Calories ─────────────────────────

function CalorieTip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DayPoint;
  if (d.future) return null;
  return (
    <GlassTip title={formatDayVi(d.day)}>
      <TipRow color={C.gold} label="Nạp vào" value={d.logged ? formatKcal(d.kcalIn) : 'Chưa ghi'} />
      <TipRow color={C.burn} label="Tiêu hao" value={formatKcal(d.burned)} />
      {d.budget != null && <TipRow color={C.text} label="Ngân sách" value={formatKcal(d.budget)} />}
    </GlassTip>
  );
}

export function CalorieChart({ days, target, animate, monthly }: { days: DayPoint[]; target: number | null; animate: boolean; monthly: boolean }) {
  const maxVal = Math.max(target ?? 0, ...days.map((d) => Math.max(d.kcalIn ?? 0, d.burned ?? 0)));
  const top = Math.max(500, Math.ceil((maxVal * 1.12) / 500) * 500);
  return (
    <div className="h-[220px] w-full" role="img" aria-label="Biểu đồ calo nạp vào và tiêu hao theo ngày">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={days} margin={{ top: 12, right: 4, bottom: 0, left: -14 }} barCategoryGap={monthly ? '18%' : '28%'}>
          <defs>
            <linearGradient id="rp-in" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFE48A" />
              <stop offset="55%" stopColor={C.gold} />
              <stop offset="100%" stopColor={C.goldDeep} stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="tick"
            tick={TICK}
            tickLine={false}
            axisLine={false}
            interval={monthly ? 'preserveStartEnd' : 0}
            minTickGap={monthly ? 6 : 0}
            dy={4}
          />
          <YAxis
            tick={TICK}
            tickLine={false}
            axisLine={false}
            domain={[0, top]}
            tickCount={5}
            width={48}
            tickFormatter={(v: number) => (v >= 1000 ? `${formatNumber(v / 1000, 1)}k` : String(v))}
          />
          <Tooltip content={<CalorieTip />} cursor={{ fill: 'rgba(255,255,255,0.05)', radius: 8 }} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
          {target != null && (
            <ReferenceLine
              y={target}
              stroke={C.text}
              strokeOpacity={0.55}
              strokeDasharray="4 5"
              ifOverflow="extendDomain"
              label={{ value: 'Mục tiêu', position: 'insideTopRight', fill: C.text, fontSize: 10, fontWeight: 700, opacity: 0.7 }}
            />
          )}
          <Bar dataKey="kcalIn" name="Nạp vào" fill="url(#rp-in)" radius={[6, 6, 2, 2]} maxBarSize={28} isAnimationActive={animate} animationDuration={900} />
          <Line
            dataKey="burned"
            name="Tiêu hao"
            type="monotone"
            stroke={C.burn}
            strokeWidth={2.5}
            dot={monthly ? false : { r: 3, fill: C.burn, stroke: '#120906', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: C.burn, stroke: '#120906', strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={animate}
            animationDuration={1100}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ───────────────────────── Weight ─────────────────────────

function WeightTip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DayPoint;
  if (d.weight == null) return null;
  return (
    <GlassTip title={formatDayVi(d.day)}>
      <TipRow color={C.gold} label="Cân nặng" value={formatKg(d.weight)} />
      {d.bmi != null && <TipRow color={C.text} label="BMI" value={`${formatNumber(d.bmi, 1)} · ${bmiCategory(d.bmi).label}`} />}
    </GlassTip>
  );
}

export function WeightChart({ days, animate, monthly }: { days: DayPoint[]; animate: boolean; monthly: boolean }) {
  const ws = days.filter((d) => d.weight != null).map((d) => d.weight as number);
  const lo = Math.floor(Math.min(...ws) - 1);
  const hi = Math.ceil(Math.max(...ws) + 1);
  return (
    <div className="h-[180px] w-full" role="img" aria-label="Biểu đồ cân nặng theo ngày">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={days} margin={{ top: 10, right: 6, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id="rp-w" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.gold} stopOpacity={0.32} />
              <stop offset="100%" stopColor={C.ember} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="tick" tick={TICK} tickLine={false} axisLine={false} interval={monthly ? 'preserveStartEnd' : 0} minTickGap={6} dy={4} />
          <YAxis
            tick={TICK}
            tickLine={false}
            axisLine={false}
            domain={[lo, hi]}
            allowDecimals={false}
            tickCount={4}
            width={48}
          />
          <Tooltip content={<WeightTip />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} wrapperStyle={{ outline: 'none', zIndex: 5 }} />
          <Area
            dataKey="weight"
            type="monotone"
            stroke={C.gold}
            strokeWidth={2.5}
            fill="url(#rp-w)"
            connectNulls
            dot={{ r: 3.5, fill: C.gold, stroke: '#120906', strokeWidth: 2 }}
            activeDot={{ r: 5.5, fill: C.gold, stroke: '#120906', strokeWidth: 2 }}
            isAnimationActive={animate}
            animationDuration={1100}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
