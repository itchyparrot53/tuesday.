import { expect, test } from '@playwright/test';
import { H, createBoard, shot, signIn } from './helpers';

test('automations: recipe moves an item and describe builds a second rule', async ({ page }) => {
  await signIn(page);
  const { boardId } = await createBoard(page, `Automations ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const status = full.columns.find((column: { type: string }) => column.type === 'status');
  const completed = full.groups.find(
    (group: { title: string }) => group.title.toLowerCase() === 'completed',
  );
  await page.goto(`/boards/${boardId}`);

  const add = page.getByTestId('add-item-input').first();
  await add.fill('Automation item');
  await add.press('Enter');
  const row = page.locator('[data-testid="item-row"][data-item-name="Automation item"]');
  await expect(row).toBeVisible();

  await page.getByTestId('automate-button').click();
  await page
    .getByRole('button', { name: 'When status changes to Done, move item to Completed' })
    .click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('automation-row')).toHaveCount(1);
  await page.getByLabel('Close automations').click();

  await row.locator('[data-testid="cell"][data-column-title="Status"]').click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(
    page
      .locator('[data-testid="group-header"][data-group-title="Completed"]')
      .locator('..')
      .getByText('Automation item'),
  ).toBeVisible({ timeout: 5000 });
  expect(completed.id).toBeTruthy();

  await page.getByTestId('automate-button').click();
  await page.getByTestId('automation-describe-input').fill('notify me when status is done');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save automation' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Save automation' }).click();
  await expect(page.getByTestId('automation-row')).toHaveCount(2);
  await shot(page, 'p2-automations');
  expect(status.id).toBeTruthy();
});
