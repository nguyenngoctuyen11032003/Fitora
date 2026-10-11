// Food diary + search through the UI. Mutates only the "other" account's meals
// (shared-backend.spec asserts the coach's day totals).
import { expect, test } from '@playwright/test';
import { admin, storageStatePath, todayVN, userId } from '../support/env';

test.use({ storageState: storageStatePath('other') });
test.describe.configure({ mode: 'serial' });

async function mealNames(): Promise<string[]> {
  const { data } = await admin().from('fit_meal_entries').select('name').eq('user_id', await userId('other')).eq('eaten_on', todayVN());
  return (data ?? []).map((r) => r.name);
}

test.describe('Nhật ký ăn', () => {
  test.afterAll(async () => {
    await admin().from('fit_meal_entries').delete().eq('user_id', await userId('other')).eq('name', 'Bánh mì thịt');
    await admin().from('fit_meal_entries').delete().eq('user_id', await userId('other')).eq('name', 'Bánh kem e2e');
  });

  test('nhật ký hôm nay hiện tổng calo và các món đã seed theo bữa', async ({ page }) => {
    await page.goto('#/diary');
    await expect(page.getByRole('heading', { name: 'Bữa sáng' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Phở bò/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Tổng trong ngày' })).toContainText('kcal');
    // Previous day button changes the date in the URL.
    await page.getByRole('button', { name: 'Ngày trước' }).click();
    await expect(page).toHaveURL(new RegExp(`date=${todayVN(-1)}`));
    await page.getByRole('button', { name: 'Về hôm nay' }).click();
    await expect(page).not.toHaveURL(/date=/);
  });

  test('tìm không dấu "banh mi thit" rồi thêm vào bữa trưa', async ({ page }) => {
    await page.goto(`#/food/search?meal=lunch&date=${todayVN()}`);
    await page.getByRole('searchbox', { name: 'Tìm món ăn' }).fill('banh mi thit');
    await page.getByRole('button', { name: /^Bánh mì thịt/ }).first().click();

    const sheet = page.getByRole('dialog', { name: 'Bánh mì thịt' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Thêm vào bữa trưa' }).click();
    await expect(sheet).toBeHidden();
    await expect.poll(mealNames).toContain('Bánh mì thịt');

    await page.getByRole('button', { name: /Xong · đã thêm 1 món/ }).click();
    await expect(page).toHaveURL(/#\/diary/);
    await expect(page.getByRole('button', { name: /Bánh mì thịt/ })).toBeVisible();
  });

  test('sửa số lượng rồi xóa và hoàn tác', async ({ page }) => {
    await page.goto('#/diary');
    await page.getByRole('button', { name: /Bánh mì thịt/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Bánh mì thịt' });
    await sheet.getByRole('button', { name: /^2 / }).click();
    await sheet.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('button', { name: /Bánh mì thịt/ })).toContainText('2 ổ');

    await page.getByRole('button', { name: /Bánh mì thịt/ }).click();
    await sheet.getByRole('button', { name: 'Xóa món này' }).click();
    await expect(page.getByRole('button', { name: /Bánh mì thịt/ })).toHaveCount(0);
    await expect.poll(mealNames).not.toContain('Bánh mì thịt');
    await page.getByRole('button', { name: 'Hoàn tác' }).click();
    await expect(page.getByRole('button', { name: /Bánh mì thịt/ })).toBeVisible();
    await expect.poll(mealNames).toContain('Bánh mì thịt');
  });

  test('không tìm thấy thì nhập nhanh bằng calo', async ({ page }) => {
    await page.goto(`#/food/search?meal=snack&date=${todayVN()}`);
    await page.getByRole('searchbox', { name: 'Tìm món ăn' }).fill('Bánh kem e2e');
    await expect(page.getByText('Không thấy “Bánh kem e2e”')).toBeVisible();
    await page.getByRole('button', { name: 'Nhập nhanh', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Nhập nhanh' });
    await expect(sheet.getByLabel('Tên món')).toHaveValue('Bánh kem e2e');
    await sheet.getByRole('textbox', { name: 'Năng lượng' }).fill('320');
    await sheet.getByRole('button', { name: 'Thêm vào nhật ký' }).click();
    await expect.poll(mealNames).toContain('Bánh kem e2e');
  });
});
