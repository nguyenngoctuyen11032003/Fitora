import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode, type RefObject } from 'react';
import { Portal } from './Portal';
import { useFocusTrap } from './useFocusTrap';

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky footer (actions) — stays above the home indicator. */
  footer?: ReactNode;
  /** 'auto' (content height, max 92%) or 'full' (92% fixed). */
  height?: 'auto' | 'full';
  /** Allow closing by backdrop / swipe / Esc (default true). */
  dismissible?: boolean;
  /** Element to focus when opened. */
  initialFocus?: RefObject<HTMLElement>;
  className?: string;
}

const CLOSE_MS = 280;

/**
 * Bottom sheet inside the phone frame: drag handle + swipe-down to close,
 * focus trap, Esc, backdrop click. Renders into #fitora-overlay-root.
 */
export function BottomSheet({ open, onClose, title, description, children, footer, height = 'auto', dismissible = true, initialFocus, className }: BottomSheetProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const start = useRef<{ y: number; t: number } | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      setDrag(0);
    } else if (mounted) {
      setClosing(true);
      const t = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, CLOSE_MS);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const requestClose = () => {
    if (dismissible) onClose();
  };
  useFocusTrap(panel, open && mounted, requestClose, initialFocus);

  const onPointerDown = (e: RPointerEvent) => {
    if (!dismissible) return;
    // Only start a drag from the handle area, or from the body when it is scrolled to top.
    const fromHandle = (e.target as HTMLElement).closest('[data-sheet-handle]');
    if (!fromHandle && (body.current?.scrollTop ?? 0) > 0) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, button, a, [role="slider"]') && !fromHandle) return;
    start.current = { y: e.clientY, t: performance.now() };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent) => {
    if (!start.current) return;
    setDrag(Math.max(0, e.clientY - start.current.y));
  };
  const onPointerUp = () => {
    if (!start.current) return;
    const dt = performance.now() - start.current.t;
    const h = panel.current?.offsetHeight ?? 400;
    const velocity = drag / Math.max(dt, 1);
    start.current = null;
    if (drag > h * 0.28 || (velocity > 0.6 && drag > 40)) onClose();
    else setDrag(0);
  };

  if (!mounted) return null;

  return (
    <Portal>
      <div className="pointer-events-auto absolute inset-0 z-[60] flex flex-col justify-end" role="presentation">
        <div
          aria-hidden="true"
          onClick={requestClose}
          className={clsx('absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300', closing ? 'opacity-0' : 'animate-fade-in')}
          style={drag ? { opacity: Math.max(0.2, 1 - drag / 500) } : undefined}
        />
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? titleId : undefined}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={clsx(
            'glass-strong relative flex max-h-[92%] flex-col rounded-t-[28px] border-b-0 bg-[rgba(24,14,10,0.94)] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] outline-none',
            height === 'full' && 'h-[92%]',
            !drag && (closing ? 'translate-y-full transition-transform duration-300 ease-in' : 'animate-sheet-up'),
            className,
          )}
          style={drag ? { transform: `translateY(${drag}px)` } : undefined}
        >
          <div data-sheet-handle className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-3 active:cursor-grabbing">
            <span className="h-[5px] w-10 rounded-full bg-white/25" aria-hidden="true" />
          </div>
          {(title || dismissible) && (
            <div data-sheet-handle className="flex shrink-0 touch-none items-start gap-3 px-5 pb-3 pt-1">
              <div className="min-w-0 flex-1 pt-1.5">
                {title && (
                  <h2 id={titleId} className="display text-[24px] text-text">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descId} className="mt-1.5 text-sm text-muted">
                    {description}
                  </p>
                )}
              </div>
              {dismissible && (
                <button type="button" onClick={onClose} aria-label="Đóng" className="glass circle text-text">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
          <div ref={body} className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
            {children}
          </div>
          {footer && <div className="shrink-0 border-t border-line px-5 pb-[calc(16px+var(--safe-bottom))] pt-3">{footer}</div>}
          {!footer && <div className="shrink-0" style={{ height: 'var(--safe-bottom)' }} />}
        </div>
      </div>
    </Portal>
  );
}
