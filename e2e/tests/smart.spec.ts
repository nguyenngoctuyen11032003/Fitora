// "Nhớ, không làm lại": a dish scanned once is remembered and re-logged later without AI;
// a logged meal becomes a "Bữa mẫu"; Today's "Ăn lại nhanh"; saved foods edit / delete.
// Mutates ONLY the dedicated "smart" account (recreated + seeded by global setup).
import { expect, test, type Page } from '@playwright/test';
import { admin, aiResponse, foodPhoto, mockFoodAi, overflowX, storageStatePath, todayVN, userId, withDb } from '../support/env';

test.use({ storageState: storageStatePath('smart') });
test.describe.configure({ mode: 'serial' });

const DISH = 'Cơm tấm sườn bì chả';
const COM_TAM = {
  name: DISH,
  ingredients: ['cơm tấm', 'sườn nướng', 'bì', 'chả trứng'],
  quantity: 1,
  unit: 'đĩa',
  grams: 450,
  kcal: 720,
  protein_g: 35,
  carbs_g: 85,
  fat_g: 26,
  fiber_g: 3,
  confidence: 0.84,
};
const CANH = { name: 'Canh chua cá lóc', quantity: 1, unit: 'bát', grams: 300, kcal: 150, protein_g: 14, carbs_g: 10, fat_g: 5, fiber_g: 2, confidence: 0.7 };

type Row = Record<string, unknown>;
async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  return withDb(async (c) => (await c.query(sql, params)).rows);
}
const uid = () => userId('smart');
const savedFoods = async (name: string) =>
  q(`select * from public.fit_custom_foods where user_id = $1 and name = $2`, [await uid(), name]);
const entries = async (name: string, date = todayVN()) =>
  q(`select * from public.fit_meal_entries where user_id = $1 and name = $2 and eaten_on = $3 order by created_at`, [await uid(), name, date]);

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function uploadPhoto(page: Page) {
  // First <input type=file> is the gallery picker (the second one has capture="environment").
  await page.locator('input[type=file]:not([capture])').first().setInputFiles(await foodPhoto(page));
}

