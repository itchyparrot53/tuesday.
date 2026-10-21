import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, createBoard, signIn } from './helpers';
import { addDays } from '../server/lib/timezone';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

test('Home focus queue: summary, hero actions, quick add, favourites, activity and ask', async ({
  page,
  request,
}) => {
  const owner = await signIn(page);
  const boardName = `Home board ${Date.now()}`;
  const { boardId } = await createBoard(page, boardName);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const people = full.columns.find((column: { type: string }) => column.type === 'people');
  const date = full.columns.find((column: { type: string }) => column.type === 'date');
  const status = full.columns.find((column: { type: string }) => column.type === 'status');

  async function addItem(name: string, due: string, assign = true) {
    const values: Record<string, unknown> = {};
    if (assign) values[String(people.id)] = { userIds: [owner.id] };
    values[String(date.id)] = { date: due };
    const response = await page.request.post(`/api/boards/${boardId}/items`, {
      headers: H,
      data: { groupId: full.groups[0].id, name, values },
    });
    return (await response.json()).item.id as number;
  }

  await addItem('Overdue task', addDays(today(), -30));
  await addItem('Today task', today());
  await addItem('Tomorrow task', addDays(today(), 1));
  const heroId = await addItem('Hero copy', today(), false);

  const email = `sam-${Date.now()}@e2e.test`;
  const invite = await page.request.post('/api/invites', {
    headers: H,
    data: { email, role: 'member' },
  });
  const token = (await invite.json()).invite.token as string;
  const accepted = await fetch('http://localhost:3200/api/auth/accept-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'tuesday' },
    body: JSON.stringify({ token, name: 'Sam Lee', email, password: 'password123' }),
  });
  expect(accepted.status).toBe(201);
  const cookie = String(accepted.headers.get('set-cookie')).split(';')[0];
  await fetch(`http://localhost:3200/api/items/${heroId}/values/${status.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'tuesday', cookie },
    body: JSON.stringify({ value: { labelId: 'progress' } }),
  });
  await fetch(`http://localhost:3200/api/items/${heroId}/updates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'tuesday', cookie },
    body: JSON.stringify({ body: `@[Erin Owner](user:${owner.id}) please review` }),
  });

  const summary = await (await page.request.get('/api/home')).json();
  await page.goto('/');
  await expect(page.getByTestId('home-summary')).toContainText(
    summary.counts.overdue > 0 ? 'overdue' : 'due today',
  );
  await expect(page.getByTestId('home-chip').filter({ hasText: 'Overdue' })).toContainText(
    String(summary.counts.overdue),
  );
  await expect(page.getByTestId('home-chip').filter({ hasText: 'Open' })).toContainText(
    String(summary.counts.open),
  );

  const overdueRow = page
    .getByTestId('home-myday-row')
    .filter({ hasText: 'Overdue task' })
    .filter({ hasText: boardName })
    .first();
  await expect(overdueRow).toBeVisible();
  const todayRow = page
    .getByTestId('home-myday-row')
    .filter({ hasText: 'Today task' })
    .filter({ hasText: boardName })
    .first();
  await expect(todayRow).toBeVisible();

  const focus = page.getByTestId('home-focus');
  await expect(focus).toContainText('Overdue task');
  await expect(focus).toContainText('Why this is first');
  await expect(focus.getByTestId('home-done')).toBeEnabled();

  await expect(todayRow.getByTestId('home-done')).toBeEnabled();
  await todayRow.getByTestId('home-done').click();
  await expect(todayRow).toBeHidden();
  await page.getByTestId('undo-toast').getByRole('button', { name: 'Undo' }).click();
  await expect(todayRow).toBeVisible();

  await todayRow.getByTestId('home-snooze').click();
  await expect(page.getByText('Next 3 days', { exact: false })).toBeVisible();
  await expect(todayRow).toBeVisible();

  await page.getByTestId('home-new').click();
  await page.getByRole('menuitem', { name: 'Item' }).click();
  await page.getByLabel('Board', { exact: true }).selectOption(String(boardId));
  await page.getByLabel('Item name').fill('Quick add item');
  await page.getByRole('button', { name: 'Create item' }).click();
  await expect(page.getByText('Item created')).toBeVisible();
  await page.getByText('Item created').locator('..').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByText('Quick add item').first()).toBeVisible();

  await page.goto('/');
  const boardRow = page.getByTestId('home-board-card').filter({ hasText: 'Home board' }).first();
  await boardRow.getByTestId('favorite-toggle').click();
  await expect(page.getByTestId('sidebar-favorites')).toBeVisible();
  await expect(page.getByTestId('sidebar-favorites')).toContainText('Home board');

  const changed = page.getByTestId('home-activity-row');
  await expect(changed.filter({ hasText: 'Sam Lee' }).first()).toBeVisible();
  await expect(changed.filter({ hasText: 'changed Status' }).first()).toBeVisible();
  await expect(page.getByTestId('home-activity-row').filter({ hasText: 'Erin Owner' })).toHaveCount(
    0,
  );

  await page.getByTestId('home-ask').getByRole('textbox').fill('hello from home');
  await page.getByTestId('home-ask').getByRole('textbox').press('Enter');
  await expect(page).toHaveURL(/\/ai/);
  await expect(
    page.getByTestId('ai-message-assistant').filter({ hasText: 'FAKE AI: hello from home' }).last(),
  ).toBeVisible({ timeout: 10_000 });

  await page.goto('/');
  await axeCheck(page, 'home');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await axeCheck(page, 'home 375');
});

test('Home focus queue: J and K move, X completes the hero', async ({ page }) => {
  const owner = await signIn(page);
  const boardName = `Focus keyboard ${Date.now()}`;
  const { boardId } = await createBoard(page, boardName);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const people = full.columns.find((column: { type: string }) => column.type === 'people');
  const date = full.columns.find((column: { type: string }) => column.type === 'date');

  async function addItem(name: string, due: string) {
    await page.request.post(`/api/boards/${boardId}/items`, {
      headers: H,
      data: {
        groupId: full.groups[0].id,
        name,
        values: {
          [String(people.id)]: { userIds: [owner.id] },
          [String(date.id)]: { date: due },
        },
      },
    });
  }

  await addItem('Focus overdue', addDays(today(), -60));
  await addItem('Focus next', today());
  await page.goto('/');

  const focus = page.getByTestId('home-focus');
  await expect(focus).toContainText('Focus overdue');
  await expect(focus.getByTestId('home-done')).toBeEnabled();
  await expect(page.locator('[data-queue-index="0"]')).toHaveAttribute('aria-current', 'true');

  await page.keyboard.press('j');
  await expect(page.locator('[data-queue-index="1"]')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('k');
  await expect(page.locator('[data-queue-index="0"]')).toHaveAttribute('aria-current', 'true');

  await page.keyboard.press('x');
  await expect(focus).not.toContainText('Focus overdue');
  await expect(focus.getByTestId('home-done')).toBeEnabled();
  await axeCheck(page, 'home focus queue');
});
