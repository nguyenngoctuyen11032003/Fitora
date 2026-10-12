// Regression guards for defects fixed before release, played as a real user:
// a double tap on "Hoàn tác" undoes exactly once; a 500 ml drink is not clamped to 50;
// ?tab=mine opens "Món của tôi"; a failed Diary load is an error (not "0 kcal"); Scan and
// Today suggest the same meal at the same clock time; no logo / no "Note_mytasks" after login.
// Mutates ONLY the dedicated "qa" account (recreated + seeded by global setup).
import { expect, test, type Page } from '@playwright/test';
import { aiResponse, foodPhoto, mockFoodAi, overflowX, storageStatePath, todayVN, userId, withDb } from '../support/env';

test.use({ storageState: storageStatePath('qa') });

type Row = Record<string, unknown>;
async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  return withDb(async (c) => (await c.query(sql, params)).rows);
}
const countEntries = async (name: string, date = todayVN()) =>
  Number((await q(`select count(*)::int as c from public.fit_meal_entries where user_id = $1 and name = $2 and eaten_on = $3`, [await userId('qa'), name, date]))[0].c);
const savedFood = async (name: string) =>
  (await q(`select use_count, last_used_at, default_meal from public.fit_custom_foods where user_id = $1 and name = $2`, [await userId('qa'), name]))[0];
const template = async (name: string) =>
  (await q(`select use_count, last_used_at from public.fit_meal_templates where user_id = $1 and name = $2`, [await userId('qa'), name]))[0];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Two clicks in the same task — a double tap that lands before React re-renders (harsher than dblclick). */
async function doubleTap(page: Page, name: string) {
  const btn = page.getByRole('button', { name, exact: true }).last();
  await expect(btn).toBeVisible();
  await btn.evaluate((b: HTMLElement) => {
    b.click();
    b.click();
  });
}

