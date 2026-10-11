import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '@/lib/format';

export interface CountUpProps {
  value: number;
  /** ms (default 2200, ease-out cubic). */
  duration?: number;
  decimals?: 0 | 1 | 2;
  /** Custom formatter (default vi-VN number). */
  format?: (n: number) => string;
  className?: string;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Animated number (from the previous value to the new one). Instant under reduced motion.
 * Screen readers read the live text on demand (no live region), so it isn't announced per frame.
 */
export function CountUp({ value, duration = 2200, decimals = 0, format, className }: CountUpProps) {
  const [n, setN] = useState(() => (reduced() ? value : 0));
  const from = useRef(reduced() ? value : 0);
  const raf = useRef(0);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    if (reduced() || duration <= 0) {
      setN(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const a = from.current;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = a + (target - a) * eased;
      setN(cur);
      from.current = cur;
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  const text = format ? format(n) : formatNumber(n, decimals);
  // Plain text: aria-label on a generic <span> is ignored by most screen readers, and the old
  // aria-hidden inner span left the number with no accessible text at all.
  return <span className={className}>{text}</span>;
}
