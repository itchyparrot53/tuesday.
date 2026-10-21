import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('go-live checklist: rows, links and the restore drill toggle', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin?tab=go-live');
  await expect(page.getByTestId('admin-go-live')).toBeVisible();
  await expect(page.getByTestId('go-live-row')).toHaveCount(8);
  await expect(page.getByTestId('go-live-row').filter({ hasText: 'HTTPS APP_URL' })).toBeVisible();

  const drill = page.getByTestId('go-live-restore-drill');
  await expect(drill).not.toBeChecked();
  await drill.check();
  await expect(drill).toBeChecked();
  await expect(page.getByText('Restore drill recorded')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('go-live-restore-drill')).toBeChecked();

  await page.getByTestId('go-live-row').first().getByRole('link', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/release$/);
  await expect(page.getByRole('heading', { name: 'Release guide' })).toBeVisible();
});