test.describe('Hoàn tác: chạm đúp chỉ hoàn tác một lần', () => {
  test.describe.configure({ mode: 'serial' });

  test('Nhật ký: xóa món rồi chạm đúp "Hoàn tác" → món trở lại đúng một lần', async ({ page }) => {
    const errors = trackErrors(page);
    const name = 'Phở bò';
    expect(await countEntries(name)).toBe(1);
    await page.goto('#/diary');
    await page.getByRole('region', { name: 'Bữa sáng' }).getByRole('button', { name: new RegExp(name) }).first().click();
    const sheet = page.getByRole('dialog', { name });
    await sheet.getByRole('button', { name: 'Xóa món này' }).click();
    await expect.poll(() => countEntries(name)).toBe(0);

    await doubleTap(page, 'Hoàn tác');
    await expect.poll(() => countEntries(name)).toBe(1);
    await page.waitForTimeout(1_500); // a late second insert would land here
    expect(await countEntries(name)).toBe(1);
    await expect(page.getByRole('region', { name: 'Bữa sáng' }).getByRole('button', { name: new RegExp(name) })).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('Hôm nay · Ăn lại nhanh: chạm đúp "Hoàn tác" → bỏ món và trả lại số lần dùng đúng một lần', async ({ page }) => {
    const name = 'Bánh mì trứng ốp la';
    const before = await savedFood(name);
    const entriesBefore = await countEntries(name);
    await page.goto('#/');
    const strip = page.getByRole('region', { name: 'Ăn lại nhanh' });
    await strip.getByRole('button', { name: new RegExp(`^Ghi ${name},`) }).click();
    await expect.poll(() => countEntries(name)).toBe(entriesBefore + 1);
    await expect.poll(async () => (await savedFood(name)).use_count).toBe(Number(before.use_count) + 1);

    await doubleTap(page, 'Hoàn tác');
    await expect.poll(() => countEntries(name)).toBe(entriesBefore);
    await expect.poll(async () => (await savedFood(name)).use_count).toBe(before.use_count);
    await page.waitForTimeout(1_500); // a second unmark would push use_count below the original
    const after = await savedFood(name);
    expect(after.use_count).toBe(before.use_count);
    expect(after.last_used_at).toEqual(before.last_used_at);
    expect(after.default_meal).toBe(before.default_meal);
  });

  // today: "Ăn lại nhanh" → tap a "Bữa mẫu" tile → "Hoàn tác" removes the rows AND gives the template
  // its use_count / last_used_at back.
  test('Hôm nay · Ăn lại nhanh: hoàn tác một bữa mẫu trả lại số lần dùng của bữa mẫu', async ({ page }) => {
    const before = await template('Sáng quen thuộc');
    // The breakfast template is offered at breakfast time (a past day keeps the session valid).
    await page.clock.setFixedTime(new Date(`${todayVN(-1)}T07:00:00+07:00`));
    await page.goto('#/');
    const strip = page.getByRole('region', { name: 'Ăn lại nhanh' });
    await strip.getByRole('button', { name: /^Ghi Sáng quen thuộc,/ }).click();
    await expect.poll(async () => (await template('Sáng quen thuộc')).use_count).toBe(Number(before.use_count) + 1);
    await doubleTap(page, 'Hoàn tác');
    await expect.poll(async () => (await template('Sáng quen thuộc')).use_count).toBe(before.use_count);
    expect((await template('Sáng quen thuộc')).last_used_at).toEqual(before.last_used_at);
  });
});

test.describe('Quét: đồ uống tính bằng ml', () => {
  test('ly trà sữa 500 ml giữ nguyên 500 ml (không bị chặn về 50) và lưu đúng', async ({ page }) => {
    const errors = trackErrors(page);
    const name = 'Trà sữa trân châu e2e';
    await mockFoodAi(page, aiResponse([{ name, quantity: 500, unit: 'ml', grams: 500, kcal: 380, protein_g: 4, carbs_g: 62, fat_g: 13, fiber_g: 0 }]));
    await page.goto('#/scan?meal=snack');
    await page.locator('input[type=file]:not([capture])').first().setInputFiles(await foodPhoto(page));
    const review = page.getByRole('dialog', { name: 'Kết quả quét' });
    await expect(review).toBeVisible({ timeout: 20_000 });
    const card = review.getByRole('article', { name });
    const field = card.getByRole('textbox', { name: 'Khối lượng' });
    await expect(field).toHaveValue(/^500/);
    // Focus + blur (where the old clamp ran) must keep the value.
    await field.click();
    await field.blur();
    await expect(field).toHaveValue(/^500/);
    await expect(review.getByRole('button', { name: /Lưu vào nhật ký · 380 kcal/ })).toBeVisible();
    expect((await overflowX(page)).doc).toBeLessThanOrEqual(0);

    await review.getByRole('button', { name: /Lưu vào nhật ký · 380 kcal/ }).click();
    await expect(page).toHaveURL(/#\/diary/);
    const [entry] = await q(`select grams, kcal from public.fit_meal_entries where user_id = $1 and name = $2`, [await userId('qa'), name]);
    expect(Number(entry.grams)).toBe(500);
    expect(Number(entry.kcal)).toBe(380);
    expect(errors).toEqual([]);
  });
});

test.describe('Món của tôi', () => {
  test('liên kết #/food/search?tab=mine mở thẳng tab "Món của tôi"', async ({ page }) => {
    await page.goto('#/food/search?tab=mine');
    await expect(page.getByRole('radio', { name: 'Món của tôi' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: /Bún bò Huế/ }).first()).toBeVisible();
  });

  test('menu "Món của tôi" cũng mở đúng tab đó', async ({ page }) => {
    await page.goto('#/');
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: /Món của tôi/ }).click();
    await expect(page).toHaveURL(/#\/food\/search\?tab=mine/);
    await expect(page.getByRole('radio', { name: 'Món của tôi' })).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('Nhật ký không tải được', () => {
  test('báo lỗi kèm "Thử lại" thay vì "Đã nạp 0 kcal"; có mạng lại thì hiện đúng số liệu', async ({ page }) => {
    const errors = trackErrors(page);
    const block = (r: import('@playwright/test').Route) => r.abort('internetdisconnected');
    await page.route('**/rest/v1/fit_meal_entries**', block);
    await page.goto('#/diary');
    const alert = page.getByRole('alert', { name: 'Không tải được nhật ký' });
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toContainText('Chưa tải được nhật ký');
    await expect(page.getByRole('region', { name: 'Tổng trong ngày' })).toHaveCount(0);
    // (the laptop sidebar has its own hidden "Đã nạp" glance — only the page itself matters here)
    await expect(page.locator('main').getByText('Đã nạp', { exact: true })).toHaveCount(0);

    await page.unroute('**/rest/v1/fit_meal_entries**', block);
    await alert.getByRole('button', { name: 'Thử lại' }).click();
    await expect(alert).toBeHidden();
    await expect(page.getByRole('region', { name: 'Tổng trong ngày' })).toContainText('kcal');
    await expect(page.getByRole('region', { name: 'Bữa sáng' }).getByRole('button', { name: /Phở bò/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('Cùng giờ thì Quét và Hôm nay gợi ý cùng một bữa', () => {
  const LABEL = { breakfast: 'Bữa sáng', lunch: 'Bữa trưa', dinner: 'Bữa tối', snack: 'Ăn vặt' } as const;
  const SHORT = { breakfast: 'Sáng', lunch: 'Trưa', dinner: 'Tối', snack: 'Ăn vặt' } as const;
  // Boundaries (sáng 04:00–10:29 · trưa 10:30–14:29 · tối 17:00–21:29 · ăn vặt otherwise).
  // A past day keeps the stored session valid under the fake clock.
  const CASES: Array<[string, keyof typeof LABEL]> = [
    ['03:59', 'snack'],
    ['04:00', 'breakfast'],
    ['10:29', 'breakfast'],
    ['10:30', 'lunch'],
    ['14:30', 'snack'],
    ['17:00', 'dinner'],
    ['21:30', 'snack'],
  ];
  for (const [hm, meal] of CASES) {
    test(`lúc ${hm}: ${LABEL[meal]}`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(`${todayVN(-1)}T${hm}:00+07:00`));
      const lower = LABEL[meal].toLowerCase();

      await page.goto('#/');
      const strip = page.getByRole('region', { name: 'Ăn lại nhanh' });
      await expect(strip).toContainText(new RegExp(`(vào|Cho) ${lower}`));

      await page.goto('#/scan');
      await expect(page.getByText(`${LABEL[meal]} · Hôm nay`, { exact: true })).toBeVisible();

      await page.goto('#/food/search');
      await expect(page.getByRole('radiogroup', { name: 'Thêm vào bữa' }).getByRole('radio', { name: SHORT[meal] })).toHaveAttribute('aria-checked', 'true');
    });
  }
});

test.describe('Sau khi đăng nhập: không logo, không nhắc tới Note_mytasks', () => {
  const FORBIDDEN = /Note_mytasks|Note mytasks|dùng chung tài khoản/i;
  async function expectClean(page: Page, where: string) {
    await expect(page.locator('img[src*="logo"]:visible'), `${where}: không có logo`).toHaveCount(0);
    const text = await page.locator('#fitora-app').innerText();
    expect(text, `${where}: không nhắc Note_mytasks`).not.toMatch(FORBIDDEN);
  }

  test('TopBar, menu, hồ sơ và hộp thoại đăng xuất', async ({ page }) => {
    await page.goto('#/');
    await expect(page.getByRole('link', { name: 'Hồ sơ của bạn' })).toBeVisible();
    await expectClean(page, 'Hôm nay');

    await page.getByRole('button', { name: 'Mở menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expectClean(page, 'Menu');
    await menu.getByRole('button', { name: 'Đóng menu' }).click();
    await expect(menu).toBeHidden();

    await page.goto('#/profile');
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
    await expectClean(page, 'Hồ sơ');
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog', { name: /Đăng xuất/ }));
    await expect(dialog.first()).toContainText('Đăng xuất khỏi Fitora?');
    await expectClean(page, 'Hộp thoại đăng xuất');
    await dialog.first().getByRole('button', { name: 'Hủy' }).click();
    await expect(page).toHaveURL(/#\/profile/);
  });

  // shell: the laptop sidebar (≥1024px) follows the owner rule "no logo inside the app after login".
  test('laptop (thanh bên): không logo, không nhắc Note_mytasks', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('#/');
    await expect(page.locator('[aria-label="Thanh bên"]')).toBeVisible();
    await expectClean(page, 'Thanh bên laptop');
  });
});
