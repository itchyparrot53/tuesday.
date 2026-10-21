import { expect, test } from '@playwright/test';
import { createBoard, signIn } from './helpers';

test('workflows: create a cross-board workflow from the page', async ({ page }) => {
  await signIn(page);
  const sourceBoard = `Workflow source ${Date.now()}`;
  const targetBoard = `Workflow target ${Date.now()}`;
  const source = await createBoard(page, sourceBoard);
  const target = await createBoard(page, targetBoard);
  await page.goto('/workflows');
  await expect(page.getByTestId('page-title')).toContainText('Workflows');
  await page.getByRole('button', { name: 'New workflow' }).click();

  await page.getByLabel('Source board').click();
  const sourceOption = page.getByRole('menuitemradio', { name: sourceBoard });
  await sourceOption.evaluate((element) => (element as HTMLElement).click());
  await page.locator('#workflow-name').fill('Onboarding handoff');

  await page.getByRole('button', { name: 'Add step' }).click();
  await page.getByRole('menuitem', { name: 'Create an item on another board' }).click();
  await page.getByLabel('Target board').click();
  const targetOption = page.getByRole('menuitemradio', { name: targetBoard });
  await targetOption.evaluate((element) => (element as HTMLElement).click());
  await page.getByLabel('New item name').fill('Delivery for {{name}}');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  const row = page.getByTestId('workflow-row').filter({ hasText: 'Onboarding handoff' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Create item');
});
