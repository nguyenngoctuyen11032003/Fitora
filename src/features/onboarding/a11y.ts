// Keyboard helpers for the onboarding / goals forms (WAI-ARIA radio group pattern).
import type { KeyboardEvent } from 'react';

const NEXT = new Set(['ArrowDown', 'ArrowRight']);
const PREV = new Set(['ArrowUp', 'ArrowLeft']);

/**
 * onKeyDown for a `role="radiogroup"` made of `role="radio"` buttons: arrow keys
 * move focus AND select (wrapping), Home/End jump to the ends. Radios of a
 * nested group (e.g. the pace picker inside the "Giảm cân" card) are ignored.
 */
export function radioGroupKeys(e: KeyboardEvent<HTMLElement>) {
  const group = e.currentTarget;
  const target = e.target as HTMLElement;
  if (target.getAttribute('role') !== 'radio' || target.closest('[role="radiogroup"]') !== group) return;
  const isNext = NEXT.has(e.key);
  const isPrev = PREV.has(e.key);
  if (!isNext && !isPrev && e.key !== 'Home' && e.key !== 'End') return;
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).filter(
    (r) => r.closest('[role="radiogroup"]') === group && !r.hasAttribute('disabled'),
  );
  const i = radios.indexOf(target);
  if (i < 0 || radios.length === 0) return;
  e.preventDefault();
  e.stopPropagation();
  const j =
    e.key === 'Home' ? 0 : e.key === 'End' ? radios.length - 1 : (i + (isNext ? 1 : -1) + radios.length) % radios.length;
  const el = radios[j];
  el.focus();
  el.click();
}

/** True when Enter on this element should advance the wizard (text-like inputs only). */
export function isEnterAdvanceTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLInputElement)) return false;
  return !['button', 'submit', 'checkbox', 'radio', 'range', 'file', 'reset'].includes(el.type);
}
