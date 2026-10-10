import clsx from 'clsx';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '@/services/errors';
import { Portal } from './Portal';

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

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 220);
  }, []);

  const show = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const id = ++seq.current;
      const kind = opts.kind ?? 'info';
      const duration = opts.duration ?? (kind === 'error' ? 5000 : 3200);
      setItems((list) => [...list.slice(-2), { id, message, kind, duration, action: opts.action }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
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
          className="pointer-events-none absolute inset-x-0 top-0 z-[90] flex flex-col items-center gap-2 px-4"
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
                className={clsx(
                  'glass-strong pointer-events-auto flex w-full max-w-[380px] items-center gap-3 rounded-2xl bg-[rgba(24,14,10,0.94)] py-2.5 pl-4 pr-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-200',
                  t.leaving ? '-translate-y-2 opacity-0' : 'animate-drop-in',
                )}
              >
                <Icon className={clsx('h-5 w-5 shrink-0', COLORS[t.kind])} aria-hidden="true" />
                <p className="min-w-0 flex-1 py-1 text-[14px] font-medium leading-snug text-text">{t.message}</p>
                {t.action && (
                  <button
                    type="button"
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="min-h-[40px] shrink-0 rounded-full px-3 text-sm font-bold text-gold hover:bg-white/5"
                  >
                    {t.action.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Đóng thông báo"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/5 hover:text-text"
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
