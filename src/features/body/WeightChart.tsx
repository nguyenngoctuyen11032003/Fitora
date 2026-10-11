import { useId, useMemo, useState } from 'react';
import { Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Segmented } from '@/components/ui/Segmented';
import { formatDayVi, todayISO } from '@/lib/date';
import { formatKg, formatNumber } from '@/lib/format';
import { useReducedMotion } from '@/lib/hooks';
import type { BodyMeasurement } from '@/types/db';
import { defaultChartRange, movingAverage, weightSeries, type ChartRange, type SeriesPoint } from './lib';

type Range = ChartRange;
const RANGES: { value: Range; label: string }[] = [
  { value: '30', label: '30N' },
  { value: '90', label: '3T' },
  { value: '365', label: '1N' },
  { value: 'all', label: 'Tất cả' },
];

interface TipProps {
  active?: boolean;
  payload?: { payload: SeriesPoint }[];
  showAvg?: boolean;
}
function Tip({ active, payload, showAvg }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="glass-strong rounded-2xl px-3 py-2 text-[12px] shadow-xl">
      <p className="text-muted">{formatDayVi(p.date)}</p>
      <p className="tabular text-[15px] font-extrabold text-text">{formatKg(p.weight)}</p>
      {showAvg && <p className="tabular text-[11px] text-muted">TB 7 ngày {formatKg(p.avg)}</p>}
    </div>
  );
}

/** Show the 7-day average line from this many points (fewer → it would just duplicate the series). */
const AVG_MIN_POINTS = 4;

const DAY_MS = 86_400_000;
type ChartPoint = SeriesPoint & { ts: number };

/** Weight trend (gold series + 7-day moving average, crosshair tooltip, optional dashed target line). */
export function WeightChart({ rows, target }: { rows: BodyMeasurement[]; target?: number | null }) {
  const [range, setRange] = useState<Range>(() => defaultChartRange(rows, todayISO()));
  const reduced = useReducedMotion();
  const gid = useId().replace(/:/g, '');
  const today = todayISO();
  // Average over ALL weigh-ins, then window → the first point in range still averages its prior week.
  // Each point carries its timestamp so the x-axis is proportional to TIME: a gap of weeks
  // without weighing shows as a gap, instead of squeezing sparse points next to each other.
  const all = useMemo(
    () => movingAverage(weightSeries(rows, null, today)).map((p): ChartPoint => ({ ...p, ts: Date.parse(p.date) })),
    [rows, today],
  );
  const data = useMemo(() => {
    if (range === 'all') return all;
    const from = weightSeries(rows, Number(range), today)[0]?.date;
    return from ? all.filter((d) => d.date >= from) : [];
  }, [all, rows, range, today]);
  const showAvg = data.length >= AVG_MIN_POINTS;
  // Time domain (±half a day of padding; a lone point gets a day on each side).
  const [tsLo, tsHi] = useMemo((): [number, number] => {
    if (!data.length) return [0, 1];
    const a = data[0].ts;
    const b = data[data.length - 1].ts;
    return a === b ? [a - DAY_MS, b + DAY_MS] : [a - DAY_MS / 2, b + DAY_MS / 2];
  }, [data]);

  // Target joins the y-domain only when near the data; otherwise it would flatten the trend
  // (shown in the header instead).
  const { lo, hi, targetInView } = useMemo(() => {
    const vals = data.map((d) => d.weight);
    if (!vals.length) return { lo: 0, hi: 1, targetInView: false };
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const near = !!target && target >= min - Math.max(5, max - min) && target <= max + Math.max(5, max - min);
    if (near && target) {
      min = Math.min(min, target);
      max = Math.max(max, target);
    }
    const pad = Math.max(0.6, (max - min) * 0.15);
    return { lo: Math.floor((min - pad) * 2) / 2, hi: Math.ceil((max + pad) * 2) / 2, targetInView: near };
  }, [data, target]);

  const first = data[0];
  const last = data[data.length - 1];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        <div className="min-w-0">
          <p className="eyebrow !text-[10px]">Xu hướng cân nặng</p>
          {first && last && first !== last ? (
            <p className="mt-1 truncate text-[13px] text-muted">
              {formatDayVi(first.date, 'short')} → {formatDayVi(last.date, 'short')} · {data.length} lần cân
            </p>
          ) : (
            <p className="mt-1 text-[13px] text-muted">{data.length ? '1 lần cân trong khoảng này' : 'Chưa có dữ liệu trong khoảng này'}</p>
          )}
          {(showAvg || (target && !targetInView)) && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              {showAvg && (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-[2px] w-4 rounded-full bg-[rgba(245,236,226,0.75)]" />
                  Trung bình 7 ngày
                </span>
              )}
              {target && !targetInView ? <span>Mục tiêu {formatKg(target)} (ngoài khung)</span> : null}
            </p>
          )}
        </div>
        <Segmented options={RANGES} value={range} onChange={setRange} size="sm" ariaLabel="Khoảng thời gian" />
      </div>

      <div className="relative -mx-2 h-[150px]" role="img" aria-label={
          last
            ? `Biểu đồ cân nặng ${data.length} điểm, gần nhất ${formatKg(last.weight)}${showAvg ? `, trung bình 7 ngày ${formatKg(last.avg)}` : ''}`
            : 'Biểu đồ cân nặng trống'
        }>
        {data.length === 0 ? (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed border-line text-[13px] text-muted">
            Không có lần cân nào
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`wg-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EDB40B" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#EDB40B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={[tsLo, tsHi]}
                tickFormatter={(t: number) => formatDayVi(new Date(t).toISOString().slice(0, 10), 'short')}
                tick={{ fill: 'rgba(235,220,205,0.45)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[lo, hi]}
                width={34}
                tickCount={3}
                tickFormatter={(v: number) => formatNumber(v, 1)}
                tick={{ fill: 'rgba(235,220,205,0.45)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              {target && targetInView ? (
                <ReferenceLine
                  y={target}
                  stroke="rgba(127,209,139,0.7)"
                  strokeDasharray="4 4"
                  label={{ value: `Mục tiêu ${formatNumber(target, 1)}`, position: 'insideTopRight', fill: 'rgba(235,220,205,0.6)', fontSize: 10 }}
                />
              ) : null}
              <Tooltip content={<Tip showAvg={showAvg} />} cursor={{ stroke: 'rgba(237,180,11,0.5)', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <Area
                type="monotone"
                dataKey="weight"
                stroke="#EDB40B"
                strokeWidth={2}
                fill={`url(#wg-${gid})`}
                dot={data.length <= 12 ? { r: 3, fill: '#EDB40B', stroke: '#120906', strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: '#EDB40B', stroke: '#120906', strokeWidth: 2 }}
                isAnimationActive={!reduced}
                animationDuration={900}
              />
              {showAvg && (
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke="rgba(245,236,226,0.75)"
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={!reduced}
                  animationDuration={900}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
