import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, createBoard, signIn } from './helpers';

test('UX-004: a long board name does not overflow the sidebar', async ({ page }) => {
  await signIn(page);
  const longName = `Long board ${'name '.repeat(12)}`.trim();
  await createBoard(page, longName);
  await page.goto('/');
  const scroll = page.getByTestId('sidebar-scroll');
  const metrics = await scroll.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  await expect(page.getByTitle(longName)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('UX-005: admin rows fit the name and email', async ({ page }) => {
  const owner = await signIn(page);
  await page.request.patch('/api/me', {
    headers: H,
    data: { preferences: { density: 'comfortable' } },
  });
  await page.goto('/admin');
  const row = page.getByTestId('admin-person-row').filter({ hasText: owner.email }).first();
  await expect(row).toBeVisible();
  const box = await row.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(box.height).toBeGreaterThanOrEqual(40);
  expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1);
  await expect(
    page.getByTestId('admin-person-email').filter({ hasText: owner.email }).first(),
  ).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('admin-person-row').first()).toBeVisible();
  await axeCheck(page, 'admin people 375');
});

test('UX-006: chat opens Updates and expand opens Info', async ({ page }) => {
  await signIn(page);
  const { boardId } = await createBoard(page, `Panel tabs ${Date.now()}`);
  const full = await (await page.request.get(`/api/boards/${boardId}`)).json();
  const created = await page.request.post(`/api/boards/${boardId}/items`, {
    headers: H,
    data: { groupId: full.groups[0].id, name: 'Panel tab item' },
  });
  const itemId = (await created.json()).item.id as number;
  await page.goto(`/boards/${boardId}`);

  const row = page.getByTestId('item-row').filter({ hasText: 'Panel tab item' }).first();
  await row.hover();
  await row.getByTestId('item-open').click();
  await expect(page.getByTestId('item-tab-updates')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('item-panel')).toHaveCount(0);

  await row.hover();
  await row.getByTestId('item-open-info').click();
  await expect(page.getByTestId('item-tab-info')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/panel=info/);

  await page.goto(`/boards/${boardId}?item=${itemId}`);
  await expect(page.getByTestId('item-tab-updates')).toHaveAttribute('aria-selected', 'true');
  await page.goto(`/boards/${boardId}?item=${itemId}&panel=info`);
  await expect(page.getByTestId('item-tab-info')).toHaveAttribute('aria-selected', 'true');
});

test('UX-007: Add widget uses clickable type cards', async ({ page }) => {
  await signIn(page);
  const workspaces = await (await page.request.get('/api/workspaces')).json();
  const workspace = workspaces.workspaces[0];
  const board = workspace.boards?.[0];
  const created = await page.request.post('/api/dashboards', {
    headers: H,
    data: {
      workspaceId: workspace.id,
      name: `UX dash ${Date.now()}`,
      boardIds: board ? [board.id] : [],
    },
  });
  expect(created.status()).toBe(201);
  const dashboardId = (await created.json()).dashboard.id as number;
  await page.goto(`/dashboards/${dashboardId}`);
  await page.getByRole('button', { name: 'Add widget', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('widget-type-ai_insight')).toBeVisible();
  await dialog.getByTestId('widget-type-ai_insight').click();
  await expect(dialog.getByTestId('widget-type-ai_insight')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await dialog.getByRole('button', { name: 'Add widget' }).click();
  await expect(page.locator('[data-widget-type="ai_insight"]')).toBeVisible();
});

test('UX-003: Monday is first in the theme picker and no theme is promoted', async ({ page }) => {
  await signIn(page);
  await page.goto('/profile');
  const first = page.locator('[data-testid^="color-theme-"]').first();
  await expect(first).toHaveAttribute('data-testid', 'color-theme-monday');
  await expect(first).toContainText('Monday');
  await expect(page.getByText('Suggested', { exact: true })).toHaveCount(0);
});

test('UX-001: the unsubscribe page is public and explains itself', async ({ page }) => {
  await page.goto('/unsubscribe');
  await expect(page.getByTestId('unsubscribe-page')).toContainText('This link is incomplete');
  await page.goto('/unsubscribe?token=not-a-real-token-value');
  await expect(page.getByTestId('unsubscribe-submit')).toBeVisible();
  await page.getByTestId('unsubscribe-submit').click();
  await expect(page.getByTestId('unsubscribe-page')).toContainText('invalid or has expired');
});
