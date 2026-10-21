import { expect, test } from '@playwright/test';
import { addDays } from '../server/lib/timezone';
import { H, createBoard, signIn } from './helpers';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

test('My work: saved board view and bulk field edit with undo', async ({ page }) => {
  const owner = await signIn(page);
  const boardName = `My work board ${Date.now()}`;
  const { boardId } = await createBoard(page, boardName);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const people = full.columns.find((column: { type: string }) => column.type === 'people');
  const date = full.columns.find((column: { type: string }) => column.type === 'date');
  const status = full.columns.find((column: { type: string }) => column.type === 'status');
  const names = ['My work A', 'My work B', 'My work C'];
  for (const [index, name] of names.entries()) {
    const response = await page.request.post(`/api/boards/${boardId}/items`, {
      headers: H,
      data: {
        groupId: full.groups[0].id,
        name,
        values: {
          [String(people.id)]: { userIds: [owner.id] },
          [String(date.id)]: { date: addDays(today(), index) },
          [String(status.id)]: { labelId: 'todo' },
        },
      },
    });
    expect(response.status()).toBe(201);
  }

  await page.goto('/my-work');
  await page.getByLabel('Filter My work by board').click();
  await page.getByRole('menuitemradio', { name: boardName }).click();
  await expect(page.getByTestId('mywork-select')).toHaveCount(3);
  await page.getByTestId('mywork-save-view').click();
  const saveDialog = page.getByRole('dialog');
  await saveDialog.getByLabel('Name').fill('Board view');
  await saveDialog.getByTestId('mywork-save-view-submit').click();
  await expect(
    page.getByTestId('mywork-saved-view').filter({ hasText: 'Board view' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByTestId('mywork-saved-view').filter({ hasText: 'Board view' }),
  ).toBeVisible();
  await page
    .getByTestId('mywork-saved-view')
    .filter({ hasText: 'Board view' })
    .getByTestId('mywork-apply-view')
    .click();
  await expect(page.getByLabel('Filter My work by board')).toContainText(boardName);

  const checks = page.getByTestId('mywork-select');
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.getByTestId('mywork-bulk-edit').click();
  const editDialog = page.getByTestId('bulk-edit-dialog');
  await editDialog.getByLabel('Bulk status').click();
  await page.getByRole('menuitemradio', { name: 'In progress' }).click();
  await editDialog.getByLabel('Due date').fill('2026-12-01');
  await page.getByTestId('bulk-edit-apply').click();
  await expect(page.getByTestId('undo-toast')).toBeVisible();

  const items = (await (await page.request.get(`/api/boards/${boardId}/items`)).json()).items as {
    name: string;
    values: Record<string, { labelId?: string; date?: string }>;
  }[];
  const changed = items.filter((item) => item.values[String(status.id)]?.labelId === 'progress');
  expect(changed.length).toBe(2);
  for (const item of changed) expect(item.values[String(date.id)]?.date).toBe('2026-12-01');

  await page.getByTestId('undo-toast').getByRole('button', { name: 'Undo' }).click();
  await expect
    .poll(
      async () => {
        const restored = (await (await page.request.get(`/api/boards/${boardId}/items`)).json())
          .items as { values: Record<string, { labelId?: string; date?: string }> }[];
        return restored.filter((item) => item.values[String(status.id)]?.labelId === 'progress')
          .length;
      },
      { timeout: 10_000 },
    )
    .toBe(0);
  void names;
});
