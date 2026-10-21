import { describe, expect, test } from 'vitest';
import {
  H,
  createBoard,
  createSpace,
  createTestApp,
  fakeOpenRouter,
  inviteAndJoin,
  setupOwner,
} from './helpers';
import { computeWidget, getDashboard } from '../server/services/dashboards';
import type { Widget } from '../shared/dashboards';

async function fixture() {
  const fake = fakeOpenRouter([{ text: '**Insight:** fake insight. Two items are overdue.' }]);
  const app = await createTestApp({ aiFetch: fake });
  const { cookie, user } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const first = await createBoard(app, cookie, space.id as number, 'Board one');
  const second = await createBoard(app, cookie, space.id as number, 'Board two');
  const addAmount = async (boardId: number) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/boards/${boardId}/columns`,
      headers: { ...H, cookie },
      payload: { title: 'Amount', type: 'number' },
    });
    return res.json().column.id as number;
  };
  const amount1 = await addAmount(first.board.id);
  const amount2 = await addAmount(second.board.id);
  const status1 = first.columns.find((column: { type: string }) => column.type === 'status');
  const owner1 = first.columns.find((column: { type: string }) => column.type === 'people');
  const status2 = second.columns.find((column: { type: string }) => column.type === 'status');
  const addItem = async (
    boardId: number,
    groupId: number,
    name: string,
    values: Record<string, unknown>,
  ) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/boards/${boardId}/items`,
      headers: { ...H, cookie },
      payload: { groupId, name, values },
    });
    return res.json().item.id as number;
  };
  await addItem(first.board.id, first.groups[0].id, 'One done', {
    [amount1]: { number: 10 },
    [status1.id]: { labelId: 'done' },
    [owner1.id]: { userIds: [user.id] },
  });
  await addItem(second.board.id, second.groups[0].id, 'Two todo', {
    [amount2]: { number: 20 },
    [status2.id]: { labelId: 'todo' },
  });
  const created = await app.inject({
    method: 'POST',
    url: '/api/dashboards',
    headers: { ...H, cookie },
    payload: {
      workspaceId: space.id,
      name: 'Portfolio',
      boardIds: [first.board.id, second.board.id],
    },
  });
  const dashboard = created.json().dashboard;
  return {
    app,
    cookie,
    user,
    space,
    first,
    second,
    amount1,
    amount2,
    dashboard,
    fake,
  };
}

function numberWidget(id: string): Widget {
  return {
    id,
    type: 'number',
    title: 'Total amount',
    w: 3,
    h: 1,
    config: { metric: 'sum', valueColumnTitle: 'Amount' },
  };
}

describe('dashboards', () => {
  test('creates starter widgets and sums a number across two boards', async () => {
    const f = await fixture();
    expect(f.dashboard.widgets).toHaveLength(3);
    expect(f.dashboard.widgets.map((widget: Widget) => widget.type)).toEqual([
      'battery',
      'chart',
      'items',
    ]);
    const widget = numberWidget('number1');
    const patched = await f.app.inject({
      method: 'PATCH',
      url: `/api/dashboards/${f.dashboard.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { widgets: [widget] },
    });
    expect(patched.statusCode).toBe(200);
    const data = await f.app.inject({
      method: 'GET',
      url: `/api/dashboards/${f.dashboard.id}/widgets/number1`,
      headers: { cookie: f.cookie },
    });
    expect(data.json().data).toMatchObject({ kind: 'number', value: 30, label: 'Amount' });
    await f.app.close();
  });

  test('chart series use status label colours and filters apply by column title', async () => {
    const f = await fixture();
    const chart = f.dashboard.widgets.find((widget: Widget) => widget.type === 'chart');
    const data = await f.app.inject({
      method: 'GET',
      url: `/api/dashboards/${f.dashboard.id}/widgets/${chart.id}`,
      headers: { cookie: f.cookie },
    });
    const series = data.json().data.series as { label: string; value: number; color: string }[];
    expect(series.find((entry) => entry.label === 'Done')?.value).toBe(1);
    expect(series.find((entry) => entry.label === 'Done')?.color).toBe('#2BB673');

    const itemsWidget: Widget = {
      id: 'items1',
      type: 'items',
      title: 'Done only',
      w: 6,
      h: 2,
      config: { filters: [{ columnTitle: 'Status', op: 'is', value: 'done' }] },
    };
    await f.app.inject({
      method: 'PATCH',
      url: `/api/dashboards/${f.dashboard.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { widgets: [itemsWidget] },
    });
    const items = await f.app.inject({
      method: 'GET',
      url: `/api/dashboards/${f.dashboard.id}/widgets/items1`,
      headers: { cookie: f.cookie },
    });
    expect(items.json().data.items).toHaveLength(1);
    expect(items.json().data.items[0].name).toBe('One done');
    await f.app.close();
  });

  test('workload counts people and unreadable boards are excluded', async () => {
    const f = await fixture();
    const workload: Widget = {
      id: 'work1',
      type: 'workload',
      title: 'Workload',
      w: 6,
      h: 2,
      config: { groupByColumnTitle: 'Owner' },
    };
    await f.app.inject({
      method: 'PATCH',
      url: `/api/dashboards/${f.dashboard.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { widgets: [workload] },
    });
    const data = await f.app.inject({
      method: 'GET',
      url: `/api/dashboards/${f.dashboard.id}/widgets/work1`,
      headers: { cookie: f.cookie },
    });
    const row = data
      .json()
      .data.rows.find((entry: { userId: number }) => entry.userId === f.user.id);
    expect(row.value).toBe(1);

    const member = await inviteAndJoin(f.app, f.cookie, 'member', 'dashboard-member@acme.test');
    const privateSpace = await createSpace(f.app, f.cookie, 'Private dash', { isPrivate: true });
    const privateBoard = await createBoard(
      f.app,
      f.cookie,
      privateSpace.id as number,
      'Hidden board',
    );
    const dashboard = getDashboard(f.app.db, f.user, f.dashboard.id);
    const dataForMember = computeWidget(
      f.app.db,
      member.user,
      { ...dashboard, boardIds: [f.first.board.id, privateBoard.board.id] },
      helpWidget(),
    );
    expect(dataForMember).toMatchObject({ kind: 'number', value: 1 });
    await f.app.close();
  });

  test('an AI insight streams and is cached', async () => {
    const f = await fixture();
    const insight: Widget = {
      id: 'insight1',
      type: 'ai_insight',
      title: 'AI insight',
      w: 12,
      h: 2,
      config: {},
    };
    await f.app.inject({
      method: 'PATCH',
      url: `/api/dashboards/${f.dashboard.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { widgets: [insight] },
    });
    const res = await f.app.inject({
      method: 'POST',
      url: `/api/dashboards/${f.dashboard.id}/widgets/insight1/insight`,
      headers: { ...H, cookie: f.cookie },
    });
    const streamed = res.body
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string; delta?: string })
      .filter((event) => event.type === 'text')
      .map((event) => event.delta ?? '')
      .join('');
    expect(streamed).toContain('fake insight');
    const data = await f.app.inject({
      method: 'GET',
      url: `/api/dashboards/${f.dashboard.id}/widgets/insight1`,
      headers: { cookie: f.cookie },
    });
    expect(data.json().data.text).toContain('fake insight');
    expect(data.json().data.generatedAt).toBeTruthy();
    await f.app.close();
  });
});

function helpWidget(): Widget {
  return {
    id: 'count1',
    type: 'number',
    title: 'Count',
    w: 3,
    h: 1,
    config: { metric: 'count' },
  };
}
