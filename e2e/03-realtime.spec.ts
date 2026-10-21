import { expect, test } from '@playwright/test';
import { H, createBoard, shot, signIn } from './helpers';

test('realtime: board changes propagate and mentions notify', async ({ page, browser }) => {
  const owner = await signIn(page);
  const { boardId } = await createBoard(page, `Realtime ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const groupId = full.groups[0].id;
  const created = await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: { groupId, name: 'Realtime item' },
  });
  const itemId = (await created.json()).item.id as number;

  const page2 = await page.context().newPage();
  await page2.goto(`/boards/${boardId}`);
  await page.goto(`/boards/${boardId}`);
  await expect(page.getByTestId('item-row').first()).toBeVisible();
  await page2.waitForTimeout(500);

  const renamed = await page.request.patch(`/api/items/${itemId}`, {
    headers: H,
    data: { name: 'Renamed live' },
  });
  expect(renamed.status()).toBe(200);
  await expect(
    page2.locator('[data-testid="item-row"][data-item-name="Renamed live"]'),
  ).toBeVisible({ timeout: 3000 });

  const invite = await page.request.post('/api/invites', {
    headers: H,
    data: { role: 'member' },
  });
  const inviteUrl = (await invite.json()).invite.url as string;

  const memberContext = await browser.newContext({ baseURL: 'http://localhost:3200' });
  const memberPage = await memberContext.newPage();
  await memberPage.goto(inviteUrl);
  await memberPage.getByLabel('Your name').fill('Mia Member');
  await memberPage.getByLabel('Email').fill('mia@e2e.test');
  await memberPage.getByLabel('Password').fill('password123');
  await memberPage.getByRole('button', { name: /^Join/ }).click();
  await expect(memberPage.getByTestId('sidebar')).toBeVisible();

  const posted = await memberPage.request.post(`/api/items/${itemId}/updates`, {
    headers: H,
    data: { body: `@[Erin Owner](user:${owner.id}) please review` },
  });
  expect(posted.status()).toBe(201);

  await expect(page.getByTestId('notification-badge')).toHaveText('1', { timeout: 3000 });
  await page.goto('/inbox');
  await expect(page.getByText(/mentioned you/)).toBeVisible();
  await shot(page, 'phase5-inbox');
  await memberContext.close();
});
