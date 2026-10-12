// Supabase Auth wrapper — mirrors Note_mytasks/src/services/auth.js so both apps
// behave identically on the shared account (same auth.users).
import { appBaseUrl, MIN_PASSWORD } from '@/lib/config';
import { setRememberPref } from '@/lib/authPersistence';
import { db } from '@/lib/supabase';
import { FitoraError, invalid, run, toFitoraError } from './errors';

function vEmail(email: string): string {
  const e = typeof email === 'string' ? email.trim() : '';
  if (!e) invalid('Hãy nhập email.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) invalid('Địa chỉ email không hợp lệ.');
  return e.toLowerCase();
}
function vPassword(password: string, strength = true): string {
  if (typeof password !== 'string' || password === '') invalid('Hãy nhập mật khẩu.');
  if (strength && password.length < MIN_PASSWORD) invalid(`Mật khẩu tối thiểu ${MIN_PASSWORD} ký tự.`);
  return password;
}

/** `remember`: keep the session for REMEMBER_DAYS on this device; otherwise only until the tab closes. */
export async function signIn(email: string, password: string, remember = true) {
  const e = vEmail(email);
  const p = vPassword(password, false);
  setRememberPref(remember); // must precede the call: supabase-js saves the session inside it
  return run(db().auth.signInWithPassword({ email: e, password: p }));
}

/** Returns { user, session } — session is null when e-mail confirmation is required. */
export async function signUp(email: string, password: string, displayName?: string) {
  const name = typeof displayName === 'string' ? displayName.trim().slice(0, 80) : '';
  setRememberPref(true); // no checkbox on the register form: default to 7 days
  const data = await run(
    db().auth.signUp({
      email: vEmail(email),
      password: vPassword(password),
      options: {
        data: name ? { display_name: name } : {}, // read by the handle_new_user trigger (Note_mytasks)
        emailRedirectTo: `${appBaseUrl()}?flow=signup`,
      },
    }),
  );
  // Existing e-mail: Supabase returns a user without identities (no leak). Make it explicit.
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new FitoraError('Email này đã có tài khoản (có thể từ Note_mytasks). Hãy đăng nhập.', 'user_already_exists');
  }
  return data;
}

export async function resendConfirmation(email: string) {
  return run(db().auth.resend({ type: 'signup', email: vEmail(email), options: { emailRedirectTo: `${appBaseUrl()}?flow=signup` } }));
}

/**
 * Signs out of Fitora on this device. A global sign-out is attempted first; when the
 * server can't be reached (offline, 5xx) supabase-js keeps the local session, so we
 * fall back to a local sign-out — otherwise the user would be "signed out" until the
 * next reload logs them straight back in.
 */
export async function signOut(): Promise<void> {
  const auth = db().auth;
  let failed = false;
  try {
    const res = await auth.signOut();
    failed = Boolean(res?.error) && !/session missing|session_not_found/i.test(`${res.error?.message} ${(res.error as { code?: string } | null)?.code}`);
  } catch {
    failed = true;
  }
  if (!failed) return;
  try {
    const res = await auth.signOut({ scope: 'local' });
    if (res?.error) throw res.error;
  } catch (e) {
    throw toFitoraError(e, 'Không đăng xuất được. Vui lòng thử lại.');
  }
}

/**
 * The "Duy trì đăng nhập" window ran out: drop the session on this device only
 * (a global sign-out would also end the user's sessions on other devices).
 */
export async function expireSession(): Promise<void> {
  try {
    await db().auth.signOut({ scope: 'local' });
  } catch {
    /* local sign-out only touches storage; SIGNED_OUT still fires */
  }
}

/**
 * ?flow=recovery, not '#/reset': the e-mail templates append '&token_hash=…&type=recovery'
 * to {{ .RedirectTo }}; the legacy PKCE link appends '&code=…' — both need the query form.
 */
export async function requestPasswordReset(email: string) {
  return run(db().auth.resetPasswordForEmail(vEmail(email), { redirectTo: `${appBaseUrl()}?flow=recovery` }));
}

const EMAIL_LINK_TYPES = ['recovery', 'email', 'signup', 'email_change'] as const;
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

/** Spend a token_hash e-mail link in this browser. */
export async function verifyEmailLink(tokenHash: string, type: string) {
  if (!tokenHash || !(EMAIL_LINK_TYPES as readonly string[]).includes(type)) {
    throw new FitoraError('Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu liên kết mới.', 'link_expired');
  }
  setRememberPref(true);
  return run(db().auth.verifyOtp({ token_hash: tokenHash, type: type as EmailLinkType }));
}

export async function updatePassword(password: string) {
  return run(db().auth.updateUser({ password: vPassword(password) }));
}
