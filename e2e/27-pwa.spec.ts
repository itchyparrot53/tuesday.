import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { signIn } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('PWA: manifest, service worker, bottom nav and update toast', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem('tuesday:e2e', '1'));
  await signIn(page);

  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({
    name: 'Tuesday',
    display: 'standalone',
    start_url: '/',
    theme_color: '#C9356C',
  });
  for (const icon of manifest.icons) {
    const response = await page.request.get(`/${icon.src}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  const sw = await page.request.get('/sw.js');
  expect(sw.headers()['cache-control']).toContain('no-cache');

  const scope = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(scope).toContain('localhost:3200');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByTestId('bottom-nav')).toBeVisible();
  await expect(page.getByTestId('bottom-nav-item')).toHaveCount(5);
  await page.getByTestId('bottom-nav-item').filter({ hasText: 'AI' }).click();
  await expect(page).toHaveURL(/\/ai$/);

  await page.goto('/?new=item');
  await expect(page.getByText('New item').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.evaluate(() => {
    (
      window as unknown as { __tuesdayPwa: { setNeedRefresh: (value: boolean) => void } }
    ).__tuesdayPwa.setNeedRefresh(true);
  });
  await expect(page.getByTestId('pwa-update')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  await axeCheck(page, 'pwa mobile');
});
