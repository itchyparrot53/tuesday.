import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('admin guide: setup checklist, usage paths and live status', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin?tab=guide');

  await expect(page.getByTestId('admin-guide')).toBeVisible();
  await expect(page.getByText('Set Tuesday up with confidence')).toBeVisible();
  await expect(page.getByTestId('admin-guide-step')).toHaveCount(8);
  await expect(page.getByText('Setup checklist')).toBeVisible();
  await expect(page.getByText('Using Tuesday')).toBeVisible();
  await expect(page.getByText('A calm weekly routine')).toBeVisible();
  await expect(
    page.getByTestId('admin-guide-step').filter({ hasText: 'Invite your team' }),
  ).toBeVisible();
  await expect(page.getByTestId('admin-guide-step').filter({ hasText: 'Go live' })).toBeVisible();
  await expect(page.getByText(/of 4 required/)).toBeVisible();
});
