import { describe, expect, it } from 'vitest';
import { returnPath } from './redirect';

describe('returnPath', () => {
  it('returns the original protected page (with its query)', () => {
    expect(returnPath({ from: '/diary?date=2026-10-01' })).toBe('/diary?date=2026-10-01');
    expect(returnPath({ from: '/workout' })).toBe('/workout');
  });
  it('falls back to home for missing / unsafe / auth targets', () => {
    expect(returnPath(null)).toBe('/');
    expect(returnPath(undefined)).toBe('/');
    expect(returnPath({})).toBe('/');
    expect(returnPath({ from: 42 })).toBe('/');
    expect(returnPath({ from: 'https://evil.example' })).toBe('/');
    expect(returnPath({ from: '//evil.example' })).toBe('/');
    expect(returnPath({ from: '/login' })).toBe('/');
    expect(returnPath({ from: '/reset?x=1' })).toBe('/');
  });
});
