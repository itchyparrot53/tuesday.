import { expect, test } from '@playwright/test';
import { H, signIn } from './helpers';

test('saved queue views: persist two filters, apply each and delete one', async ({ page }) => {
  await signIn(page);
  await page.request.patch('/api/me', {
    headers: H,
    data: {
      preferences: {
        savedQueueViews: [],
        homeDateFilter: 'all',
        homeBoardFilter: null,
        homeFavoritesOnly: false,
      },
    },
  });
  await page.goto('/');
  await expect(page.getByTestId('home-save-view')).toBeVisible();

  await page.getByTestId('home-date-overdue').click();
  await page.getByTestId('home-save-view').click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Overdue view');
  await dialog.getByTestId('home-save-view-submit').click();
  await expect(
    page.getByTestId('home-saved-view').filter({ hasText: 'Overdue view' }),
  ).toBeVisible();

  await page.getByTestId('home-date-today').click();
  await page.getByTestId('home-save-view').click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Today view');
  await dialog.getByTestId('home-save-view-submit').click();
  await expect(page.getByTestId('home-saved-view')).toHaveCount(2);

  await page.reload();
  await expect(page.getByTestId('home-saved-view')).toHaveCount(2);

  await page
    .getByTestId('home-saved-view')
    .filter({ hasText: 'Overdue view' })
    .getByTestId('home-apply-view')
    .click();
  await expect(page.getByTestId('home-date-overdue')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('home-date-today')).toHaveAttribute('aria-pressed', 'false');

  await page
    .getByTestId('home-saved-view')
    .filter({ hasText: 'Today view' })
    .getByTestId('home-apply-view')
    .click();
  await expect(page.getByTestId('home-date-today')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('home-date-overdue')).toHaveAttribute('aria-pressed', 'false');

  await page
    .getByTestId('home-saved-view')
    .filter({ hasText: 'Overdue view' })
    .getByTestId('home-delete-view')
    .click();
  await expect(page.getByTestId('home-saved-view')).toHaveCount(1);
  await expect(page.getByTestId('home-saved-view').filter({ hasText: 'Today view' })).toBeVisible();

  await page.request.patch('/api/me', {
    headers: H,
    data: {
      preferences: {
        savedQueueViews: [],
        homeDateFilter: 'all',
        homeBoardFilter: null,
        homeFavoritesOnly: false,
      },
    },
  });
});
