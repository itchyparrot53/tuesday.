import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';
import { boardAccess } from '../server/services/permissions';
import { runTool } from '../server/ai/tools';
import { listUsers } from '../server/services/users';
import { buildAttachedContext } from '../server/ai/context';
import { getHome } from '../server/services/home';
import { getMyWork } from '../server/services/mywork';
import { search } from '../server/services/search';
import { notify } from '../server/services/notifications';

async function fixture() {
  const app = await createTestApp();
  const owner = await setupOwner(app);
  const space = await createSpace(app, owner.cookie, 'Studio');
  const a = await createBoard(app, owner.cookie, space.id as number, 'Board A');
  const b = await createBoard(app, owner.cookie, space.id as number, 'Board B');
  app.db.prepare('UPDATE boards SET is_private = 1 WHERE id = ?').run(b.board.id);
  const m1 = await inviteAndJoin(app, owner.cookie, 'member', 'm1@acme.test');
  const m2 = await inviteAndJoin(app, owner.cookie, 'member', 'm2@acme.test');
  const viewer = await inviteAndJoin(app, owner.cookie, 'viewer', 'viewer@acme.test');
  app.db
    .prepare(
      `INSERT INTO users (email, name, password_hash, role, title, color, is_active, created_at, is_guest)
       VALUES ('guest@acme.test', 'Guest', 'x', 'member', '', '#9CA3AF', 1, ?, 1)`,
    )
    .run(new Date().toISOString());
  const guestRow = app.db.prepare("SELECT * FROM users WHERE email = 'guest@acme.test'").get() as {
    id: number;
  };
  const guest = listUsers(app.db).find((user) => user.id === guestRow.id)!;
  app.db
    .prepare(
      'INSERT INTO board_members (board_id, user_id, access, added_by, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(a.board.id, guest.id, 'edit', owner.user.id, new Date().toISOString());
  app.db
    .prepare(
      'INSERT INTO board_members (board_id, user_id, access, added_by, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(b.board.id, m2.user.id, 'view', owner.user.id, new Date().toISOString());

  const people = (a.columns as { id: number; type: string }[]).find(
    (column) => column.type === 'people',
  )!;
  for (const [name, board] of [
    ['A open', a],
    ['B hidden', b],
  ] as const) {
    await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie: owner.cookie },
      payload: {
        groupId: board.groups[0].id,
        name,
        values: { [String(people.id)]: { userIds: [m1.user.id, m2.user.id] } },
      },
    });
  }
  return { app, owner, m1, m2, viewer, guest, a, b };
}

describe('guests and private boards', () => {
  test('guest and member access across board data', async () => {
    const f = await fixture();
    const users = listUsers(f.app.db);
    const names = new Map(users.map((user) => [user.id, user.name]));

    expect(boardAccess(f.app.db, f.m1.user, f.a.board.id)).toBe('manage');
    expect(boardAccess(f.app.db, f.m1.user, f.b.board.id)).toBe('none');
    expect(boardAccess(f.app.db, f.m2.user, f.b.board.id)).toBe('view');
    expect(boardAccess(f.app.db, f.viewer.user, f.a.board.id)).toBe('view');
    expect(boardAccess(f.app.db, f.guest, f.a.board.id)).toBe('edit');
    expect(boardAccess(f.app.db, f.guest, f.b.board.id)).toBe('none');

    const memberBoardA = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.a.board.id}`,
      headers: { cookie: f.m1.cookie },
    });
    expect(memberBoardA.statusCode).toBe(200);
    expect(memberBoardA.json().board.myAccess).toBe('manage');
    const memberBoardB = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.b.board.id}`,
      headers: { cookie: f.m1.cookie },
    });
    expect(memberBoardB.statusCode).toBe(404);

    const myWork = getMyWork(f.app.db, f.m1.user);
    expect(myWork.some((entry) => entry.board.id === f.a.board.id)).toBe(true);
    expect(myWork.some((entry) => entry.board.id === f.b.board.id)).toBe(false);

    const results = search(f.app.db, f.m1.user, 'hidden');
    expect(results.items.some((hit) => hit.boardId === f.b.board.id)).toBe(false);
    const visible = search(f.app.db, f.m1.user, 'open');
    expect(visible.items.some((hit) => hit.boardId === f.a.board.id)).toBe(true);

    const home = getHome(f.app.db, f.m1.user);
    expect(home.boards.every((board) => board.id !== f.b.board.id)).toBe(true);

    const ctx = { db: f.app.db, user: f.m1.user, users };
    const found = runTool('find_items', JSON.stringify({ query: 'hidden' }), ctx);
    expect(found.ok).toBe(true);
    expect((found.result as unknown[]).length).toBe(0);
    expect(
      buildAttachedContext(f.app, f.m1.user, { boardIds: [f.b.board.id], itemIds: [], docIds: [] }),
    ).toBe('');
    expect(
      buildAttachedContext(f.app, f.m1.user, { boardIds: [f.a.board.id], itemIds: [], docIds: [] }),
    ).toContain('Board A');

    notify(f.app.db, {
      userId: f.m1.user.id,
      workspaceId: f.a.board.workspaceId,
      boardId: f.b.board.id,
      kind: 'mention',
      title: 'Hidden mention',
      link: '/boards/x',
      actorId: f.owner.user.id,
    });
    expect(
      (
        f.app.db
          .prepare('SELECT count(*) AS n FROM notifications WHERE title = ?')
          .get('Hidden mention') as { n: number }
      ).n,
    ).toBe(0);

    const guestCreateA = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.a.board.id}/items`,
      headers: { ...H, cookie: f.guest.id ? '' : '' },
      payload: { groupId: f.a.groups[0].id, name: 'Guest item' },
    });
    expect(guestCreateA.statusCode).toBe(401);

    const viewerCreate = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.a.board.id}/items`,
      headers: { ...H, cookie: f.viewer.cookie },
      payload: { groupId: f.a.groups[0].id, name: 'Viewer item' },
    });
    expect(viewerCreate.statusCode).toBe(403);

    const memberCreateB = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.b.board.id}/items`,
      headers: { ...H, cookie: f.m2.cookie },
      payload: { groupId: f.b.groups[0].id, name: 'Read only item' },
    });
    expect(memberCreateB.statusCode).toBe(403);

    const columnB = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.b.board.id}/columns`,
      headers: { ...H, cookie: f.m2.cookie },
      payload: { title: 'Nope', type: 'text' },
    });
    expect(columnB.statusCode).toBe(403);

    const guestWorkspaces = await f.app.inject({
      method: 'GET',
      url: '/api/workspaces',
      headers: { cookie: f.guest.id ? '' : '' },
    });
    expect(guestWorkspaces.statusCode).toBe(401);
    expect(names.size).toBeGreaterThan(0);

    await f.app.close();
  });
});

