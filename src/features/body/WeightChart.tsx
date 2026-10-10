import { useId, useMemo, useState } from 'react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Segmented } from '@/components/ui/Segmented';
import { formatDayVi, todayISO } from '@/lib/date';
import { formatKg, formatNumber } from '@/lib/format';
import { useReducedMotion } from '@/lib/hooks';
import type { BodyMeasurement } from '@/types/db';
import { weightSeries } from './lib';

type Range = '30' | '90' | '365' | 'all';
const RANGES: { value: Range; label: string }[] = [
  { value: '30', label: '30N' },
  { value: '90', label: '3T' },
  { value: '365', label: '1N' },
  { value: 'all', label: 'Tất cả' },
];

interface TipProps {
  active?: boolean;
  payload?: { payload: { date: string; weight: number } }[];
}
function Tip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="glass-strong rounded-2xl px-3 py-2 text-[12px] shadow-xl">
      <p className="text-muted">{formatDayVi(p.date)}</p>
      <p className="tabular text-[15px] font-extrabold text-text">{formatKg(p.weight)}</p>
    </div>
  );
}

/** Weight trend (single gold series, crosshair tooltip, optional dashed target line). */
export function WeightChart({ rows, target }: { rows: BodyMeasurement[]; target?: number | null }) {
  const [range, setRange] = useState<Range>('90');
  const reduced = useReducedMotion();
  const gid = useId().replace(/:/g, '');
  const today = todayISO();
  const data = useMemo(() => weightSeries(rows, range === 'all' ? null : Number(range), today), [rows, range, today]);

  const [lo, hi] = useMemo(() => {
    const vals = data.map((d) => d.weight);
    if (target) vals.push(target);
    if (!vals.length) return [0, 1];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max(0.6, (max - min) * 0.15);
    return [Math.floor((min - pad) * 2) / 2, Math.ceil((max + pad) * 2) / 2];
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
        </div>
        <Segmented options={RANGES} value={range} onChange={setRange} size="sm" ariaLabel="Khoảng thời gian" />
      </div>

      <div className="relative -mx-2 h-[150px]" role="img" aria-label={`Biểu đồ cân nặng ${data.length} điểm`}>
        {data.length === 0 ? (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed border-line text-[13px] text-muted">
            Không có lần cân nào
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`wg-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EDB40B" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#EDB40B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => formatDayVi(d, 'short')}
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
              {target ? (
                <ReferenceLine
                  y={target}
                  stroke="rgba(127,209,139,0.7)"
                  strokeDasharray="4 4"
                  label={{ value: `Mục tiêu ${formatNumber(target, 1)}`, position: 'insideTopRight', fill: 'rgba(235,220,205,0.6)', fontSize: 10 }}
                />
              ) : null}
              <Tooltip content={<Tip />} cursor={{ stroke: 'rgba(237,180,11,0.5)', strokeWidth: 1, strokeDasharray: '3 3' }} />
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
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