test.describe('Nhớ món đã quét, ghi lại không cần AI', () => {
  test('quét bằng AI → lưu nhật ký → món được ghi nhớ kèm ảnh', async ({ page }) => {
    const errors = trackErrors(page);
    const ai = await mockFoodAi(page, aiResponse([COM_TAM, CANH], 'Ước tính theo khẩu phần quán.'));
    await page.goto('#/scan?meal=lunch');
    await expect(page.getByRole('radiogroup', { name: 'Chế độ quét' })).toBeVisible();
    await uploadPhoto(page);

    const review = page.getByRole('dialog', { name: 'Kết quả quét' });
    await expect(review).toBeVisible({ timeout: 20_000 });
    expect(ai.calls()).toBe(1);
    await expect(review.getByRole('region', { name: 'Tổng cộng' })).toContainText('870');
    // Each dish is remembered by default ("Ghi nhớ món này" switch on).
    const remember = review.getByRole('switch', { name: /Ghi nhớ món này/ });
    await expect(remember).toHaveCount(2);
    for (const s of await remember.all()) await expect(s).toBeChecked();
    // Untick the soup: only the rice dish must be remembered.
    await review.getByRole('article', { name: CANH.name }).getByRole('switch', { name: /Ghi nhớ món này/ }).click();
    await expect(review.getByRole('article', { name: CANH.name }).getByRole('switch', { name: /Ghi nhớ món này/ })).not.toBeChecked();

    await review.getByRole('button', { name: /Lưu vào nhật ký · 870 kcal/ }).click();
    await expect(page).toHaveURL(/#\/diary/);
    await expect(page.getByRole('region', { name: 'Bữa trưa' }).getByRole('button', { name: new RegExp(DISH) })).toBeVisible();

    const [food] = await savedFoods(DISH);
    expect(food, 'món đã quét phải được lưu vào Món của tôi').toBeTruthy();
    expect(food.source).toBe('ai');
    expect(food.use_count).toBe(1);
    expect(food.default_meal).toBe('lunch');
    expect(String(food.photo_path)).toMatch(new RegExp(`^${await uid()}/meals/`));
    expect(food.serving_label).toBe('1 đĩa');
    expect(Number(food.serving_grams)).toBe(450);
    expect(await savedFoods(CANH.name)).toHaveLength(0);

    const [entry] = await entries(DISH);
    expect(entry.source).toBe('ai');
    expect(entry.custom_food_id).toBe(food.id);
    expect(Number(entry.kcal)).toBe(720);
    expect(entry.photo_path).toBe(food.photo_path);
    expect(await entries(CANH.name)).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('lần sau: "Ăn lại món đã lưu" trong màn Scan, 1½ đĩa, không gọi AI', async ({ page }) => {
    const errors = trackErrors(page);
    const ai = await mockFoodAi(page, { error: 'ai_unavailable', message: 'không được gọi' });
    const date = todayVN(-1);
    await page.goto(`#/scan?meal=dinner&date=${date}`);
    const strip = page.getByRole('region', { name: 'Ăn lại món đã lưu' });
    await strip.getByRole('button', { name: new RegExp(`^Ăn lại ${DISH}, 720 kcal`) }).click();

    const sheet = page.getByRole('dialog', { name: DISH });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('không dùng lượt AI');
    await sheet.getByRole('group', { name: 'Chọn nhanh khẩu phần' }).getByRole('button', { name: '1½' }).click();
    const add = sheet.getByRole('button', { name: /Thêm vào tối · 1\.080 kcal/ });
    // Double tap must not log twice.
    await add.dblclick();
    await expect(sheet).toBeHidden();

    await expect.poll(async () => (await entries(DISH, date)).length).toBe(1);
    const [entry] = await entries(DISH, date);
    expect(entry.meal).toBe('dinner');
    expect(entry.source).toBe('custom');
    expect(Number(entry.quantity)).toBe(1.5);
    expect(Number(entry.kcal)).toBe(1080);
    expect(Number(entry.grams)).toBe(675);
    const [food] = await savedFoods(DISH);
    expect(entry.custom_food_id).toBe(food.id);
    expect(entry.photo_path).toBe(food.photo_path);
    expect(food.use_count).toBe(2);
    expect(food.default_meal).toBe('dinner');
    expect(ai.calls()).toBe(0);
    expect(errors).toEqual([]);
  });

  test('quét lại cùng món (khác hoa thường / dấu) → không tạo món trùng, gợi ý số liệu đã lưu', async ({ page }) => {
    await mockFoodAi(page, aiResponse([{ ...COM_TAM, name: 'CƠM TẤM SƯỜN BÌ CHẢ', kcal: 800 }]));
    await page.goto('#/scan?meal=lunch');
    await uploadPhoto(page);
    const review = page.getByRole('dialog', { name: 'Kết quả quét' });
    await expect(review).toBeVisible({ timeout: 20_000 });
    // The saved values are either applied automatically or offered with one tap.
    await expect(review.getByText(/Đang dùng số liệu đã lưu của bạn|Bạn đã lưu/).first()).toBeVisible();
    await review.getByRole('button', { name: /Lưu vào nhật ký/ }).click();
    await expect(page).toHaveURL(/#\/diary/);
    const all = await q(`select id, use_count from public.fit_custom_foods where user_id = $1 and lower(name) like 'c%m t%m s%n b% ch%'`, [await uid()]);
    expect(all).toHaveLength(1);
    expect(all[0].use_count).toBe(3);
  });
});

test.describe('Bữa mẫu', () => {
  const TPL = 'Trưa văn phòng e2e';

  test('lưu bữa trưa thành bữa mẫu rồi ghi lại cả bữa vào một ngày khác bằng 1 chạm', async ({ page }) => {
    await page.goto('#/diary');
    const lunch = page.getByRole('region', { name: 'Bữa trưa' });
    await lunch.getByRole('button', { name: 'Lưu thành bữa mẫu' }).click();
    const sheet = page.getByRole('dialog', { name: 'Lưu thành bữa mẫu' });
    await sheet.getByRole('textbox', { name: 'Tên bữa mẫu' }).fill(TPL);
    const items = sheet.getByRole('checkbox');
    const n = await items.count();
    expect(n).toBeGreaterThanOrEqual(2);
    await sheet.getByRole('button', { name: new RegExp(`Lưu bữa mẫu · ${n} món`) }).click();
    await expect(sheet).toBeHidden();
    await expect(lunch.getByRole('button', { name: `Đã có bữa mẫu “${TPL}”` })).toBeVisible();

    const [tpl] = await q(`select * from public.fit_meal_templates where user_id = $1 and name = $2`, [await uid(), TPL]);
    expect(tpl.meal).toBe('lunch');
    expect((tpl.items as unknown[]).length).toBe(n);
    const todayLunch = await q(`select coalesce(sum(kcal),0)::float as k from public.fit_meal_entries where user_id=$1 and eaten_on=$2 and meal='lunch'`, [await uid(), todayVN()]);
    expect(Number(tpl.total_kcal)).toBeCloseTo(Number(todayLunch[0].k), 0);

    // An old, empty day: the empty lunch offers the template.
    const day = todayVN(-30);
    await page.goto(`#/diary?date=${day}`);
    const oldLunch = page.getByRole('region', { name: 'Bữa trưa' });
    await expect(oldLunch).toContainText('Chưa có món');
    await oldLunch.getByRole('button', { name: new RegExp(`^Ghi bữa mẫu ${TPL} \\(${n} món`) }).click();
    await expect(oldLunch).toContainText(`${n} món`);
    const logged = await q(`select * from public.fit_meal_entries where user_id=$1 and eaten_on=$2 and meal='lunch'`, [await uid(), day]);
    expect(logged).toHaveLength(n);
    const sum = logged.reduce((s, r) => s + Number(r.kcal), 0);
    expect(sum).toBeCloseTo(Number(tpl.total_kcal), 0);
    const [after] = await q(`select use_count, last_used_at from public.fit_meal_templates where id=$1`, [tpl.id]);
    expect(after.use_count).toBe(1);
    expect(after.last_used_at).not.toBeNull();
  });

  test('tìm món: bữa mẫu ghi được vào bữa đang chọn', async ({ page }) => {
    const day = todayVN(-31);
    await page.goto(`#/food/search?meal=dinner&date=${day}`);
    await page.getByRole('radio', { name: 'Món của tôi' }).click();
    await page.getByRole('button', { name: new RegExp(`^Ghi bữa mẫu ${TPL},.* vào bữa tối`) }).click();
    await expect.poll(async () => (await q(`select id from public.fit_meal_entries where user_id=$1 and eaten_on=$2 and meal='dinner'`, [await uid(), day])).length).toBeGreaterThan(0);
  });
});

test.describe('Hôm nay · Ăn lại nhanh', () => {
  test('chạm một món đã lưu là ghi ngay vào bữa hiện tại', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('#/');
    const strip = page.getByRole('region', { name: 'Ăn lại nhanh' });
    await expect(strip).toBeVisible();
    const btn = strip.getByRole('button', { name: /^Ghi Bún bò Huế, 1 bát · 550 g, 540 kcal vào / });
    const label = (await btn.getAttribute('aria-label'))!;
    const before = (await entries('Bún bò Huế')).length;
    await btn.click();
    await expect.poll(async () => (await entries('Bún bò Huế')).length).toBe(before + 1);
    const rows = await entries('Bún bò Huế');
    const last = rows[rows.length - 1];
    expect(Number(last.kcal)).toBeCloseTo(540, 0); // seed stores kcal per 100 g with 1 decimal (540.1)
    expect(last.source).toBe('custom');
    const mealVi: Record<string, string> = { breakfast: 'bữa sáng', lunch: 'bữa trưa', dinner: 'bữa tối', snack: 'ăn vặt' };
    expect(label.endsWith(mealVi[String(last.meal)])).toBe(true);
    // The hero updates without a reload.
    await expect(page.getByRole('region', { name: 'Calo hôm nay' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('Món của tôi · sửa / xóa', () => {
  test('sửa calo một phần rồi xóa món đã lưu, nhật ký cũ giữ nguyên số liệu', async ({ page }) => {
    await page.goto('#/food/search?meal=lunch');
    await page.getByRole('radio', { name: 'Món của tôi' }).click();
    await page.getByRole('button', { name: `Sửa món đã lưu ${DISH}` }).click();
    const sheet = page.getByRole('dialog', { name: 'Sửa món đã lưu' });
    await expect(sheet.getByRole('textbox', { name: 'Tên món' })).toHaveValue(DISH);
    await sheet.getByRole('textbox', { name: 'Năng lượng mỗi phần' }).fill('700');
    await sheet.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(sheet).toBeHidden();
    const [food] = await savedFoods(DISH);
    expect((Number(food.kcal_100g) * Number(food.serving_grams)) / 100).toBeCloseTo(700, 0);
    await expect(page.getByRole('button', { name: new RegExp(`^${DISH} .*700 kcal`) })).toBeVisible();

    // Delete → "Hoàn tác" brings it back and nothing is deleted.
    await page.getByRole('button', { name: `Sửa món đã lưu ${DISH}` }).click();
    await sheet.getByRole('button', { name: 'Xóa món đã lưu' }).click();
    await expect(page.getByRole('button', { name: `Sửa món đã lưu ${DISH}` })).toHaveCount(0);
    await page.getByRole('button', { name: 'Hoàn tác' }).click();
    await expect(page.getByRole('button', { name: `Sửa món đã lưu ${DISH}` })).toBeVisible();
    await page.waitForTimeout(6_000); // past the undo window
    expect(await savedFoods(DISH)).toHaveLength(1);

    // Delete for real (after the 5 s undo window).
    await page.getByRole('button', { name: `Sửa món đã lưu ${DISH}` }).click();
    await sheet.getByRole('button', { name: 'Xóa món đã lưu' }).click();
    await expect(page.getByRole('button', { name: `Sửa món đã lưu ${DISH}` })).toHaveCount(0);
    await expect.poll(async () => (await savedFoods(DISH)).length, { timeout: 15_000 }).toBe(0);
    const old = await entries(DISH);
    expect(old.length).toBeGreaterThan(0);
    expect(old[0].custom_food_id).toBeNull();
    expect(Number(old[0].kcal)).toBe(720);
  });

  test('màn Món của tôi không tràn ngang ở 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    await page.goto('#/food/search?meal=lunch');
    await page.getByRole('radio', { name: 'Món của tôi' }).click();
    const o = await overflowX(page);
    expect(o.doc).toBeLessThanOrEqual(0);
    expect(o.main).toBeLessThanOrEqual(0);
  });
});

test.afterAll(async () => {
  // Keep the account small for re-runs (global setup recreates it anyway).
  await admin().from('fit_meal_templates').delete().eq('user_id', await uid()).eq('name', 'Trưa văn phòng e2e');
});
