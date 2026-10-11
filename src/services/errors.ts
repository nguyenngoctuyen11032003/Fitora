// Turns Supabase/PostgREST/Auth/Storage errors into an Error with a Vietnamese message.
// Services call `run(query)` and either get the data or throw `FitError`.
import { isISODate } from '@/lib/date';

export class FitError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FitError';
    this.code = code;
  }
}

/** Alias kept for readability in services (`new FitoraError(message, code)`). */
export class FitoraError extends FitError {
  constructor(message: string, code = 'unknown') {
    super(code, message);
    this.name = 'FitoraError';
  }
}

interface RawError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
  /** StorageApiError carries the HTTP status as a string. */
  statusCode?: string | number;
  name?: string;
}

const SESSION_MSG = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';

const AUTH_MESSAGES: Array<[RegExp, string, string]> = [
  [/invalid login credentials|invalid_credentials/i, 'invalid_credentials', 'Email hoặc mật khẩu không đúng.'],
  [/email not confirmed|email_not_confirmed/i, 'email_not_confirmed', 'Email chưa được xác nhận. Hãy mở liên kết trong hộp thư của bạn.'],
  [/user already registered|user_already_exists|email_exists/i, 'user_already_exists', 'Email này đã có tài khoản — hãy đăng nhập bằng tài khoản Note_mytasks của bạn.'],
  // Before weak_password: "New password should be different from the old password." also contains "password should be".
  [/same_password|should be different/i, 'same_password', 'Mật khẩu mới phải khác mật khẩu cũ.'],
  [/password should|weak_password|weak password|pwned/i, 'weak_password', 'Mật khẩu quá yếu. Hãy dùng ít nhất 8 ký tự, khó đoán hơn.'],
  [/rate limit|over_email_send_rate_limit|over_request_rate_limit|too many/i, 'rate_limited', 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.'],
  [/email_address_invalid|email address .* is invalid|unable to validate email/i, 'invalid_email', 'Địa chỉ email không hợp lệ.'],
  // Session / refresh-token problems before the generic "invalid … token" (e-mail link) rule:
  // "Invalid Refresh Token: Refresh Token Not Found" is an expired login, not a bad link.
  [/session.*(missing|not.?found|expired)|jwt expired|invalid jwt|bad_jwt|refresh.?token/i, 'session_expired', SESSION_MSG],
  [/otp_expired|token has expired|invalid.*(token|link)|flow_state/i, 'link_expired', 'Liên kết đã hết hạn hoặc đã được dùng. Hãy yêu cầu liên kết mới.'],
  [/signup_disabled|signups not allowed/i, 'signup_disabled', 'Đăng ký tài khoản mới đang tạm tắt.'],
  [/email_address_not_authorized|email address not authorized/i, 'email_not_authorized', 'Máy chủ chưa được phép gửi email tới địa chỉ này. Hãy liên hệ quản trị viên.'],
  [/user_banned|user is banned/i, 'user_banned', 'Tài khoản này đang bị khóa.'],
];

const TIMEOUT_MSG = 'Máy chủ phản hồi quá lâu. Kiểm tra mạng và thử lại.';

const NETWORK_RE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|err_network/i;

export function toFitError(err: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): FitError {
  if (err instanceof FitError) return err;
  const e = (err ?? {}) as RawError;
  const msg = `${e.message ?? ''} ${e.code ?? ''}`;

  // Only fetch-style TypeErrors are network failures; any other TypeError is a bug, not "mất mạng".
  if (e.name === 'AuthRetryableFetchError' || NETWORK_RE.test(msg) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return new FitError('network', 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
  }
  if (e.name === 'TimeoutError') return new FitError('timeout', TIMEOUT_MSG);
  for (const [re, code, text] of AUTH_MESSAGES) if (re.test(msg)) return new FitError(code, text);

  switch (e.code) {
    case '42P01':
    case 'PGRST205':
    case 'PGRST204':
    case '42703':
    case '42883':
    case 'PGRST202':
      // Tables / RPCs of migration 001400 not applied yet on the shared project.
      return new FitError('schema_missing', 'Máy chủ chưa được cập nhật dữ liệu Fitora. Vui lòng thử lại sau.');
    case '42501':
      return /not_authenticated/.test(msg)
        ? new FitError('session_expired', SESSION_MSG)
        : new FitError('forbidden', 'Bạn không có quyền thực hiện thao tác này.');
    case 'PGRST301':
    case 'PGRST302':
    case 'PGRST303':
      return new FitError('session_expired', SESSION_MSG);
    case '23505':
      return new FitError('duplicate', 'Dữ liệu này đã tồn tại.');
    case '23503':
      return new FitError('reference', 'Mục liên kết không còn tồn tại.');
    case '23514':
    case '22P02':
    case '22003':
    case '22007':
    case '22008':
    case '23502':
      return new FitError('invalid', 'Giá trị nhập vào không hợp lệ hoặc vượt giới hạn cho phép.');
    case '22023':
      return new FitError('invalid', /366/.test(msg) ? 'Khoảng thời gian tối đa 1 năm.' : 'Giá trị nhập vào không hợp lệ.');
    case 'PGRST116':
      return new FitError('not_found', 'Không tìm thấy dữ liệu.');
  }
  const status = Number(e.status ?? e.statusCode) || 0;
  if (status === 401) return new FitError('session_expired', SESSION_MSG);
  if (status === 413 || /payload too large|exceeded the maximum allowed size/i.test(msg)) {
    return new FitError('too_large', 'Ảnh quá lớn (tối đa 5 MB).');
  }
  if (/mime type|invalid_mime_type/i.test(msg)) return new FitError('invalid', 'Định dạng ảnh không được hỗ trợ.');
  if (status === 404 && /object not found|not_found/i.test(msg)) return new FitError('not_found', 'Không tìm thấy ảnh (có thể đã bị xóa).');
  if (status === 403) return new FitError('forbidden', 'Bạn không có quyền thực hiện thao tác này.');
  if (status >= 500) return new FitError('server', 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau ít phút.');
  return new FitError(e.code || 'unknown', fallback);
}

/** Same as toFitError (alias). */
export const toFitoraError = toFitError;

/** Awaits a supabase-js call and returns `data`, throwing a FitError on `error`. `fallback` = message for unknown errors. */
/** Success branch of a supabase-js result union ({ data, error: null } | { data: null, error }). */
export type OkData<R> = R extends { error: null | undefined; data: infer D } ? D : never;

export async function run<R extends { data: unknown; error: unknown }>(p: PromiseLike<R>, fallback?: string): Promise<OkData<R>> {
  let res: R;
  try {
    res = await p;
  } catch (err) {
    throw toFitError(err, fallback);
  }
  if (res.error) throw toFitError(res.error, fallback);
  return res.data as OkData<R>;
}

/** Errors worth retrying for an idempotent read: no connection, timeout, 5xx. */
export function isTransient(err: unknown): boolean {
  const code = toFitError(err).code;
  return code === 'network' || code === 'timeout' || code === 'server';
}

export interface ReadOptions {
  /** Per-attempt timeout in ms (default 20 000) — a hanging request would otherwise spin forever. */
  timeoutMs?: number;
  /** Extra attempts after a transient failure (default 0). Only for side-effect-free reads. */
  retries?: number;
  /** Delay before the first retry in ms (default 600, doubled each time). */
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * `run` for READS: each attempt gets an AbortSignal that fires after `timeoutMs`
 * (attach it with `.abortSignal(signal)`), and transient failures (network, timeout,
 * 5xx) are retried `retries` times. Never use it for writes: a timed-out insert may
 * still have landed on the server.
 */
export async function runRead<R extends { data: unknown; error: unknown }>(
  make: (signal: AbortSignal) => PromiseLike<R>,
  fallback?: string,
  opts: ReadOptions = {},
): Promise<OkData<R>> {
  const { timeoutMs = 20_000, retries = 0, retryDelayMs = 600 } = opts;
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    try {
      return await run(make(ctrl.signal), fallback);
    } catch (err) {
      const e = timedOut ? new FitError('timeout', TIMEOUT_MSG) : toFitError(err, fallback);
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (attempt >= retries || offline || !isTransient(e)) throw e;
    } finally {
      clearTimeout(timer);
    }
    await sleep(retryDelayMs * 2 ** attempt);
  }
}

/**
 * Validation error. Throws immediately; typed `never` so both `invalid('…')` and
 * `throw invalid('…')` work.
 */
export function invalid(message: string): never {
  throw new FitError('invalid', message);
}

/**
 * Validates a local 'YYYY-MM-DD' day before it is sent to a `date` column — a UTC
 * ISO timestamp (toISOString) or '2026-02-31' would otherwise be shifted or rejected
 * by Postgres with a cryptic error.
 */
export function vDate(value: unknown, message = 'Ngày không hợp lệ.'): string {
  if (!isISODate(value)) invalid(message);
  return value;
}

/** Human message for anything caught in a component. */
export function errorMessage(err: unknown): string {
  if (err instanceof FitError) return err.message;
  if (typeof err === 'string') return looksVietnamese(err) ? err : toFitError(new Error(err)).message;
  const mapped = toFitError(err);
  // Errors thrown by feature code with a Vietnamese message are shown as-is; raw library
  // messages (English) never reach the user — they get the mapped / generic text instead.
  if (mapped.code === 'unknown' && err instanceof Error && looksVietnamese(err.message)) return err.message;
  return mapped.message;
}

/** Vietnamese text always contains letters outside ASCII (ă, ơ, ư, đ, tone marks…). */
function looksVietnamese(s: string | undefined): boolean {
  return Boolean(s && /[À-ỹ]/.test(s));
}

/** Keeps only whitelisted keys whose value is not undefined. */
export function pick<T extends object, K extends string>(obj: T, keys: readonly K[]): Partial<Record<K, unknown>> {
  const out: Partial<Record<K, unknown>> = {};
  for (const k of keys) {
    const v = (obj as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}
