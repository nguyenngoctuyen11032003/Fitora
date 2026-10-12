import { useEffect, useState, type ReactNode } from 'react';
import { OVERLAY_ROOT_ID } from '@/components/ui/Portal';

function StatusBar() {
  const fmt = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const [time, setTime] = useState(fmt);
  useEffect(() => {
    const id = window.setInterval(() => setTime(fmt()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="fitora-frame__status hidden text-text md:flex lg:hidden" aria-hidden="true">
      <span className="tabular">{time}</span>
      <span className="flex items-center gap-1.5">
        {/* signal */}
        <svg width="18" height="11" viewBox="0 0 18 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="5" y="5" width="3" height="6" rx="1" />
          <rect x="10" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="15" y="0" width="3" height="11" rx="1" />
        </svg>
        {/* wifi */}
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
          <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.1-1.2A10 10 0 0 0 8 .6 10 10 0 0 0 .9 3.4L2 4.6a8.4 8.4 0 0 1 6-2.4Zm0 3.2c1.4 0 2.7.5 3.7 1.4l1.1-1.2A7 7 0 0 0 8 3.8a7 7 0 0 0-4.8 1.8l1.1 1.2c1-.9 2.3-1.4 3.7-1.4Zm0 3.2c.6 0 1.1.2 1.5.6L8 10.8 6.5 9.2c.4-.4.9-.6 1.5-.6Z" />
        </svg>
        {/* battery */}
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity=".45" />
          <rect x="2" y="2" width="15" height="8" rx="1.6" fill="currentColor" />
          <path d="M24 4v4c.8-.3 1.3-1 1.3-2S24.8 4.3 24 4Z" fill="currentColor" opacity=".45" />
        </svg>
      </span>
    </div>
  );
}

/**
 * Device shell.
 *  - < 768px: full-bleed app, 100dvh, real safe-area insets.
 *  - 768–1023px (tablet): warm page background + phone frame (54px radius, dynamic island, side
 *    buttons), content rendered at the frame's real size (no transform scaling).
 *  - ≥ 1024px (laptop): full-window app; ShellLayout adds the sidebar and pages switch to wide grids.
 * The DOM structure is the same at every width (CSS-only switch), so #fitora-overlay-root
 * never remounts and portals stay valid.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className="fitora-root flex min-h-[100dvh] w-full items-center justify-center md:gap-[clamp(32px,6vw,120px)] md:px-8 md:py-6">
      {/* Phone: pinned to all four edges. iOS home-screen apps get a layout viewport one status bar
          too short; src/lib/iosViewport.ts then stretches this box to the real screen height. */}
      <div className="fixed inset-0 h-auto w-full fitora-frame md:relative md:inset-auto md:h-[min(92vh,900px)] lg:fixed lg:inset-0 lg:h-auto">
        {/* side buttons (desktop only) */}
        <span className="fitora-frame__btn -left-[5px] top-[120px] hidden h-8 md:block lg:hidden" aria-hidden="true" />
        <span className="fitora-frame__btn -left-[5px] top-[176px] hidden h-14 md:block lg:hidden" aria-hidden="true" />
        <span className="fitora-frame__btn -left-[5px] top-[244px] hidden h-14 md:block lg:hidden" aria-hidden="true" />
        <span className="fitora-frame__btn -right-[5px] top-[200px] hidden h-20 md:block lg:hidden" aria-hidden="true" />

        <div className="app-bg relative h-full w-full overflow-hidden fitora-frame__screen">
          <span className="fitora-frame__island hidden md:block lg:hidden" aria-hidden="true" />
          <StatusBar />
          <div id="fitora-app" className="relative h-full w-full">
            {children}
          </div>
          {/* Content scrolling under the translucent status bar stays readable behind the clock. */}
          <div className="fitora-status-scrim pointer-events-none fixed inset-x-0 top-0 z-40 md:hidden lg:block" aria-hidden="true" />
          {/* Overlays (sheets, modals, toasts, menu) portal here — inside the frame (whole window on laptop). */}
          <div id={OVERLAY_ROOT_ID} className="pointer-events-none fixed inset-0 z-50 md:absolute" />
          <span className="fitora-frame__home hidden md:block lg:hidden" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
