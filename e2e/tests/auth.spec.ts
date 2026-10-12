// Sign-in flow through the real UI (mobile + desktop projects).
import { expect, test } from '@playwright/test';
import { PASSWORD, USERS } from '../support/env';

test.describe('Đăng nhập', () => {
  test('chưa đăng nhập thì mọi trang đều về /login', async ({ page }) => {
    await page.goto('#/diary');
    await expect(page).toHaveURL(/#\/login/);
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('sai mật khẩu báo lỗi tiếng Việt và vẫn ở /login', async ({ page }) => {
    await page.goto('#/login');
    await page.getByLabel('Email').fill(USERS.coach.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill('sai-mat-khau-123');
    await page.getByRole('button', { name: /Đăng nhập/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /mật khẩu|không đúng|sai/i }).first()).toBeVisible();
    await expect(page).toHaveURL(/#\/login/);
  });

  test('tài khoản Note_mytasks đăng nhập được và vào màn Hôm nay', async ({ page }) => {
    await page.goto('#/login');
    await page.getByLabel('Email').fill(USERS.coach.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: /Đăng nhập/ }).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByText(/calo còn lại/i)).toBeVisible();
    // Session lives under Fitora's own key, not Note_mytasks' 'nm.auth'.
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain('fitora.auth');
    expect(keys).not.toContain('nm.auth');
  });

  test('tích "Duy trì đăng nhập 7 ngày": phiên ở localStorage, hết 7 ngày thì về /login', async ({ page }) => {
    await page.goto('#/login');
    await expect(page.getByLabel(/Duy trì đăng nhập 7 ngày/)).toBeChecked();
    await page.getByLabel('Email').fill(USERS.coach.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: /Đăng nhập/ }).click();
    await expect(page).toHaveURL(/#\/$/);
    const pref = await page.evaluate(() => JSON.parse(localStorage.getItem('fitora.authRemember') ?? 'null'));
    expect(pref.mode).toBe('persist');
    const days = (pref.until - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
    // Pretend the 7 days are over, then come back to the app.
    await page.evaluate(() => localStorage.setItem('fitora.authRemember', JSON.stringify({ mode: 'persist', until: Date.now() - 1 })));
    await page.reload();
    await expect(page).toHaveURL(/#\/login/);
    expect(await page.evaluate(() => localStorage.getItem('fitora.auth'))).toBeNull();
  });

  test('bỏ tích: phiên chỉ trong tab (sessionStorage), tab mới phải đăng nhập lại', async ({ page, context }) => {
    await page.goto('#/login');
    await page.getByLabel(/Duy trì đăng nhập 7 ngày/).uncheck();
    await page.getByLabel('Email').fill(USERS.coach.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: /Đăng nhập/ }).click();
    await expect(page).toHaveURL(/#\/$/);
    expect(await page.evaluate(() => localStorage.getItem('fitora.auth'))).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem('fitora.auth'))).not.toBeNull();
    await page.reload();
    await expect(page.getByText(/calo còn lại/i)).toBeVisible();
    const other = await context.newPage();
    await other.goto(page.url().replace(/#.*$/, '#/diary'));
    await expect(other).toHaveURL(/#\/login/);
  });
});
