import { describe, expect, test } from 'vitest';
import { H, cookieFrom, createSpace, createTestApp, setupOwner } from './helpers';
import { runTool, type ToolContext } from '../server/ai/tools';
import { listUsers } from '../server/services/users';

describe('Part 1 audit regressions', () => {
  test('audit A1: concurrent setup creates exactly one owner', async () => {
    const app = await createTestApp();
    const attempt = (email: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        headers: H,
        payload: {
          orgName: 'Race Org',
          name: 'Race Owner',
          email,
          password: 'password123',
        },
      });
    const results = await Promise.all([attempt('race1@acme.test'), attempt('race2@acme.test')]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 409]);
    expect((app.db.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n).toBe(1);
    await app.close();
  });

  test('audit A2: an invite token can only be accepted once under concurrency', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const invite = await app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { ...H, cookie },
      payload: { role: 'member' },
    });
    const token = invite.json().invite.token as string;
    const accept = (email: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/accept-invite',
        headers: H,
        payload: { token, name: email.split('@')[0], email, password: 'password123' },
      });
    const results = await Promise.all([accept('one@acme.test'), accept('two@acme.test')]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 410]);
    expect((app.db.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n).toBe(2);
    const row = app.db.prepare('SELECT used_at FROM invites WHERE token = ?').get(token) as {
      used_at: string | null;
    };
    expect(row.used_at).toBeTruthy();
    await app.close();
  });

  test('audit A3: the assistant create_board tool rejects an invalid draft', async () => {
    const app = await createTestApp();
    const { cookie, user } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const ctx: ToolContext = { db: app.db, user, users: listUsers(app.db) };
    const before = (app.db.prepare('SELECT count(*) AS n FROM boards').get() as { n: number }).n;
    const result = runTool(
      'create_board',
      JSON.stringify({
        workspaceId: space.id,
        draft: {
          name: 'Bad board',
          description: '',
          columns: [{ title: 'Bad', type: 'sql' }],
          groups: [{ title: 'Group' }],
          items: [],
        },
      }),
      ctx,
    );
    expect(result.ok).toBe(false);
    const after = (app.db.prepare('SELECT count(*) AS n FROM boards').get() as { n: number }).n;
    expect(after).toBe(before);
    await app.close();
  });
});
