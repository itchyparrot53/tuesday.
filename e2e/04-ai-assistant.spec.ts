import { expect, test } from '@playwright/test';
import { shot, signIn } from './helpers';

test('AI assistant: admin config and Ask AI panel', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin?tab=ai');
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('ready', { exact: true })).toBeVisible();
  await shot(page, 'phase6-admin-ai');

  await page.getByTestId('ask-ai').click();
  await expect(page.getByTestId('ai-panel')).toBeVisible();
  await page.getByTestId('ai-composer').fill('Hello');
  await page.getByTestId('ai-composer').press('Enter');
  await expect(
    page.getByTestId('ai-message-assistant').filter({ hasText: 'FAKE AI: Hello' }).last(),
  ).toBeVisible({ timeout: 10_000 });
  await shot(page, 'phase6-assistant');
});
