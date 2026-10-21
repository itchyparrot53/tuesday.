import { expect, test } from '@playwright/test';
import { OWNER, shot } from './helpers';

test('shell: setup, workspace, board and invite', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const state = await (await page.request.get('/api/auth/state')).json();

  if (state.needsSetup) {
    await page.goto('/');
    await expect(page).toHaveURL(/\/setup$/);
    await page.getByLabel('Your name').fill(OWNER.name);
    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByTestId('setup-next').click();
    await page.getByLabel('Organisation name').fill(OWNER.orgName);
    await page.getByTestId('setup-next').click();
    await expect(page).toHaveURL(/\/welcome\?step=starter/);
    await page.goto('/');
  } else {
    await page.goto('/login');
    await page.getByLabel('Email').fill(OWNER.email);
    await page.getByLabel('Password').fill(OWNER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }

  await expect(page.getByTestId('user-menu')).toBeVisible();
  await expect(page.getByTestId('sidebar')).toBeVisible();
  await shot(page, 'phase3-home');

  await page.getByRole('button', { name: 'New workspace' }).click();
  await page.getByLabel('Name').fill('E2E Space');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/workspaces\/\d+/);

  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Board…', exact: true }).click();
  await page.getByLabel('Board name').fill('E2E Board');
  await page.getByTestId('create-board-submit').click();
  await expect(page).toHaveURL(/\/boards\/\d+/);

  await expect(
    page.locator('[data-testid="column-header"][data-column-title="Owner"]').first(),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="column-header"][data-column-title="Status"]').first(),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="column-header"][data-column-title="Due date"]').first(),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="group-header"][data-group-title="To do"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="group-header"][data-group-title="Completed"]'),
  ).toBeVisible();
  await shot(page, 'phase3-board');

  await page.goto('/admin?tab=invites');
  await page.getByRole('button', { name: 'Create invite' }).click();
  const code = page.locator('code');
  await expect(code).toContainText('/invite/');
  const url = (await code.textContent())!.trim();
  await shot(page, 'phase3-admin');

  const context = await browser.newContext({ baseURL: 'http://localhost:3200' });
  const invited = await context.newPage();
  await invited.goto(url);
  await invited.getByLabel('Your name').fill('Pat Person');
  await invited.getByLabel('Email').fill('pat@e2e.test');
  await invited.getByLabel('Password').fill('password123');
  await invited.getByRole('button', { name: /^Join/ }).click();
  await expect(invited.getByTestId('sidebar')).toBeVisible();
  await context.close();
});
