import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, createBoard, signIn } from './helpers';

test('AI builders: dashboard, view and assistant dashboard', async ({ page }) => {
  test.setTimeout(90_000);
  const owner = await signIn(page);
  const { boardId } = await createBoard(page, `Build board ${Date.now()}`);

  await page.goto('/');
  await page.getByTestId('home-new').click();
  await page.getByRole('menuitem', { name: 'Dashboard' }).click();
  await expect(page.getByTestId('describe-dashboard')).toBeVisible();
  await page.getByLabel('Describe the dashboard').fill('status and workload');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByTestId('describe-dashboard')).toContainText('Items');
  await page.getByTestId('describe-dashboard-create').click();
  await expect(page).toHaveURL(/\/dashboards\/\d+/);
  await expect(page.getByTestId('dashboard-widget').first()).toBeVisible();
  await axeCheck(page, 'described dashboard');

  await page.goto(`/boards/${boardId}`);
  await page.getByTestId('view-picker').click();
  await page.getByTestId('describe-view').click();
  await page.getByLabel('Describe the view').fill('table of all items');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByTestId('view-preview-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Save view' }).click();
  await expect(page.getByRole('tab', { name: 'Fake view', exact: true })).toBeVisible();

  const before = (await (await page.request.get('/api/workspaces')).json()).workspaces[0].id;
  await page.goto('/ai');
  await page
    .getByTestId('ai-composer')
    .fill(
      `/fake-tool {"name":"create_dashboard","args":{"workspaceId":${before},"prompt":"status"}}`,
    );
  await page.getByTestId('ai-composer').press('Enter');
  await expect(page.getByTestId('ai-approval')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByTestId('ai-message-assistant').last()).toBeVisible({ timeout: 10_000 });

  await page.route('**/api/ai/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        enabled: false,
        configured: false,
        usable: false,
        defaultModel: '',
        fastModel: '',
        requireConfirmation: true,
      }),
    });
  });
  await page.goto('/');
  await page.getByTestId('home-new').click();
  await page.getByRole('menuitem', { name: 'Dashboard' }).click();
  await expect(page.getByText(/AI isn't set up yet/)).toBeVisible();
  expect(owner.email).toBeTruthy();
});
