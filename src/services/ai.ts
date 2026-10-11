import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { AI_FUNCTION } from '@/lib/config';
import { db } from '@/lib/supabase';
import type { AiDish, AiErrorCode, AiScanResponse } from '@/types/db';
import { FitoraError } from './errors';

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  not_food: 'Không nhận ra món ăn trong ảnh. Hãy chụp gần hơn, đủ sáng và thấy rõ món.',
  quota_exceeded: 'Bạn đã dùng hết lượt quét AI hôm nay. Hãy nhập món thủ công hoặc thử lại vào ngày mai.',
  bad_request: 'Ảnh không hợp lệ hoặc quá lớn. Hãy thử ảnh khác.',
  ai_unavailable: 'AI đang bận hoặc tạm gián đoạn. Hãy thử lại sau ít phút.',
  network: 'Không kết nối được máy chủ. Hãy kiểm tra mạng và thử lại.',
  unauthorized: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
};

/** Error thrown by scanFood; `code` tells the UI what to offer (retry, manual entry…). */
export class AiScanError extends FitoraError {
  declare code: AiErrorCode;
  constructor(code: AiErrorCode, message?: string) {
    super(message || AI_ERROR_MESSAGES[code], code);
    this.name = 'AiScanError';
  }
}

export interface ScanOptions {
  hint?: string;
  mode?: 'photo' | 'live';
  signal?: AbortSignal;
  /** Give up after this many ms (default AI_TIMEOUT_MS). */
  timeoutMs?: number;
}

/** Vision models answer in 3–15 s; past this the request is considered stuck. */
export const AI_TIMEOUT_MS = 60_000;
export const AI_TIMEOUT_MESSAGE = 'AI phản hồi quá lâu. Hãy kiểm tra mạng và thử lại.';

function abortError(): Error {
  return typeof DOMException === 'function' ? new DOMException('Đã hủy quét.', 'AbortError') : Object.assign(new Error('Đã hủy quét.'), { name: 'AbortError' });
}

const KNOWN: AiErrorCode[] = ['not_food', 'quota_exceeded', 'bad_request', 'ai_unavailable'];

const n = (v: unknown, min = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(min, x) : min;
};

const GRAM_UNITS = ['g', 'gr', 'gr.', 'gram', 'grams', 'gam'];

export function normalizeDish(d: Partial<AiDish>): AiDish {
  const quantity = n(d.quantity) || 1;
  let unit = String(d.unit ?? 'phần').trim().slice(0, 20) || 'phần';
  let grams = n(d.grams);
  // "150 gram" / "150 gr." → unit 'g'; the quantity then IS the weight when grams is missing.
  if (GRAM_UNITS.includes(unit.toLowerCase())) {
    unit = 'g';
    if (!grams) grams = quantity;
  }
  const protein_g = n(d.protein_g);
  const carbs_g = n(d.carbs_g);
  const fat_g = n(d.fat_g);
  // Missing / zero kcal but macros present: derive it (Atwater 4/4/9).
  const kcal = n(d.kcal) || Math.round(protein_g * 4 + carbs_g * 4 + fat_g * 9);
  return {
    name: String(d.name ?? 'Món ăn').trim().slice(0, 120) || 'Món ăn',
    ingredients: Array.isArray(d.ingredients) ? d.ingredients.map(String).slice(0, 20) : [],
    quantity,
    unit,
    grams,
    kcal,
    protein_g,
    carbs_g,
    fat_g,
    fiber_g: n(d.fiber_g),
    confidence: d.confidence === undefined || d.confidence === null ? 0.5 : Math.min(1, n(d.confidence)),
  };
}

/**
 * The server's own Vietnamese explanation is more specific than ours ("Ảnh là bàn phím",
 * "hết 40 lượt"); keep it when it looks like a short human sentence.
 */
export function serverMessage(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const m = v.replace(/\s+/g, ' ').trim();
  return m.length >= 8 && m.length <= 300 ? m : undefined;
}

export async function errorFromResponse(res: Response | undefined): Promise<AiScanError> {
  if (!res) return new AiScanError('ai_unavailable');
  if (res.status === 401) return new AiScanError('unauthorized');
  try {
    const body = (await res.clone().json()) as { error?: string; message?: unknown };
    if (body?.error && (KNOWN as string[]).includes(body.error)) {
      return new AiScanError(body.error as AiErrorCode, serverMessage(body.message));
    }
  } catch {
    /* non-JSON body */
  }
  if (res.status === 429) return new AiScanError('quota_exceeded');
  if (res.status === 413 || res.status === 400) return new AiScanError('bad_request');
  return new AiScanError('ai_unavailable');
}

/**
 * Send a (compressed) image data URL to the Edge Function `fitora-food-ai`.
 * Throws AiScanError with a Vietnamese message: not_food | quota_exceeded |
 * bad_request | ai_unavailable | network | unauthorized.
 */
export async function scanFood(dataUrl: string, opts: ScanOptions = {}): Promise<AiScanResponse> {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) throw new AiScanError('bad_request');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiScanError('network');

  const body: Record<string, unknown> = { image: dataUrl, mode: opts.mode ?? 'photo' };
  if (opts.hint?.trim()) body.hint = opts.hint.trim().slice(0, 200);

  if (opts.signal?.aborted) throw abortError();

  let result: { data: unknown; error: unknown };
  try {
    result = await db().functions.invoke(AI_FUNCTION, {
      body,
      // A stuck request would otherwise keep the scan spinner forever.
      timeout: opts.timeoutMs ?? AI_TIMEOUT_MS,
      ...(opts.signal ? { signal: opts.signal } : {}),
    } as Parameters<ReturnType<typeof db>['functions']['invoke']>[1]);
  } catch (e) {
    if (opts.signal?.aborted || (e as Error)?.name === 'AbortError') throw abortError();
    throw new AiScanError('network');
  }

  const { data, error } = result;
  if (error) {
    // functions-js wraps an aborted fetch in FunctionsFetchError: tell the caller's own
    // cancel (AbortError, ignored by the UI) apart from our timeout (AI too slow).
    if (opts.signal?.aborted || (error as Error)?.name === 'AbortError') throw abortError();
    if (error instanceof FunctionsHttpError) throw await errorFromResponse(error.context as Response);
    if (error instanceof FunctionsFetchError) {
      const cause = (error as { context?: { name?: string } }).context;
      if (cause?.name === 'AbortError' || cause?.name === 'TimeoutError') throw new AiScanError('ai_unavailable', AI_TIMEOUT_MESSAGE);
      throw new AiScanError('network');
    }
    if (error instanceof FunctionsRelayError) throw new AiScanError('ai_unavailable');
    throw new AiScanError('ai_unavailable');
  }

  let payload: (Partial<AiScanResponse> & { error?: string; message?: unknown }) | null;
  try {
    payload = (typeof data === 'string' ? JSON.parse(data) : data) as typeof payload;
  } catch {
    throw new AiScanError('ai_unavailable');
  }
  if (payload?.error && (KNOWN as string[]).includes(payload.error)) {
    throw new AiScanError(payload.error as AiErrorCode, serverMessage(payload.message));
  }
  const dishes = Array.isArray(payload?.dishes) ? payload.dishes.map(normalizeDish) : [];
  if (payload?.is_food === false || !dishes.length) throw new AiScanError('not_food', serverMessage(payload?.notes));
  return { dishes, is_food: true, notes: typeof payload?.notes === 'string' && payload.notes.trim() ? payload.notes.trim() : undefined };
}
