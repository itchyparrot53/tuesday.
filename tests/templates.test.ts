import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';

async function fixture() {
  const app = await createTestApp();
  const { cookie } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const board = await createBoard(app, cookie, space.id as number, 'Source board');
  const status = (board.columns as { id: number; type: string }[]).find(
    (column) => column.type === 'status',
  )!;
  const owner = (board.columns as { id: number; type: string }[]).find(
    (column) => column.type === 'people',
  )!;
  const groupId = board.groups[0].id as number;
  await app.inject({
    method: 'POST',
    url: `/api/boards/${board.board.id}/items`,
    headers: { ...H, cookie },
    payload: {
      groupId,
      name: 'Copy me',
      values: { [status.id]: { labelId: 'progress' }, [owner.id]: { userIds: [1] } },
    },
  });
  await app.inject({
    method: 'POST',
    url: `/api/boards/${board.board.id}/views`,
    headers: { ...H, cookie },
    payload: {
      name: 'Hidden owner',
      type: 'table',
      settings: {
        filters: [],
        sort: null,
        search: '',
        personUserId: null,
        hiddenColumnIds: [owner.id],
      },
    },
  });
  await app.inject({
    method: 'POST',
    url: `/api/boards/${board.board.id}/automations`,
    headers: { ...H, cookie },
    payload: {
      name: 'Copy automation',
      trigger: { type: 'status_changed', columnId: status.id, toLabelId: 'done' },
      conditions: [],
      actions: [{ type: 'notify', to: 'creator', message: 'done' }],
    },
  });
  return { app, cookie, space, board, status, owner, groupId };
}

describe('templates and duplication', () => {
  test('duplicates columns, groups, items, views (remapped) and disabled automations', async () => {
    const f = await fixture();
    const res = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/duplicate`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Source board copy',
        workspaceId: f.space.id,
        includeItems: true,
      },
    });
    expect(res.statusCode).toBe(201);
    const full = res.json();
    expect(full.board.name).toBe('Source board copy');
    expect(full.columns.map((column: { title: string }) => column.title)).toEqual([
      'Owner',
      'Status',
      'Due date',
    ]);
    const items = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${full.board.id}/items`,
      headers: { cookie: f.cookie },
    });
    expect(items.json().items).toHaveLength(1);
    const newOwner = full.columns.find((column: { type: string }) => column.type === 'people');
    const hiddenView = full.views.find((view: { name: string }) => view.name === 'Hidden owner');
    expect(hiddenView.settings.hiddenColumnIds).toEqual([newOwner.id]);
    const automations = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${full.board.id}/automations`,
      headers: { cookie: f.cookie },
    });
    expect(automations.json().automations).toHaveLength(1);
    expect(automations.json().automations[0].enabled).toBe(false);
    await f.app.close();
  });

  test('creates boards from built-in and user templates', async () => {
    const f = await fixture();
    const builtin = await f.app.inject({
      method: 'POST',
      url: '/api/boards/from-template',
      headers: { ...H, cookie: f.cookie },
      payload: {
        templateId: 'builtin:bug-tracker',
        workspaceId: f.space.id,
        name: 'Bugs from template',
      },
    });
    expect(builtin.statusCode).toBe(201);
    expect(
      builtin.json().columns.some((column: { title: string }) => column.title === 'Severity'),
    ).toBe(true);

    const saved = await f.app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: { ...H, cookie: f.cookie },
      payload: {
        boardId: f.board.board.id,
        name: 'My template',
        description: 'Reusable',
        category: 'Custom',
        includeItems: true,
      },
    });
    expect(saved.statusCode).toBe(201);
    const templateId = saved.json().template.id as string;
    const fromUser = await f.app.inject({
      method: 'POST',
      url: '/api/boards/from-template',
      headers: { ...H, cookie: f.cookie },
      payload: { templateId, workspaceId: f.space.id, name: 'From user template' },
    });
    expect(fromUser.statusCode).toBe(201);
    const items = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${fromUser.json().board.id}/items`,
      headers: { cookie: f.cookie },
    });
    expect(items.json().items).toHaveLength(1);
    await f.app.close();
  });
});
