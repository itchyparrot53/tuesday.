import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { axeCheck } from './design';

const PORT = 3300 + Math.floor(Math.random() * 200);
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess;

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('The fresh onboarding server did not start');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  for (const file of [
    'data/e2e-onboarding.db',
    'data/e2e-onboarding.db-wal',
    'data/e2e-onboarding.db-shm',
  ]) {
    rmSync(file, { force: true });
  }
  server = spawn('node', ['dist/server/index.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATABASE_PATH: './data/e2e-onboarding.db',
      APP_URL: BASE,
      AI_FAKE: 'true',
      LOG_LEVEL: 'warn',
      UPLOADS_DIR: './data/e2e-onboarding-uploads',
      BACKUP_DIR: './data/e2e-onboarding-backups',
    },
    stdio: 'ignore',
  });
  await waitForHealth();
});

test.afterAll(() => {
  server?.kill('SIGTERM');
});

test('first run: owner setup, starter board, invites, checklist, tour, member join and board creation', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const ownerContext = await browser.newContext({ baseURL: BASE });
  const page = await ownerContext.newPage();

  await page.goto('/setup');
  await expect(page.getByTestId('setup-step').first()).toBeVisible();
  await axeCheck(page, 'setup account');
  await page.getByLabel('Your name').fill('Onboarding Owner');
  await page.getByLabel('Email').fill('onboarding@test.dev');
  await page.getByLabel('Password').fill('password123');
  await page.getByTestId('setup-next').click();
  await expect(page.getByLabel('Organisation name')).toBeVisible();
  await axeCheck(page, 'setup organisation');
  await page.getByLabel('Organisation name').fill('Onboarding Studio');
  await page.getByTestId('setup-next').click();
  await expect(page).toHaveURL(/\/welcome\?step=starter/);
  await axeCheck(page, 'welcome starter');
  await page.getByTestId('usecase-card').filter({ hasText: 'Projects' }).click();
  await page.getByTestId('setup-next').click();
  await expect(page).toHaveURL(/step=invite/);
  await axeCheck(page, 'welcome invite');

  await page.getByLabel('Email 1').fill('member-one@test.dev');
  await page.getByTestId('invite-add-row').click();
  await page.getByLabel('Email 2').fill('member-two@test.dev');
  await page.getByTestId('setup-next').click();
  await expect(page.getByTestId('invite-link')).toHaveCount(2);
  const inviteLink = (await page.getByTestId('invite-link').first().textContent())!.trim();

  await page.getByRole('button', { name: 'Go to Tuesday' }).click();
  await expect(page).toHaveURL(`${BASE}/`);
  await expect(page.getByTestId('home-getting-started')).toBeVisible();
  await expect(
    page.getByTestId('onboarding-step').filter({ hasText: 'Create your first board' }),
  ).toHaveAttribute('data-done', 'true');
  await expect(page.getByText('Project tracker').first()).toBeVisible();
  await axeCheck(page, 'home first run');

  await expect(page.getByTestId('tour-step')).toBeVisible({ timeout: 5000 });
  for (let step = 1; step <= 3; step++) {
    await expect(page.getByTestId('tour-step')).toHaveAttribute('data-step', String(step));
    await page.getByTestId('tour-next').click();
  }
  await expect(page.getByTestId('tour-step')).toHaveAttribute('data-step', '4');
  await page.getByTestId('tour-next').click();
  await expect(page.getByTestId('tour-step')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('tour-step')).toHaveCount(0);

  await page.getByTestId('onboarding-hide').click();
  await expect(page.getByTestId('home-getting-started')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('home-getting-started')).toHaveCount(0);

  const memberContext = await browser.newContext({ baseURL: BASE });
  const member = await memberContext.newPage();
  await member.goto(inviteLink);
  await expect(member.getByTestId('invite-who')).toContainText('Onboarding Owner');
  await axeCheck(member, 'invite accept');
  await member.getByLabel('Your name').fill('Mia Member');
  await member.getByLabel('Password').fill('password123');
  await member.getByRole('button', { name: /Join Onboarding Studio/ }).click();
  await expect(member).toHaveURL(`${BASE}/`);
  await expect(member.getByTestId('home-getting-started')).toBeVisible();
  await expect(
    member.getByTestId('onboarding-step').filter({ hasText: 'Create your first board' }),
  ).toHaveCount(0);
  await member.getByTestId('tour-skip').click();
  await axeCheck(member, 'member home');

  await member.getByTestId('home-new').click();
  await member.getByRole('menuitem', { name: 'Board…', exact: true }).click();
  await expect(member.getByTestId('create-board-dialog')).toBeVisible();
  await member.getByLabel('Board name').fill('Blank board');
  await expect(member.getByTestId('create-board-submit')).toBeEnabled();
  await member.waitForTimeout(300);
  await axeCheck(member, 'create board dialog');
  await member.getByTestId('create-board-submit').click();
  await expect(member).toHaveURL(/\/boards\/\d+/);
  await expect(member.getByTestId('page-title')).toContainText('Blank board');

  await member.goto('/');
  await member.getByTestId('home-new').click();
  await member.getByRole('menuitem', { name: 'Board…', exact: true }).click();
  await member.getByTestId('create-board-tab').filter({ hasText: 'From a template' }).click();
  await member.getByTestId('template-card').first().click();
  await member.getByTestId('create-board-submit').click();
  await expect(member).toHaveURL(/\/boards\/\d+/);
  await expect(member.getByTestId('page-title')).toBeVisible();

  await ownerContext.close();
  await memberContext.close();
});
