import { describe, expect, test } from 'vitest';
import { H, createTestApp, inviteAndJoin, setupOwner } from './helpers';
import { runOnce } from '../server/jobs/worker';
import { JOB_HANDLERS } from '../server/jobs/handlers';

async function fixture() {
  const app = await createTestApp({ config: { mailFake: true } });
  const owner = await setupOwner(app);
  const member = await inviteAndJoin(app, owner.cookie, 'member', 'reset@acme.test');
  return { app, owner, member };
}

async function lastResetLink(app: any): Promise<string> {
  await runOnce(app, JOB_HANDLERS);
  const mail = app.mailer.outbox
    .filter((entry: { subject: string }) => entry.subject.includes('Reset your Tuesday password'))
    .at(-1);
  expect(mail).toBeTruthy();
  const match = String(mail.text).match(/https?:\/\/\S+/);
  expect(match).toBeTruthy();
  return match![0];
}

describe('password reset', () => {
  test('forgot for an unknown email returns 202 and sends nothing', async () => {
    const { app } = await fixture();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot',
      headers: H,
      payload: { email: 'nobody@acme.test' },
    });
    expect(response.statusCode).toBe(202);
    await runOnce(app, JOB_HANDLERS);
    expect(
      app.mailer.outbox.filter((entry: { subject: string }) => entry.subject.includes('Reset')),
    ).toHaveLength(0);
    await app.close();
  });

  test('a known user gets a single-use link that resets the password', async () => {
    const { app, member } = await fixture();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot',
      headers: H,
      payload: { email: 'reset@acme.test' },
    });
    expect(response.statusCode).toBe(202);
    const link = await lastResetLink(app);
    const token = link.split('/').pop()!;
    const info = await app.inject({ method: 'GET', url: `/api/auth/reset/${token}` });
    expect(info.statusCode).toBe(200);
    expect(info.json().email).toBe('r***@acme.test');

    const reset = await app.inject({
      method: 'POST',
      url: '/api/auth/reset',
      headers: H,
      payload: { token, password: 'newpassword123' },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().user.id).toBe(member.user.id);
    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/reset',
      headers: H,
      payload: { token, password: 'anotherpass123' },
    });
    expect(again.statusCode).toBe(410);

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: 'reset@acme.test', password: 'newpassword123' },
    });
    expect(login.statusCode).toBe(200);
    await app.close();
  });

  test('expired links are 410 and SSO-only users get no email', async () => {
    const { app } = await fixture();
    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot',
      headers: H,
      payload: { email: 'reset@acme.test' },
    });
    const link = await lastResetLink(app);
    const token = link.split('/').pop()!;
    app.db.prepare("UPDATE password_resets SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    const expired = await app.inject({
      method: 'POST',
      url: '/api/auth/reset',
      headers: H,
      payload: { token, password: 'newpassword123' },
    });
    expect(expired.statusCode).toBe(410);

    app.db.prepare("UPDATE users SET password_hash = '!sso' WHERE email = 'reset@acme.test'").run();
    const before = app.mailer.outbox.length;
    await app.inject({
      method: 'POST',
      url: '/api/auth/forgot',
      headers: H,
      payload: { email: 'reset@acme.test' },
    });
    await runOnce(app, JOB_HANDLERS);
    expect(app.mailer.outbox.length).toBe(before);
    await app.close();
  });

  test('admin reset links work and non-admins are refused', async () => {
    const { app, owner, member } = await fixture();
    const admin = await app.inject({
      method: 'POST',
      url: `/api/users/${member.user.id}/reset-link`,
      headers: { ...H, cookie: owner.cookie },
    });
    expect(admin.statusCode).toBe(201);
    expect(admin.json().link).toContain('/reset-password/');
    const forbidden = await app.inject({
      method: 'POST',
      url: `/api/users/${owner.user.id}/reset-link`,
      headers: { ...H, cookie: member.cookie },
    });
    expect(forbidden.statusCode).toBe(403);
    await app.close();
  });
});
