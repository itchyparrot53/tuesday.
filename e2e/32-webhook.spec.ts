import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { createBoard, signIn } from './helpers';

test('inbound webhook: create the URL in the board and post an item into a group', async ({
  page,
}) => {
  await signIn(page);
  const { boardId } = await createBoard(page, `Webhook board ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const group = full.groups[0] as { id: number; title: string };

  await page.goto(`/boards/${boardId}`);
  await page.getByRole('button', { name: 'Board menu' }).click();
  await page.getByRole('menuitem', { name: /Inbound webhook/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Inbound webhook', { exact: true })).toBeVisible();
  await axeCheck(page, 'board webhook dialog');
  await dialog.getByRole('button', { name: 'Create webhook' }).click();
  const url = await dialog.locator('#inbound-webhook-url').inputValue();
  expect(url).toContain('/api/hooks/board/');

  const response = await page.request.post(url, {
    data: { name: 'Webhook E2E item', group: group.title },
  });
  expect(response.status()).toBe(201);

  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.getByTestId('item-name').filter({ hasText: 'Webhook E2E item' })).toBeVisible();
});
