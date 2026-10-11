import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Eye button for the `trailing` slot of a password Input. */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      aria-pressed={shown}
      className="-mr-2 grid h-11 w-11 place-items-center rounded-full text-muted hover:text-text"
    >
      {shown ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
}

/**
 * Seconds left before an e-mail can be re-sent. Supabase rate-limits auth e-mails
 * (≈ 1 per 60 s per address); counting down beats a "thao tác quá nhanh" error.
 */
export function useCooldown(): [number, (seconds?: number) => void] {
  const [left, setLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);
  const start = (seconds = 60) => {
    if (timer.current) clearInterval(timer.current);
    setLeft(seconds);
    timer.current = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };
  return [left, start];
}
