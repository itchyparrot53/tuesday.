import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';

async function fixture() {
  const app = await createTestApp();
  const { cookie, user } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const full = await createBoard(app, cookie, space.id as number);
  const status = full.columns.find((c: { type: string }) => c.type === 'status');
  const people = full.columns.find((c: { type: string }) => c.type === 'people');
  return {
    app,
    cookie,
    user,
    workspaceId: space.id as number,
    boardId: full.board.id as number,
    groups: full.groups as { id: number; title: string }[],
    columns: full.columns as { id: number; type: string; title: string }[],
    statusId: status.id as number,
    peopleId: people.id as number,
  };
}

async function addItem(
  app: any,
  cookie: string,
  boardId: number,
  groupId: number,
  name: string,
  values?: Record<string, unknown>,
  parentId?: number,
) {
  return app.inject({
    method: 'POST',
    url: `/api/boards/${boardId}/items`,
    headers: { ...H, cookie },
    payload: { groupId, name, ...(values ? { values } : {}), ...(parentId ? { parentId } : {}) },
  });
}

describe('items', () => {
  test('creates items with values, rejects invalid labels and clears values', async () => {
    const f = await fixture();
    const created = await addItem(f.app, f.cookie, f.boardId, f.groups[0].id, 'Fix login', {
      [String(f.statusId)]: 'progress',
    });
    expect(created.statusCode).toBe(201);
    const item = created.json().item;
    expect(item.values[String(f.statusId)]).toEqual({ labelId: 'progress' });

    const bad = await f.app.inject({
      method: 'PUT',
      url: `/api/items/${item.id}/values/${f.statusId}`,
      headers: { ...H, cookie: f.cookie },
      payload: { value: { labelId: 'nope' } },
    });
    expect(bad.statusCode).toBe(400);

    const cleared = await f.app.inject({
      method: 'PUT',
      url: `/api/items/${item.id}/values/${f.statusId}`,
      headers: { ...H, cookie: f.cookie },
      payload: { value: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().item.values[String(f.statusId)]).toBeUndefined();
    await f.app.close();
  });

  test('moves an item across groups after a given sibling', async () => {
    const f = await fixture();
    const a1 = (await addItem(f.app, f.cookie, f.boardId, f.groups[0].id, 'A1')).json().item;
    await addItem(f.app, f.cookie, f.boardId, f.groups[0].id, 'A2');
    const b1 = (await addItem(f.app, f.cookie, f.boardId, f.groups[1].id, 'B1')).json().item;
    const moved = await f.app.inject({
      method: 'PATCH',
      url: `/api/items/${a1.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { groupId: f.groups[1].id, afterItemId: b1.id },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().item.groupId).toBe(f.groups[1].id);
    const list = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.boardId}/items`,
      headers: { cookie: f.cookie },
    });
    const groupItems = list
      .json()
      .items.filter((i: { groupId: number }) => i.groupId === f.groups[1].id)
      .map((i: { name: string }) => i.name);
    expect(groupItems).toEqual(['B1', 'A1']);
    await f.app.close();
  });

  test('supports one level of subitems only', async () => {
    const f = await fixture();
    const parent = (await addItem(f.app, f.cookie, f.boardId, f.groups[0].id, 'Parent')).json()
      .item;
    const childRes = await addItem(
      f.app,
      f.cookie,
      f.boardId,
      f.groups[0].id,
      'Child',
      undefined,
      parent.id,
    );
    expect(childRes.statusCode).toBe(201);
    expect(childRes.json().item.parentId).toBe(parent.id);
    expect(childRes.json().item.groupId).toBe(parent.groupId);
    const grand = await addItem(
      f.app,
      f.cookie,
      f.boardId,
      f.groups[0].id,
      'Grand',
      undefined,
      childRes.json().item.id,
    );
    expect(grand.statusCode).toBe(400);
    await f.app.close();
  });

  test('archiving removes items from the list', async () => {
    const f = await fixture();
    const item = (await addItem(f.app, f.cookie, f.boardId, f.groups[0].id, 'Archive me')).json()
      .item;
    const del = await f.app.inject({
      method: 'DELETE',
      url: `/api/items/${item.id}`,
      headers: { ...H, cookie: f.cookie },
    });
    expect(del.statusCode).toBe(204);
    const list = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.boardId}/items`,
      headers: { cookie: f.cookie },
    });
    expect(list.json().items.find((i: { id: number }) => i.id === item.id)).toBeUndefined();
    await f.app.close();
  });

  test('mentions create notifications for the mentioned user', async () => {
    const f = await fixture();
    const member = await inviteAndJoin(f.app, f.cookie, 'member', 'mention@acme.test');
    const item = (await addItem(f.app, f.cookie, f.boardId, f.groups[0].id, 'Discuss')).json().item;
    const posted = await f.app.inject({
      method: 'POST',
      url: `/api/items/${item.id}/updates`,
      headers: { ...H, cookie: f.cookie },
      payload: { body: `Hello @[member](user:${member.user.id}) please review` },
    });
    expect(posted.statusCode).toBe(201);
    const notes = await f.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie: member.cookie },
    });
    const mention = notes.json().notifications.find((n: { kind: string }) => n.kind === 'mention');
    expect(mention).toBeTruthy();
    expect(mention.title).toContain('mentioned you');
    await f.app.close();
  });

  test('assigning a person creates an assigned notification', async () => {
    const f = await fixture();
    const member = await inviteAndJoin(f.app, f.cookie, 'member', 'assign@acme.test');
    const item = (await addItem(f.app, f.cookie, f.boardId, f.groups[0].id, 'Assigned task')).json()
      .item;
    const set = await f.app.inject({
      method: 'PUT',
      url: `/api/items/${item.id}/values/${f.peopleId}`,
      headers: { ...H, cookie: f.cookie },
      payload: { value: { userIds: [member.user.id] } },
    });
    expect(set.statusCode).toBe(200);
    const notes = await f.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie: member.cookie },
    });
    const assigned = notes
      .json()
      .notifications.find((n: { kind: string }) => n.kind === 'assigned');
    expect(assigned).toBeTruthy();
    await f.app.close();
  });

  test('search finds an item by a word in a text cell', async () => {
    const f = await fixture();
    const column = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.boardId}/columns`,
      headers: { ...H, cookie: f.cookie },
      payload: { title: 'Notes', type: 'text' },
    });
    const columnId = column.json().column.id;
    const item = (await addItem(f.app, f.cookie, f.boardId, f.groups[0].id, 'Field trip')).json()
      .item;
    await f.app.inject({
      method: 'PUT',
      url: `/api/items/${item.id}/values/${columnId}`,
      headers: { ...H, cookie: f.cookie },
      payload: { value: 'zebra crossing' },
    });
    const res = await f.app.inject({
      method: 'GET',
      url: '/api/search?q=zebra',
      headers: { cookie: f.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((i: { id: number }) => i.id)).toContain(item.id);
    await f.app.close();
  });

  test('item activity records readable value changes', async () => {
    const f = await fixture();
    const item = (await addItem(f.app, f.cookie, f.boardId, f.groups[0].id, 'Log me')).json().item;
    await f.app.inject({
      method: 'PUT',
      url: `/api/items/${item.id}/values/${f.statusId}`,
      headers: { ...H, cookie: f.cookie },
      payload: { value: 'done' },
    });
    const res = await f.app.inject({
      method: 'GET',
      url: `/api/items/${item.id}/activity`,
      headers: { cookie: f.cookie },
    });
    const changed = res
      .json()
      .activity.find((a: { action: string }) => a.action === 'value_changed');
    expect(changed).toBeTruthy();
    expect(changed.data.columnTitle).toBe('Status');
    expect(changed.data.from).toBe('');
    expect(changed.data.to).toBe('Done');
    await f.app.close();
  });
});
