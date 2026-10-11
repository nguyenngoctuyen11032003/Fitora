import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Columns2, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { GlassButton } from '@/components/ui/GlassButton';
import { Portal } from '@/components/ui/Portal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useFocusTrap } from '@/components/ui/useFocusTrap';
import { formatDayVi } from '@/lib/date';
import { formatKg } from '@/lib/format';
import type { BodyMeasurement, ProgressPhoto } from '@/types/db';
import { POSE_LABELS, weightOn } from './lib';

export interface PhotoViewerProps {
  photos: ProgressPhoto[];
  /** Index into photos, null = closed. */
  index: number | null;
  urls: Record<string, string>;
  rows: BodyMeasurement[];
  onIndex: (i: number | null) => void;
  /** Resolves when deleted (viewer shows its own inline confirm). */
  onDelete: (p: ProgressPhoto) => Promise<void>;
  onCompare: (p: ProgressPhoto) => void;
}

/** Fullscreen photo viewer (inside the frame): swipe / arrows to navigate, Esc to close. */
export function PhotoViewer({ photos, index, urls, rows, onIndex, onDelete, onCompare }: PhotoViewerProps) {
  const open = index !== null && !!photos[index];
  const panel = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => setConfirm(false), [index]);
  const close = () => onIndex(null);
  // Escape first dismisses the inline delete confirmation, then the viewer.
  useFocusTrap(panel, open, confirm ? () => setConfirm(false) : close);
  // The focused control can unmount (delete confirm closes, photo deleted → next one shown);
  // pull focus back into the dialog so Escape / Tab / arrows keep working.
  useEffect(() => {
    const el = panel.current;
    if (open && el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [open, confirm, index, photos.length]);

  const go = (d: 1 | -1) => {
    if (index === null) return;
    const n = index + d;
    if (n >= 0 && n < photos.length) onIndex(n);
  };

  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      // photos are newest first → "next" in time = left
      if (e.key === 'ArrowRight') goRef.current(1);
      else if (e.key === 'ArrowLeft') goRef.current(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Warm the neighbours so swiping shows the next photo instantly.
  useEffect(() => {
    if (index === null) return;
    for (const i of [index - 1, index + 1]) {
      const u = photos[i] && urls[photos[i].storage_path];
      if (u) {
        const img = new Image();
        img.decoding = 'async';
        img.src = u;
      }
    }
  }, [index, photos, urls]);

  if (!open || index === null) return null;
  const p = photos[index];
  const url = urls[p.storage_path];
  const w = weightOn(rows, p.taken_on, 3);

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    start.current = { x: e.clientX, y: e.clientY };
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const mx = e.clientX - start.current.x;
    const my = e.clientY - start.current.y;
    // Mostly vertical → it's a scroll / pull, not a swipe.
    if (!dx && Math.abs(my) > Math.abs(mx) && Math.abs(my) > 10) {
      start.current = null;
      return;
    }
    if (Math.abs(mx) > 6 && !e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.setPointerCapture?.(e.pointerId);
    // Rubber-band at the ends.
    const atEnd = (mx > 0 && index === 0) || (mx < 0 && index === photos.length - 1);
    setDx(atEnd ? mx / 3 : mx);
  };
  const up = () => {
    if (!start.current) return setDx(0);
    start.current = null;
    if (dx < -60) go(1);
    else if (dx > 60) go(-1);
    setDx(0);
  };

  return (
    <Portal>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Ảnh ngày ${formatDayVi(p.taken_on, 'long')}`}
        tabIndex={-1}
        className="pointer-events-auto absolute inset-0 z-[75] flex flex-col bg-[#060302] outline-none animate-fade-in"
      >
        <div className="flex items-center justify-between gap-2 px-4" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
          <GlassButton label="Đóng" onClick={close}>
            <X className="h-5 w-5" />
          </GlassButton>
          <span className="tabular text-[13px] font-semibold text-muted">
            {index + 1} / {photos.length}
          </span>
          <div className="flex gap-2">
            <GlassButton label="So sánh với ảnh khác" onClick={() => onCompare(p)}>
              <Columns2 className="h-5 w-5" />
            </GlassButton>
            <GlassButton label="Xóa ảnh" onClick={() => setConfirm(true)} active={confirm}>
              <Trash2 className="h-5 w-5 text-[var(--danger-text)]" />
            </GlassButton>
          </div>
        </div>

        <div
          className="relative flex min-h-0 flex-1 touch-pan-y select-none items-center justify-center px-2 py-3"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          {url ? (
            <img
              key={p.id}
              src={url}
              alt={`Ảnh tiến trình ${POSE_LABELS[p.pose].toLowerCase()} ngày ${formatDayVi(p.taken_on, 'long')}`}
              draggable={false}
              className="max-h-full max-w-full rounded-[20px] object-contain animate-scale-in"
              style={dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}
            />
          ) : (
            <Spinner size={28} />
          )}
          <button
            type="button"
            aria-label="Ảnh mới hơn"
            onClick={() => go(-1)}
            disabled={index === 0}
            className={clsx('glass circle absolute left-3 top-1/2 -translate-y-1/2', index === 0 && 'invisible')}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Ảnh cũ hơn"
            onClick={() => go(1)}
            disabled={index === photos.length - 1}
            className={clsx('glass circle absolute right-3 top-1/2 -translate-y-1/2', index === photos.length - 1 && 'invisible')}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5" style={{ paddingBottom: 'calc(var(--safe-bottom) + 18px)' }}>
          <p className="eyebrow !text-[10px] text-gold">{POSE_LABELS[p.pose]}</p>
          <div className="mt-1.5 flex items-end justify-between gap-3">
            <h2 className="display text-[28px] text-text">{formatDayVi(p.taken_on)}</h2>
            {w && (
              <span className="tabular pb-1 text-[15px] font-bold text-text">
                {w.exact ? '' : '≈ '}
                {formatKg(w.weight)}
              </span>
            )}
          </div>
          {p.note && <p className="mt-1.5 text-[14px] text-muted">{p.note}</p>}
          {confirm && (
            <div role="alertdialog" aria-label="Xác nhận xóa ảnh" className="glass-strong mt-4 flex flex-col gap-3 rounded-[22px] p-4 animate-fade-slide-up">
              <p className="text-[14px] text-text">Xóa vĩnh viễn ảnh này? Không thể hoàn tác.</p>
              <div className="flex gap-2.5">
                <Button variant="secondary" size="sm" block onClick={() => setConfirm(false)} disabled={deleting}>
                  Hủy
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  block
                  loading={deleting}
                  data-autofocus
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await onDelete(p);
                    } finally {
                      setDeleting(false);
                      setConfirm(false);
                    }
                  }}
                >
                  Xóa ảnh
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
