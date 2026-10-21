import { describe, expect, test } from 'vitest';
import { H, createSpace, createTestApp, setupOwner } from './helpers';
import { getNotificationPrefs } from '../server/services/notify-prefs';
import { DEFAULT_NOTIFICATION_PREFS } from '../shared/types';

describe('notification preferences', () => {
  test('defaults are returned for a fresh user', async () => {
    const app = await createTestApp();
    const { user } = await setupOwner(app);
    expect(getNotificationPrefs(app.db, user.id)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    const response = await app.inject({
      method: 'GET',
      url: '/api/me/notification-prefs',
      headers: {
        cookie: (
          await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            headers: H,
            payload: { email: 'owner@acme.test', password: 'password123' },
          })
        ).headers['set-cookie'] as string,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().email.mention).toBe('instant');
    await app.close();
  });

  test('partial saves merge and invalid hours are rejected', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const first = await app.inject({
      method: 'PUT',
      url: '/api/me/notification-prefs',
      headers: { ...H, cookie },
      payload: { email: { mention: 'off' } },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().email.mention).toBe('off');
    expect(first.json().email.assigned).toBe('instant');
    const second = await app.inject({
      method: 'PUT',
      url: '/api/me/notification-prefs',
      headers: { ...H, cookie },
      payload: { digest: { hour: 9 } },
    });
    expect(second.json().digest).toEqual({ enabled: true, hour: 9, weekdaysOnly: true });
    expect(second.json().email.mention).toBe('off');
    const invalid = await app.inject({
      method: 'PUT',
      url: '/api/me/notification-prefs',
      headers: { ...H, cookie },
      payload: { digest: { hour: 24 } },
    });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });
});

describe('instant notification emails', () => {
  test('a mention sends one batched email and marks it emailed', async () => {
    const previous = process.env.MAIL_FAKE;
    process.env.MAIL_FAKE = 'true';
    const app = await createTestApp({ config: { mailFake: true } });
    const { user, cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const { notify } = await import('../server/services/notifications');
    notify(app.db, {
      userId: user.id,
      workspaceId: space.id as number,
      kind: 'mention',
      title: 'You were mentioned',
      body: 'please review',
      link: '/boards/1?item=1',
      actorId: null,
    });
    const { runOnce } = await import('../server/jobs/worker');
    const { JOB_HANDLERS } = await import('../server/jobs/handlers');
    app.db
      .prepare("UPDATE jobs SET run_after = ? WHERE kind = 'email_notification'")
      .run(new Date().toISOString());
    await runOnce(app, JOB_HANDLERS);
    await runOnce(app, JOB_HANDLERS);
    expect(
      app.mailer.outbox.filter((mail: { subject: string }) => mail.subject.includes('mentioned'))
        .length,
    ).toBe(1);
    const row = app.db.prepare('SELECT emailed_at FROM notifications LIMIT 1').get() as {
      emailed_at: string | null;
    };
    expect(row.emailed_at).toBeTruthy();
    process.env.MAIL_FAKE = previous;
    await app.close();
  });

  test('read notifications and off preferences send nothing', async () => {
    const previous = process.env.MAIL_FAKE;
    process.env.MAIL_FAKE = 'true';
    const app = await createTestApp({ config: { mailFake: true } });
    const { user } = await setupOwner(app);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: 'owner@acme.test', password: 'password123' },
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const space = await createSpace(app, cookie);
    const { notify } = await import('../server/services/notifications');
    notify(app.db, {
      userId: user.id,
      workspaceId: space.id as number,
      kind: 'mention',
      title: 'Read already',
      link: '/x',
      actorId: null,
    });
    app.db.prepare('UPDATE notifications SET read_at = ?').run(new Date().toISOString());
    const { runOnce } = await import('../server/jobs/worker');
    const { JOB_HANDLERS } = await import('../server/jobs/handlers');
    await runOnce(app, JOB_HANDLERS);
    expect(app.mailer.outbox).toHaveLength(0);
    app.db
      .prepare('UPDATE users SET notification_prefs = ? WHERE id = ?')
      .run(JSON.stringify({ email: { mention: 'off' } }), user.id);
    notify(app.db, {
      userId: user.id,
      workspaceId: space.id as number,
      kind: 'mention',
      title: 'Off',
      link: '/x',
      actorId: null,
    });
    app.db.prepare("DELETE FROM jobs WHERE kind = 'email_notification'").run();
    notify(app.db, {
      userId: user.id,
      workspaceId: space.id as number,
      kind: 'mention',
      title: 'Off again',
      link: '/x',
      actorId: null,
    });
    expect(
      (
        app.db
          .prepare("SELECT count(*) AS n FROM jobs WHERE kind = 'email_notification'")
          .get() as { n: number }
      ).n,
    ).toBe(0);
    process.env.MAIL_FAKE = previous;
    await app.close();
  });
});
