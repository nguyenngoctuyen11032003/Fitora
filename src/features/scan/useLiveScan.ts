import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { captureVideoFrame } from '@/lib/image';
import { AiScanError, scanFood } from '@/services/ai';
import type { AiErrorCode } from '@/types/db';
import { DARK_LUMA, frameDiff, meanLuma, STABLE_DIFF, toLuma } from './frame';
import { fromAiDish, type ScanDish } from './scale';
import { vibrate, type Shot } from './shot';

/* Live Scan tuning */
export const LIVE_INTERVAL = 3500; // min ms between AI calls
const LIVE_TICK = 500; // stability sampling
const LIVE_STABLE_MS = 900; // scene must be still this long
export const LIVE_CONFIDENT = 0.6; // pause when the best dish reaches this
export const LIVE_MAX_CALLS = 8; // per live session → protects the daily AI quota

export const LIVE_HINT_START = 'Giữ máy ổn định, đưa món vào khung';

export interface LiveResult {
  shot: Shot;
  dishes: ScanDish[];
  notes?: string;
  confidence: number;
}

interface Options {
  /** Live mode selected, screen in capture phase, camera ready and tab visible. */
  running: boolean;
  videoRef: RefObject<HTMLVideoElement>;
  makeShot: (blob: Blob, dataUrl: string) => Shot;
  /** Errors that end the session (quota, auth) → the page shows the full error panel. */
  onFatal: (code: AiErrorCode, message: string) => void;
}

/**
 * Hands-free scanning: samples a 32×24 thumbnail every 500 ms, waits for a still,
 * well-lit scene, then sends one frame to the AI — at most every 3.5 s and 8 times per
 * session. Pauses itself once a confident answer arrives.
 */
export function useLiveScan({ running, videoRef, makeShot, onFatal }: Options) {
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string>(LIVE_HINT_START);
  const [result, setResult] = useState<LiveResult | null>(null);

  const liveRef = useRef({ busy: false, lastSent: 0, stableSince: 0, prev: null as Uint8Array | null, sentThumb: null as Uint8Array | null, calls: 0, needChange: false });
  const thumbCanvas = useRef<HTMLCanvasElement | null>(null);
  const latest = useRef({ makeShot, onFatal });
  latest.current = { makeShot, onFatal };

  const active = running && !paused;

  useEffect(() => {
    if (!active) return;
    const L = liveRef.current;
    L.stableSince = 0;
    L.prev = null;
    let alive = true;
    const ctrl = new AbortController();

    const sample = (): Uint8Array | null => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return null;
      if (!thumbCanvas.current) {
        thumbCanvas.current = document.createElement('canvas');
        thumbCanvas.current.width = 32;
        thumbCanvas.current.height = 24;
      }
      const ctx = thumbCanvas.current.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0, 32, 24);
      return toLuma(ctx.getImageData(0, 0, 32, 24).data);
    };

    const send = async (thumb: Uint8Array) => {
      const v = videoRef.current;
      if (!v) return;
      L.busy = true;
      L.lastSent = performance.now();
      L.calls += 1;
      L.sentThumb = thumb;
      setBusy(true);
      setHint('Đang nhận diện…');
      try {
        const img = await captureVideoFrame(v, { maxSide: 960, quality: 0.75, type: 'image/jpeg' });
        const res = await scanFood(img.dataUrl, { mode: 'live', signal: ctrl.signal });
        if (!alive) return;
        const list = res.dishes.map((d) => fromAiDish(d));
        const confidence = Math.max(0, ...list.map((d) => d.confidence ?? 0));
        setResult({ shot: latest.current.makeShot(img.blob, img.dataUrl), dishes: list, notes: res.notes, confidence });
        if (confidence >= LIVE_CONFIDENT) {
          vibrate(30);
          setPaused(true);
          setHint('Đã nhận diện — kiểm tra & lưu');
        } else {
          L.needChange = true;
          setHint('Chưa chắc chắn — xoay góc hoặc lại gần hơn');
        }
      } catch (e) {
        if (!alive || (e as Error)?.name === 'AbortError') return;
        const code = e instanceof AiScanError ? e.code : null;
        if (code === 'not_food') {
          L.needChange = true;
          setHint('Chưa thấy món ăn — đưa món vào khung');
        } else if (code === 'quota_exceeded' || code === 'unauthorized') {
          setPaused(true);
          latest.current.onFatal(code, (e as AiScanError).message);
        } else {
          setPaused(true);
          setHint(code === 'network' ? 'Mất kết nối — đã tạm dừng' : 'AI tạm gián đoạn — đã tạm dừng');
        }
      } finally {
        L.busy = false;
        if (alive) setBusy(false);
        if (alive && L.calls >= LIVE_MAX_CALLS) {
          setPaused(true);
          setHint('Đã tạm dừng để tiết kiệm lượt quét');
        }
      }
    };

    const id = window.setInterval(() => {
      if (L.busy) return;
      const t = sample();
      if (!t) return;
      const now = performance.now();
      const diff = frameDiff(L.prev, t);
      L.prev = t;
      if (meanLuma(t) < DARK_LUMA) {
        L.stableSince = 0;
        setHint('Hơi tối — thêm ánh sáng hoặc bật đèn');
        return;
      }
      if (diff > STABLE_DIFF) {
        L.stableSince = 0;
        if (!L.needChange) setHint('Giữ máy ổn định…');
        // Enough movement away from the last sent frame → allow a new attempt.
        if (L.needChange && frameDiff(L.sentThumb, t) > STABLE_DIFF * 1.5) L.needChange = false;
        return;
      }
      if (!L.stableSince) L.stableSince = now;
      const waited = now - L.lastSent;
      const steady = now - L.stableSince >= LIVE_STABLE_MS;
      const freshScene = !L.needChange || waited > LIVE_INTERVAL * 3;
      if (steady && waited >= LIVE_INTERVAL && freshScene) void send(t);
      else if (steady && !L.needChange) setHint('Đã giữ ổn định — chuẩn bị quét');
    }, LIVE_TICK);

    return () => {
      alive = false;
      window.clearInterval(id);
      ctrl.abort();
      L.busy = false;
      setBusy(false);
    };
  }, [active, videoRef]);

  /** Continue after a pause; a shown result means "the scene must change first". */
  const resume = useCallback(() => {
    liveRef.current.calls = 0;
    setResult((r) => {
      liveRef.current.needChange = !!r;
      return null;
    });
    setHint(LIVE_HINT_START);
    setPaused(false);
  }, []);

  /** Fresh session (entering Live mode). */
  const reset = useCallback(() => {
    liveRef.current.calls = 0;
    liveRef.current.needChange = false;
    setPaused(false);
    setResult(null);
    setHint(LIVE_HINT_START);
  }, []);

  const pause = useCallback(() => setPaused(true), []);

  return { paused, busy, hint, result, resume, reset, pause };
}
