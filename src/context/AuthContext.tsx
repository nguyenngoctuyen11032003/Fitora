import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { signOut as authSignOut, verifyEmailLink } from '@/services/auth';
import { forgetSignedUrls } from '@/services/storage';
import { linkErrorMessage, readAuthRedirect } from './authLinks';

export interface AuthState {
  session: Session | null;
  user: User | null;
  /** True until the initial session (and any e-mail link in the URL) has been resolved. */
  loading: boolean;
  /** Signed in through a password-recovery link: the user must set a new password (/reset). */
  recovery: boolean;
  /** Call after the new password is saved. */
  endRecovery: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

const WELCOME = 'Đã xác nhận email. Chào mừng bạn đến với Fitora!';

interface BootResult {
  session: Session | null;
  recovery: boolean;
  navTo: string | null;
  toast: { kind: 'success' | 'error'; message: unknown } | null;
}

/**
 * The boot (session + e-mail link) runs ONCE per page load and is shared: under
 * React StrictMode the effect mounts twice, and spending a one-time token_hash twice
 * would fail the second time ("link expired") or race the first.
 */
let bootPromise: Promise<BootResult> | null = null;
let bootApplied = false;

// Mirrors Note_mytasks/src/main.js boot(): PKCE ?code is exchanged inside getSession();
// token_hash links (custom e-mail templates) are spent here with verifyOtp.
async function boot(client: SupabaseClient): Promise<BootResult> {
  const out: BootResult = { session: null, recovery: false, navTo: null, toast: null };
  try {
    out.session = (await client.auth.getSession()).data.session;
  } catch (e) {
    out.toast = { kind: 'error', message: e };
  }
  let link;
  try {
    link = readAuthRedirect(window.location.href);
    if (link.cleanUrl) window.history.replaceState(window.history.state, '', link.cleanUrl);
  } catch {
    return out; // malformed URL: nothing to do
  }
  const { tokenHash, type, flow, hadCode, errorCode, errorDescription } = link;

  if (tokenHash && type) {
    try {
      const data = await verifyEmailLink(tokenHash, type);
      out.session = data?.session ?? out.session;
      if (type === 'recovery') {
        out.recovery = true;
        out.navTo = '/reset';
      } else {
        out.toast = { kind: 'success', message: WELCOME };
        out.navTo = out.session ? '/' : '/login';
      }
    } catch (e) {
      out.toast = { kind: 'error', message: e };
      out.navTo = type === 'recovery' ? '/forgot' : '/login';
    }
  } else if (flow === 'recovery' && hadCode && out.session) {
    // Legacy PKCE recovery link: PASSWORD_RECOVERY fired inside getSession() before we subscribed.
    out.recovery = true;
    out.navTo = '/reset';
  } else if (flow === 'signup' && hadCode && out.session) {
    out.toast = { kind: 'success', message: WELCOME };
    out.navTo = '/';
  } else if (errorCode || errorDescription) {
    const msg = linkErrorMessage(errorCode, errorDescription);
    if (msg) out.toast = { kind: 'error', message: msg };
    if (flow === 'recovery' || errorCode === 'otp_expired' || errorCode === 'access_denied') out.navTo = '/forgot';
  }
  return out;
}

/** Same user (id, e-mail, metadata, updated_at) → keep the old object so `user` deps don't re-fire on every token refresh. */
function sameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.updated_at === b.updated_at &&
    JSON.stringify(a.user_metadata ?? null) === JSON.stringify(b.user_metadata ?? null)
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }
    let alive = true;
    // Once onAuthStateChange has spoken (INITIAL_SESSION fires after supabase-js finished
    // its own init), it is the source of truth: the boot result must not overwrite a
    // newer state, e.g. a sign-out in another tab while the e-mail link was verified.
    let eventSeen = false;
    const go = (path: string) => navRef.current(path, { replace: true });

    const { data } = client.auth.onAuthStateChange((event, s) => {
      if (!alive) return;
      eventSeen = true;
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        setSession(s);
        go('/reset');
        return;
      }
      if (event === 'SIGNED_OUT') {
        setRecovery(false);
        setSession(null);
        forgetSignedUrls();
        return;
      }
      setSession((prev) => (prev?.access_token === s?.access_token ? prev : s));
    });

    bootPromise ??= boot(client);
    bootPromise
      .then((r) => {
        if (!alive) return;
        const first = !bootApplied;
        bootApplied = true;
        if (first) {
          if (r.recovery) setRecovery(true);
          if (r.toast) {
            if (r.toast.kind === 'success') toastRef.current.success(String(r.toast.message));
            else toastRef.current.error(r.toast.message);
          }
          if (r.navTo) go(r.navTo);
        }
        setSession((prev) => (eventSeen ? prev : r.session));
        setLoading(false);
      })
      .catch(() => {
        /* boot never rejects, but never leave the splash up */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signingOut = useRef<Promise<void> | null>(null);
  const signOut = useCallback(() => {
    // A double tap on "Đăng xuất" shares one request.
    signingOut.current ??= (async () => {
      try {
        await authSignOut();
      } finally {
        setRecovery(false);
        setSession(null);
        forgetSignedUrls();
        signingOut.current = null;
        navRef.current('/login', { replace: true });
      }
    })();
    return signingOut.current;
  }, []);

  const endRecovery = useCallback(() => setRecovery(false), []);

  const userRef = useRef<User | null>(null);
  const nextUser = session?.user ?? null;
  if (!sameUser(userRef.current, nextUser)) userRef.current = nextUser;
  const user = userRef.current;

  const value = useMemo<AuthState>(
    () => ({ session, user, loading, recovery, endRecovery, signOut }),
    [session, user, loading, recovery, endRecovery, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
