import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';
import { boardAccess, boardAccessMap, assertBoardAccess } from '../server/services/permissions';
import { inviteAndJoin as join } from './helpers';
import type { User } from '../shared/types';

async function fixture() {
  const app = await createTestApp();
  const owner = await setupOwner(app);
  const space = await createSpace(app, owner.cookie, 'Public');
  const a = await createBoard(app, owner.cookie, space.id as number, 'A public');
  const b = await createBoard(app, owner.cookie, space.id as number, 'B private');
  app.db.prepare('UPDATE boards SET is_private = 1 WHERE id = ?').run(b.board.id);
  const m1 = await join(app, owner.cookie, 'member', 'm1@acme.test');
  const m2 = await join(app, owner.cookie, 'member', 'm2@acme.test');
  const viewer = await join(app, owner.cookie, 'viewer', 'v@acme.test');
  app.db
    .prepare(
      `INSERT INTO users (email, name, password_hash, role, title, color, is_active, created_at, is_guest)
       VALUES ('guest@acme.test', 'Guest', 'x', 'member', '', '#9CA3AF', 1, ?, 1)`,
    )
    .run(new Date().toISOString());
  const guest = app.db.prepare("SELECT * FROM users WHERE email = 'guest@acme.test'").get() as {
    id: number;
  };
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
  const privateSpace = await createSpace(app, owner.cookie, 'Private', { isPrivate: true });
  const c = await createBoard(app, owner.cookie, privateSpace.id as number, 'C private workspace');
  app.db
    .prepare(
      'INSERT INTO board_members (board_id, user_id, access, added_by, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(c.board.id, m2.user.id, 'view', owner.user.id, new Date().toISOString());
  return { app, owner, m1, m2, viewer, guest, a, b, c };
}

function userOf(app: any, id: number): User {
  const row = app.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    (Record<string, unknown> & { is_guest?: number }) | undefined;
  if (!row) throw new Error(`No user ${id}`);
  return { ...row, isGuest: Boolean(row.is_guest) } as unknown as User;
}

describe('board access table', () => {
  test('owner and admin manage every board', async () => {
    const f = await fixture();
    expect(boardAccess(f.app.db, f.owner.user, f.b.board.id)).toBe('manage');
    await f.app.close();
  });

  test('a member creator manages their own board', async () => {
    const f = await fixture();
    const own = await createBoard(f.app, f.m1.cookie, 1, 'Own board');
    expect(boardAccess(f.app.db, f.m1.user, own.board.id)).toBe('manage');
    await f.app.close();
  });

  test('member on a public readable board gets manage', async () => {
    const f = await fixture();
    expect(boardAccess(f.app.db, f.m1.user, f.a.board.id)).toBe('manage');
    await f.app.close();
  });

  test('member on a private board gets the row access or none', async () => {
    const f = await fixture();
    expect(boardAccess(f.app.db, f.m2.user, f.b.board.id)).toBe('view');
    expect(boardAccess(f.app.db, f.m1.user, f.b.board.id)).toBe('none');
    await f.app.close();
  });

  test('viewer on a public board gets view', async () => {
    const f = await fixture();
    expect(boardAccess(f.app.db, f.viewer.user, f.a.board.id)).toBe('view');
    await f.app.close();
  });

  test('private workspace row is capped by the role', async () => {
    const f = await fixture();
    expect(boardAccess(f.app.db, f.m2.user, f.c.board.id)).toBe('view');
    expect(boardAccess(f.app.db, f.m1.user, f.c.board.id)).toBe('none');
    await f.app.close();
  });

  test('guest gets at most edit and none without a row', async () => {
    const f = await fixture();
    const guest = userOf(f.app, f.guest.id);
    expect(boardAccess(f.app.db, guest, f.a.board.id)).toBe('edit');
    expect(boardAccess(f.app.db, guest, f.b.board.id)).toBe('none');
    await f.app.close();
  });

  test('archived boards are invisible', async () => {
    const f = await fixture();
    f.app.db
      .prepare('UPDATE boards SET archived_at = ? WHERE id = ?')
      .run(new Date().toISOString(), f.a.board.id);
    expect(boardAccess(f.app.db, f.owner.user, f.a.board.id)).toBe('none');
    await f.app.close();
  });

  test('boardAccessMap agrees with boardAccess for each user type', async () => {
    const f = await fixture();
    for (const principal of [
      f.owner.user,
      f.m1.user,
      f.m2.user,
      f.viewer.user,
      userOf(f.app, f.guest.id),
    ]) {
      const map = boardAccessMap(f.app.db, principal);
      for (const board of [f.a.board.id, f.b.board.id, f.c.board.id]) {
        expect(map.get(board) ?? 'none').toBe(boardAccess(f.app.db, principal, board));
      }
    }
    await f.app.close();
  });

  test('assertBoardAccess returns 404 for invisible and 403 for too low', async () => {
    const f = await fixture();
    expect(() => assertBoardAccess(f.app.db, f.m1.user, f.b.board.id, 'view')).toThrow(
      expect.objectContaining({ status: 404 }),
    );
    expect(() => assertBoardAccess(f.app.db, f.viewer.user, f.a.board.id, 'edit')).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(assertBoardAccess(f.app.db, f.viewer.user, f.a.board.id, 'view')).toBe('view');
    await f.app.close();
  });
});
