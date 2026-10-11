import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onDataChanged } from '@/lib/events';
import { listCustomFoods } from '@/services/foods';
import { signedUrls } from '@/services/storage';
import type { CustomFood } from '@/types/db';

/**
 * The user's saved foods ("Món của tôi") for the scanner, refreshed when foods / meals
 * change elsewhere. A failed load (offline…) just leaves the list empty — the scanner
 * must keep working without it.
 */
export function useSavedFoods() {
  const [foods, setFoods] = useState<CustomFood[]>([]);
  const [loaded, setLoaded] = useState(false);
  const token = useRef(0);

  const reload = useCallback(async () => {
    const t = ++token.current;
    try {
      const list = await listCustomFoods();
      if (t === token.current) setFoods(list);
    } catch {
      /* keep what we have */
    } finally {
      if (t === token.current) setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    const off = onDataChanged((k) => {
      if (k === 'foods' || k === 'meals' || k === 'any') void reload();
    });
    const online = () => void reload();
    window.addEventListener('online', online);
    return () => {
      token.current++;
      off();
      window.removeEventListener('online', online);
    };
  }, [reload]);

  return { foods, loaded, reload, setFoods };
}

/** Signed URLs for the photos of the given saved foods (cached by the storage service). */
export function useFoodPhotoUrls(foods: Array<Pick<CustomFood, 'photo_path'>>): Record<string, string> {
  const paths = useMemo(() => [...new Set(foods.map((f) => f.photo_path).filter((p): p is string => !!p))].sort(), [foods]);
  const key = paths.join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!paths.length) return;
    let alive = true;
    signedUrls(paths)
      .then((map) => alive && setUrls((u) => ({ ...u, ...map })))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
