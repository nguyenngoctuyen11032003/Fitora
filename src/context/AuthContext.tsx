import type { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { signOut as authSignOut, verifyEmailLink } from '@/services/auth';

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

const LINK_ERRORS: Record<string, string> = {
  otp_expired: 'Liên kết trong email đã hết hạn hoặc đã được dùng. Hãy yêu cầu gửi lại liên kết mới.',
  access_denied: 'Liên kết không còn hợp lệ. Hãy yêu cầu gửi lại liên kết mới.',
};

/** Query params from both the real search (?a=b) and the hash route (#/x?a=b). */
function allParams(): URLSearchParams {
  const url = new URL(window.location.href);
  const out = new URLSearchParams(url.search);
  const q = url.hash.indexOf('?');
  if (q >= 0) new URLSearchParams(url.hash.slice(q + 1)).forEach((v, k) => out.set(k, v));
  return out;
}

/** Remove auth params (?code, ?flow, ?token_hash, errors) from the address bar. Returns a link error code if any. */
function cleanAuthParams(): { code: string | null; raw: string | null } {
  const url = new URL(window.location.href);
  const hashBody = url.hash.replace(/^#\/?/, '');
  const hashParams = new URLSearchParams(hashBody.includes('=') && !hashBody.includes('/') ? hashBody : '');
  const hashError = hashParams.has('error') || hashParams.has('error_code');
  const code =
    url.searchParams.get('error_code') || hashParams.get('error_code') || url.searchParams.get('error') || hashParams.get('error');
  const raw = url.searchParams.get('error_description') || hashParams.get('error_description');
  const keys = ['code', 'error', 'error_code', 'error_description', 'type', 'flow', 'token_hash'];
  if (keys.some((k) => url.searchParams.has(k)) || hashError) {
    keys.forEach((k) => url.searchParams.delete(k));
    if (hashError) url.hash = '#/login';
    window.history.replaceState(window.history.state, '', url);
  }
  return { code, raw };
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
    if (!supabase) {
      setLoading(false);
      return;
    }
    let alive = true;
    const go = (path: string) => navRef.current(path, { replace: true });

    // Mirrors Note_mytasks/src/main.js boot(): PKCE ?code is exchanged inside getSession();
    // token_hash links (custom e-mail templates) are spent here with verifyOtp.
    (async () => {
      let s: Session | null = null;
      try {
        s = (await supabase.auth.getSession()).data.session;
      } catch (e) {
        toastRef.current.error(e);
      }
      const params = allParams();
      const tokenHash = params.get('token_hash');
      const type = params.get('type');
      const flow = params.get('flow');
      const hadCode = params.has('code');
      const { code: errCode, raw } = cleanAuthParams();

      if (tokenHash && type) {
        try {
          const data = await verifyEmailLink(tokenHash, type);
          s = data?.session ?? s;
          if (type === 'recovery') {
            setRecovery(true);
            go('/reset');
          } else {
            toastRef.current.success('Đã xác nhận email. Chào mừng bạn đến với Fitora!');
            go(s ? '/' : '/login');
          }
        } catch (e) {
          toastRef.current.error(e);
          go(type === 'recovery' ? '/forgot' : '/login');
        }
      } else if (flow === 'recovery' && hadCode && s) {
        // Legacy PKCE recovery link: PASSWORD_RECOVERY fired inside getSession() before we subscribed.
        setRecovery(true);
        go('/reset');
      } else if (flow === 'signup' && hadCode && s) {
        toastRef.current.success('Đã xác nhận email. Chào mừng bạn đến với Fitora!');
        go('/');
      } else if (errCode || raw) {
        const msg = (errCode && LINK_ERRORS[errCode]) || (raw ? decodeURIComponent(raw.replace(/\+/g, ' ')) : null);
        if (msg) toastRef.current.error(msg);
        if (errCode === 'otp_expired' || errCode === 'access_denied') go('/forgot');
      }
      if (!alive) return;
      setSession(s);
      setLoading(false);
    })();

    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY') {
        setRecovery(true);
        setSession(s);
        go('/reset');
        return;
      }
      if (event === 'SIGNED_OUT') {
        setRecovery(false);
        setSession(null);
        return;
      }
      setSession((prev) => (prev?.access_token === s?.access_token ? prev : s));
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authSignOut();
    } finally {
      setRecovery(false);
      setSession(null);
      navRef.current('/login', { replace: true });
    }
  }, []);

  const endRecovery = useCallback(() => setRecovery(false), []);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading, recovery, endRecovery, signOut }),
    [session, loading, recovery, endRecovery, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
