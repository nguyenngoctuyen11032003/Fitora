import { describe, expect, it } from 'vitest';
import { linkErrorMessage, readAuthRedirect } from './authLinks';

const BASE = 'https://u.github.io/Fitora/';

describe('readAuthRedirect', () => {
  it('reads a token_hash recovery link and cleans the address', () => {
    const r = readAuthRedirect(`${BASE}?flow=recovery&token_hash=abc&type=recovery#/login`);
    expect(r).toMatchObject({ tokenHash: 'abc', type: 'recovery', flow: 'recovery', hadCode: false });
    expect(r.cleanUrl).toBe(`${BASE}#/login`);
  });

  it('detects a PKCE code', () => {
    const r = readAuthRedirect(`${BASE}?flow=signup&code=xyz`);
    expect(r.hadCode).toBe(true);
    expect(r.flow).toBe('signup');
    expect(r.cleanUrl).toBe(BASE);
  });

  it('reads implicit-style errors in the hash and routes to /login', () => {
    const r = readAuthRedirect(`${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    expect(r.errorCode).toBe('otp_expired');
    expect(r.cleanUrl).toBe(`${BASE}#/login`);
  });

  it('cleans auth params inside the hash route but keeps others', () => {
    const r = readAuthRedirect(`${BASE}#/diary?date=2026-10-01&code=1`);
    expect(r.hadCode).toBe(true);
    expect(r.cleanUrl).toBe(`${BASE}#/diary?date=2026-10-01`);
  });

  it('leaves normal URLs alone', () => {
    expect(readAuthRedirect(`${BASE}#/diary?date=2026-10-01`).cleanUrl).toBeNull();
  });
});

describe('linkErrorMessage', () => {
  it('uses known codes, maps English text, and never throws on a stray %', () => {
    expect(linkErrorMessage('otp_expired', null)).toMatch(/hết hạn/);
    expect(linkErrorMessage(null, 'Email link is invalid or has expired')).toMatch(/Liên kết/);
    expect(() => linkErrorMessage(null, '100% broken')).not.toThrow();
    expect(linkErrorMessage(null, '100% broken')).toMatch(/Liên kết/);
    expect(linkErrorMessage(null, null)).toBeNull();
  });
});
