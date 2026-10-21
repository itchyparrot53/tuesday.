import { expect, test } from '@playwright/test';
import { axeCheck } from './design';
import { H, OWNER, signIn } from './helpers';

test('security: audit entries, CSV export, session revoke and SSO button', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.request.post('/api/auth/logout', { headers: H });
  await page.request.post('/api/auth/login', {
    headers: H,
    data: { email: OWNER.email, password: 'wrong-password' },
  });
  await page.request.post('/api/auth/login', {
    headers: H,
    data: { email: OWNER.email, password: OWNER.password },
  });

  await page.goto('/admin?tab=audit');
  await expect(page.getByTestId('admin-audit')).toBeVisible();
  await page.getByLabel('Action group').click();
  await page.getByRole('menuitemradio', { name: 'Sign-in' }).click();
  await expect(page.getByTestId('audit-row').first()).toBeVisible();
  await expect(
    page.getByTestId('audit-row').filter({ hasText: 'auth.login' }).first(),
  ).toBeVisible();
  await axeCheck(page, 'admin audit');

  const csv = await page.request.get('/api/admin/audit.csv?action=auth.');
  expect(csv.status()).toBe(200);
  expect((await csv.text()).split('\n')[0]).toBe('time,actor,action,target,ip,user_agent,data');

  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.goto('http://localhost:3200/login');
  await second.getByLabel('Email').fill(OWNER.email);
  await second.getByLabel('Password').fill(OWNER.password);
  await second.getByRole('button', { name: 'Sign in' }).click();
  await expect(second).toHaveURL(/\/$/);

  await page.goto('/profile?tab=security');
  await expect(page.getByTestId('sessions-list')).toBeVisible();
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByTestId('sessions-revoke').click();
  const me = await second.request.get('/api/auth/me');
  expect(me.status()).toBe(401);

  await page.request.post('/api/auth/logout', { headers: H });
  await page.route('**/api/auth/state', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        needsSetup: false,
        orgName: 'Studio',
        sso: { enabled: true, label: 'Sign in with SSO', only: false },
        mail: true,
      }),
    });
  });
  await page.goto('/login');
  await expect(page.getByTestId('login-sso')).toBeVisible();
  await axeCheck(page, 'login sso');

  await secondContext.close();
});
