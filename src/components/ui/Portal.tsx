import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const OVERLAY_ROOT_ID = 'fitora-overlay-root';

const findRoot = () => (typeof document !== 'undefined' ? document.getElementById(OVERLAY_ROOT_ID) : null);

/**
 * Renders children into #fitora-overlay-root — a position:absolute layer INSIDE
 * the phone frame (AppFrame), so sheets / modals / toasts stay inside the device
 * on desktop. Falls back to document.body.
 *
 * The root is looked up during the first render when it already exists (every
 * sheet/modal/menu opened after boot), so the portal content — and the refs the
 * focus trap needs — exist in the same commit as the opener's effects. Only the
 * ToastProvider, rendered before AppFrame on boot, waits for the layout effect.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(findRoot);
  useLayoutEffect(() => {
    if (!el) setEl(findRoot() ?? document.body);
  }, [el]);
  return el ? createPortal(children, el) : null;
}
