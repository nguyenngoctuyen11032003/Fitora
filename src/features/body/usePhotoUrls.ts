import { useCallback, useEffect, useState } from 'react';
import { signedUrls } from '@/services/storage';

// In-memory cache for this session (on top of the storage service's own cache): keeps
// already-signed URLs across tab switches / remounts so thumbnails never flash.
const memo = new Map<string, { url: string; exp: number; issued: number }>();
const TTL_MS = 50 * 60 * 1000; // signed for 60 min, refresh after 50
// The storage service keeps its own copy for ~58 min, so a refresh at 50 min may hand back the
// SAME url; that one is only good until its original 60 min, so re-check right after 58.5 min.
const SAME_URL_MS = 58.5 * 60 * 1000;

function remember(path: string, url: string, now = Date.now()) {
  const prev = memo.get(path);
  if (prev && prev.url === url) memo.set(path, { url, issued: prev.issued, exp: Math.max(prev.exp, prev.issued + SAME_URL_MS) });
  else memo.set(path, { url, issued: now, exp: now + TTL_MS });
}

export function cachedPhotoUrl(path: string): string | undefined {
  const hit = memo.get(path);
  return hit && hit.exp > Date.now() ? hit.url : undefined;
}

/**
 * Signed URLs for private storage paths (batched, cached). Returns path → url.
 * URLs are re-signed shortly before they expire while the page stays open, and a failed
 * signing round is exposed as `error` with a `retry()`.
 */
export function usePhotoUrls(paths: string[]): { urls: Record<string, string>; error: unknown; retry: () => void } {
  const key = paths.join('|');
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of paths) {
      const u = cachedPhotoUrl(p);
      if (u) init[p] = u;
    }
    return init;
  });
  const [error, setError] = useState<unknown>(null);
  const [round, setRound] = useState(0);
  const retry = useCallback(() => setRound((r) => r + 1), []);

  // Background tabs throttle timers (and phones suspend them): when the page becomes visible
  // again, re-sign only if something actually went stale — no refetch on every focus.
  useEffect(() => {
    if (!paths.length || typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState === 'visible' && paths.some((p) => !cachedPhotoUrl(p))) setRound((r) => r + 1);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const missing = paths.filter((p) => !cachedPhotoUrl(p));
    const fromCache: Record<string, string> = {};
    for (const p of paths) {
      const u = cachedPhotoUrl(p);
      if (u) fromCache[p] = u;
    }
    setUrls((prev) => ({ ...prev, ...fromCache }));

    // Re-run when the first cached URL is about to go stale (page left open for a long time).
    const schedule = () => {
      const exps = paths.map((p) => memo.get(p)?.exp ?? 0).filter((e) => e > Date.now());
      if (!exps.length) return;
      const wait = Math.min(...exps) - Date.now() + 1000;
      timer = setTimeout(() => alive && setRound((r) => r + 1), Math.max(1000, wait));
    };

    if (!missing.length) {
      setError(null);
      schedule();
    } else {
      signedUrls(missing)
        .then((res) => {
          for (const [p, u] of Object.entries(res)) remember(p, u);
          if (!alive) return;
          setUrls((prev) => ({ ...prev, ...res }));
          setError(null);
          schedule();
        })
        .catch((e) => alive && setError(e));
    }
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, round]);

  return { urls, error, retry };
}

/** Remember a URL we already have (e.g. the local dataUrl right after upload). */
export function primePhotoUrl(path: string, url: string) {
  remember(path, url);
}
