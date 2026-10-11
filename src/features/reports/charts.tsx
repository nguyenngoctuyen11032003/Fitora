// Recharts themed to Ember Glass: no default blue, faint grid, glass tooltip, Albert Sans ticks.
// Loaded lazily by sections.tsx (keeps recharts out of the page's first chunk); the fixed-height
// frame, accessible label and data table live in sections.tsx so there is no layout shift.
import { useId, type ReactNode } from 'react';
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
import { ddmm, type DayPoint } from './lib';

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

/** Short, snappy entrance (disabled entirely under prefers-reduced-motion via `animate`). */
const ANIM_MS = 450;
const FONT = '"Albert Sans", system-ui, sans-serif';
const TICK = { fill: C.muted, fontSize: 11, fontFamily: FONT, fontWeight: 600 } as const;

/** Month axis: label day 1, every 5th day and the last day — readable at 360px. */
function monthTick(day: string, last: string): boolean {
  const d = Number(day.slice(8, 10));
  return d === 1 || d % 5 === 0 || day === last;
}

/** Two-line weekday tick for weeks: "T2" over "12/10". */
function WeekTick({ x, y, payload, days }: { x?: number; y?: number; payload?: { value: string }; days: DayPoint[] }) {
  const d = days.find((p) => p.day === payload?.value);
  if (!d) return null;
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text textAnchor="middle" dy={10} fill={d.isToday ? C.gold : C.muted} fontSize={11} fontWeight={700} fontFamily={FONT}>
        {d.tick}
      </text>
      <text textAnchor="middle" dy={23} fill={C.muted} fontSize={9.5} fontWeight={500} fontFamily={FONT} opacity={0.8}>
        {ddmm(d.day)}
      </text>
    </g>
  );
}

function xAxisProps(days: DayPoint[], monthly: boolean) {
  if (monthly) {
    const last = days[days.length - 1]?.day ?? '';
    return {
      dataKey: 'day',
      tick: TICK,
      interval: 0 as const,
      height: 24,
      tickFormatter: (day: string) => (monthTick(day, last) ? String(Number(day.slice(8, 10))) : ''),
    };
  }
  return { dataKey: 'day', tick: <WeekTick days={days} />, interval: 0 as const, height: 34 };
}

/** Glass tooltip shell. */
function GlassTip({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div
      className="glass-strong min-w-[150px] max-w-[220px] rounded-2xl bg-[rgba(24,14,10,0.92)] px-3.5 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
      role="status"
      aria-live="polite"
    >
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{title}</p>
      <div className="flex flex-col gap-1 text-[13px]">{children}</div>
    </div>
  );
}

function TipRow({ color, label, value, dashed }: { color: string; label: string; value: string; dashed?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-muted">
        {dashed ? (
          <span className="h-0 w-2.5 border-t-2 border-dashed" style={{ borderColor: color }} aria-hidden="true" />
        ) : (
          <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
        )}
        {label}
      </span>
      <span className="tabular font-bold text-text">{value}</span>
    </div>
  );
}

const tipWrapper = { outline: 'none', zIndex: 5, pointerEvents: 'none' } as const;

// ───────────────────────── Calories ─────────────────────────

function CalorieTip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DayPoint;
  if (d.future) return null;
  return (
    <GlassTip title={formatDayVi(d.day)}>
      <TipRow color={C.gold} label="Nạp vào" value={d.logged ? formatKcal(d.kcalIn) : 'Chưa ghi'} />
      <TipRow color={C.burn} label="Vận động" value={formatKcal(d.burned)} />
      {d.budget != null && <TipRow color={C.text} label="Ngân sách" value={formatKcal(d.budget)} dashed />}
      {d.isToday && d.logged && <p className="mt-0.5 text-[11.5px] text-muted">Chưa hết ngày — chưa tính vào cân bằng</p>}
      {d.partial && <p className="mt-0.5 text-[11.5px] text-muted">Ghi chưa đủ — không tính vào cân bằng</p>}
    </GlassTip>
  );
}

