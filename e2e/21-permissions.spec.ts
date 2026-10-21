import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, createBoard, signIn } from './helpers';

test('permissions: private boards, sharing, guests and read-only members', async ({
  page,
  browser,
}) => {
  const owner = await signIn(page);
  const { boardId } = await createBoard(page, `Private board ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  await page.request.patch(`/api/boards/${boardId}/privacy`, {
    headers: H,
    data: { isPrivate: true },
  });

  const email = `viewer-${Date.now()}@e2e.test`;
  const invite = await page.request.post('/api/invites', {
    headers: H,
    data: { email, role: 'member' },
  });
  const token = (await invite.json()).invite.token as string;

  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await member.goto(`http://localhost:3200/invite/${token}`);
  await member.getByLabel('Your name').fill('Member Person');
  await member.getByLabel('Password').fill('password123');
  await member.getByRole('button', { name: /Join/ }).click();
  await expect(member).toHaveURL(/\/$/);

  await member.goto(`/boards/${boardId}`);
  await expect(member.getByText(/not found|couldn't/i).first()).toBeVisible();

  const users = await (await page.request.get('/api/users')).json();
  const memberUser = users.users.find((user: { email: string }) => user.email === email);
  const share = await page.request.put(`/api/boards/${boardId}/members/${memberUser.id}`, {
    headers: H,
    data: { access: 'view' },
  });
  expect(share.status()).toBe(200);
  await member.goto(`/boards/${boardId}`);
  await expect(member.getByTestId('page-title')).toContainText('Private board');

  await page.request.put(`/api/boards/${boardId}/members/${memberUser.id}`, {
    headers: H,
    data: { access: 'comment' },
  });
  const itemId = full.groups?.[0]?.id
    ? (
        await (
          await page.request.post(`/api/boards/${boardId}/items`, {
            headers: H,
            data: { groupId: full.groups[0].id, name: 'Member update target' },
          })
        ).json()
      ).item.id
    : null;
  if (itemId) {
    const update = await member.request.post(`/api/items/${itemId}/updates`, {
      headers: H,
      data: { body: 'I can comment' },
    });
    expect(update.status()).toBe(201);
  }

  await page.goto(`/boards/${boardId}`);
  await page.getByTestId('board-share').click();
  await expect(page.getByTestId('share-dialog')).toBeVisible();
  await axeCheck(page, 'share dialog');

  const guestEmail = `guest-${Date.now()}@example.test`;
  const guestInvite = await page.request.post(`/api/boards/${boardId}/guests`, {
    headers: H,
    data: { email: guestEmail, access: 'edit' },
  });
  expect(guestInvite.status()).toBe(201);
  const guestToken = (await guestInvite.json()).invite.token as string;
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`http://localhost:3200/invite/${guestToken}`);
  await guest.getByLabel('Your name').fill('Guest Person');
  await guest.getByLabel('Password').fill('password123');
  await guest.getByRole('button', { name: /Join/ }).click();
  await expect(guest).toHaveURL(/\/$/);
  await expect(guest.getByTestId('sidebar-shared')).toBeVisible();
  await expect(guest.getByTestId('sidebar-workspaces')).toHaveCount(0);
  await expect(guest.getByRole('link', { name: 'Admin' })).toHaveCount(0);
  await guest.goto(`/boards/${boardId}`);
  await expect(guest.getByTestId('page-title')).toContainText('Private board');
  await guest.getByTestId('ask-ai').click();
  await guest.getByTestId('ai-composer').fill('find items in my boards');
  await guest.getByTestId('ai-composer').press('Enter');
  await expect(guest.getByTestId('ai-message-assistant').last()).toBeVisible({ timeout: 10_000 });
  await expect(guest.getByText('Private board', { exact: true })).toHaveCount(0);
  expect(owner.email).toBeTruthy();

  await guestContext.close();
  await memberContext.close();
});
