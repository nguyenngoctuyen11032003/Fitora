import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferredDelete, flushPendingDeletes, UNDO_MS } from './undo';

type Action = { label: string; onClick: () => void };

function fakeToast() {
  const shown: Array<{ message: string; action?: Action; duration?: number }> = [];
  const errors: unknown[] = [];
  return {
    shown,
    errors,
    api: {
      show: (message: string, opts?: { action?: Action; duration?: number }) => {
        shown.push({ message, action: opts?.action, duration: opts?.duration });
        return shown.length;
      },
      error: (e: unknown) => {
        errors.push(e);
        return 0;
      },
    },
  };
}

describe('deferredDelete', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('commits after the undo window', async () => {
    const t = fakeToast();
    const commit = vi.fn(() => Promise.resolve());
    const restore = vi.fn();
    const done = vi.fn();
    deferredDelete({ toast: t.api, message: 'Đã xóa', commit, restore, done });
    expect(t.shown[0]).toMatchObject({ message: 'Đã xóa', duration: UNDO_MS });
    expect(t.shown[0].action?.label).toBe('Hoàn tác');
    await vi.advanceTimersByTimeAsync(UNDO_MS - 100);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(restore).not.toHaveBeenCalled();
  });

  it('"Hoàn tác" restores and never deletes', async () => {
    const t = fakeToast();
    const commit = vi.fn(() => Promise.resolve());
    const restore = vi.fn();
    deferredDelete({ toast: t.api, message: 'x', commit, restore });
    t.shown[0].action!.onClick();
    t.shown[0].action!.onClick(); // double tap
    await vi.advanceTimersByTimeAsync(UNDO_MS * 2);
    expect(commit).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('a failed delete restores the row and shows the error', async () => {
    const t = fakeToast();
    const restore = vi.fn();
    deferredDelete({ toast: t.api, message: 'x', commit: () => Promise.reject(new Error('mạng')), restore });
    await vi.advanceTimersByTimeAsync(UNDO_MS + 400);
    expect(restore).toHaveBeenCalledTimes(1);
    expect(t.errors).toHaveLength(1);
  });

  it('flushes pending deletes immediately (page hidden) and only once', async () => {
    const t = fakeToast();
    const commit = vi.fn(() => Promise.resolve());
    deferredDelete({ toast: t.api, message: 'x', commit, restore: () => undefined });
    flushPendingDeletes();
    await vi.advanceTimersByTimeAsync(UNDO_MS * 2);
    expect(commit).toHaveBeenCalledTimes(1);
    // Undo after the flush is a no-op.
    t.shown[0].action!.onClick();
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
