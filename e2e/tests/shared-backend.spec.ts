// Shared backend contract, through the public API exactly like the two browsers use it.
// No UI: runs even before the Fitora screens exist.
import { expect, test } from '@playwright/test';
import { USERS, admin, todayVN, userClient, userId } from '../support/env';

test.describe('Backend dùng chung Fitora ↔ Note_mytasks', () => {
  test.describe.configure({ mode: 'serial' });

  test('một tài khoản: profiles (của Note_mytasks) được tạo khi đăng ký và Fitora đọc được', async () => {
    const c = await userClient('coach');
    const id = await userId('coach');
    const { data, error } = await c.from('profiles').select('id, display_name, avatar_url, timezone').eq('id', id).single();
    expect(error).toBeNull();
    expect(data!.display_name).toBe(USERS.coach.name);
    expect(data!.timezone).toBe('Asia/Ho_Chi_Minh');
    // handle_new_user also seeds Note_mytasks categories — the account works in both apps.
    const { count } = await c.from('categories').select('id', { count: 'exact', head: true });
    expect(count).toBeGreaterThan(0);
  });

  test('đổi tên ở Fitora thì Note_mytasks thấy ngay (cùng hàng profiles)', async () => {
    const c = await userClient('other');
    const id = await userId('other');
    await expect(c.from('profiles').update({ display_name: 'Tên mới' }).eq('id', id).select().single())
      .resolves.toMatchObject({ error: null });
    const { data } = await admin().from('profiles').select('display_name').eq('id', id).single();
    expect(data!.display_name).toBe('Tên mới');
    await c.from('profiles').update({ display_name: USERS.other.name }).eq('id', id);
  });

  test('fit_day_summary hôm nay khớp dữ liệu seed', async () => {
    const c = await userClient('coach');
    const { data, error } = await c.rpc('fit_day_summary', { p_date: todayVN() });
    expect(error).toBeNull();
    // today: phở 450 + cơm gà 650 + snack 145.5 (d=0 is even)
    expect(Number(data.kcal_in)).toBeCloseTo(1245.5, 1);
    expect(Number(data.water_ml)).toBe(750);
    expect(Number(data.steps)).toBe(3200);
    expect(Number(data.workout_kcal)).toBe(0);
  });

  test('fit_range_summary: 7 ngày, buổi tập "planned" không tính, cân nặng theo ngày', async () => {
    const c = await userClient('coach');
    const { data, error } = await c.rpc('fit_range_summary', { p_from: todayVN(-6), p_to: todayVN(1) });
    expect(error).toBeNull();
    expect(data).toHaveLength(8);
    const tomorrow = data!.find((r: { day: string }) => r.day === todayVN(1));
    expect(Number(tomorrow.workout_kcal)).toBe(0); // planned yoga
    const today = data!.find((r: { day: string }) => r.day === todayVN());
    expect(Number(today.weight_kg)).toBeCloseTo(76.6, 1);
  });

  test('RLS: tài khoản khác không đọc / sửa được dữ liệu Fitora của coach', async () => {
    const other = await userClient('other');
    const coachId = await userId('coach');
    const { data } = await other.from('fit_meal_entries').select('id').eq('user_id', coachId);
    expect(data).toEqual([]);
    const { data: upd } = await other.from('fit_profiles').update({ calorie_target: 900 }).eq('user_id', coachId).select();
    expect(upd).toEqual([]);
    const forged = await other.from('fit_meal_entries')
      .insert({ user_id: coachId, eaten_on: todayVN(), meal: 'lunch', name: 'giả mạo' });
    expect(forged.error).not.toBeNull();
  });

  test('anon không truy cập được bảng fit_* và RPC', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const anon = createClient(process.env.FITORA_E2E_API_URL!, process.env.FITORA_E2E_ANON_KEY!);
    const { error } = await anon.from('fit_profiles').select('user_id').limit(1);
    expect(error).not.toBeNull();
    const rpc = await anon.rpc('fit_day_summary', { p_date: todayVN() });
    expect(rpc.error).not.toBeNull();
  });

  test('ảnh bữa ăn: chỉ ghi được vào thư mục của chính mình trong bucket riêng "fitora"', async () => {
    const c = await userClient('coach');
    const id = await userId('coach');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const own = await c.storage.from('fitora').upload(`${id}/meals/e2e.png`, png, { contentType: 'image/png', upsert: true });
    expect(own.error).toBeNull();
    const signed = await c.storage.from('fitora').createSignedUrl(`${id}/meals/e2e.png`, 60);
    expect(signed.error).toBeNull();
    const other = await userClient('other');
    const steal = await other.storage.from('fitora').createSignedUrl(`${id}/meals/e2e.png`, 60);
    expect(steal.error).not.toBeNull();
    const intrude = await other.storage.from('fitora').upload(`${id}/meals/x.png`, png, { contentType: 'image/png' });
    expect(intrude.error).not.toBeNull();
  });

  test('hạn mức AI: fit_ai_quota_consume dừng ở giới hạn', async () => {
    const c = await userClient('other');
    const r1 = await c.rpc('fit_ai_quota_consume', { p_limit: 2 });
    const r2 = await c.rpc('fit_ai_quota_consume', { p_limit: 2 });
    const r3 = await c.rpc('fit_ai_quota_consume', { p_limit: 2 });
    expect([r1.data, r2.data, r3.data]).toEqual([true, true, false]);
  });
});
