// Edge cases of the "remember, don't repeat" features, played as a real user:
// AI errors (quota / not food / AI busy → retry), double taps, losing the network,
// an account that has not saved anything yet, and known defects kept as `fixme`
// (flip them to `test` once the owning area ships the fix).
// Mutates ONLY the dedicated "edge" and "empty" accounts (recreated + seeded by global setup).
import { expect, test, type Page } from '@playwright/test';
import { aiResponse, foodPhoto, mockFoodAi, overflowX, storageStatePath, todayVN, userId, wipeFood, withDb } from '../support/env';

type Row = Record<string, unknown>;
async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  return withDb(async (c) => (await c.query(sql, params)).rows);
}
const countEntries = async (key: 'edge' | 'empty', name: string, date = todayVN()) =>
  Number((await q(`select count(*)::int as c from public.fit_meal_entries where user_id = $1 and name = $2 and eaten_on = $3`, [await userId(key), name, date]))[0].c);

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
async function uploadPhoto(page: Page) {
  await page.locator('input[type=file]:not([capture])').first().setInputFiles(await foodPhoto(page));
}

const BANH_XEO = { name: 'Bánh xèo miền Tây', quantity: 1, unit: 'chiếc', grams: 250, kcal: 480, protein_g: 15, carbs_g: 45, fat_g: 26, fiber_g: 3, confidence: 0.8 };

