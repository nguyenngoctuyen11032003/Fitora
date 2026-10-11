import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * Keeps Tab focus inside `ref` while active, closes on Escape, moves focus in on open
 * and restores it to the previously focused element on close.
 */
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, onEscape?: () => void, initialFocus?: RefObject<HTMLElement>) {
  // Latest handler: callers pass inline closures (e.g. dismissible ? onClose : undefined)
  // whose captured state changes after the trap was activated.
  const escRef = useRef(onEscape);
  escRef.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;

    const focusFirst = () => {
      const target = initialFocus?.current ?? root.querySelector<HTMLElement>('[data-autofocus]') ?? root;
      target.focus({ preventScroll: true });
    };
    const id = requestAnimationFrame(focusFirst);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // An Escape that cancels an IME composition (mobile keyboards) must not also close the dialog.
        if (e.isComposing || e.keyCode === 229) return;
        e.stopPropagation();
        if (escRef.current) {
          e.preventDefault(); // we close — don't let the browser also act on it (e.g. exit fullscreen)
          escRef.current();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(id);
      root.removeEventListener('keydown', onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
