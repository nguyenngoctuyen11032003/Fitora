import { describe, expect, it } from 'vitest';
import { normalizeEmail, readLastEmail, rememberEmail } from './lastEmail';

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('lastEmail', () => {
  it('normalizes valid addresses and rejects junk', () => {
    expect(normalizeEmail('  An@Mail.VN ')).toBe('an@mail.vn');
    expect(normalizeEmail('no-at-sign')).toBeNull();
    expect(normalizeEmail('a@b')).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });

  it('round-trips through storage and ignores invalid values', () => {
    const s = mem();
    expect(readLastEmail(s)).toBe('');
    rememberEmail('Me@Fitora.test', s);
    expect(readLastEmail(s)).toBe('me@fitora.test');
    rememberEmail('oops', s);
    expect(readLastEmail(s)).toBe('me@fitora.test');
    s.m.set('fitora.lastEmail', 'garbage');
    expect(readLastEmail(s)).toBe('');
  });

  it('never throws when storage is unavailable or throws', () => {
    const bad = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readLastEmail(bad)).toBe('');
    expect(() => rememberEmail('a@b.co', bad)).not.toThrow();
    expect(readLastEmail(undefined)).toBe('');
  });
});
