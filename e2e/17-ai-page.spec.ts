import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, createBoard, signIn } from './helpers';

test('AI page: chat, references, rename, pin, search, slash, context and stop', async ({
  page,
}) => {
  const user = await signIn(page);
  const { boardId } = await createBoard(page, `AI refs ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const itemResponse = await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: { groupId: full.groups[0].id, name: 'Fix login bug' },
  });
  const itemId = (await itemResponse.json()).item.id as number;

  await page.goto('/');
  await page.getByTestId('ask-ai').click();
  await expect(page).toHaveURL(/\/ai$/);
  await expect(page.getByTestId('ai-page')).toBeVisible();
  await expect(page.getByTestId('ai-panel')).toBeVisible();
  await page.getByTestId('ai-new-chat').click();

  await page.getByTestId('ai-composer').fill('hello');
  await page.getByTestId('ai-composer').press('Enter');
  await expect(
    page.getByTestId('ai-message-assistant').filter({ hasText: 'FAKE AI: hello' }).last(),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByTestId('ai-composer').fill(`see [[item:${itemId}]]`);
  await page.getByTestId('ai-composer').press('Enter');
  const chip = page
    .getByTestId('ai-message-assistant')
    .last()
    .getByTestId('ai-ref-chip')
    .filter({ hasText: 'Fix login bug' })
    .first();
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await chip.click();
  await expect(page.getByTestId('item-panel')).toBeVisible();
  await page.getByLabel('Close item panel').click();
  await expect(page.getByTestId('item-panel')).toHaveCount(0);

  await page.getByTestId('ai-chat-title').click();
  await page.getByTestId('ai-chat-title').fill('Launch risks');
  await page.getByTestId('ai-chat-title').press('Enter');
  await expect(page.getByTestId('ai-chat-title')).toHaveText('Launch risks');
  await page.reload();
  await expect(page.getByTestId('ai-chat-title')).toHaveText('Launch risks');

  await page.getByLabel('Actions for Launch risks').click();
  await page.getByRole('menuitem', { name: 'Pin' }).click();
  await expect(page.getByText('Pinned', { exact: true })).toBeVisible();

  const search = page.getByLabel('Search chats');
  await search.fill('Launch risks');
  await expect(page.getByTestId('ai-conversation-row')).toHaveCount(1);
  await expect(page.getByTestId('ai-conversation-row')).toContainText('Launch risks');
  await search.fill('');

  await page.getByTestId('ai-composer').fill('/');
  await expect(page.getByTestId('ai-slash-menu')).toBeVisible();
  await page.getByTestId('ai-composer').press('Enter');
  await expect(page.getByTestId('ai-composer')).toHaveValue(/Plan my day:/);

  await page.getByRole('button', { name: 'Context', exact: true }).click();
  await page.getByLabel('Search context').fill(`AI refs`);
  const checkbox = page.getByRole('checkbox', { name: new RegExp(`AI refs`) }).first();
  await expect(checkbox).toBeVisible();
  await checkbox.check();
  await page.getByRole('dialog').getByRole('button', { name: 'Add context' }).click();
  await expect(page.getByTestId('ai-context-chip').first()).toBeVisible();

  const slow = `[slow] ${'tell me a story '.repeat(40)}`;
  await page.getByTestId('ai-composer').fill(slow);
  await page.getByTestId('ai-composer').press('Enter');
  await expect(page.getByTestId('ai-stop')).toBeVisible();
  await expect(page.getByTestId('ai-message-assistant').last()).toContainText('FAKE AI', {
    timeout: 10_000,
  });
  await page.getByTestId('ai-stop').click();
  await expect(page.getByTestId('ai-message-assistant').last()).toContainText('FAKE AI');
  await expect(page.getByTestId('ai-stop')).toHaveCount(0);

  await axeCheck(page, 'ai page');
  expect(user.email).toContain('@');
});

test('AI page: ?q sends immediately', async ({ page }) => {
  await signIn(page);
  const conversation = await (
    await page.request.post('/api/ai/conversations', { headers: H, data: {} })
  ).json();
  await page.goto(`/ai/${conversation.conversation.id}?q=hello-auto`);
  await expect(
    page.getByTestId('ai-message-assistant').filter({ hasText: 'FAKE AI: hello-auto' }).last(),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(new RegExp(`/ai/${conversation.conversation.id}$`));
  await axeCheck(page, 'ai chat');
});

test('AI page: mobile shows the list and chat as separate screens', async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/ai');
  await expect(page.getByTestId('ai-conversation-list')).toBeVisible();
  await expect(page.getByTestId('ai-panel')).toBeHidden();
  await page.getByTestId('ai-conversation-row').first().click();
  await expect(page.getByTestId('ai-panel')).toBeVisible();
  await expect(page.getByTestId('ai-back')).toBeVisible();
  await page.getByTestId('ai-back').click();
  await expect(page.getByTestId('ai-conversation-list')).toBeVisible();
});
