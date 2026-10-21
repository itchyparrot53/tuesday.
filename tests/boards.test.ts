import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';

describe('boards', () => {
  test('a new board gets default columns, groups and a view', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const full = await createBoard(app, cookie, space.id as number, 'Roadmap');
    expect(full.board.name).toBe('Roadmap');
    expect(full.columns.map((c: { title: string }) => c.title)).toEqual([
      'Owner',
      'Status',
      'Due date',
    ]);
    expect(full.columns.map((c: { type: string }) => c.type)).toEqual(['people', 'status', 'date']);
    expect(full.columns[0].width).toBe(140);
    expect(full.columns[1].settings.labels).toHaveLength(4);
    expect(full.groups.map((g: { title: string }) => g.title)).toEqual(['To do', 'Completed']);
    expect(full.groups[0].color).toBe('#3E8EF7');
    expect(full.groups[1].color).toBe('#2BB673');
    expect(full.views).toHaveLength(1);
    expect(full.views[0].name).toBe('Main table');
    expect(full.views[0].type).toBe('table');
    expect(full.views[0].settings.filters).toEqual([]);
    await app.close();
  });

  test('status columns keep custom labels', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const full = await createBoard(app, cookie, space.id as number);
    const res = await app.inject({
      method: 'POST',
      url: `/api/boards/${full.board.id}/columns`,
      headers: { ...H, cookie },
      payload: {
        title: 'Priority',
        type: 'status',
        settings: {
          labels: [
            { id: 'low', name: 'Low', color: '#2BB673' },
            { id: 'high', name: 'High', color: '#E5484D' },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().column.settings.labels).toHaveLength(2);
    expect(res.json().column.position).toBeGreaterThan(full.columns[2].position);
    await app.close();
  });

  test('columns can be renamed and resized with clamping', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const full = await createBoard(app, cookie, space.id as number);
    const columnId = full.columns[0].id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/columns/${columnId}`,
      headers: { ...H, cookie },
      payload: { title: 'Assignee', width: 900 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().column.title).toBe('Assignee');
    expect(res.json().column.width).toBe(480);
    await app.close();
  });

  test('the last group cannot be deleted', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const full = await createBoard(app, cookie, space.id as number);
    const first = await app.inject({
      method: 'DELETE',
      url: `/api/groups/${full.groups[0].id}`,
      headers: { ...H, cookie },
    });
    expect(first.statusCode).toBe(204);
    const second = await app.inject({
      method: 'DELETE',
      url: `/api/groups/${full.groups[1].id}`,
      headers: { ...H, cookie },
    });
    expect(second.statusCode).toBe(409);
    await app.close();
  });

  test('views accept all four types with sensible defaults', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const full = await createBoard(app, cookie, space.id as number);
    for (const [name, type] of [
      ['Kanban', 'kanban'],
      ['Calendar', 'calendar'],
      ['Timeline', 'timeline'],
      ['Second table', 'table'],
    ] as const) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/boards/${full.board.id}/views`,
        headers: { ...H, cookie },
        payload: { name, type },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().view.type).toBe(type);
    }
    await app.close();
  });

  test('viewers cannot create boards', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const viewer = await inviteAndJoin(app, cookie, 'viewer', 'viewer@acme.test');
    const res = await app.inject({
      method: 'POST',
      url: '/api/boards',
      headers: { ...H, cookie: viewer.cookie },
      payload: { workspaceId: space.id, name: 'Nope' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  test('private workspaces are hidden from non-members', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const member = await inviteAndJoin(app, cookie, 'member', 'member@acme.test');
    const space = await createSpace(app, cookie, 'Secret', { isPrivate: true });
    const full = await createBoard(app, cookie, space.id as number);
    const res = await app.inject({
      method: 'GET',
      url: `/api/boards/${full.board.id}`,
      headers: { cookie: member.cookie },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
