import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';

describe('audit log', () => {
  test('login failures and successes are recorded without secrets', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: 'owner@acme.test', password: 'wrong-password' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: 'owner@acme.test', password: 'password123' },
    });
    const failed = app.db
      .prepare("SELECT * FROM audit_log WHERE action = 'auth.login_failed'")
      .get() as { actor_id: number | null; target_label: string };
    expect(failed.actor_id).toBeNull();
    expect(failed.target_label).toBe('owner@acme.test');
    expect(
      app.db.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'auth.login'").get(),
    ).toMatchObject({ n: 1 });
    const rows = app.db.prepare('SELECT data FROM audit_log').all() as { data: string }[];
    expect(rows.every((row) => !row.data.includes('password123'))).toBe(true);
    expect(owner.user.email).toBe('owner@acme.test');
    await app.close();
  });

  test('role changes, board sharing and CSV export are recorded', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const member = await inviteAndJoin(app, owner.cookie, 'member', 'audit-member@acme.test');
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number);
    await app.inject({
      method: 'PUT',
      url: `/api/boards/${board.board.id}/members/${member.user.id}`,
      headers: { ...H, cookie: owner.cookie },
      payload: { access: 'edit' },
    });
    await app.inject({
      method: 'PUT',
      url: `/api/boards/${board.board.id}/members/${member.user.id}`,
      headers: { ...H, cookie: owner.cookie },
      payload: { access: 'comment' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/users/${member.user.id}`,
      headers: { ...H, cookie: owner.cookie },
      payload: { role: 'admin' },
    });
    expect(
      (
        app.db
          .prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'user.role_changed'")
          .get() as { n: number }
      ).n,
    ).toBe(1);
    expect(
      (
        app.db
          .prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'board.member_added'")
          .get() as { n: number }
      ).n,
    ).toBe(1);
    expect(
      (
        app.db
          .prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'board.member_changed'")
          .get() as { n: number }
      ).n,
    ).toBe(1);
    const csv = await app.inject({
      method: 'GET',
      url: '/api/admin/audit.csv',
      headers: { cookie: owner.cookie },
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.body.split('\n')[0]).toBe('time,actor,action,target,ip,user_agent,data');
    const spaceToDelete = await createSpace(app, owner.cookie, 'Audit delete');
    await app.inject({
      method: 'DELETE',
      url: `/api/workspaces/${spaceToDelete.id}`,
      headers: { ...H, cookie: owner.cookie },
    });
    expect(
      (
        app.db
          .prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'workspace.deleted'")
          .get() as { n: number }
      ).n,
    ).toBe(1);
    const viewer = await inviteAndJoin(app, owner.cookie, 'viewer', 'audit-viewer@acme.test');
    const viewerDenied = await app.inject({
      method: 'GET',
      url: '/api/admin/audit',
      headers: { cookie: viewer.cookie },
    });
    expect(viewerDenied.statusCode).toBe(403);
    await app.close();
  });

  test('purge removes rows older than 365 days only', async () => {
    const app = await createTestApp();
    await setupOwner(app);
    app.db
      .prepare(
        `INSERT INTO audit_log (actor_label, action, created_at) VALUES ('System', 'old', '2000-01-01T00:00:00.000Z')`,
      )
      .run();
    const { tickOnce } = await import('../server/jobs/scheduler');
    tickOnce(app, new Date('2026-10-19T02:05:00.000Z'));
    expect(
      app.db.prepare("SELECT count(*) AS n FROM audit_log WHERE action = 'old'").get(),
    ).toMatchObject({ n: 0 });
    await app.close();
  });
});

describe('sessions', () => {
  test('lists sessions without tokens and revokes the others', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: 'owner@acme.test', password: 'password123' },
    });
    const secondCookie = String(second.headers['set-cookie']).split(';')[0];
    const list = await app.inject({
      method: 'GET',
      url: '/api/me/sessions',
      headers: { cookie: owner.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().sessions).toHaveLength(2);
    const current = list.json().sessions.find((session: { current: boolean }) => session.current);
    expect(current).toBeTruthy();
    expect(JSON.stringify(list.json())).not.toContain(owner.cookie.split('=')[1]);
    const revoke = await app.inject({
      method: 'DELETE',
      url: '/api/me/sessions/others',
      headers: { ...H, cookie: owner.cookie },
    });
    expect(revoke.statusCode).toBe(204);
    const after = await app.inject({
      method: 'GET',
      url: '/api/me/sessions',
      headers: { cookie: owner.cookie },
    });
    expect(after.json().sessions).toHaveLength(1);
    const denied = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: secondCookie },
    });
    expect(denied.statusCode).toBe(401);
    await app.close();
  });
});
