import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';

describe('favourites', () => {
  test('adds boards, docs and dashboards, is idempotent and removes them', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const doc = await app.inject({
      method: 'POST',
      url: '/api/docs',
      headers: { ...H, cookie },
      payload: { workspaceId: space.id, title: 'Relaunch brief', content: 'Hello' },
    });
    const dashboard = await app.inject({
      method: 'POST',
      url: '/api/dashboards',
      headers: { ...H, cookie },
      payload: { workspaceId: space.id, name: 'Launch dashboard', boardIds: [board.board.id] },
    });

    for (const [kind, id, name] of [
      ['board', board.board.id, 'Board'],
      ['doc', doc.json().doc.id, 'Relaunch brief'],
      ['dashboard', dashboard.json().dashboard.id, 'Launch dashboard'],
    ] as const) {
      const added = await app.inject({
        method: 'PUT',
        url: `/api/me/favorites/${kind}/${id}`,
        headers: { ...H, cookie },
      });
      expect(added.statusCode, name).toBe(200);
      expect(added.json().favorites).toHaveLength(kind === 'board' ? 1 : kind === 'doc' ? 2 : 3);
    }

    const twice = await app.inject({
      method: 'PUT',
      url: `/api/me/favorites/board/${board.board.id}`,
      headers: { ...H, cookie },
    });
    expect(twice.json().favorites).toHaveLength(3);

    const list = await app.inject({
      method: 'GET',
      url: '/api/me/favorites',
      headers: { cookie },
    });
    expect(list.json().favorites.map((favorite: { kind: string }) => favorite.kind)).toEqual([
      'board',
      'doc',
      'dashboard',
    ]);
    expect(list.json().favorites[0].workspaceId).toBe(space.id);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/me/favorites/doc/${doc.json().doc.id}`,
      headers: { ...H, cookie },
    });
    expect(removed.json().favorites).toHaveLength(2);

    await app.close();
  });

  test('hides targets the caller cannot read', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const privateSpace = await createSpace(app, owner.cookie, 'Secret', { isPrivate: true });
    const board = await createBoard(app, owner.cookie, privateSpace.id as number, 'Secret board');
    await app.inject({
      method: 'PUT',
      url: `/api/me/favorites/board/${board.board.id}`,
      headers: { ...H, cookie: owner.cookie },
    });
    const member = await inviteAndJoin(app, owner.cookie, 'member', 'no-peek@acme.test');

    const list = await app.inject({
      method: 'GET',
      url: '/api/me/favorites',
      headers: { cookie: member.cookie },
    });
    expect(list.json().favorites).toEqual([]);

    const attempt = await app.inject({
      method: 'PUT',
      url: `/api/me/favorites/board/${board.board.id}`,
      headers: { ...H, cookie: member.cookie },
    });
    expect(attempt.statusCode).toBe(404);

    await app.close();
  });
});
