import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({ db: () => ({ functions: { invoke } }) }));

const { AI_ERROR_MESSAGES, AiScanError, scanFood, serverMessage } = await import('@/services/ai');

const IMG = 'data:image/jpeg;base64,AAAA';
const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

async function codeOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AiScanError);
    return { code: (e as InstanceType<typeof AiScanError>).code, message: (e as Error).message };
  }
  throw new Error('expected a rejection');
}

beforeEach(() => {
  invoke.mockReset();
});

describe('scanFood', () => {
  it('normalises dishes and keeps notes', async () => {
    invoke.mockResolvedValue({
      data: { is_food: true, notes: ' Ước tính 1 tô. ', dishes: [{ name: 'Phở bò', quantity: 1, unit: 'tô', grams: 600, kcal: 520, protein_g: 30, carbs_g: 65, fat_g: 14 }] },
      error: null,
    });
    const r = await scanFood(IMG, { hint: '  ít bánh  ' });
    expect(invoke.mock.calls[0][1].body).toEqual({ image: IMG, mode: 'photo', hint: 'ít bánh' });
    expect(r.notes).toBe('Ước tính 1 tô.');
    expect(r.dishes[0]).toMatchObject({ name: 'Phở bò', fiber_g: 0, confidence: 0.5, ingredients: [] });
  });

  it('rejects non-image data URLs without calling the server', async () => {
    expect((await codeOf(scanFood('data:text/plain;base64,AA'))).code).toBe('bad_request');
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    [422, { error: 'not_food', message: 'Ảnh chụp bàn phím máy tính, không có món ăn.' }, 'not_food', 'Ảnh chụp bàn phím máy tính, không có món ăn.'],
    [429, { error: 'quota_exceeded', message: 'Bạn đã dùng hết 40 lượt phân tích AI hôm nay.' }, 'quota_exceeded', 'Bạn đã dùng hết 40 lượt phân tích AI hôm nay.'],
    [400, { error: 'bad_request', message: 'Ảnh quá lớn (tối đa ~1.5 MB).' }, 'bad_request', 'Ảnh quá lớn (tối đa ~1.5 MB).'],
    [503, { error: 'ai_unavailable', message: 'x' }, 'ai_unavailable', AI_ERROR_MESSAGES.ai_unavailable],
    [401, { error: 'bad_request', message: 'Phiên đăng nhập không hợp lệ' }, 'unauthorized', AI_ERROR_MESSAGES.unauthorized],
    [429, 'Too Many Requests', 'quota_exceeded', AI_ERROR_MESSAGES.quota_exceeded],
    [413, '', 'bad_request', AI_ERROR_MESSAGES.bad_request],
    [500, '<html>', 'ai_unavailable', AI_ERROR_MESSAGES.ai_unavailable],
  ])('HTTP %i %j → %s', async (status, body, code, message) => {
    invoke.mockResolvedValue({ data: null, error: httpError(status, body) });
    expect(await codeOf(scanFood(IMG))).toEqual({ code, message });
  });

  it('network failures map to network', async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new TypeError('Failed to fetch')) });
    expect((await codeOf(scanFood(IMG))).code).toBe('network');
  });

  it('a thrown fetch error maps to network', async () => {
    invoke.mockImplementation(() => Promise.reject(Object.assign(new Error('Failed to fetch'), { name: 'TypeError' })));
    expect((await codeOf(scanFood(IMG))).code).toBe('network');
  });

  it('empty or non-food answers are not_food; garbage is ai_unavailable', async () => {
    invoke.mockResolvedValue({ data: { is_food: true, dishes: [] }, error: null });
    expect(await codeOf(scanFood(IMG))).toEqual({ code: 'not_food', message: AI_ERROR_MESSAGES.not_food });
    invoke.mockResolvedValue({ data: '<html>oops', error: null });
    expect((await codeOf(scanFood(IMG))).code).toBe('ai_unavailable');
  });

  it('serverMessage keeps short human sentences only', () => {
    expect(serverMessage('  Ảnh   phong cảnh. ')).toBe('Ảnh phong cảnh.');
    expect(serverMessage('x')).toBeUndefined();
    expect(serverMessage('a'.repeat(400))).toBeUndefined();
    expect(serverMessage(42)).toBeUndefined();
  });
});
