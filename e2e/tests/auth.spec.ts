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
});
