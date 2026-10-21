import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, signIn } from './helpers';

test('AI cost controls: person limit, blocked call, usage and routing', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const owner = await signIn(page);
  const email = `cost-${Date.now()}@e2e.test`;
  const invite = await page.request.post('/api/invites', {
    headers: H,
    data: { email, role: 'member' },
  });
  const token = (await invite.json()).invite.token as string;
  const accepted = await fetch('http://localhost:3200/api/auth/accept-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'tuesday' },
    body: JSON.stringify({ token, name: 'Cost Member', email, password: 'password123' }),
  });
  const users = await (await page.request.get('/api/users')).json();
  const member = users.users.find((user: { email: string }) => user.email === email);
  expect(accepted.status).toBe(201);
  await page.request.put(`/api/ai/budgets/user/${member.id}`, {
    headers: H,
    data: { monthlyUsd: 0.01 },
  });

  const context = await browser.newContext();
  const memberPage = await context.newPage();
  await memberPage.goto('http://localhost:3200/login');
  await memberPage.getByLabel('Email').fill(email);
  await memberPage.getByLabel('Password').fill('password123');
  await memberPage.getByRole('button', { name: 'Sign in' }).click();
  await memberPage.getByTestId('ask-ai').click();
  await memberPage.getByTestId('ai-composer').fill('[cost] hi');
  await memberPage.getByTestId('ai-composer').press('Enter');
  await expect(memberPage.getByTestId('ai-message-assistant').last()).toContainText('FAKE AI');
  await memberPage.getByTestId('ai-composer').fill('[cost] again');
  await memberPage.getByTestId('ai-composer').press('Enter');
  await expect(
    memberPage.getByText(
      "You've reached your AI limit for this month ($0.01). Ask an admin to raise it.",
    ),
  ).toBeVisible({ timeout: 10_000 });

  await page.goto('/admin?tab=ai');
  await expect(page.getByTestId('ai-usage')).toBeVisible();
  await expect(page.getByTestId('ai-usage')).toContainText('Cost Member');
  await expect(page.getByTestId('ai-usage')).toContainText('1 blocked');
  await axeCheck(page, 'admin ai usage');

  const routing = page.getByTestId('ai-routing');
  await routing.getByLabel('Tier for Writing help').click();
  await page.getByRole('menuitemradio', { name: 'Strong' }).click();
  await page.getByRole('button', { name: 'Save routing' }).click();
  await page.reload();
  await expect(page.getByTestId('ai-routing').getByLabel('Tier for Writing help')).toContainText(
    'Strong',
  );
  expect(owner.email).toBeTruthy();
  await context.close();
});