describe('sharing', () => {
  test('privacy hides a board and adding a row restores access', async () => {
    const f = await fixture();
    const privacy = await f.app.inject({
      method: 'PATCH',
      url: `/api/boards/${f.a.board.id}/privacy`,
      headers: { ...H, cookie: f.owner.cookie },
      payload: { isPrivate: true },
    });
    expect(privacy.statusCode).toBe(200);
    expect(privacy.json().board.isPrivate).toBe(true);
    const hidden = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.a.board.id}`,
      headers: { cookie: f.m1.cookie },
    });
    expect(hidden.statusCode).toBe(404);
    const added = await f.app.inject({
      method: 'PUT',
      url: `/api/boards/${f.a.board.id}/members/${f.m1.user.id}`,
      headers: { ...H, cookie: f.owner.cookie },
      payload: { access: 'view' },
    });
    expect(added.statusCode).toBe(200);
    const restored = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.a.board.id}`,
      headers: { cookie: f.m1.cookie },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().board.myAccess).toBe('view');
    await f.app.close();
  });

  test('a guest invite carries board access and is emailed', async () => {
    const app = await createTestApp({ config: { mailFake: true } });
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number, 'Shared board');
    const response = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/guests`,
      headers: { ...H, cookie: owner.cookie },
      payload: { email: 'guest@example.test', access: 'edit' },
    });
    expect(response.statusCode).toBe(201);
    const invite = app.db
      .prepare("SELECT * FROM invites WHERE email = 'guest@example.test'")
      .get() as {
      is_guest: number;
      board_access: string;
    };
    expect(invite.is_guest).toBe(1);
    expect(JSON.parse(invite.board_access)).toEqual([{ boardId: board.board.id, access: 'edit' }]);
    await app.close();
  });
});

describe('guest invite acceptance', () => {
  test('a guest joins with board rows and sees only those boards', async () => {
    const app = await createTestApp({ config: { mailFake: true } });
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number, 'Guest board');
    const inviteResponse = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/guests`,
      headers: { ...H, cookie: owner.cookie },
      payload: { email: 'outside@example.test', access: 'edit' },
    });
    expect(inviteResponse.statusCode).toBe(201);
    const token = inviteResponse.json().invite.token as string;
    const info = await app.inject({ method: 'GET', url: `/api/invites/${token}` });
    expect(info.json().boardNames).toEqual(['Guest board']);
    const joined = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: H,
      payload: {
        token,
        name: 'Outside Guest',
        email: 'outside@example.test',
        password: 'password123',
      },
    });
    expect(joined.statusCode).toBe(201);
    expect(joined.json().user.isGuest).toBe(true);
    const cookie = String(joined.headers['set-cookie']).split(';')[0];
    const shared = await app.inject({
      method: 'GET',
      url: '/api/me/shared-boards',
      headers: { cookie },
    });
    expect(shared.json().boards.map((entry: { id: number }) => entry.id)).toEqual([board.board.id]);
    const workspaces = await app.inject({
      method: 'GET',
      url: '/api/workspaces',
      headers: { cookie },
    });
    expect(workspaces.json().workspaces).toEqual([]);
    const users = await app.inject({ method: 'GET', url: '/api/users', headers: { cookie } });
    expect(users.json().users.every((user: { email: string }) => user.email === '')).toBe(true);
    const create = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: { ...H, cookie },
      payload: { name: 'No' },
    });
    expect(create.statusCode).toBe(403);
    const createBoardAttempt = await app.inject({
      method: 'POST',
      url: '/api/boards',
      headers: { ...H, cookie },
      payload: { workspaceId: board.board.workspaceId, name: 'No' },
    });
    expect(createBoardAttempt.statusCode).toBe(403);
    await app.close();
  });
});
