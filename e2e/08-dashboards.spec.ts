import { expect, test } from '@playwright/test';
import { H, createBoard, shot, signIn } from './helpers';

test('dashboards: create over two boards, resize, count and AI insight', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const first = await createBoard(page, `Dash A ${Date.now()}`);
  const second = await createBoard(page, `Dash B ${Date.now()}`);
  for (const board of [first, second]) {
    const full = await (await page.request.get(`/api/boards/${board.boardId}`)).json();
    const groupId = full.groups[0].id;
    for (const name of ['Item one', 'Item two']) {
      await page.request.post(`/api/boards/${board.boardId}/items`, {
        headers: H,
        data: { groupId, name },
      });
    }
  }

  await page.goto(`/workspaces/${first.workspaceId}`);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Dashboard…' }).click();
  const dialog = page.getByRole('dialog');
  for (const box of await dialog.getByRole('checkbox').all()) {
    await box.setChecked(false);
  }
  await dialog.getByLabel(/Dash A/).setChecked(true);
  await dialog.getByLabel(/Dash B/).setChecked(true);
  await page.getByRole('button', { name: 'Blank dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboards\/\d+/);
  await expect(page.locator('[data-widget-type="battery"]')).toBeVisible();
  await expect(page.locator('[data-widget-type="chart"]')).toBeVisible();

  await page.getByRole('button', { name: 'Add widget', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add widget' }).click();
  const numberWidget = page.locator('[data-widget-type="number"]');
  await expect(numberWidget).toContainText('4');

  await page
    .getByLabel(/Widget menu/)
    .last()
    .click();
  await page.getByRole('menuitem', { name: 'Wider' }).click();
  await page.waitForTimeout(500);
  const dashboardUrl = page.url();
  const dashboardId = dashboardUrl.split('/').pop();
  let dashboard = await (await page.request.get(`/api/dashboards/${dashboardId}`)).json();
  expect(
    dashboard.dashboard.widgets.find((widget: { type: string }) => widget.type === 'number').w,
  ).toBe(4);
  await page.reload();
  dashboard = await (await page.request.get(`/api/dashboards/${dashboardId}`)).json();
  expect(
    dashboard.dashboard.widgets.find((widget: { type: string }) => widget.type === 'number').w,
  ).toBe(4);

  await page.getByRole('button', { name: 'Add widget', exact: true }).click();
  await expect(page.getByRole('dialog').getByTestId('widget-type-chart')).toBeVisible();
  await page.getByRole('dialog').getByTestId('widget-type-ai_insight').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add widget' }).click();
  const insight = page.locator('[data-widget-type="ai_insight"]');
  await insight.getByRole('button', { name: 'Generate insight' }).click();
  await expect(insight).toContainText('fake insight', { timeout: 10_000 });
  await page.reload();
  await expect(page.locator('[data-widget-type="ai_insight"]')).toContainText('fake insight');
  await shot(page, 'p2-dashboard');
});
