import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('AI page: drafts persist, search clears and follow-ups are offered', async ({ page }) => {
  await signIn(page);
  await page.goto('/ai');
  const composer = page.getByTestId('ai-composer');
  await composer.fill('a draft that should survive navigation');
  await page.goto('/inbox');
  await page.goto('/ai');
  await expect(page.getByTestId('ai-composer')).toHaveValue(
    'a draft that should survive navigation',
  );

  const search = page.getByLabel('Search chats');
  await search.fill('nothing-matches');
  await page.getByLabel('Clear chat search').click();
  await expect(search).toHaveValue('');

  await page.getByTestId('ai-composer').fill('hello');
  await page.getByTestId('ai-composer').press('Enter');
  await expect(
    page.getByTestId('ai-message-assistant').filter({ hasText: 'FAKE AI: hello' }).last(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Summarize this' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'What should I do next?' })).toBeVisible();
});
