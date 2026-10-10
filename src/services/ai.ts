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
}

const KNOWN: AiErrorCode[] = ['not_food', 'quota_exceeded', 'bad_request', 'ai_unavailable'];

const n = (v: unknown, min = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(min, x) : min;
};

function normalizeDish(d: Partial<AiDish>): AiDish {
  return {
    name: String(d.name ?? 'Món ăn').trim().slice(0, 120) || 'Món ăn',
    ingredients: Array.isArray(d.ingredients) ? d.ingredients.map(String).slice(0, 20) : [],
    quantity: n(d.quantity) || 1,
    unit: String(d.unit ?? 'phần').trim().slice(0, 20) || 'phần',
    grams: n(d.grams),
    kcal: n(d.kcal),
    protein_g: n(d.protein_g),
    carbs_g: n(d.carbs_g),
    fat_g: n(d.fat_g),
    fiber_g: n(d.fiber_g),
    confidence: Math.min(1, n(d.confidence)),
  };
}

async function errorFromResponse(res: Response | undefined): Promise<AiScanError> {
  if (!res) return new AiScanError('ai_unavailable');
  if (res.status === 401) return new AiScanError('unauthorized');
  try {
    const body = (await res.clone().json()) as { error?: string };
    if (body?.error && (KNOWN as string[]).includes(body.error)) return new AiScanError(body.error as AiErrorCode);
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

  let result: { data: unknown; error: unknown };
  try {
    result = await db().functions.invoke(AI_FUNCTION, { body, ...(opts.signal ? { signal: opts.signal } : {}) } as Parameters<
      ReturnType<typeof db>['functions']['invoke']
    >[1]);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new AiScanError('network');
  }

  const { data, error } = result;
  if (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    if (error instanceof FunctionsHttpError) throw await errorFromResponse(error.context as Response);
    if (error instanceof FunctionsFetchError) throw new AiScanError('network');
    if (error instanceof FunctionsRelayError) throw new AiScanError('ai_unavailable');
    throw new AiScanError('ai_unavailable');
  }

  const payload = (typeof data === 'string' ? JSON.parse(data) : data) as Partial<AiScanResponse> & { error?: string };
  if (payload?.error && (KNOWN as string[]).includes(payload.error)) throw new AiScanError(payload.error as AiErrorCode);
  const dishes = Array.isArray(payload?.dishes) ? payload.dishes.map(normalizeDish) : [];
  if (payload?.is_food === false || !dishes.length) throw new AiScanError('not_food');
  return { dishes, is_food: true, notes: typeof payload.notes === 'string' ? payload.notes : undefined };
}
