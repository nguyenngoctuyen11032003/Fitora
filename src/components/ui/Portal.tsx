import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const OVERLAY_ROOT_ID = 'fitora-overlay-root';

/**
 * Renders children into #fitora-overlay-root — a position:absolute layer INSIDE
 * the phone frame (AppFrame), so sheets / modals / toasts stay inside the device
 * on desktop. Falls back to document.body.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setEl(document.getElementById(OVERLAY_ROOT_ID) ?? document.body);
  }, []);
  return el ? createPortal(children, el) : null;
}