test.describe('Quét bị lỗi AI → vẫn ghi được, không bắt quét lại', () => {
  test.use({ storageState: storageStatePath('edge') });
  test.describe.configure({ mode: 'serial' });

  test('hết lượt quét: báo bằng tiếng Việt và mời ăn lại món đã lưu (không cần AI)', async ({ page }) => {
    const errors = trackErrors(page);
    const ai = await mockFoodAi(page, () => ({ status: 429, body: { error: 'quota_exceeded', message: 'Bạn đã dùng hết lượt quét hôm nay.' } }));
    await page.goto('#/scan?meal=lunch');
    await uploadPhoto(page);
    const panel = page.getByRole('alertdialog');
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel).toContainText('Hết lượt quét hôm nay');
    expect(ai.calls()).toBe(1);

    const strip = page.getByRole('region', { name: 'Không cần AI — ăn lại món đã lưu' });
    await expect(strip).toBeVisible();
    const before = await countEntries('edge', 'Bún bò Huế');
    await strip.getByRole('button', { name: /^Ăn lại Bún bò Huế, 540 kcal/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Bún bò Huế' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /^Thêm vào trưa/ }).click();
    await expect(sheet).toBeHidden();
    await expect.poll(() => countEntries('edge', 'Bún bò Huế')).toBe(before + 1);
    expect(ai.calls()).toBe(1); // the re-log never touched the AI
    expect(errors).toEqual([]);
  });

  test('ảnh không phải đồ ăn: gợi ý chụp lại hoặc tìm thủ công cho đúng bữa', async ({ page }) => {
    await mockFoodAi(page, () => ({ status: 422, body: { error: 'not_food', message: 'Ảnh này không có món ăn.' } }));
    await page.goto(`#/scan?meal=dinner&date=${todayVN()}`);
    await uploadPhoto(page);
    const panel = page.getByRole('alertdialog');
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel).toContainText('Chưa thấy món ăn');
    await expect(panel.getByRole('button', { name: 'Chụp lại' })).toBeVisible();
    await panel.getByText('Tìm thủ công').click();
    await expect(page).toHaveURL(/#\/food\/search\?meal=dinner/);
  });

  test('AI bận: "Thử lại" gửi lại đúng ảnh và ra kết quả, không phải chọn ảnh lại', async ({ page }) => {
    const ai = await mockFoodAi(page, (n) =>
      n === 1 ? { status: 503, body: { error: 'ai_unavailable', message: 'AI đang bận.' } } : { status: 200, body: aiResponse([BANH_XEO]) });
    await page.goto('#/scan?meal=snack');
    await uploadPhoto(page);
    const panel = page.getByRole('alertdialog');
    await expect(panel).toContainText('AI đang bận', { timeout: 20_000 });
    await panel.getByRole('button', { name: 'Thử lại' }).click();
    const review = page.getByRole('dialog', { name: 'Kết quả quét' });
    await expect(review).toBeVisible({ timeout: 20_000 });
    await expect(review.getByRole('button', { name: /Lưu vào nhật ký · 480 kcal/ })).toBeVisible();
    expect(ai.calls()).toBe(2);
    const o = await overflowX(page);
    expect(o.doc).toBeLessThanOrEqual(0);
  });
});

test.describe('Hôm nay · Ăn lại nhanh: chạm hai lần, mất mạng', () => {
  test.use({ storageState: storageStatePath('edge') });
  test.describe.configure({ mode: 'serial' });

  test('chạm đúp chỉ ghi một lần', async ({ page }) => {
    await page.goto('#/');
    const strip = page.getByRole('region', { name: 'Ăn lại nhanh' });
    const tile = strip.getByRole('button', { name: /^Ghi Bánh mì trứng ốp la,/ });
    const before = await countEntries('edge', 'Bánh mì trứng ốp la');
    await tile.dblclick();
    await expect.poll(() => countEntries('edge', 'Bánh mì trứng ốp la')).toBe(before + 1);
    await page.waitForTimeout(1_500); // a late second insert would land here
    expect(await countEntries('edge', 'Bánh mì trứng ốp la')).toBe(before + 1);
  });

  test('mất mạng: báo lỗi rõ ràng, không ghi; có mạng lại thì chạm là ghi', async ({ page, context }) => {
    await page.goto('#/');
    const strip = page.getByRole('region', { name: 'Ăn lại nhanh' });
    const tile = strip.getByRole('button', { name: /^Ghi Sữa chua Hy Lạp nhà làm,/ });
    await expect(tile).toBeVisible();
    const before = await countEntries('edge', 'Sữa chua Hy Lạp nhà làm');

    await context.setOffline(true);
    await tile.click();
    await expect(page.getByText(/Không kết nối được máy chủ/).first()).toBeVisible();
    await context.setOffline(false);
    expect(await countEntries('edge', 'Sữa chua Hy Lạp nhà làm')).toBe(before);

    await expect(tile).toBeEnabled();
    await tile.click();
    await expect.poll(() => countEntries('edge', 'Sữa chua Hy Lạp nhà làm')).toBe(before + 1);
  });
});

test.describe('Tài khoản chưa lưu món nào', () => {
  test.use({ storageState: storageStatePath('empty') });
  test.beforeAll(async () => {
    await wipeFood('empty');
  });

  test('Hôm nay, Scan và Món của tôi giải thích cách món được ghi nhớ, không hiện ô trống', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('#/');
    await expect(page.getByRole('region', { name: 'Ăn lại nhanh' })).toContainText('Món bạn scan hoặc lưu sẽ hiện ở đây');

    await page.goto('#/scan?meal=lunch');
    await expect(page.getByRole('radiogroup', { name: 'Chế độ quét' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ăn lại món đã lưu' })).toHaveCount(0);

    await page.goto('#/food/search?meal=lunch');
    await page.getByRole('radio', { name: 'Món của tôi' }).click();
    await expect(page.getByText('Chưa có món đã lưu')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------ */
/* Known defects (reported to the owning areas). Flip `test.fixme` → `test` when fixed.        */
/* ------------------------------------------------------------------------------------------ */

test.describe('Lỗi đã báo (chờ sửa)', () => {
  test.use({ storageState: storageStatePath('edge') });

  // scan: Android/browser Back while "Kết quả quét" is open leaves the Scan screen and throws
  // away a result that already cost one AI scan. Back should close the sheet (or ask first).
  test.fixme('nút Back khi đang xem kết quả quét chỉ đóng bảng kết quả, không mất lượt quét', async ({ page }) => {
    await mockFoodAi(page, aiResponse([BANH_XEO]));
    await page.goto('#/');
    await page.getByRole('navigation', { name: 'Điều hướng' }).getByRole('link', { name: 'Quét món ăn bằng AI' }).click();
    await uploadPhoto(page);
    const review = page.getByRole('dialog', { name: 'Kết quả quét' });
    await expect(review).toBeVisible({ timeout: 20_000 });
    await page.goBack();
    await expect(page).toHaveURL(/#\/scan/);
  });

  // scan + contract: an AI result over the DB limits (e.g. 99 999 g, 999 999 kcal) can be submitted;
  // the diary insert fails with a generic error but the dish was already saved to "Món của tôi"
  // (use_count 1, clamped to 1 000 kcal/100 g) although nothing was logged.
  test.fixme('kết quả AI vô lý: báo lỗi ngay ở ô sai và không để lại món đã lưu "ma"', async ({ page }) => {
    const name = 'Lẩu hải sản e2e khổng lồ';
    await mockFoodAi(page, aiResponse([{ ...BANH_XEO, name, unit: 'nồi', grams: 99_999, kcal: 999_999, protein_g: 9_999, carbs_g: 9_999, fat_g: 9_999, fiber_g: 999 }]));
    await page.goto('#/scan?meal=lunch');
    await uploadPhoto(page);
    const review = page.getByRole('dialog', { name: 'Kết quả quét' });
    await expect(review).toBeVisible({ timeout: 20_000 });
    await review.getByRole('button', { name: /Lưu vào nhật ký/ }).click();
    await expect(review.getByRole('alert').first()).toBeVisible();
    const saved = await q(`select id from public.fit_custom_foods where user_id = $1 and name = $2`, [await userId('edge'), name]);
    expect(saved).toHaveLength(0);
  });

  // foundation (NumberField clamps silently on blur) → body: typing 999 kg saves 300 kg with
  // "Đã cập nhật số đo". Same for quick-add 99 999 kcal → 5 000 kcal, steps 9 999 999 → 200 000.
  test.fixme('cân nặng 999 kg bị chặn bằng lỗi, không âm thầm lưu thành 300 kg', async ({ page }) => {
    await page.goto('#/body');
    await page.getByRole('button', { name: /Cập nhật số đo/ }).first().click();
    const sheet = page.getByRole('dialog').last();
    await sheet.getByRole('textbox', { name: 'Cân nặng' }).fill('999');
    await sheet.getByRole('button', { name: 'Cập nhật' }).click();
    await expect(sheet.getByText(/300 kg|tối đa|không hợp lệ/i).first()).toBeVisible();
    const [row] = await q(`select weight_kg from public.fit_body_measurements where user_id = $1 and measured_on = $2`, [await userId('edge'), todayVN()]);
    expect(Number(row?.weight_kg ?? 0)).not.toBe(300);
  });
});
