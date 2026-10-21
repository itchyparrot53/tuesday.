import { expect, test } from '@playwright/test';
import { createBoard, signIn } from './helpers';

test('automation center: templates, duplicate and activity tabs', async ({ page }) => {
  await signIn(page);
  const { boardId } = await createBoard(page, `Automation center ${Date.now()}`);
  await page.goto(`/boards/${boardId}`);
  await page.getByTestId('automate-button').click();

  await expect(page.getByRole('tab', { name: /Automations/ })).toBeVisible();
  await page.getByRole('tab', { name: /Templates/ }).click();
  await expect(page.getByLabel('Search templates')).toBeVisible();
  await page.getByLabel('Search templates').fill('assign the creator');

  const template = page.getByRole('button', {
    name: 'When an item is created, assign the creator',
  });
  await expect(template).toBeVisible();
  await template.click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByTestId('automation-row')).toHaveCount(1);
  const row = page.getByTestId('automation-row').first();
  await expect(row.getByText('assign the creator')).toBeVisible();
  await row.getByLabel('Automation actions').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(page.getByTestId('automation-row')).toHaveCount(2);
  await expect(page.getByTestId('automation-row').nth(1)).toContainText('Paused');

  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByText('Total runs')).toBeVisible();
  await expect(page.getByText('No runs yet')).toBeVisible();
});
