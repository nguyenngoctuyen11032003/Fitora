import { afterEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, reloadOnce } from './ErrorBoundary';

describe('isChunkLoadError', () => {
  it('nhận ra lỗi tải chunk của Chrome, Safari, Firefox và Vite', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x.github.io/Fitora/assets/BodyPage-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/scan.css'))).toBe(true);
  });
  it('không coi lỗi render thường là lỗi chunk', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of null (reading 'kcal')"))).toBe(false);
    expect(isChunkLoadError('Rendered more hooks than during the previous render.')).toBe(false);
  });
});

describe('reloadOnce', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(onLine: boolean, last?: number) {
    const store = new Map<string, string>(last ? [['fitora.chunk-reload', String(last)]] : []);
    const reload = vi.fn();
    vi.stubGlobal('navigator', { onLine });
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('window', { location: { reload } });
    return reload;
  }

  it('tải lại một lần khi có mạng', () => {
    const reload = stub(true);
    expect(reloadOnce()).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    // Lần thứ hai trong vòng 1 phút: không lặp.
    expect(reloadOnce()).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('không tải lại khi đang ngoại tuyến', () => {
    const reload = stub(false);
    expect(reloadOnce()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('không tải lại nếu vừa tải lại chưa đầy 1 phút', () => {
    const reload = stub(true, Date.now() - 10_000);
    expect(reloadOnce()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
