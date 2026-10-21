import { expect, test } from '@playwright/test';
import { H, createBoard, shot, signIn } from './helpers';

test('power tools: palette, grid, undo, trash and backup', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const name = `Power ${Date.now()}`;
  const { boardId } = await createBoard(page, name);
  const notes = await page.request.post(`/api/boards/${boardId}/columns`, {
    headers: H,
    data: { title: 'Notes', type: 'text' },
  });
  expect(notes.status()).toBe(201);
  const notesId = (await notes.json()).column.id;
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: {
      groupId: full.groups[0].id,
      name: 'Grid item',
      values: { [notesId]: { text: 'initial' } },
    },
  });
  const second = await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: {
      groupId: full.groups[0].id,
      name: 'Grid item 2',
      values: { [notesId]: { text: 'second' } },
    },
  });
  const secondItemId = (await second.json()).item.id as number;
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByRole('heading', { name: /Power/ })).toBeVisible();

  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await shot(page, 'p2-palette');
  await page.getByTestId('command-input').fill(name);
  await page
    .locator('[data-command-row]')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
  await expect(page.getByTestId('command-palette')).not.toBeVisible();

  const cell = page.locator(
    '[data-testid="item-row"][data-item-name="Grid item"] [data-testid="cell"][data-column-title="Notes"]',
  );
  await cell.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-active-cell="true"][data-column-title="Notes"]')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(
    page.locator('[data-active-cell="true"][data-column-title="Due date"]'),
  ).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-active-cell="true"][data-column-title="Notes"]')).toBeVisible();
  await page.getByTestId('board-scroll').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-active-cell="true"] input').waitFor();
  await page.keyboard.press('Meta+a');
  await page.keyboard.type('grid value');
  await page.keyboard.press('Enter');
  await expect(cell).toContainText('grid value');
  await expect(
    page.locator(`[data-active-cell="true"][data-item-id="${secondItemId}"]`),
  ).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(cell).not.toContainText('grid value', { timeout: 5000 });

  await cell.click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('x');
  const typed = page.locator('[data-active-cell="true"] input');
  await expect(typed).toHaveValue('x');
  await page.keyboard.press('Enter');
  await expect(cell).toContainText('x');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="cell-active"]')).toHaveCount(0);

  const nameCell = page
    .locator(
      '[data-testid="item-row"][data-item-name="Grid item"] [data-grid-cell][data-column-type="name"]',
    )
    .first();
  await nameCell.click({ position: { x: 180, y: 10 } });
  await page.keyboard.press('z');
  await expect(nameCell.locator('input[class*="h-7"]')).toHaveValue('z');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="cell-active"]')).toHaveCount(0);

  const statusCell = page
    .locator(
      '[data-testid="item-row"][data-item-name="Grid item"] [data-testid="cell"][data-column-title="Status"]',
    )
    .first();
  await statusCell.click();
  await page.locator('[data-radix-popper-content-wrapper] button').first().focus();
  await page.keyboard.press('Enter');
  await expect(
    page.locator(`[data-active-cell="true"][data-item-id="${secondItemId}"]`),
  ).toBeVisible();

  const group = page.locator('[data-testid="group-header"][data-group-title="To do"]');
  await group.getByText('To do', { exact: true }).click();
  const groupInput = group.locator('input:not([type="checkbox"])');
  await groupInput.fill('Doing now');
  await groupInput.press('Enter');
  await expect(page.getByText('Doing now', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('To do', { exact: true }).first()).toBeVisible();

  await page
    .locator('[data-testid="item-row"][data-item-name="Grid item"]')
    .getByTestId('item-open')
    .click();
  await page.getByLabel('Item menu').click();
  await page.getByRole('menuitem', { name: 'Archive item' }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByTestId('undo-toast')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('undo-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-testid="item-row"][data-item-name="Grid item"]')).toBeVisible({
    timeout: 5000,
  });

  await page
    .locator('[data-testid="item-row"][data-item-name="Grid item"]')
    .getByTestId('item-open')
    .click();
  await page.getByLabel('Item menu').click();
  await page.getByRole('menuitem', { name: 'Archive item' }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.goto('/trash');
  const trashRow = page.getByTestId('trash-row').filter({ hasText: 'Grid item' }).first();
  await expect(trashRow).toBeVisible();
  await shot(page, 'p2-trash');
  await trashRow.getByRole('button', { name: 'Restore' }).click();
  await expect(trashRow).not.toBeVisible({ timeout: 5000 });

  await page.goto('/admin');
  await page.getByTestId('tab-data').click();
  await page.getByRole('button', { name: 'Create backup now' }).click();
  await expect(page.getByText(/tuesday-\d{8}-\d{6}\.tar\.gz/).first()).toBeVisible({
    timeout: 10_000,
  });
  await shot(page, 'p2-backup');
});
