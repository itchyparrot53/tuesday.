import { expect, test } from '@playwright/test';
import { createBoard, signIn } from './helpers';

test('automation builder: type-aware action values and item-created group', async ({ page }) => {
  await signIn(page);
  const { boardId } = await createBoard(page, `Automation builder ${Date.now()}`);
  await page.goto(`/boards/${boardId}`);
  await page.getByTestId('automate-button').click();
  await page.getByRole('button', { name: 'New automation' }).click();

  await page.getByLabel('Action', { exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Set a value' }).click();
  await expect(page.getByLabel('Column to set')).toBeVisible();
  await page.getByLabel('Column to set').click();
  await page.getByRole('menuitemradio', { name: 'Status', exact: true }).click();
  await page.getByLabel('Status value').click();
  await page.getByRole('menuitemradio', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByTestId('automation-row')).toHaveCount(1);
  await expect(page.getByTestId('automation-row').first()).toContainText('set Status to Done');

  await page.getByRole('button', { name: 'New automation' }).click();
  await page.getByLabel('Trigger group').click();
  await page.getByRole('menuitemradio', { name: 'Completed' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('automation-row')).toHaveCount(2);
  await expect(page.getByTestId('automation-row').nth(1)).toContainText(
    'an item is created in Completed',
  );
});
