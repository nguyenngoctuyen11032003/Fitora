// New account: guard → 5-step survey → plan saved → dashboard.
import { expect, test } from '@playwright/test';
import { admin, storageStatePath, userId, wipeFit } from '../support/env';

test.use({ storageState: storageStatePath('fresh') });
test.describe.configure({ mode: 'serial' });

test.describe('Onboarding', () => {
  test.beforeAll(async () => {
    await wipeFit('fresh');
  });

  test('tài khoản chưa có hồ sơ Fitora bị đưa vào /onboarding', async ({ page }) => {
    await page.goto('#/workout');
    await expect(page).toHaveURL(/#\/onboarding/);
    await expect(page.getByRole('heading', { name: /bắt đầu nào/ })).toBeVisible();
  });

  test('hoàn thành 5 bước thì lưu kế hoạch và vào màn Hôm nay', async ({ page }) => {
    await page.goto('#/onboarding');
    const next = page.getByRole('button', { name: 'Tiếp tục' });

    // 1 · Về bạn — validation first
    await next.click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await page.getByRole('radiogroup', { name: 'Giới tính' }).getByRole('radio').first().click();
    await page.getByLabel('Ngày sinh').fill('1996-04-20');
    await next.click();

    // 2 · Cơ thể
    await expect(page.getByRole('heading', { name: 'Chiều cao & cân nặng' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Chiều cao', exact: true }).fill('170');
    await page.getByRole('textbox', { name: 'Cân nặng', exact: true }).fill('72');
    await next.click();

    // 3 · Vận động
    await page.getByRole('radiogroup', { name: 'Mức vận động' }).getByRole('radio').nth(2).click();
    await next.click();

    // 4 · Mục tiêu
    await page.getByRole('radiogroup', { name: 'Mục tiêu' }).getByRole('radio').first().click();
    await next.click();

    // 5 · Kế hoạch
    await expect(page.getByRole('heading', { name: 'Kế hoạch của bạn' })).toBeVisible();
    await expect(page.getByText('TDEE', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Bắt đầu với Fitora' }).click();

    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText(/calo còn lại/i)).toBeVisible();

    const { data } = await admin().from('fit_profiles').select('onboarded_at, height_cm, start_weight_kg, calorie_target').eq('user_id', await userId('fresh')).single();
    expect(data!.onboarded_at).not.toBeNull();
    expect(Number(data!.height_cm)).toBe(170);
    expect(Number(data!.start_weight_kg)).toBe(72);
    expect(data!.calorie_target).toBeGreaterThanOrEqual(1200);
  });
});
