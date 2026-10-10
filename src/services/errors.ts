// Turns Supabase/PostgREST/Auth/Storage errors into an Error with a Vietnamese message.
// Services call `run(query)` and either get the data or throw `FitError`.

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
  name?: string;
}

const SESSION_MSG = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';

const AUTH_MESSAGES: Array<[RegExp, string, string]> = [
  [/invalid login credentials|invalid_credentials/i, 'invalid_credentials', 'Email hoặc mật khẩu không đúng.'],
  [/email not confirmed|email_not_confirmed/i, 'email_not_confirmed', 'Email chưa được xác nhận. Hãy mở liên kết trong hộp thư của bạn.'],
  [/user already registered|user_already_exists|email_exists/i, 'user_already_exists', 'Email này đã có tài khoản — hãy đăng nhập bằng tài khoản Note_mytasks của bạn.'],
  [/password should be|weak_password/i, 'weak_password', 'Mật khẩu quá yếu. Hãy dùng ít nhất 8 ký tự, khó đoán hơn.'],
  [/rate limit|over_email_send_rate_limit|over_request_rate_limit|too many/i, 'rate_limited', 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.'],
  [/otp_expired|token has expired|invalid.*(token|link)|flow_state/i, 'link_expired', 'Liên kết đã hết hạn hoặc đã được dùng. Hãy yêu cầu liên kết mới.'],
  [/same_password|should be different/i, 'same_password', 'Mật khẩu mới phải khác mật khẩu cũ.'],
  [/signup_disabled|signups not allowed/i, 'signup_disabled', 'Đăng ký tài khoản mới đang tạm tắt.'],
  [/session.*(missing|not.?found|expired)|jwt expired|invalid jwt|bad_jwt|refresh_token/i, 'session_expired', SESSION_MSG],
];

export function toFitError(err: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): FitError {
  if (err instanceof FitError) return err;
  const e = (err ?? {}) as RawError;
  const msg = `${e.message ?? ''} ${e.code ?? ''}`;

  if (err instanceof TypeError || e.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg)) {
    return new FitError('network', 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
  }
  for (const [re, code, text] of AUTH_MESSAGES) if (re.test(msg)) return new FitError(code, text);

  switch (e.code) {
    case '42P01':
    case 'PGRST205':
    case '42883':
    case 'PGRST202':
      // Tables / RPCs of migration 001400 not applied yet on the shared project.
      return new FitError('schema_missing', 'Máy chủ chưa được cập nhật dữ liệu Fitora. Vui lòng thử lại sau.');
    case '42501':
      return /not_authenticated/.test(msg)
        ? new FitError('session_expired', SESSION_MSG)
        : new FitError('forbidden', 'Bạn không có quyền thực hiện thao tác này.');
    case 'PGRST301':
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
  if (e.status === 401) return new FitError('session_expired', SESSION_MSG);
  if (e.status === 413 || /payload too large|exceeded the maximum allowed size/i.test(msg)) {
    return new FitError('too_large', 'Ảnh quá lớn (tối đa 5 MB).');
  }
  if (/mime type|invalid_mime_type/i.test(msg)) return new FitError('invalid', 'Định dạng ảnh không được hỗ trợ.');
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

/**
 * Validation error. Throws immediately; typed `never` so both `invalid('…')` and
 * `throw invalid('…')` work.
 */
export function invalid(message: string): never {
  throw new FitError('invalid', message);
}

/** Human message for anything caught in a component. */
export function errorMessage(err: unknown): string {
  if (err instanceof FitError) return err.message;
  if (err instanceof Error && err.message && !/^\w+Error$/.test(err.message)) return toFitError(err).code === 'unknown' ? err.message : toFitError(err).message;
  return toFitError(err).message;
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
