import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';
import { tickOnce } from '../server/jobs/scheduler';

describe('trash', () => {
  test('archives, lists, restores and purges items', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const item = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId: board.groups[0].id, name: 'Trash me' },
    });
    const itemId = item.json().item.id;
    await app.inject({ method: 'DELETE', url: `/api/items/${itemId}`, headers: { ...H, cookie } });
    const list = await app.inject({ method: 'GET', url: '/api/trash', headers: { cookie } });
    expect(
      list
        .json()
        .entries.some(
          (entry: { kind: string; id: number }) => entry.kind === 'item' && entry.id === itemId,
        ),
    ).toBe(true);
    await app.inject({
      method: 'POST',
      url: '/api/trash/restore',
      headers: { ...H, cookie },
      payload: { kind: 'item', id: itemId },
    });
    const items = await app.inject({
      method: 'GET',
      url: `/api/boards/${board.board.id}/items`,
      headers: { cookie },
    });
    expect(items.json().items.some((entry: { id: number }) => entry.id === itemId)).toBe(true);
    await app.inject({ method: 'DELETE', url: `/api/items/${itemId}`, headers: { ...H, cookie } });
    await app.inject({
      method: 'DELETE',
      url: `/api/trash/item/${itemId}`,
      headers: { ...H, cookie },
    });
    const after = await app.inject({ method: 'GET', url: '/api/trash', headers: { cookie } });
    expect(after.json().entries.some((entry: { id: number }) => entry.id === itemId)).toBe(false);
    await app.close();
  });

  test('an item cannot be restored while its board is archived', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const item = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId: board.groups[0].id, name: 'Orphan' },
    });
    await app.inject({
      method: 'DELETE',
      url: `/api/items/${item.json().item.id}`,
      headers: { ...H, cookie },
    });
    await app.inject({
      method: 'DELETE',
      url: `/api/boards/${board.board.id}`,
      headers: { ...H, cookie },
    });
    const restore = await app.inject({
      method: 'POST',
      url: '/api/trash/restore',
      headers: { ...H, cookie },
      payload: { kind: 'item', id: item.json().item.id },
    });
    expect(restore.statusCode).toBe(409);
    await app.close();
  });

  test('the scheduler purges entries older than 30 days', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const item = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId: board.groups[0].id, name: 'Old trash' },
    });
    await app.inject({
      method: 'DELETE',
      url: `/api/items/${item.json().item.id}`,
      headers: { ...H, cookie },
    });
    app.db
      .prepare('UPDATE items SET archived_at = ? WHERE id = ?')
      .run('2020-01-01T00:00:00.000Z', item.json().item.id);
    tickOnce(app, new Date('2026-10-20T02:00:00Z'));
    const row = app.db.prepare('SELECT id FROM items WHERE id = ?').get(item.json().item.id);
    expect(row).toBeUndefined();
    await app.close();
  });
});
