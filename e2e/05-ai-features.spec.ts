import { expect, test } from '@playwright/test';
import { H, shot, signIn } from './helpers';

test('AI features: board generator, AI column and summary', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const workspaces = await (await page.request.get('/api/workspaces')).json();
  let workspaceId = workspaces.workspaces[0]?.id as number | undefined;
  if (!workspaceId) {
    const created = await page.request.post('/api/workspaces', {
      headers: H,
      data: { name: `AI Space ${Date.now()}` },
    });
    workspaceId = (await created.json()).workspace.id;
  }
  await page.goto(`/workspaces/${workspaceId}`);

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Board…', exact: true }).click();
  await page.getByTestId('create-board-tab').filter({ hasText: 'Describe it' }).click();
  await page.getByLabel('Describe the board').fill('Product launch plan for a mobile app');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(page.getByText('Fake Launch Plan').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('create-board-submit').click();
  await expect(page).toHaveURL(/\/boards\/\d+/);
  await expect(page.getByRole('heading', { name: 'Fake Launch Plan' })).toBeVisible();

  await page.getByTestId('add-column').click();
  await page.getByRole('menuitem', { name: 'AI column' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Summary');
  await page.getByLabel('Prompt').fill('Describe {{name}}');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  const cells = page.locator('[data-testid="cell"][data-column-title="Summary"]');
  await expect(cells).toHaveCount(3);
  for (let index = 0; index < 3; index++) {
    await expect(cells.nth(index)).toContainText('Fake value', { timeout: 20_000 });
  }
  await shot(page, 'phase7-ai-board');

  await page.getByTestId('item-row').first().getByTestId('item-open').click();
  await expect(page.getByTestId('item-panel')).toBeVisible();
  await page.getByRole('button', { name: /Summarize/ }).click();
  await expect(page.getByTestId('summary-content')).toContainText('fake summary', {
    timeout: 10_000,
  });
  await shot(page, 'phase7-summary');
});
