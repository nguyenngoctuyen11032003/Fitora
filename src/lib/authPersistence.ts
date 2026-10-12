// "Duy trì đăng nhập 7 ngày": decides where supabase-js keeps the session.
//
// - remembered  → localStorage, valid for REMEMBER_DAYS from sign-in (a hard deadline:
//                 token refreshes don't extend it). Past the deadline the stored
//                 session is dropped, so the next boot lands on /login.
// - not ticked  → sessionStorage: survives reloads in this tab, gone when the
//                 tab/browser closes.
//
// Only the session key is routed; other supabase-js keys (PKCE code verifier, …)
// stay in localStorage because e-mail links open in a new tab.

export const REMEMBER_DAYS = 7;
export const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;
const PREF_KEY = 'fitora.authRemember';

export type RememberPref = { mode: 'persist'; until: number } | { mode: 'session' };

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export interface PersistenceEnv {
  local?: Store;
  session?: Store;
  now?: () => number;
}

function env(e: PersistenceEnv = {}) {
  return { local: e.local ?? safe('localStorage'), session: e.session ?? safe('sessionStorage'), now: e.now ?? Date.now };
}

function safe(name: 'localStorage' | 'sessionStorage'): Store | undefined {
  try {
    return typeof window !== 'undefined' ? window[name] : undefined;
  } catch {
    return undefined;
  }
}

function get(s: Store | undefined, k: string): string | null {
  try {
    return s?.getItem(k) ?? null;
  } catch {
    return null;
  }
}
function set(s: Store | undefined, k: string, v: string): void {
  try {
    s?.setItem(k, v);
  } catch {
    /* private mode / quota */
  }
}
function del(s: Store | undefined, k: string): void {
  try {
    s?.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function readRememberPref(e?: PersistenceEnv): RememberPref | null {
  const raw = get(env(e).local, PREF_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<{ mode: string; until: number }>;
    if (p?.mode === 'session') return { mode: 'session' };
    if (p?.mode === 'persist' && typeof p.until === 'number' && Number.isFinite(p.until)) return { mode: 'persist', until: p.until };
  } catch {
    /* corrupt → treat as missing */
  }
  return null;
}

/** Call right before a sign-in: true keeps the session for REMEMBER_DAYS, false for this tab only. */
export function setRememberPref(remember: boolean, e?: PersistenceEnv): void {
  const x = env(e);
  const pref: RememberPref = remember ? { mode: 'persist', until: x.now() + REMEMBER_MS } : { mode: 'session' };
  set(x.local, PREF_KEY, JSON.stringify(pref));
}

export function clearRememberPref(e?: PersistenceEnv): void {
  del(env(e).local, PREF_KEY);
}

/** Epoch ms when a remembered session must end, or null (tab-only session / no session). */
export function rememberDeadline(e?: PersistenceEnv): number | null {
  const p = readRememberPref(e);
  return p?.mode === 'persist' ? p.until : null;
}

/**
 * Storage adapter for createClient({ auth: { storage } }). `sessionKey` is the
 * supabase-js storageKey; every other key goes straight to localStorage.
 */
export function createAuthStorage(sessionKey: string, e?: PersistenceEnv) {
  const x = () => env(e);
  // A tab that signed in without "remember" keeps using sessionStorage even if
  // another tab later flips the shared preference.
  const tabOnly = (k: string) => get(x().session, k) !== null || readRememberPref(e)?.mode === 'session';

  return {
    getItem(key: string): string | null {
      const { local, session, now } = x();
      if (key !== sessionKey) return get(local, key);
      const inTab = get(session, key);
      if (inTab !== null) return inTab;
      const stored = get(local, key);
      if (stored === null) return null;
      const pref = readRememberPref(e);
      if (pref?.mode === 'persist' && now() >= pref.until) {
        // Expired: forget it so supabase-js boots signed out.
        del(local, key);
        clearRememberPref(e);
        return null;
      }
      // Session from before this feature (or a stray tab-only pref): start a 7-day window now.
      if (pref?.mode !== 'persist') setRememberPref(true, e);
      return stored;
    },
    setItem(key: string, value: string): void {
      const { local, session } = x();
      if (key === sessionKey && tabOnly(key)) {
        set(session, key, value);
        del(local, key);
        return;
      }
      set(local, key, value);
      if (key !== sessionKey) return;
      del(session, key);
      // Signed in without going through the login form (e-mail link): default to 7 days.
      if (readRememberPref(e)?.mode !== 'persist') setRememberPref(true, e);
    },
    removeItem(key: string): void {
      const { local, session } = x();
      del(local, key);
      if (key === sessionKey) {
        del(session, key);
        clearRememberPref(e);
      }
    },
  };
}
