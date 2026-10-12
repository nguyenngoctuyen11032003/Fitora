import { describe, expect, it } from 'vitest';
import { createAuthStorage, readRememberPref, rememberDeadline, REMEMBER_MS, setRememberPref } from './authPersistence';

function mem() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

function setup(start = 1_000_000) {
  const local = mem();
  const session = mem();
  const clock = { t: start };
  const env = { local, session, now: () => clock.t };
  return { local, session, clock, env, storage: createAuthStorage('fitora.auth', env) };
}

describe('authPersistence', () => {
  it('remembered sign-in lives in localStorage for 7 days, then is dropped', () => {
    const { local, session, clock, env, storage } = setup();
    setRememberPref(true, env);
    storage.setItem('fitora.auth', 'S');
    expect(local.m.get('fitora.auth')).toBe('S');
    expect(session.m.has('fitora.auth')).toBe(false);
    expect(rememberDeadline(env)).toBe(clock.t + REMEMBER_MS);

    clock.t += REMEMBER_MS - 1;
    storage.setItem('fitora.auth', 'S2'); // token refresh does not extend the window
    expect(storage.getItem('fitora.auth')).toBe('S2');
    expect(rememberDeadline(env)).toBe(1_000_000 + REMEMBER_MS);

    clock.t += 1;
    expect(storage.getItem('fitora.auth')).toBeNull();
    expect(local.m.has('fitora.auth')).toBe(false);
    expect(readRememberPref(env)).toBeNull();
  });

  it('unticked sign-in stays in sessionStorage only', () => {
    const { local, session, env, storage } = setup();
    setRememberPref(false, env);
    storage.setItem('fitora.auth', 'S');
    expect(session.m.get('fitora.auth')).toBe('S');
    expect(local.m.has('fitora.auth')).toBe(false);
    expect(storage.getItem('fitora.auth')).toBe('S');
    expect(rememberDeadline(env)).toBeNull();
    // A later remembered sign-in in another tab must not move this tab's session.
    setRememberPref(true, env);
    storage.setItem('fitora.auth', 'S2');
    expect(session.m.get('fitora.auth')).toBe('S2');
    expect(local.m.has('fitora.auth')).toBe(false);
  });

  it('a session from before the feature gets a 7-day window from now', () => {
    const { local, clock, env, storage } = setup();
    local.m.set('fitora.auth', 'OLD');
    expect(storage.getItem('fitora.auth')).toBe('OLD');
    expect(rememberDeadline(env)).toBe(clock.t + REMEMBER_MS);
  });

  it('e-mail link sign-in (no pref) defaults to remembered', () => {
    const { local, clock, env, storage } = setup();
    storage.setItem('fitora.auth', 'S');
    expect(local.m.get('fitora.auth')).toBe('S');
    expect(rememberDeadline(env)).toBe(clock.t + REMEMBER_MS);
  });

  it('sign-out clears session and preference; other keys use localStorage untouched', () => {
    const { local, session, env, storage } = setup();
    setRememberPref(false, env);
    storage.setItem('fitora.auth', 'S');
    storage.setItem('fitora.auth-code-verifier', 'V');
    expect(local.m.get('fitora.auth-code-verifier')).toBe('V');
    storage.removeItem('fitora.auth');
    expect(session.m.has('fitora.auth')).toBe(false);
    expect(readRememberPref(env)).toBeNull();
    expect(storage.getItem('fitora.auth-code-verifier')).toBe('V');
  });

  it('ignores corrupt prefs and throwing storage', () => {
    const { local, env } = setup();
    local.m.set('fitora.authRemember', '{oops');
    expect(readRememberPref(env)).toBeNull();
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    const s = createAuthStorage('fitora.auth', { local: bad, session: bad, now: () => 0 });
    expect(() => s.setItem('fitora.auth', 'S')).not.toThrow();
    expect(s.getItem('fitora.auth')).toBeNull();
    expect(() => s.removeItem('fitora.auth')).not.toThrow();
  });
});
