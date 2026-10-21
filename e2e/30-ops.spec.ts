import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, signIn } from './helpers';

test('ops: off-site backup UI, deep health and metrics', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin?tab=data');
  await expect(page.getByTestId('offsite-backups')).toBeVisible();
  await page.getByRole('button', { name: 'Create backup now' }).click();
  await page.getByTestId('offsite-upload').click();
  await expect(page.getByTestId('offsite-restore').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('🔒').first()).toBeVisible();
  await page.getByTestId('offsite-restore').first().click();
  await expect(page.getByLabel('Organisation name')).toBeVisible();
  await axeCheck(page, 'admin offsite');

  const health = await page.request.get('/api/health/deep');
  expect(health.status()).toBe(200);
  expect((await health.json()).checks.backups.offsiteConfigured).toBe(true);
  const metrics = await fetch('http://localhost:3200/api/metrics');
  expect(metrics.status).toBe(401);
  const authed = await page.request.get('/api/metrics');
  expect(authed.status()).toBe(200);
  expect(await authed.text()).toContain('tuesday_up 1');
  expect(H).toBeTruthy();
});
