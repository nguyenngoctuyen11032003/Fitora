import { useCallback, useEffect, useMemo, useRef } from 'react';

/** A captured / picked photo: the compressed blob, its data URL (for the AI) and an object URL (for <img>). */
export interface Shot {
  blob: Blob;
  dataUrl: string;
  url: string;
}

/**
 * Owns the object URLs of every Shot created on the screen. `release(keep)` revokes the
 * ones no longer shown (Live Scan can create many), and everything is revoked on unmount.
 */
export function useShots() {
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const set = urls.current;
    return () => {
      set.forEach((u) => URL.revokeObjectURL(u));
      set.clear();
    };
  }, []);

  const make = useCallback((blob: Blob, dataUrl: string): Shot => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return { blob, dataUrl, url };
  }, []);

  const release = useCallback((keep: (Shot | null | undefined)[]) => {
    const alive = new Set(keep.filter(Boolean).map((s) => s!.url));
    urls.current.forEach((u) => {
      if (!alive.has(u)) {
        URL.revokeObjectURL(u);
        urls.current.delete(u);
      }
    });
  }, []);

  return useMemo(() => ({ make, release }), [make, release]);
}

export const vibrate = (ms: number) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
};
