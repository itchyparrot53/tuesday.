import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, OWNER, signIn } from './helpers';

test('email: test send, invite, password reset and mention preferences', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await signIn(page);

  await page.goto('/admin?tab=email');
  await expect(page.getByTestId('admin-email')).toBeVisible();
  await page.getByTestId('email-test').click();
  await expect
    .poll(async () => {
      await page.request.post('/api/admin/jobs/run-due', { headers: H });
      const outbox = await (await page.request.get('/api/admin/email/outbox')).json();
      return outbox.messages.some(
        (mail: { subject: string }) => mail.subject === 'Tuesday test email',
      );
    })
    .toBe(true);
  await expect(page.getByTestId('email-log-row').first()).toContainText('sent');
  await axeCheck(page, 'admin email');

  const email = `teammate-${Date.now()}@example.test`;
  await page.goto('/admin?tab=invites');
  await page.getByLabel('Email (optional)').fill(email);
  await page.getByRole('button', { name: 'Create invite' }).click();
  await expect(page.getByTestId('invite-status').first()).toContainText('Emailed');
  await page.request.post('/api/admin/jobs/run-due', { headers: H });
  const outbox = await (await page.request.get('/api/admin/email/outbox')).json();
  const invite = outbox.messages.find(
    (mail: { to: string; subject: string }) =>
      mail.to === email && mail.subject.includes('invited you to'),
  );
  expect(invite).toBeTruthy();
  const link = String(invite.text).match(/https?:\/\/\S+/)?.[0] ?? '';
  expect(link).toContain('/invite/');

  const teammateContext = await browser.newContext();
  const teammate = await teammateContext.newPage();
  await teammate.goto(link);
  await teammate.getByLabel('Your name').fill('Email Teammate');
  await teammate.getByLabel('Password').fill('password123');
  await teammate.getByRole('button', { name: /Join/ }).click();
  await expect(teammate).toHaveURL(/\/$/);

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/If an account exists/)).toBeVisible();
  await page.request.post('/api/admin/jobs/run-due', { headers: H });
  const afterReset = await (await page.request.get('/api/admin/email/outbox')).json();
  const resetMail = afterReset.messages.find(
    (mail: { subject: string }) => mail.subject === 'Reset your Tuesday password',
  );
  expect(resetMail).toBeTruthy();
  const resetLink = String(resetMail.text).match(/https?:\/\/\S+/)?.[0] ?? '';
  await teammate.goto(resetLink);
  await teammate.getByLabel('New password').fill('password456');
  await teammate.getByLabel('Confirm password').fill('password456');
  await teammate.getByRole('button', { name: 'Set new password' }).click();
  await expect(teammate).toHaveURL(/\/$/);

  await teammate.goto('/profile?tab=notifications');
  await teammate.getByTestId('notify-pref').filter({ hasText: 'Off' }).first().click();
  await axeCheck(teammate, 'profile notifications');

  const before = (await (await page.request.get('/api/admin/email/outbox')).json()).messages.length;
  const me = await (await page.request.get('/api/auth/me')).json();
  const users = await (await page.request.get('/api/users')).json();
  const teammateUser = users.users.find((user: { email: string }) => user.email === email);
  await page.request.post('/api/items/1/updates', {
    headers: H,
    data: { body: `@[${teammateUser.name}](user:${teammateUser.id}) hello` },
  });
  await page.request.post('/api/admin/jobs/run-due', { headers: H });
  const after = (await (await page.request.get('/api/admin/email/outbox')).json()).messages.length;
  expect(after).toBe(before);
  expect(me.user.email).toBe(OWNER.email);
  await teammateContext.close();
});
