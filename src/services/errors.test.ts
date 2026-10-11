import { describe, expect, it } from 'vitest';
import { errorMessage, FitError, invalid, run, toFitError } from './errors';

const SESSION = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';

describe('toFitError', () => {
  it('maps auth errors to Vietnamese', () => {
    expect(toFitError({ message: 'Invalid login credentials', code: 'invalid_credentials' }).code).toBe('invalid_credentials');
    expect(toFitError({ message: 'Email not confirmed' }).code).toBe('email_not_confirmed');
    expect(toFitError({ message: 'User already registered' }).code).toBe('user_already_exists');
    expect(toFitError({ message: 'Email address "a@b" is invalid', code: 'email_address_invalid' }).message).toBe('Địa chỉ email không hợp lệ.');
    expect(toFitError({ message: 'Email link is invalid or has expired', code: 'otp_expired' }).code).toBe('link_expired');
  });

  it('an invalid refresh token is an expired session, not a bad e-mail link', () => {
    const e = toFitError({ message: 'Invalid Refresh Token: Refresh Token Not Found', code: 'refresh_token_not_found' });
    expect(e.code).toBe('session_expired');
    expect(e.message).toBe(SESSION);
  });

  it('maps network failures', () => {
    expect(toFitError(new TypeError('Failed to fetch')).code).toBe('network');
    expect(toFitError({ message: 'TypeError: Load failed' }).code).toBe('network');
    expect(toFitError({ name: 'AuthRetryableFetchError', message: '' }).code).toBe('network');
  });

  it('does not call a programming TypeError a network problem', () => {
    const e = toFitError(new TypeError("Cannot read properties of undefined (reading 'x')"), 'Không lưu được.');
    expect(e.code).toBe('unknown');
    expect(e.message).toBe('Không lưu được.');
  });

  it('maps PostgREST / Postgres codes', () => {
    expect(toFitError({ code: '42501', message: 'not_authenticated' }).code).toBe('session_expired');
    expect(toFitError({ code: '42501', message: 'new row violates row-level security policy' }).code).toBe('forbidden');
    expect(toFitError({ code: 'PGRST303', message: 'JWT expired' }).code).toBe('session_expired');
    expect(toFitError({ code: '23514', message: 'check constraint' }).code).toBe('invalid');
    expect(toFitError({ code: '23505', message: 'duplicate key' }).code).toBe('duplicate');
    expect(toFitError({ code: 'PGRST205', message: 'Could not find the table' }).code).toBe('schema_missing');
    expect(toFitError({ code: 'PGRST204', message: "Could not find the 'x' column" }).code).toBe('schema_missing');
    expect(toFitError({ code: '22023', message: 'date range is limited to 366 days' }).message).toBe('Khoảng thời gian tối đa 1 năm.');
  });

  it('maps storage errors by statusCode', () => {
    expect(toFitError({ name: 'StorageApiError', message: 'The object exceeded the maximum allowed size', statusCode: '413' }).code).toBe('too_large');
    expect(toFitError({ name: 'StorageApiError', message: 'Object not found', statusCode: '404' }).code).toBe('not_found');
    expect(toFitError({ message: 'mime type image/gif is not supported', statusCode: '415' }).code).toBe('invalid');
    expect(toFitError({ message: 'boom', status: 503 }).code).toBe('server');
  });

  it('uses the fallback for unknown errors', () => {
    expect(toFitError({ message: 'weird' }, 'Không tải được.').message).toBe('Không tải được.');
    expect(toFitError(null).message).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
  });
});

describe('errorMessage', () => {
  it('keeps Vietnamese messages from feature code', () => {
    expect(errorMessage(new Error('Hãy chọn ít nhất một món.'))).toBe('Hãy chọn ít nhất một món.');
    expect(errorMessage('Đã lưu xong')).toBe('Đã lưu xong');
  });
  it('never shows raw English library messages', () => {
    expect(errorMessage(new Error('Request failed with status code 500'))).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
    expect(errorMessage({ message: 'something odd' })).toBe('Đã có lỗi xảy ra. Vui lòng thử lại.');
    expect(errorMessage(new Error('Invalid login credentials'))).toBe('Email hoặc mật khẩu không đúng.');
  });
  it('passes FitError through', () => {
    expect(errorMessage(new FitError('x', 'Thông báo'))).toBe('Thông báo');
    expect(() => invalid('Sai rồi')).toThrow('Sai rồi');
  });
});

describe('run', () => {
  it('returns data or throws a mapped error', async () => {
    await expect(run(Promise.resolve({ data: 5, error: null }))).resolves.toBe(5);
    await expect(run(Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } }))).rejects.toMatchObject({ code: 'duplicate' });
    await expect(run(Promise.reject(new TypeError('Failed to fetch')))).rejects.toMatchObject({ code: 'network' });
  });
});
