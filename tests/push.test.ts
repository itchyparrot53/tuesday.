import { describe, expect, test } from 'vitest';
import { H, createSpace, createTestApp, setupOwner } from './helpers';
import { runOnce } from '../server/jobs/worker';
import { JOB_HANDLERS } from '../server/jobs/handlers';

async function fixture() {
  const app = await createTestApp({ config: { pushFake: true } });
  const owner = await setupOwner(app);
  const space = await createSpace(app, owner.cookie);
  const key = await app.inject({
    method: 'GET',
    url: '/api/push/key',
    headers: { cookie: owner.cookie },
  });
  const subscribe = await app.inject({
    method: 'POST',
    url: '/api/push/subscriptions',
    headers: { ...H, cookie: owner.cookie },
    payload: {
      endpoint: 'https://push.example.test/abc',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    },
  });
  expect(subscribe.statusCode).toBe(201);
  return { app, owner, space, publicKey: key.json().publicKey };
}

describe('push notifications', () => {
  test('VAPID keys persist and the private key is never returned', async () => {
    const app = await createTestApp({ config: { pushFake: true } });
    const { cookie } = await setupOwner(app);
    const first = await app.inject({
      method: 'GET',
      url: '/api/push/key',
      headers: { cookie },
    });
    const second = await app.inject({
      method: 'GET',
      url: '/api/push/key',
      headers: { cookie },
    });
    expect(first.json().publicKey).toBe(second.json().publicKey);
    expect(JSON.stringify(first.json())).not.toContain('private');
    const row = app.db.prepare("SELECT value FROM settings WHERE key = 'push:vapid'").get();
    expect(row).toBeTruthy();
    await app.close();
  });

  test('a mention pushes once when the pref is on and never when off', async () => {
    const { app, owner, space } = await fixture();
    const { notify } = await import('../server/services/notifications');
    notify(app.db, {
      userId: owner.user.id,
      workspaceId: space.id as number,
      kind: 'mention',
      title: 'You were mentioned',
      body: 'please review',
      link: '/boards/1?item=1',
      actorId: null,
    });
    await runOnce(app, JOB_HANDLERS);
    await runOnce(app, JOB_HANDLERS);
    const outbox = await app.inject({
      method: 'GET',
      url: '/api/admin/push/outbox',
      headers: { cookie: owner.cookie },
    });
    expect(outbox.json().messages).toHaveLength(1);
    expect(outbox.json().messages[0].payload).toMatchObject({
      title: 'You were mentioned',
      url: '/boards/1?item=1',
    });
    app.db
      .prepare('UPDATE users SET notification_prefs = ? WHERE id = ?')
      .run(JSON.stringify({ push: { mention: false } }), owner.user.id);
    notify(app.db, {
      userId: owner.user.id,
      workspaceId: space.id as number,
      kind: 'mention',
      title: 'Second',
      body: '',
      link: '/x',
      actorId: null,
    });
    expect(
      (
        app.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind = 'push_send'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
    await app.close();
  });

  test('subscriptions are per user and can be removed', async () => {
    const { app, owner } = await fixture();
    const other = await app.inject({
      method: 'POST',
      url: '/api/push/subscriptions',
      headers: H,
      payload: { endpoint: 'https://push.example.test/abc', keys: { p256dh: 'x', auth: 'y' } },
    });
    expect(other.statusCode).toBe(401);
    const remove = await app.inject({
      method: 'DELETE',
      url: '/api/push/subscriptions',
      headers: { ...H, cookie: owner.cookie },
      payload: { endpoint: 'https://push.example.test/abc' },
    });
    expect(remove.statusCode).toBe(204);
    await app.close();
  });
});
