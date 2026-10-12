// Pure helpers for the e-mail links that land on Fitora (unit-tested in authLinks.test.ts).
//
//  - PKCE:        <base>?flow=signup|recovery&code=…           (exchanged by supabase-js in getSession)
//  - token_hash:  <base>?flow=…&token_hash=…&type=recovery|signup|email…  (custom e-mail templates)
//  - errors:      ?error=…&error_code=otp_expired&error_description=…  or the same in the hash
//                 (#error=…, implicit-flow style).

import { toFitError } from '@/services/errors';

export interface AuthRedirect {
  tokenHash: string | null;
  type: string | null;
  flow: string | null;
  /** A PKCE ?code= was present (supabase-js already exchanged it). */
  hadCode: boolean;
  errorCode: string | null;
  errorDescription: string | null;
  /** Address without the auth params, or null when nothing needs cleaning. */
  cleanUrl: string | null;
}

const AUTH_KEYS = ['code', 'error', 'error_code', 'error_description', 'type', 'flow', 'token_hash'];

export const LINK_ERRORS: Record<string, string> = {
  otp_expired: 'Liên kết trong email đã hết hạn hoặc đã được dùng. Hãy yêu cầu gửi lại liên kết mới.',
  access_denied: 'Liên kết không còn hợp lệ. Hãy yêu cầu gửi lại liên kết mới.',
  flow_state_expired: 'Liên kết đã hết hạn. Hãy yêu cầu gửi lại liên kết mới.',
  flow_state_not_found: 'Liên kết phải được mở trên cùng trình duyệt đã yêu cầu. Hãy yêu cầu liên kết mới.',
  bad_code_verifier: 'Liên kết phải được mở trên cùng trình duyệt đã yêu cầu. Hãy yêu cầu liên kết mới.',
};

/** Query params of both the real search (?a=b) and the hash route (#/x?a=b); the hash wins. */
function allParams(url: URL): URLSearchParams {
  const out = new URLSearchParams(url.search);
  const q = url.hash.indexOf('?');
  if (q >= 0) new URLSearchParams(url.hash.slice(q + 1)).forEach((v, k) => out.set(k, v));
  return out;
}

export function readAuthRedirect(href: string): AuthRedirect {
  const url = new URL(href);
  const params = allParams(url);
  // Implicit-flow style errors live directly in the hash: #error=…&error_code=…
  const hashBody = url.hash.replace(/^#\/?/, '');
  const hashParams = new URLSearchParams(hashBody.includes('=') && !hashBody.includes('/') && !hashBody.includes('?') ? hashBody : '');
  const hashError = hashParams.has('error') || hashParams.has('error_code');

  const errorCode = params.get('error_code') || hashParams.get('error_code') || params.get('error') || hashParams.get('error');
  const errorDescription = params.get('error_description') || hashParams.get('error_description');

  let cleanUrl: string | null = null;
  const routeQ = url.hash.indexOf('?');
  const routeParams = routeQ >= 0 ? new URLSearchParams(url.hash.slice(routeQ + 1)) : null;
  const inRoute = Boolean(routeParams && AUTH_KEYS.some((k) => routeParams.has(k)));
  if (AUTH_KEYS.some((k) => url.searchParams.has(k)) || hashError || inRoute) {
    AUTH_KEYS.forEach((k) => url.searchParams.delete(k));
    if (hashError) url.hash = '#/login';
    else if (routeParams && inRoute) {
      AUTH_KEYS.forEach((k) => routeParams.delete(k));
      const rest = routeParams.toString();
      url.hash = url.hash.slice(0, routeQ) + (rest ? `?${rest}` : '');
    }
    cleanUrl = url.href;
  }

  return {
    tokenHash: params.get('token_hash'),
    type: params.get('type'),
    flow: params.get('flow'),
    hadCode: params.has('code'),
    errorCode,
    errorDescription,
    cleanUrl,
  };
}

/** Vietnamese text for a link error; null when there is nothing to show. Never throws. */
export function linkErrorMessage(code: string | null, description: string | null): string | null {
  if (code && LINK_ERRORS[code]) return LINK_ERRORS[code];
  if (!description) return null;
  // URLSearchParams already decoded it once; some providers double-encode. A stray '%'
  // must not throw (that used to leave the app stuck on the splash screen).
  let text = description.replace(/\+/g, ' ');
  try {
    text = decodeURIComponent(text);
  } catch {
    /* keep as is */
  }
  text = text.trim();
  if (!text) return null;
  // Raw provider text is English ('Email link is invalid or has expired'): map it.
  const mapped = toFitError({ message: text });
  if (mapped.code !== 'unknown' && mapped.code !== 'network') return mapped.message;
  // Never echo text taken from the URL: anyone can craft a link that makes the app display it.
  return GENERIC_LINK_ERROR;
}

const GENERIC_LINK_ERROR = 'Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.';

/**
 * A token_hash link needs no PKCE verifier, so it works in any browser: spending one while
 * someone is already signed in would silently swap that session for the link owner's account
 * (login CSRF). The caller must ask first when this returns true.
 */
export function linkNeedsConfirm(hasSession: boolean, tokenHash: string | null, type: string | null): boolean {
  return hasSession && Boolean(tokenHash && type);
}
