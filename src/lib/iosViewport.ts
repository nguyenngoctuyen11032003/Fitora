// iOS home-screen web apps (standalone + "black-translucent" status bar) draw the page from the
// very top of the screen, but WebKit still sizes the layout viewport — the box that
// `position: fixed`, `100dvh` and `innerHeight` use — as if the status bar took space. The app
// shell then ends one status-bar height above the real bottom (47pt on a notched iPhone) and the
// bottom nav floats over an empty strip. When that exact shortfall is measured, the shell is
// stretched to the real screen height; every other browser keeps the CSS-only layout.

export interface ViewportSample {
  isIOS: boolean;
  standalone: boolean;
  innerWidth: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
  /** env(safe-area-inset-top) in CSS px. */
  safeTop: number;
}

/** Tolerance for rounding between screen size, innerHeight and the inset (CSS px). */
const SLACK = 3;

/**
 * Height the app shell must have to reach the real bottom edge, or null when the layout
 * viewport already covers the screen (Android, Safari tabs, desktop, fixed iOS versions).
 */
export function shellHeightFix(s: ViewportSample): number | null {
  if (!s.isIOS || !s.standalone || !(s.safeTop > 0) || !(s.innerHeight > 0)) return null;
  // iOS keeps screen.width/height in portrait order whatever the orientation.
  const landscape = s.innerWidth > s.innerHeight;
  const full = landscape ? Math.min(s.screenWidth, s.screenHeight) : Math.max(s.screenWidth, s.screenHeight);
  const missing = full - s.innerHeight;
  // Only the known WebKit shortfall (one status-bar inset) is corrected; anything else
  // (split view, keyboard open, a future WebKit fix) is left alone.
  if (missing <= SLACK || Math.abs(missing - s.safeTop) > SLACK) return null;
  return full;
}

export function isIOSDevice(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

function readSafeTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}

/** Measures now and after every viewport change; sets html[data-ios-gap] + --app-h when needed. */
export function installIosViewportFix(): void {
  if (typeof window === 'undefined' || !isIOSDevice(navigator)) return;
  const root = document.documentElement;
  const apply = () => {
    const fix = shellHeightFix({
      isIOS: true,
      standalone: (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      safeTop: readSafeTop(),
    });
    if (fix) {
      root.style.setProperty('--app-h', `${fix}px`);
      root.dataset.iosGap = '';
    } else {
      root.style.removeProperty('--app-h');
      delete root.dataset.iosGap;
    }
  };
  // The viewport settles a moment after launch / rotation, so measure again shortly after.
  const schedule = () => {
    apply();
    window.setTimeout(apply, 300);
  };
  schedule();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule();
  });
}
