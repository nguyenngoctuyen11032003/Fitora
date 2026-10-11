// Layout contract (PLAN §5): full-bleed on phones, phone frame on desktop,
// no horizontal scroll on any screen, 5-item bottom nav on the main tabs.
import { expect, test } from '@playwright/test';
import { storageStatePath } from '../support/env';

test.use({ storageState: storageStatePath('coach') });

const SCREENS = ['/', '/diary', '/food/search', '/workout', '/progress', '/body', '/profile', '/goals'];

for (const route of SCREENS) {
  test(`${route} không tràn ngang và không lỗi JS`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`#${route}`);
    await expect(page.locator('#fitora-app main').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => {
      const app = document.getElementById('fitora-app')!;
      const main = app.querySelector('main')!;
      return { doc: document.documentElement.scrollWidth - window.innerWidth, main: main.scrollWidth - main.clientWidth };
    });
    expect(overflow.doc).toBeLessThanOrEqual(0);
    expect(overflow.main).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
}

test('thanh điều hướng dưới có đủ 5 mục và nút Scan ở giữa', async ({ page }) => {
  await page.goto('#/');
  const nav = page.getByRole('navigation', { name: 'Điều hướng' });
  await expect(nav).toBeVisible();
  for (const name of ['Hôm nay', 'Nhật ký', 'Tập luyện', 'Tiến trình']) await expect(nav.getByRole('link', { name })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Quét món ăn bằng AI' })).toBeVisible();
  await nav.getByRole('link', { name: 'Nhật ký' }).click();
  await expect(page).toHaveURL(/#\/diary/);
});

test('khung app: toàn màn hình trên điện thoại, khung điện thoại trên desktop', async ({ page }, info) => {
  await page.goto('#/');
  await expect(page.getByText(/calo còn lại/i)).toBeVisible();
  const box = (await page.locator('.fitora-frame').boundingBox())!;
  const vp = page.viewportSize()!;
  if (info.project.name === 'desktop') {
    expect(box.height).toBeLessThanOrEqual(Math.min(vp.height * 0.92, 900) + 1);
    expect(box.width / box.height).toBeCloseTo(390 / 844, 1);
    // ≥1100px: brand column next to the frame.
    await expect(page.getByText('Fitora', { exact: true }).first()).toBeVisible();
  } else {
    expect(Math.round(box.width)).toBe(vp.width);
    expect(Math.round(box.height)).toBe(vp.height);
  }
});
