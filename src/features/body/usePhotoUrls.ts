import { useEffect, useState } from 'react';
import { signedUrls } from '@/services/storage';

// In-memory cache for this session (on top of the storage service's own cache): keeps
// already-signed URLs across tab switches / remounts so thumbnails never flash.
const memo = new Map<string, { url: string; exp: number }>();
const TTL_MS = 50 * 60 * 1000; // signed for 60 min, refresh after 50

export function cachedPhotoUrl(path: string): string | undefined {
  const hit = memo.get(path);
  return hit && hit.exp > Date.now() ? hit.url : undefined;
}

/** Signed URLs for private storage paths (batched, cached). Returns path → url. */
export function usePhotoUrls(paths: string[]): { urls: Record<string, string>; error: unknown } {
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

  useEffect(() => {
    let alive = true;
    const missing = paths.filter((p) => !cachedPhotoUrl(p));
    const fromCache: Record<string, string> = {};
    for (const p of paths) {
      const u = cachedPhotoUrl(p);
      if (u) fromCache[p] = u;
    }
    setUrls((prev) => ({ ...prev, ...fromCache }));
    if (!missing.length) return;
    signedUrls(missing)
      .then((res) => {
        const exp = Date.now() + TTL_MS;
        for (const [p, u] of Object.entries(res)) memo.set(p, { url: u, exp });
        if (alive) setUrls((prev) => ({ ...prev, ...res }));
      })
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { urls, error };
}

/** Remember a URL we already have (e.g. the local dataUrl right after upload). */
export function primePhotoUrl(path: string, url: string) {
  memo.set(path, { url, exp: Date.now() + TTL_MS });
}
