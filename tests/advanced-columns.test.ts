import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';
import { getItemDto } from '../server/services/items';

async function addColumn(app: any, cookie: string, boardId: number, body: Record<string, unknown>) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/boards/${boardId}/columns`,
    headers: { ...H, cookie },
    payload: body,
  });
  expect(res.statusCode).toBe(201);
  return res.json().column;
}

async function addItem(app: any, cookie: string, boardId: number, groupId: number, name: string) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/boards/${boardId}/items`,
    headers: { ...H, cookie },
    payload: { groupId, name },
  });
  return res.json().item.id as number;
}

async function setValue(
  app: any,
  cookie: string,
  itemId: number,
  columnId: number,
  value: unknown,
) {
  return app.inject({
    method: 'PUT',
    url: `/api/items/${itemId}/values/${columnId}`,
    headers: { ...H, cookie },
    payload: { value },
  });
}

describe('advanced columns', () => {
  test('formulas compute in items and CSV export and cannot be written', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const hours = await addColumn(app, cookie, board.board.id, { title: 'Hours', type: 'number' });
    const formula = await addColumn(app, cookie, board.board.id, {
      title: 'Formula',
      type: 'formula',
      settings: { expression: '{Hours} * 2', format: 'number', decimals: 0 },
    });
    const itemId = await addItem(app, cookie, board.board.id, board.groups[0].id, 'Formula item');
    await setValue(app, cookie, itemId, hours.id, { number: 3 });
    const items = await app.inject({
      method: 'GET',
      url: `/api/boards/${board.board.id}/items`,
      headers: { cookie },
    });
    const item = items.json().items.find((entry: { id: number }) => entry.id === itemId);
    expect(item.values[String(formula.id)]).toEqual({ formula: 6 });
    const csv = await app.inject({
      method: 'GET',
      url: `/api/boards/${board.board.id}/export.csv`,
      headers: { cookie },
    });
    expect(csv.body).toContain('6');
    const write = await setValue(app, cookie, itemId, formula.id, { formula: 10 });
    expect(write.statusCode).toBe(400);
    await app.close();
  });

  test('dependencies reject cycles and auto-shift dependents', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const timeline = await addColumn(app, cookie, board.board.id, {
      title: 'Window',
      type: 'timeline',
    });
    const dependency = await addColumn(app, cookie, board.board.id, {
      title: 'Blocked by',
      type: 'dependency',
      settings: { autoShift: true },
    });
    const a = await addItem(app, cookie, board.board.id, board.groups[0].id, 'Predecessor');
    const b = await addItem(app, cookie, board.board.id, board.groups[0].id, 'Dependent');
    await setValue(app, cookie, a, timeline.id, { from: '2026-01-01', to: '2026-01-02' });
    await setValue(app, cookie, b, timeline.id, { from: '2026-01-01', to: '2026-01-02' });
    await setValue(app, cookie, b, dependency.id, { itemIds: [a] });
    await setValue(app, cookie, a, timeline.id, { from: '2026-01-01', to: '2026-01-05' });
    const dependent = getItemDto(app.db, b);
    expect(dependent.values[String(timeline.id)]).toEqual({
      from: '2026-01-04',
      to: '2026-01-05',
    });
    const cycle = await setValue(app, cookie, a, dependency.id, { itemIds: [b] });
    expect(cycle.statusCode).toBe(400);
    await app.close();
  });

  test('connect and mirror columns respect target permissions and links are listed', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number, 'Source');
    const target = await createBoard(app, cookie, space.id as number, 'Target');
    const targetStatus = (target.columns as { id: number; type: string }[]).find(
      (column) => column.type === 'status',
    )!;
    const targetItem = await addItem(
      app,
      cookie,
      target.board.id,
      target.groups[0].id,
      'Target item',
    );
    await setValue(app, cookie, targetItem, targetStatus.id, { labelId: 'done' });
    const connect = await addColumn(app, cookie, board.board.id, {
      title: 'Connected',
      type: 'connect',
      settings: { targetBoardId: target.board.id, allowMultiple: true },
    });
    const mirror = await addColumn(app, cookie, board.board.id, {
      title: 'Mirrored status',
      type: 'mirror',
      settings: { connectColumnId: connect.id, targetColumnId: targetStatus.id, aggregate: 'list' },
    });
    const item = await addItem(app, cookie, board.board.id, board.groups[0].id, 'Source item');
    await setValue(app, cookie, item, connect.id, { itemIds: [targetItem] });
    const items = await app.inject({
      method: 'GET',
      url: `/api/boards/${board.board.id}/items`,
      headers: { cookie },
    });
    const source = items.json().items.find((entry: { id: number }) => entry.id === item);
    expect(source.values[String(mirror.id)]).toEqual({ mirror: 'Done' });
    const links = await app.inject({
      method: 'GET',
      url: `/api/items/${targetItem}/links`,
      headers: { cookie },
    });
    expect(links.json().linkedFrom[0]).toMatchObject({ itemId: item, columnTitle: 'Connected' });

    const privateSpace = await createSpace(app, cookie, 'Private target', { isPrivate: true });
    const privateBoard = await createBoard(app, cookie, privateSpace.id as number);
    const privateStatus = (privateBoard.columns as { id: number; type: string }[]).find(
      (column) => column.type === 'status',
    )!;
    const hiddenItem = await addItem(
      app,
      cookie,
      privateBoard.board.id,
      privateBoard.groups[0].id,
      'Hidden',
    );
    const hiddenConnect = await addColumn(app, cookie, board.board.id, {
      title: 'Hidden connect',
      type: 'connect',
      settings: { targetBoardId: privateBoard.board.id, allowMultiple: true },
    });
    const hiddenMirror = await addColumn(app, cookie, board.board.id, {
      title: 'Hidden mirror',
      type: 'mirror',
      settings: {
        connectColumnId: hiddenConnect.id,
        targetColumnId: privateStatus.id,
        aggregate: 'list',
      },
    });
    await setValue(app, cookie, item, hiddenConnect.id, { itemIds: [hiddenItem] });
    const member = await inviteAndJoin(app, cookie, 'member', 'advanced-member@acme.test');
    const memberItems = await app.inject({
      method: 'GET',
      url: `/api/boards/${board.board.id}/items`,
      headers: { cookie: member.cookie },
    });
    const memberItem = memberItems.json().items.find((entry: { id: number }) => entry.id === item);
    expect(memberItem.values[String(hiddenMirror.id)]).toMatchObject({ error: 'No access' });
    await app.close();
  });

  test('time tracking starts, stops and reports conflicts', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const tracking = await addColumn(app, cookie, board.board.id, {
      title: 'Time',
      type: 'time_tracking',
    });
    const first = await addItem(app, cookie, board.board.id, board.groups[0].id, 'Timed');
    const second = await addItem(app, cookie, board.board.id, board.groups[0].id, 'Other');
    await app.inject({
      method: 'POST',
      url: `/api/items/${first}/time/${tracking.id}/start`,
      headers: { ...H, cookie },
    });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const member = await inviteAndJoin(app, cookie, 'member', 'timer-member@acme.test');
    const conflict = await app.inject({
      method: 'POST',
      url: `/api/items/${first}/time/${tracking.id}/start`,
      headers: { ...H, cookie: member.cookie },
    });
    expect(conflict.statusCode).toBe(409);
    await app.inject({
      method: 'POST',
      url: `/api/items/${second}/time/${tracking.id}/start`,
      headers: { ...H, cookie },
    });
    const firstAfter = getItemDto(app.db, first);
    expect(
      (firstAfter.values[String(tracking.id)] as { runningSince: string | null }).runningSince,
    ).toBeNull();
    await app.inject({
      method: 'POST',
      url: `/api/items/${second}/time/${tracking.id}/stop`,
      headers: { ...H, cookie },
    });
    const secondAfter = getItemDto(app.db, second);
    expect(
      (secondAfter.values[String(tracking.id)] as { totalSeconds: number }).totalSeconds,
    ).toBeGreaterThanOrEqual(1);
    const timer = await app.inject({ method: 'GET', url: '/api/me/timer', headers: { cookie } });
    expect(timer.json().running).toBeNull();
    await app.close();
  });
});
