// "Xóa · Hoàn tác" for rows that cannot be recreated as they were (saved foods keep their
// use count, templates their history): the row is hidden at once, the real delete runs
// when the toast's undo window has passed. Pending deletes are flushed if the page is
// being hidden / closed so they are not silently lost.
import type { ToastApi } from '@/components/ui';

export const UNDO_MS = 5000;

const pending = new Map<number, () => void>();
let seq = 0;
let listening = false;

function flushAll() {
  for (const run of [...pending.values()]) run();
}

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('pagehide', flushAll);
}

export interface DeferredDeleteOptions {
  toast: Pick<ToastApi, 'show' | 'error'>;
  message: string;
  /** The real delete. */
  commit: () => Promise<void>;
  /** Put the row back (undo, or the delete failed). */
  restore: () => void;
  /** After a successful delete. */
  done?: () => void;
  delayMs?: number;
}

/** Hides now (caller already did), deletes after `delayMs` unless "Hoàn tác" is tapped. */
export function deferredDelete({ toast, message, commit, restore, done, delayMs = UNDO_MS }: DeferredDeleteOptions): void {
  listen();
  const id = ++seq;
  let settled = false;
  const run = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    pending.delete(id);
    commit()
      .then(() => done?.())
      .catch((err) => {
        restore();
        toast.error(err);
      });
  };
  const timer = setTimeout(run, delayMs + 300);
  pending.set(id, run);
  toast.show(message, {
    duration: delayMs,
    action: {
      label: 'Hoàn tác',
      onClick: () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pending.delete(id);
        restore();
      },
    },
  });
}

/** Test hook: run every pending delete now. */
export function flushPendingDeletes(): void {
  flushAll();
}
