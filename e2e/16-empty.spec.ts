import { expect, test } from '@playwright/test';
import { H, signIn } from './helpers';

test('empty workspace shows an empty state', async ({ page }) => {
  await signIn(page);
  const created = await page.request.post('/api/workspaces', {
    headers: H,
    data: { name: `Empty space ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const workspace = (await created.json()).workspace as { id: number };
  await page.goto(`/workspaces/${workspace.id}`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('empty-state').first()).toBeVisible();
});

test('empty trash shows its copy', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/trash', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entries: [] }),
    });
  });
  await page.goto('/trash');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Trash is empty.', { exact: true })).toBeVisible();
});
