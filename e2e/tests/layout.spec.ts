// Layout contract (PLAN §5 + AppFrame): full-bleed on phones, phone frame on tablets, full window + sidebar on laptops,
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

test('điều hướng: 5 mục + nút Quét ở giữa trên điện thoại, thanh bên trên laptop', async ({ page }, info) => {
  await page.goto('#/');
  if (info.project.name === 'desktop') {
    // ≥1024px: bottom nav hidden, the sidebar carries the navigation and the gold "Quét món AI" CTA.
    await expect(page.getByRole('navigation', { name: 'Điều hướng', exact: true })).toBeHidden();
    const side = page.getByRole('complementary', { name: 'Thanh bên' }).or(page.locator('[aria-label="Thanh bên"]')).first();
    await expect(side).toBeVisible();
    await expect(side.getByRole('link', { name: /Quét món AI/ })).toBeVisible();
    const nav = side.getByRole('navigation', { name: 'Điều hướng chính' });
    for (const name of [/Hôm nay/, /Nhật ký/, /Tập luyện/, /Tiến trình/]) await expect(nav.getByRole('link', { name })).toBeVisible();
    await nav.getByRole('link', { name: /Nhật ký/ }).click();
  } else {
    const nav = page.getByRole('navigation', { name: 'Điều hướng', exact: true });
    await expect(nav).toBeVisible();
    for (const name of ['Hôm nay', 'Nhật ký', 'Tập luyện', 'Tiến trình']) await expect(nav.getByRole('link', { name })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Quét món ăn bằng AI' })).toBeVisible();
    await nav.getByRole('link', { name: 'Nhật ký' }).click();
  }
  await expect(page).toHaveURL(/#\/diary/);
});

// AppFrame contract: < 768px full-bleed · 768–1023px phone frame · ≥ 1024px full-window app + sidebar.
test('khung app: toàn màn hình trên điện thoại, khung điện thoại trên tablet, toàn cửa sổ trên laptop', async ({ page }, info) => {
  await page.goto('#/');
  await expect(page.getByText(/calo còn lại/i).first()).toBeVisible();
  const frame = page.locator('.fitora-frame');
  let box = (await frame.boundingBox())!;
  let vp = page.viewportSize()!;
  expect(Math.round(box.width)).toBe(vp.width);
  expect(Math.round(box.height)).toBe(vp.height);
  if (info.project.name !== 'desktop') return;

  // Tablet width: the phone frame, centred, phone-shaped.
  await page.setViewportSize({ width: 900, height: 860 });
  vp = page.viewportSize()!;
  await expect.poll(async () => Math.round((await frame.boundingBox())!.width)).toBeLessThan(vp.width);
  box = (await frame.boundingBox())!;
  expect(box.height).toBeLessThanOrEqual(Math.min(vp.height * 0.92, 900) + 1);
  expect(box.width / box.height).toBeCloseTo(390 / 844, 1);
  await expect(page.getByRole('navigation', { name: 'Điều hướng', exact: true })).toBeVisible();
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(o).toBeLessThanOrEqual(0);
});
