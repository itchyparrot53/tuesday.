import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, createBoard, signIn } from './helpers';

test.use({ serviceWorkers: 'allow' });

test('offline: shell, banner, outbox and share target', async ({ page, context }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const { boardId } = await createBoard(page, `Offline board ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: { groupId: full.groups[0].id, name: 'Offline item' },
  });
  await page.goto(`/boards/${boardId}`);
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable');
    if (!(await navigator.serviceWorker.getRegistration())) {
      await navigator.serviceWorker.register('/sw.js');
    }
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('Service worker did not become ready')), 15_000),
      ),
    ]);
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
    }
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await expect(page.getByText(/Good (morning|afternoon|evening)/).first()).toBeVisible();
  await expect(page.getByTestId('home-summary')).toBeVisible();

  await page.goto(`/boards/${boardId}`);
  await expect(page.getByText('Offline item').first()).toBeVisible();

  const cell = page.getByRole('button', { name: 'Select status' }).first();
  await cell.click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByTestId('outbox-badge').first()).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByTestId('outbox-badge')).toHaveCount(0, { timeout: 40_000 });

  await page.goto('/share?title=Read%20this&url=https%3A%2F%2Fexample.com');
  await expect(page.getByTestId('share-page')).toBeVisible();
  await page.getByRole('button', { name: 'Create an item' }).click();
  await page.getByLabel('Board', { exact: true }).selectOption(String(boardId));
  await page.getByLabel('Item name').fill('Shared link');
  await page.getByRole('button', { name: 'Create item' }).click();
  await expect(page.getByText(/Saved to/)).toBeVisible();
  const board = await (await page.request.get(`/api/boards/${boardId}/items`)).json();
  const item = board.items.find((entry: { name: string }) => entry.name === 'Shared link');
  expect(item).toBeTruthy();
  await axeCheck(page, 'share page');

  await page.getByTestId('user-menu').click();
  await page.getByRole('menuitem', { name: /Log out/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect
    .poll(() => page.evaluate(() => caches.has('tuesday-api')), { timeout: 10_000 })
    .toBe(false);
});
