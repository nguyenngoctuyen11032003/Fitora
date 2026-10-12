import { describe, expect, it } from 'vitest';
import { isIOSDevice, shellHeightFix, type ViewportSample } from './iosViewport';

// iPhone 12/13 Pro Max, 14 Plus: 428×926 pt, notch inset 47 pt (the device in the bug report).
const pwa: ViewportSample = {
  isIOS: true,
  standalone: true,
  innerWidth: 428,
  innerHeight: 879,
  screenWidth: 428,
  screenHeight: 926,
  safeTop: 47,
};

describe('shellHeightFix', () => {
  it('stretches the shell to the screen when the viewport is short by exactly the status-bar inset', () => {
    expect(shellHeightFix(pwa)).toBe(926);
    // Dynamic Island phones (inset 59) and rounding of a pixel or two.
    expect(shellHeightFix({ ...pwa, screenWidth: 430, screenHeight: 932, innerWidth: 430, innerHeight: 874, safeTop: 59 })).toBe(932);
    expect(shellHeightFix({ ...pwa, innerHeight: 880 })).toBe(926);
  });

  it('leaves correct viewports alone', () => {
    expect(shellHeightFix({ ...pwa, innerHeight: 926 })).toBeNull(); // no WebKit shortfall
    expect(shellHeightFix({ ...pwa, standalone: false })).toBeNull(); // Safari tab
    expect(shellHeightFix({ ...pwa, isIOS: false })).toBeNull(); // Android / Samsung
    expect(shellHeightFix({ ...pwa, safeTop: 0 })).toBeNull(); // no notch inset reported
  });

  it('does not stretch over the keyboard or other shortfalls that are not the inset', () => {
    expect(shellHeightFix({ ...pwa, innerHeight: 590 })).toBeNull();
    expect(shellHeightFix({ ...pwa, innerHeight: 900 })).toBeNull();
  });

  it('uses the short screen side in landscape (iOS reports screen size in portrait order)', () => {
    expect(shellHeightFix({ ...pwa, innerWidth: 926, innerHeight: 381, safeTop: 47 })).toBe(428);
    expect(shellHeightFix({ ...pwa, innerWidth: 926, innerHeight: 428, safeTop: 0 })).toBeNull();
  });
});

describe('isIOSDevice', () => {
  it('detects iPhone, iPad and iPadOS desktop-mode Safari only', () => {
    expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 })).toBe(true);
    expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIOSDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B)', platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false);
  });
});
