import { expect, test } from '@playwright/test';
import { H, createBoard, signIn } from './helpers';

test('long text opens with its current value and replies keep focus', async ({ page }) => {
  await signIn(page);
  const { boardId } = await createBoard(page, `Input fixes ${Date.now()}`);
  const board = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const notes = await page.request.post(`/api/boards/${boardId}/columns`, {
    headers: H,
    data: { title: 'Notes', type: 'long_text' },
  });
  const notesId = (await notes.json()).column.id as number;
  const item = await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: {
      groupId: board.groups[0].id,
      name: 'Input item',
      values: { [String(notesId)]: { text: 'hello notes' } },
    },
  });
  const itemId = (await item.json()).item.id as number;

  await page.goto(`/boards/${boardId}?item=${itemId}&panel=info`);
  const panel = page.getByTestId('item-panel');
  await panel.getByLabel('Edit Notes').click();
  const notesEditor = page.locator('.popover-content textarea').first();
  await expect(notesEditor).toHaveValue('hello notes');
  await notesEditor.fill('hello notes updated');
  await page.locator('.popover-content').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.getByText('hello notes updated')).toBeVisible();

  await page.getByTestId('item-tab-updates').click();
  const composer = page.getByTestId('update-composer');
  await composer.fill('Parent update');
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByText('Parent update')).toBeVisible();
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  const reply = page.getByPlaceholder('Write a reply…');
  await reply.pressSequentially('hello');
  await expect(reply).toHaveValue('hello');
  await expect(reply).toBeFocused();
});
