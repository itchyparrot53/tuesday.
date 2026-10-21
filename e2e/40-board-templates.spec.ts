import { expect, test } from '@playwright/test';
import { createBoard, signIn } from './helpers';

test('board-specific templates: generate ten, save one and keep them cached', async ({ page }) => {
  await signIn(page);
  const { boardId } = await createBoard(page, `Board templates ${Date.now()}`);
  await page.goto(`/boards/${boardId}`);
  await page.getByTestId('automate-button').click();
  await page.getByRole('tab', { name: /Templates/ }).click();

  await page.getByTestId('generate-board-templates').click();
  await expect(page.getByTestId('generated-template-card')).toHaveCount(10, { timeout: 15_000 });
  await expect(page.getByText('10 board-specific templates')).toBeVisible();

  await page.getByTestId('generated-template-card').first().click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('tab', { name: /Automations/ }).click();
  await expect(page.getByTestId('automation-row')).toHaveCount(1);

  await page.getByLabel('Close automations').click();
  await page.getByTestId('automate-button').click();
  await page.getByRole('tab', { name: /Templates/ }).click();
  await expect(page.getByTestId('generated-template-card')).toHaveCount(10);
  await expect(page.getByTestId('generate-board-templates')).toContainText('Regenerate');
  await expect(page.getByTestId('generate-board-templates')).toBeEnabled();
});
