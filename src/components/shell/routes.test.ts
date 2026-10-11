import { describe, expect, it } from 'vitest';
import { isLinkActive } from './routes';
import { MENU_LINKS, SAVED_FOODS_PATH } from './MenuOverlay';

describe('isLinkActive', () => {
  it('matches root exactly', () => {
    expect(isLinkActive('/', '/')).toBe(true);
    expect(isLinkActive('/', '/diary')).toBe(false);
  });
  it('prefix-matches nested paths but not look-alikes', () => {
    expect(isLinkActive('/diary', '/diary')).toBe(true);
    expect(isLinkActive('/food', '/food/search')).toBe(true);
    expect(isLinkActive('/body', '/bodyfat')).toBe(false);
  });
  it('requires the query params of the link', () => {
    expect(isLinkActive('/food/search?tab=mine', '/food/search', '?tab=mine')).toBe(true);
    expect(isLinkActive('/food/search?tab=mine', '/food/search', '?meal=lunch&tab=mine')).toBe(true);
    expect(isLinkActive('/food/search?tab=mine', '/food/search', '')).toBe(false);
    expect(isLinkActive('/food/search?tab=mine', '/food/search', '?tab=recent')).toBe(false);
    expect(isLinkActive('/food/search?tab=mine', '/diary', '?tab=mine')).toBe(false);
  });
});

describe('MENU_LINKS', () => {
  it('has a "Món của tôi" entry opening the saved-foods tab', () => {
    const mine = MENU_LINKS.find((l) => l.label === 'Món của tôi');
    expect(mine?.to).toBe(SAVED_FOODS_PATH);
    expect(SAVED_FOODS_PATH).toBe('/food/search?tab=mine');
  });
  it('has unique targets', () => {
    expect(new Set(MENU_LINKS.map((l) => l.to)).size).toBe(MENU_LINKS.length);
  });
});
