import { describe, expect, it } from 'vitest';
import { INITIAL_NAV_STATE, nextNavState, type NavScrollState } from './navAutoHide';

const PAGE = { scrollHeight: 3000, clientHeight: 800 }; // max scrollTop = 2200

function run(tops: number[], start: NavScrollState = INITIAL_NAV_STATE) {
  return tops.reduce((s, top) => nextNavState(s, { top, ...PAGE }), start);
}

describe('nextNavState', () => {
  it('hides after a deliberate scroll down and shows again on scroll up', () => {
    const down = run([100, 105, 110, 120]);
    expect(down.hidden).toBe(true);
    expect(run([125, 122], down).hidden).toBe(true); // 3px back up: still hidden
    expect(run([125, 118], down).hidden).toBe(false); // 7px back up: shown
  });

  it('ignores small jitter in either direction', () => {
    expect(run([305, 302, 307, 304, 309], { hidden: false, anchor: 300, last: 300 }).hidden).toBe(false);
    const hidden = run([300, 320]);
    expect(run([322, 319, 323, 320], hidden).hidden).toBe(true);
  });

  it('is always visible near the top and at the end of the page', () => {
    const hidden = run([300, 400]);
    expect(hidden.hidden).toBe(true);
    expect(run([40], hidden).hidden).toBe(false);
    expect(run([2190], hidden).hidden).toBe(false);
  });

  it('clamps iOS rubber-band offsets and never hides on a page that barely scrolls', () => {
    expect(run([-40, -10, 0]).hidden).toBe(false);
    expect(run([2300], run([300, 400])).hidden).toBe(false);
    const short = { scrollHeight: 840, clientHeight: 800 };
    expect(nextNavState(INITIAL_NAV_STATE, { top: 40, ...short }).hidden).toBe(false);
  });

  it('measures the up travel from where the direction flipped, not from the start', () => {
    const s = run([200, 600]); // hidden, long way down
    expect(run([590], s).hidden).toBe(false); // 10px up from the turning point is enough
  });
});
