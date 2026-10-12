import { describe, expect, it, vi } from 'vitest';
import { claimToastAction } from './toastGuard';

describe('claimToastAction', () => {
  it('chỉ cho chạy hành động của một toast đúng một lần (chạm đúp vào "Hoàn tác")', () => {
    const fired = new Set<number>();
    const undo = vi.fn();
    for (let i = 0; i < 3; i++) if (claimToastAction(fired, 7)) undo();
    expect(undo).toHaveBeenCalledOnce();
  });
  it('toast khác vẫn chạy được hành động của nó', () => {
    const fired = new Set<number>();
    expect(claimToastAction(fired, 1)).toBe(true);
    expect(claimToastAction(fired, 2)).toBe(true);
    expect(claimToastAction(fired, 1)).toBe(false);
  });
});