export function CalorieChart({ days, target, animate, monthly }: { days: DayPoint[]; target: number | null; animate: boolean; monthly: boolean }) {
  const gid = `rp-in-${useId().replace(/:/g, '')}`;
  const maxVal = Math.max(target ?? 0, ...days.map((d) => Math.max(d.kcalIn ?? 0, d.burned ?? 0)));
  const top = Math.max(500, Math.ceil((maxVal * 1.12) / 500) * 500);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={days}
        margin={{ top: 12, right: 4, bottom: 0, left: -14 }}
        barCategoryGap={monthly ? '18%' : '28%'}
        accessibilityLayer
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFE48A" />
            <stop offset="55%" stopColor={C.gold} />
            <stop offset="100%" stopColor={C.goldDeep} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis {...xAxisProps(days, monthly)} tickLine={false} axisLine={false} />
        <YAxis
          tick={TICK}
          tickLine={false}
          axisLine={false}
          domain={[0, top]}
          tickCount={5}
          width={48}
          tickFormatter={(v: number) => (v >= 1000 ? `${formatNumber(v / 1000, 1)}k` : String(v))}
        />
        <Tooltip content={<CalorieTip />} cursor={{ fill: 'rgba(255,255,255,0.05)', radius: 8 }} wrapperStyle={tipWrapper} isAnimationActive={false} />
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
        <Bar dataKey="kcalIn" name="Nạp vào" fill={`url(#${gid})`} radius={[6, 6, 2, 2]} maxBarSize={28} isAnimationActive={animate} animationDuration={ANIM_MS} />
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
          animationDuration={ANIM_MS}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ───────────────────────── Weight ─────────────────────────

function WeightTip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DayPoint;
  if (d.weight == null && d.weightTrend == null) return null;
  return (
    <GlassTip title={formatDayVi(d.day)}>
      {d.weight != null && <TipRow color={C.gold} label="Cân nặng" value={formatKg(d.weight)} />}
      {d.weightTrend != null && <TipRow color={C.ember} label="Xu hướng" value={formatKg(d.weightTrend)} dashed />}
      {d.bmi != null && <TipRow color={C.text} label="BMI" value={`${formatNumber(d.bmi, 1)} · ${bmiCategory(d.bmi).label}`} />}
    </GlassTip>
  );
}

export function WeightChart({ days, animate, monthly }: { days: DayPoint[]; animate: boolean; monthly: boolean }) {
  const gid = `rp-w-${useId().replace(/:/g, '')}`;
  const ws = days.flatMap((d) => [d.weight, d.weightTrend]).filter((v): v is number => v != null);
  const lo = ws.length ? Math.floor(Math.min(...ws) - 1) : 0;
  const hi = ws.length ? Math.ceil(Math.max(...ws) + 1) : 1;
  const hasTrend = days.some((d) => d.weightTrend != null);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={days} margin={{ top: 10, right: 6, bottom: 0, left: -14 }} accessibilityLayer>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.gold} stopOpacity={0.32} />
            <stop offset="100%" stopColor={C.ember} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis {...xAxisProps(days, monthly)} tickLine={false} axisLine={false} />
        <YAxis tick={TICK} tickLine={false} axisLine={false} domain={[lo, hi]} allowDecimals={false} tickCount={4} width={48} />
        <Tooltip content={<WeightTip />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} wrapperStyle={tipWrapper} isAnimationActive={false} />
        <Area
          dataKey="weight"
          name="Cân nặng"
          type="monotone"
          stroke={C.gold}
          strokeWidth={2.5}
          fill={`url(#${gid})`}
          connectNulls
          dot={{ r: 3.5, fill: C.gold, stroke: '#120906', strokeWidth: 2 }}
          activeDot={{ r: 5.5, fill: C.gold, stroke: '#120906', strokeWidth: 2 }}
          isAnimationActive={animate}
          animationDuration={ANIM_MS}
        />
        {hasTrend && (
          <Line
            dataKey="weightTrend"
            name="Xu hướng"
            type="linear"
            stroke={C.ember}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={animate}
            animationDuration={ANIM_MS}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
