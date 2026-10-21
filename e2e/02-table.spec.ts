import { expect, test } from '@playwright/test';
import { createBoard, shot, signIn } from './helpers';

test('table: items, cells, columns, search and updates', async ({ page }) => {
  await signIn(page);
  const name = `Table Board ${Date.now()}`;
  const { boardId } = await createBoard(page, name);
  await page.goto(`/boards/${boardId}`);

  const addItem = page.getByTestId('add-item-input').first();
  await addItem.fill('E2E item');
  await addItem.press('Enter');

  const row = page.locator('[data-testid="item-row"][data-item-name="E2E item"]');
  await expect(row).toBeVisible();

  const statusCell = row.locator('[data-testid="cell"][data-column-title="Status"]');
  await statusCell.click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(statusCell).toContainText('Done');

  const dateCell = row.locator('[data-testid="cell"][data-column-title="Due date"]');
  await dateCell.click();
  await page.locator('input[type="date"]').fill('2026-12-01');
  await page.getByRole('button', { name: 'Save', exact: true }).last().click();
  await expect(dateCell).not.toBeEmpty();

  await page.getByTestId('add-column').click();
  await page.getByRole('menuitem', { name: 'Numbers' }).click();
  await expect(
    page.locator('[data-testid="column-header"][data-column-title="Numbers"]').first(),
  ).toBeVisible();

  await page.getByTestId('toolbar-search').fill('zzz-nomatch');
  await expect(page.getByTestId('item-row')).toHaveCount(0);
  await page.getByTestId('toolbar-search').fill('');
  await expect(row).toBeVisible();

  await row.getByTestId('item-open').click();
  await expect(page.getByTestId('item-panel')).toBeVisible();
  await page.getByTestId('update-composer').fill('Hello from e2e');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByTestId('update-body').filter({ hasText: 'Hello from e2e' })).toBeVisible();

  await shot(page, 'phase4-board');
  await shot(page, 'phase4-panel');

  await page.reload();
  const reloaded = page.locator('[data-testid="item-row"][data-item-name="E2E item"]');
  await expect(reloaded.locator('[data-testid="cell"][data-column-title="Status"]')).toContainText(
    'Done',
  );
});
