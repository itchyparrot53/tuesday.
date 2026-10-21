import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';
import { getMyWork } from '../server/services/mywork';
import { listItems } from '../server/services/items';

async function fixture() {
  const app = await createTestApp();
  const { cookie, user } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const board = await createBoard(app, cookie, space.id as number);
  const columns = board.columns as { id: number; type: string; title: string }[];
  const groupId = board.groups[0].id as number;
  return { app, cookie, user, board, columns, groupId };
}

describe('views and My Work', () => {
  test('kanban without a suitable column is rejected', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const blank = await app.inject({
      method: 'POST',
      url: '/api/boards',
      headers: { ...H, cookie },
      payload: { workspaceId: space.id, name: 'Blank', blank: true },
    });
    const boardId = blank.json().board.id;
    const res = await app.inject({
      method: 'POST',
      url: `/api/boards/${boardId}/views`,
      headers: { ...H, cookie },
      payload: { name: 'Kanban', type: 'kanban' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('Status');
    await app.close();
  });

  test('calendar rejects an invalid date column and accepts a date column', async () => {
    const f = await fixture();
    const owner = f.columns.find((column) => column.type === 'people')!;
    const bad = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/views`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Calendar',
        type: 'calendar',
        settings: { calendarColumnId: owner.id },
      },
    });
    expect(bad.statusCode).toBe(400);
    const ok = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/views`,
      headers: { ...H, cookie: f.cookie },
      payload: { name: 'Calendar', type: 'calendar' },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().view.settings.calendarColumnId).toBeTypeOf('number');
    await f.app.close();
  });

  test('My Work buckets respect dates, done state and the frozen now', async () => {
    const f = await fixture();
    const status = f.columns.find((column) => column.type === 'status')!;
    const due = f.columns.find((column) => column.type === 'date')!;
    const owner = f.columns.find((column) => column.type === 'people')!;
    const add = (name: string, date: string | null, done = false) =>
      f.app.inject({
        method: 'POST',
        url: `/api/boards/${f.board.board.id}/items`,
        headers: { ...H, cookie: f.cookie },
        payload: {
          groupId: f.groupId,
          name,
          values: {
            [owner.id]: { userIds: [f.user.id] },
            ...(date ? { [due.id]: { date } } : {}),
            ...(done ? { [status.id]: { labelId: 'done' } } : {}),
          },
        },
      });
    await add('Overdue task', '2026-10-19');
    await add('Today task', '2026-10-20');
    await add('This week task', '2026-10-22');
    await add('Next week task', '2026-10-27');
    await add('Later task', '2026-11-10');
    await add('No date task', null);
    await add('Done task', '2026-10-20', true);

    const entries = getMyWork(f.app.db, f.user, false, new Date('2026-10-20T10:00:00Z'));
    const buckets = Object.fromEntries(entries.map((entry) => [entry.item.name, entry.bucket]));
    expect(buckets).toEqual({
      'Overdue task': 'overdue',
      'Today task': 'today',
      'This week task': 'this_week',
      'Next week task': 'next_week',
      'Later task': 'later',
      'No date task': 'no_date',
    });
    const withDone = getMyWork(f.app.db, f.user, true, new Date('2026-10-20T10:00:00Z'));
    expect(withDone.map((entry) => entry.item.name)).toContain('Done task');
    await f.app.close();
  });
});
