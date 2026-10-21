import { describe, expect, test } from 'vitest';
import { runTool, toolsFor, type ToolContext } from '../server/ai/tools';
import { parseHumanValue } from '../server/ai/human-values';
import { listUsers } from '../server/services/users';
import { listItems } from '../server/services/items';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';
import type { Column, User } from '../shared/types';

async function fixture() {
  const app = await createTestApp();
  const { cookie, user } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const full = await createBoard(app, cookie, space.id as number);
  const column = (title: string) => full.columns.find((c: Column) => c.title === title) as Column;
  const ctx: ToolContext = { db: app.db, user, users: listUsers(app.db) };
  return {
    app,
    cookie,
    user,
    full,
    ctx,
    statusColumn: column('Status'),
    peopleColumn: column('Owner'),
    groupId: full.groups[0].id as number,
  };
}

describe('ai tools', () => {
  test('parses status, people and timeline human values', async () => {
    const f = await fixture();
    expect(parseHumanValue(f.statusColumn, 'Done', f.ctx.users)).toEqual({ labelId: 'done' });
    expect(parseHumanValue(f.peopleColumn, 'Olivia Owner', f.ctx.users)).toEqual({
      userIds: [f.user.id],
    });
    const timeline: Column = {
      id: 999,
      boardId: 1,
      title: 'Window',
      type: 'timeline',
      settings: {},
      position: 1,
      width: 160,
    };
    expect(parseHumanValue(timeline, '2026-01-01..2026-01-03', f.ctx.users)).toEqual({
      from: '2026-01-01',
      to: '2026-01-03',
    });
    await f.app.close();
  });

  test('reports valid choices for an unknown status', async () => {
    const f = await fixture();
    expect(() => parseHumanValue(f.statusColumn, 'Finished', f.ctx.users)).toThrow(
      /Valid: To do, In progress, Blocked, Done/,
    );
    await f.app.close();
  });

  test('create_item creates an item with a status through services', async () => {
    const f = await fixture();
    const result = runTool(
      'create_item',
      JSON.stringify({
        boardId: f.full.board.id,
        name: 'AI created',
        groupId: f.groupId,
        values: { Status: 'Done' },
      }),
      f.ctx,
    );
    expect(result.ok).toBe(true);
    const items = listItems(f.app.db, f.user, f.full.board.id);
    const item = items.find((i) => i.name === 'AI created');
    expect(item).toBeTruthy();
    expect(item!.values[String(f.statusColumn.id)]).toEqual({ labelId: 'done' });
    await f.app.close();
  });

  test('viewers get no mutating tools', async () => {
    const f = await fixture();
    const viewer: User = { ...f.user, role: 'viewer' };
    const tools = toolsFor(viewer);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((tool) => !tool.mutates)).toBe(true);
    await f.app.close();
  });

  test('find_items returns readable values', async () => {
    const f = await fixture();
    runTool(
      'create_item',
      JSON.stringify({
        boardId: f.full.board.id,
        name: 'Find me',
        values: { Status: 'In progress' },
      }),
      f.ctx,
    );
    const result = runTool(
      'find_items',
      JSON.stringify({ boardId: f.full.board.id, query: 'find' }),
      f.ctx,
    );
    expect(result.ok).toBe(true);
    const found = result.result as { name: string; values: Record<string, string> }[];
    expect(found[0].name).toBe('Find me');
    expect(found[0].values.Status).toBe('In progress');
    await f.app.close();
  });

  test('bad tool JSON returns an error result instead of throwing', async () => {
    const f = await fixture();
    const result = runTool('create_item', '{not json', f.ctx);
    expect(result.ok).toBe(false);
    expect((result.result as { error: string }).error).toBe('Invalid tool arguments');
    await f.app.close();
  });
});

describe('ai page read tools', () => {
  test("get_my_work returns only the caller's assigned items", async () => {
    const f = await fixture();
    const invite = await f.app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { ...H, cookie: f.cookie },
      payload: { role: 'member' },
    });
    const token = invite.json().invite.token as string;
    const joined = await f.app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: H,
      payload: { token, name: 'Mia Member', email: 'mia@acme.test', password: 'password123' },
    });
    const member = joined.json().user as User;
    const memberCtx: ToolContext = { db: f.app.db, user: member, users: listUsers(f.app.db) };

    for (const [name, ownerId] of [
      ['Owner task', f.user.id],
      ['Member task', member.id],
    ] as const) {
      const res = await f.app.inject({
        method: 'POST',
        url: `/api/boards/${f.full.board.id}/items`,
        headers: { ...H, cookie: f.cookie },
        payload: {
          groupId: f.groupId,
          name,
          values: {
            [String(f.peopleColumn.id)]: { userIds: [ownerId] },
            [String(f.full.columns.find((c: Column) => c.title === 'Due date').id)]: {
              date: '2026-01-02',
            },
          },
        },
      });
      expect(res.statusCode).toBe(201);
    }

    const mine = runTool('get_my_work', JSON.stringify({}), f.ctx);
    expect(mine.ok).toBe(true);
    const ownerRows = Object.values(mine.result as Record<string, { name: string }[]>).flat();
    expect(ownerRows.map((row) => row.name)).toContain('Owner task');
    expect(ownerRows.map((row) => row.name)).not.toContain('Member task');

    const theirs = runTool('get_my_work', JSON.stringify({}), memberCtx);
    const memberRows = Object.values(theirs.result as Record<string, { name: string }[]>).flat();
    expect(memberRows.map((row) => row.name)).toEqual(['Member task']);

    await f.app.close();
  });

  test('get_recent_activity excludes boards the caller cannot read', async () => {
    const f = await fixture();
    const invite = await f.app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { ...H, cookie: f.cookie },
      payload: { role: 'member' },
    });
    const joined = await f.app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: H,
      payload: {
        token: invite.json().invite.token,
        name: 'Rae Reader',
        email: 'rae@acme.test',
        password: 'password123',
      },
    });
    const member = joined.json().user as User;
    const privateSpace = await createSpace(f.app, f.cookie, 'Secret', { isPrivate: true });
    const secretBoard = await createBoard(
      f.app,
      f.cookie,
      privateSpace.id as number,
      'Secret board',
    );
    await f.app.inject({
      method: 'POST',
      url: `/api/boards/${secretBoard.board.id}/items`,
      headers: { ...H, cookie: f.cookie },
      payload: { groupId: secretBoard.groups[0].id, name: 'Secret item' },
    });
    await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.full.board.id}/items`,
      headers: { ...H, cookie: f.cookie },
      payload: { groupId: f.groupId, name: 'Public item' },
    });

    const memberCtx: ToolContext = { db: f.app.db, user: member, users: listUsers(f.app.db) };
    const result = runTool('get_recent_activity', JSON.stringify({ days: 7 }), memberCtx);
    expect(result.ok).toBe(true);
    const rows = result.result as { board: string; summary: string }[];
    expect(rows.some((row) => row.board === 'Secret board')).toBe(false);
    expect(rows.some((row) => row.board === f.full.board.name)).toBe(true);

    const forbidden = runTool(
      'get_recent_activity',
      JSON.stringify({ days: 7, boardId: secretBoard.board.id }),
      memberCtx,
    );
    expect(forbidden.ok).toBe(false);

    await f.app.close();
  });
});
