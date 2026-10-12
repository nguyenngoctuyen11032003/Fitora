import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { openUndoWindow } from '@/lib/undoWindow';
import { errorMessage } from '@/services/errors';
import { Portal } from './Portal';
import { claimToastAction } from './toastGuard';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastOptions {
  kind?: ToastKind;
  /** ms; default 3200 (errors 5000). 0 = sticky. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends Required<Pick<ToastOptions, 'kind' | 'duration'>> {
  id: number;
  message: string;
  action?: ToastOptions['action'];
  leaving?: boolean;
}

export interface ToastApi {
  show: (message: string, opts?: ToastOptions) => number;
  success: (message: string, opts?: Omit<ToastOptions, 'kind'>) => number;
  /** Accepts an Error / Supabase error / string → Vietnamese message. */
  error: (err: unknown, opts?: Omit<ToastOptions, 'kind'>) => number;
  info: (message: string, opts?: Omit<ToastOptions, 'kind'>) => number;
  dismiss: (id: number) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info } as const;
const COLORS = { success: 'text-ok', error: 'text-[var(--danger-text)]', info: 'text-gold' } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  // Toasts whose action already ran: a double-tap during the fade-out must not run it twice.
  const fired = useRef(new Set<number>());
  // Mirror of the visible items so show() can de-duplicate synchronously.
  const live = useRef<ToastItem[]>([]);
  live.current = items;

  // Auto-dismiss timers, pausable while the toast is hovered / focused (WCAG 2.2.1).
  const timers = useRef(new Map<number, { handle?: ReturnType<typeof setTimeout>; remaining: number; startedAt: number }>());

  // A toast with an action ("Hoàn tác") holds an undo window while it is on screen, so
  // deferred clean-ups (a deleted entry's photo) wait for it however long it is hovered.
  const holds = useRef(new Map<number, () => void>());
  const release = useCallback((id: number) => {
    holds.current.get(id)?.();
    holds.current.delete(id);
  }, []);

  useEffect(() => {
    const map = timers.current;
    const held = holds.current;
    return () => {
      map.forEach((t) => clearTimeout(t.handle));
      map.clear();
      held.forEach((free) => free());
      held.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    release(id);
    const t = timers.current.get(id);
    if (t) clearTimeout(t.handle);
    timers.current.delete(id);
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 220);
  }, [release]);

  const startTimer = useCallback(
    (id: number, ms: number) => {
      const prev = timers.current.get(id);
      if (prev) clearTimeout(prev.handle);
      timers.current.set(id, { handle: setTimeout(() => dismiss(id), ms), remaining: ms, startedAt: Date.now() });
    },
    [dismiss],
  );
  const pause = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (!t || t.handle === undefined) return;
    clearTimeout(t.handle);
    t.handle = undefined;
    t.remaining = Math.max(800, t.remaining - (Date.now() - t.startedAt));
  }, []);
  const resume = useCallback(
    (id: number) => {
      const t = timers.current.get(id);
      if (t && t.handle === undefined) startTimer(id, t.remaining);
    },
    [startTimer],
  );

  const show = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const kind = opts.kind ?? 'info';
      const duration = opts.duration ?? (kind === 'error' ? 5000 : 3200);
      // Several screens failing at once (offline…) must not stack the same message 3×.
      const dup = live.current.find((t) => !t.leaving && t.kind === kind && t.message === message && !t.action && !opts.action);
      if (dup) {
        // Repeated message: keep it on screen for a full duration again.
        if (dup.duration > 0 && timers.current.get(dup.id)?.handle !== undefined) startTimer(dup.id, dup.duration);
        return dup.id;
      }
      const id = ++seq.current;
      const item: ToastItem = { id, message, kind, duration, action: opts.action };
      live.current = [...live.current, item]; // visible to a second show() in the same tick
      if (item.action) holds.current.set(id, openUndoWindow());
      setItems((list) => {
        // Max 3 visible (leaving ones excluded): the oldest are evicted and drop their timers.
        const active = list.filter((t) => !t.leaving);
        const evict = new Set(active.slice(0, Math.max(0, active.length - 2)).map((t) => t.id));
        evict.forEach((eid) => {
          release(eid);
          clearTimeout(timers.current.get(eid)?.handle);
          timers.current.delete(eid);
        });
        return [...list.filter((t) => !evict.has(t.id)), item];
      });
      if (duration > 0) startTimer(id, duration);
      return id;
    },
    [startTimer, release],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (m, o) => show(m, { ...o, kind: 'success' }),
      info: (m, o) => show(m, { ...o, kind: 'info' }),
      error: (e, o) => show(typeof e === 'string' ? e : errorMessage(e), { ...o, kind: 'error' }),
    }),
    [show, dismiss],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <Portal>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[90] flex flex-col items-center gap-2 px-4 lg:items-end lg:px-6 lg:!pt-6"
          style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}
          aria-live="polite"
          aria-relevant="additions"
        >
          {items.map((t) => {
            const Icon = ICONS[t.kind];
            return (
              <div
                key={t.id}
                role={t.kind === 'error' ? 'alert' : 'status'}
                onPointerEnter={() => pause(t.id)}
                onPointerLeave={() => resume(t.id)}
                onFocus={() => pause(t.id)}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resume(t.id);
                }}
                className={clsx(
                  'glass-strong flex w-full max-w-[380px] items-center gap-3 rounded-2xl bg-[rgba(24,14,10,0.94)] py-2.5 pl-4 pr-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-200',
                  t.leaving ? 'pointer-events-none -translate-y-2 opacity-0' : 'pointer-events-auto animate-drop-in',
                )}
              >
                <Icon className={clsx('h-5 w-5 shrink-0', COLORS[t.kind])} aria-hidden="true" />
                <p className="min-w-0 flex-1 py-1 text-[14px] font-medium leading-snug text-text">{t.message}</p>
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      if (claimToastAction(fired.current, t.id)) t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="min-h-[44px] shrink-0 rounded-full px-3 text-sm font-bold text-gold hover:bg-white/5"
                  >
                    {t.action.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Đóng thông báo"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/5 hover:text-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </Portal>
    </ToastCtx.Provider>
  );
}
