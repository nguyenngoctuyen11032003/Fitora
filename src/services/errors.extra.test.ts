import { afterEach, describe, expect, it, vi } from 'vitest';
import { FitError, runRead, toFitError, vDate } from './errors';

describe('auth error mapping order', () => {
  it('"should be different" is same_password, not weak_password', () => {
    expect(toFitError({ message: 'New password should be different from the old password.', code: 'same_password' }).code).toBe('same_password');
    expect(toFitError({ message: 'New password should be different from the old password.' }).code).toBe('same_password');
    expect(toFitError({ message: 'Password should be at least 6 characters.' }).code).toBe('weak_password');
    expect(toFitError({ message: 'Password should contain at least one character of each: abc' }).code).toBe('weak_password');
  });
  it('maps SMTP-not-authorized and timeouts', () => {
    expect(toFitError({ message: 'Email address not authorized', code: 'email_address_not_authorized' }).code).toBe('email_not_authorized');
    expect(toFitError({ name: 'TimeoutError', message: 'signal timed out' }).code).toBe('timeout');
  });
});

describe('vDate', () => {
  it('accepts local days only', () => {
    expect(vDate('2026-10-11')).toBe('2026-10-11');
    expect(() => vDate('2026-02-31')).toThrow(FitError);
    expect(() => vDate('2026-10-11T00:00:00.000Z')).toThrow('Ngày không hợp lệ.');
    expect(() => vDate(undefined, 'Ngày sinh không hợp lệ.')).toThrow('Ngày sinh không hợp lệ.');
  });
});

describe('runRead', () => {
  afterEach(() => vi.useRealTimers());

  it('passes a signal and returns data', async () => {
    const make = vi.fn(async (s: AbortSignal) => ({ data: s instanceof AbortSignal, error: null }));
    await expect(runRead(make)).resolves.toBe(true);
  });

  it('times out a hanging request with a Vietnamese timeout error', async () => {
    vi.useFakeTimers();
    let aborted = false;
    const p = runRead(
      (signal) =>
        new Promise<{ data: null; error: { message: string } }>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve({ data: null, error: { message: 'AbortError: aborted' } });
          });
        }),
      undefined,
      { timeoutMs: 1000 },
    );
    const assertion = expect(p).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(aborted).toBe(true);
  });

  it('retries transient failures only', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const flaky = () => {
      calls++;
      return Promise.resolve(calls === 1 ? { data: null, error: { message: 'Failed to fetch' } } : { data: 7, error: null });
    };
    const p = runRead(flaky, undefined, { retries: 1, retryDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(20);
    await expect(p).resolves.toBe(7);
    expect(calls).toBe(2);

    let rlsCalls = 0;
    const denied = () => {
      rlsCalls++;
      return Promise.resolve({ data: null, error: { code: '42501', message: 'row-level security' } });
    };
    await expect(runRead(denied, undefined, { retries: 2 })).rejects.toMatchObject({ code: 'forbidden' });
    expect(rlsCalls).toBe(1);
  });
});
