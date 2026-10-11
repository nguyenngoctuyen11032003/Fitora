import { ChevronsLeftRight, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { GlassButton } from '@/components/ui/GlassButton';
import { Portal } from '@/components/ui/Portal';
import { Segmented } from '@/components/ui/Segmented';
import { useFocusTrap } from '@/components/ui/useFocusTrap';
import { diffDays, formatDayVi } from '@/lib/date';
import { formatKg, formatNumber } from '@/lib/format';
import type { BodyMeasurement, Goal, ProgressPhoto } from '@/types/db';
import { DeltaBadge } from './DeltaBadge';
import { deltaTone, orderPair, POSE_LABELS, weightOn } from './lib';

type Mode = 'slider' | 'side';

export interface CompareViewProps {
  pair: [ProgressPhoto, ProgressPhoto] | null;
  urls: Record<string, string>;
  rows: BodyMeasurement[];
  goal?: Goal | null;
  onClose: () => void;
}

/** Before/after comparison: draggable slider overlay or side-by-side. Older photo = "Trước". */
export function CompareView({ pair, urls, rows, goal, onClose }: CompareViewProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('slider');
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  useFocusTrap(panel, !!pair, onClose);
  const pairKey = pair ? `${pair[0].id}|${pair[1].id}` : '';
  // A new pair starts centred.
  useEffect(() => {
    if (pairKey) setPos(50);
  }, [pairKey]);

  if (!pair) return null;
  const [before, after] = orderPair(pair[0], pair[1]);
  const wB = weightOn(rows, before.taken_on, 3);
  const wA = weightOn(rows, after.taken_on, 3);
  const days = diffDays(before.taken_on, after.taken_on);
  const dW = wB && wA ? Math.round((wA.weight - wB.weight) * 10) / 10 : null;

  const setFromX = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setFromX(e.clientX);
  };
  const move = (e: RPointerEvent) => dragging.current && setFromX(e.clientX);
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - step));
    else if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + step));
    else if (e.key === 'Home') setPos(0);
    else if (e.key === 'End') setPos(100);
    else return;
    e.preventDefault();
  };

  const label = (p: ProgressPhoto, tag: string) => (
    <span className="glass-strong pointer-events-none inline-flex flex-col rounded-xl px-2.5 py-1.5 text-left leading-tight">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">{tag}</span>
      <span className="text-[12px] font-semibold text-text">{formatDayVi(p.taken_on, 'short')}</span>
    </span>
  );

  return (
    <Portal>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="So sánh ảnh trước và sau"
        tabIndex={-1}
        className="pointer-events-auto absolute inset-0 z-[75] flex flex-col bg-[#060302] outline-none animate-fade-in"
      >
        <div className="flex items-center gap-3 px-4" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
          <GlassButton label="Đóng so sánh" onClick={onClose}>
            <X className="h-5 w-5" />
          </GlassButton>
          <Segmented
            options={[
              { value: 'slider', label: 'Trượt' },
              { value: 'side', label: 'Cạnh nhau' },
            ]}
            value={mode}
            onChange={setMode}
            size="sm"
            ariaLabel="Kiểu so sánh"
            className="flex-1"
          />
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-4">
          {mode === 'slider' ? (
            <div
              ref={box}
              className="relative aspect-[3/4] max-h-full w-full max-w-[420px] touch-none select-none overflow-hidden rounded-[22px] bg-white/[0.04] ring-1 ring-white/10"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              {/* After = base layer; Before clipped from the left up to the handle. */}
              <Img url={urls[after.storage_path]} alt={`Sau, ${formatDayVi(after.taken_on, 'long')}`} />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                <Img url={urls[before.storage_path]} alt={`Trước, ${formatDayVi(before.taken_on, 'long')}`} />
              </div>
              <div className="absolute left-2.5 top-2.5" style={{ opacity: pos > 18 ? 1 : 0 }}>{label(before, 'Trước')}</div>
              <div className="absolute right-2.5 top-2.5" style={{ opacity: pos < 82 ? 1 : 0 }}>{label(after, 'Sau')}</div>
              <div className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2 bg-gold shadow-[0_0_14px_rgba(237,180,11,0.8)]" style={{ left: `${pos}%` }} />
              <div
                role="slider"
                tabIndex={0}
                aria-label="Vị trí thanh so sánh"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pos)}
                aria-valuetext={`${Math.round(pos)}% ảnh trước`}
                onKeyDown={onKey}
                className="absolute top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gold text-[#1a0e02] shadow-[0_8px_24px_rgba(0,0,0,0.5)] ring-4 ring-black/30"
                style={{ left: `${pos}%` }}
              >
                <ChevronsLeftRight className="h-5 w-5" aria-hidden="true" />
              </div>
            </div>
          ) : (
            <div className="grid w-full max-w-[460px] grid-cols-2 gap-2.5">
              {[
                [before, 'Trước'],
                [after, 'Sau'],
              ].map(([p, tag]) => {
                const ph = p as ProgressPhoto;
                return (
                  <figure key={ph.id} className="relative aspect-[3/4] overflow-hidden rounded-[18px] bg-white/[0.04] ring-1 ring-white/10">
                    <Img url={urls[ph.storage_path]} alt={`${tag}, ${formatDayVi(ph.taken_on, 'long')}`} />
                    <figcaption className="absolute left-2 top-2">{label(ph, tag as string)}</figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="px-4" style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}>
          <div className="glass-card grid grid-cols-[1fr_auto_1fr] items-center gap-2 !rounded-[22px] p-4">
            <Side tag="Trước" p={before} w={wB?.weight ?? null} approx={wB ? !wB.exact : false} />
            <div className="flex flex-col items-center gap-1 px-1 text-center">
              <span className="num text-[30px] text-gradient-gold">{formatNumber(Math.abs(days))}</span>
              <span className="text-[11px] font-semibold text-muted">ngày</span>
              {dW !== null && <DeltaBadge delta={dW} unit="kg" tone={deltaTone('weight_kg', dW, goal)} size="sm" />}
            </div>
            <Side tag="Sau" p={after} w={wA?.weight ?? null} approx={wA ? !wA.exact : false} right />
          </div>
          {before.pose !== after.pose && (
            <p className="mt-2 text-center text-[12px] text-muted">
              Hai ảnh khác tư thế ({POSE_LABELS[before.pose]} · {POSE_LABELS[after.pose]}) — so sánh có thể chưa chính xác.
            </p>
          )}
        </div>
      </div>
    </Portal>
  );
}

function Img({ url, alt }: { url?: string; alt: string }) {
  return url ? (
    <img src={url} alt={alt} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
  ) : (
    <div className="skeleton absolute inset-0" aria-label="Đang tải ảnh" />
  );
}

function Side({ tag, p, w, approx, right }: { tag: string; p: ProgressPhoto; w: number | null; approx: boolean; right?: boolean }) {
  return (
    <div className={right ? 'text-right' : 'text-left'}>
      <p className="eyebrow !text-[10px]">{tag}</p>
      <p className="mt-1 text-[14px] font-bold text-text">{formatDayVi(p.taken_on, 'short')}</p>
      <p className="tabular text-[13px] text-muted">{w !== null ? `${approx ? '≈ ' : ''}${formatKg(w)}` : 'Chưa có cân nặng'}</p>
    </div>
  );
}
