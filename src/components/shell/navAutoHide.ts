// Bottom nav that gets out of the way while reading: hides on a deliberate scroll down,
// comes back on any scroll up, and is always visible near the top or at the very end of a
// screen (where the user is about to navigate). Thresholds keep tiny finger jitter, iOS
// rubber-band bounce and momentum tails from making it flicker.

export const HIDE_AFTER_PX = 12; // downward travel before hiding
export const SHOW_AFTER_PX = 6; // upward travel before showing again
export const TOP_ZONE_PX = 56; // always visible this close to the top
export const END_ZONE_PX = 24; // always visible this close to the bottom

export interface ScrollSample {
  top: number;
  scrollHeight: number;
  clientHeight: number;
}

export interface NavScrollState {
  hidden: boolean;
  /** scrollTop where the current direction run started. */
  anchor: number;
  last: number;
}

export const INITIAL_NAV_STATE: NavScrollState = { hidden: false, anchor: 0, last: 0 };

export function nextNavState(prev: NavScrollState, s: ScrollSample): NavScrollState {
  const max = Math.max(0, s.scrollHeight - s.clientHeight);
  // iOS reports negative / past-the-end offsets while bouncing.
  const top = Math.min(Math.max(s.top, 0), max);
  if (top <= TOP_ZONE_PX || max - top <= END_ZONE_PX || max <= TOP_ZONE_PX) {
    return { hidden: false, anchor: top, last: top };
  }
  const dir = Math.sign(top - prev.last);
  const prevDir = Math.sign(prev.last - prev.anchor);
  // A direction flip starts a new run from the turning point.
  const anchor = dir !== 0 && prevDir !== 0 && dir !== prevDir ? prev.last : prev.anchor;
  const travel = top - anchor;
  let hidden = prev.hidden;
  if (!hidden && travel >= HIDE_AFTER_PX) hidden = true;
  else if (hidden && -travel >= SHOW_AFTER_PX) hidden = false;
  return { hidden, anchor: hidden !== prev.hidden ? top : anchor, last: top };
}
