import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';
import { getHome } from '../server/services/home';
import type { Column } from '../shared/types';
import { addDays } from '../server/lib/timezone';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function addItem(
  app: any,
  cookie: string,
  board: any,
  input: { name: string; due?: string; assign?: number; done?: boolean },
): Promise<number> {
  const columns = board.columns as Column[];
  const people = columns.find((column) => column.type === 'people')!;
  const date = columns.find((column) => column.type === 'date')!;
  const status = columns.find((column) => column.type === 'status')!;
  const values: Record<string, unknown> = {};
  if (input.assign) values[String(people.id)] = { userIds: [input.assign] };
  if (input.due) values[String(date.id)] = { date: input.due };
  if (input.done) values[String(status.id)] = { labelId: 'done' };
  const res = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.board.id}/items`,
    headers: { ...H, cookie },
    payload: { groupId: board.groups[0].id, name: input.name, values },
  });
  expect(res.statusCode).toBe(201);
  return res.json().item.id as number;
}

describe('home summary', () => {
  test('counts, buckets, week and done trend with a fixed now', async () => {
    const app = await createTestApp();
    const { cookie, user } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number, 'Website relaunch');
    const now = new Date();
    const day = today();

    await addItem(app, cookie, board, {
      name: 'Overdue task',
      due: addDays(day, -1),
      assign: user.id,
    });
    await addItem(app, cookie, board, { name: 'Today task', due: day, assign: user.id });
    await addItem(app, cookie, board, {
      name: 'Tomorrow task',
      due: addDays(day, 1),
      assign: user.id,
    });
    const doneId = await addItem(app, cookie, board, {
      name: 'Done task',
      due: addDays(day, 2),
      assign: user.id,
    });

    const home = getHome(app.db, user, now);
    expect(home.today).toBe(day);
    expect(home.counts.open).toBe(4);
    expect(home.counts.dueToday).toBe(1);
    expect(home.counts.overdue).toBe(1);
    expect(home.myDay.overdue.map((entry) => entry.item.name)).toEqual(['Overdue task']);
    expect(home.myDay.today.map((entry) => entry.item.name)).toEqual(['Today task']);
    expect(home.myDay.upcoming.map((entry) => entry.item.name)).toEqual([
      'Tomorrow task',
      'Done task',
    ]);
    expect(home.week).toHaveLength(7);
    expect(home.week[0]).toEqual({ date: day, count: 1 });
    expect(home.doneTrend).toHaveLength(14);
    expect(home.doneTrend.at(-1)?.date).toBe(day);

    const status = (board.columns as Column[]).find((column) => column.type === 'status')!;
    const changed = await app.inject({
      method: 'PUT',
      url: `/api/items/${doneId}/values/${status.id}`,
      headers: { ...H, cookie },
      payload: { value: { labelId: 'done' } },
    });
    expect(changed.statusCode).toBe(200);

    const after = getHome(app.db, user, now);
    expect(after.counts.open).toBe(3);
    expect(after.counts.doneThisWeek).toBe(1);
    expect(after.doneTrend.at(-1)?.count).toBe(1);

    await app.close();
  });

  test('activity excludes the user and automation runs; board cards sort favourites first', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const member = await inviteAndJoin(app, owner.cookie, 'member', 'sam@acme.test');
    const space = await createSpace(app, owner.cookie);
    const first = await createBoard(app, owner.cookie, space.id as number, 'Website relaunch');
    const second = await createBoard(app, owner.cookie, space.id as number, 'Launch plan');
    const itemId = await addItem(app, owner.cookie, first, { name: 'Hero copy' });
    addItem(app, owner.cookie, second, { name: 'Book venue' });

    const status = (first.columns as Column[]).find((column) => column.type === 'status')!;
    await app.inject({
      method: 'PUT',
      url: `/api/items/${itemId}/values/${status.id}`,
      headers: { ...H, cookie: member.cookie },
      payload: { value: { labelId: 'progress' } },
    });
    app.db
      .prepare(
        `INSERT INTO activity (board_id, item_id, actor_id, actor_kind, action, data, created_at)
         VALUES (?, NULL, NULL, 'system', 'automation_ran', '{}', ?)`,
      )
      .run(first.board.id, new Date().toISOString());

    const favorite = await app.inject({
      method: 'PUT',
      url: `/api/me/favorites/board/${second.board.id}`,
      headers: { ...H, cookie: owner.cookie },
    });
    expect(favorite.statusCode).toBe(200);

    const home = getHome(app.db, owner.user, new Date());
    expect(home.activity.length).toBeGreaterThan(0);
    expect(home.activity.every((entry) => entry.actorId !== owner.user.id)).toBe(true);
    expect(home.activity.every((entry) => entry.action !== 'automation_ran')).toBe(true);
    expect(home.activity.some((entry) => entry.actorName === 'sam')).toBe(true);
    expect(home.boards[0].id).toBe(second.board.id);
    expect(home.boards[0].favorite).toBe(true);

    await app.close();
  });

  test('answers in under a second with 2,000 items', async () => {
    const app = await createTestApp();
    const { cookie, user } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const boards = [] as any[];
    for (let index = 0; index < 4; index++) {
      boards.push(await createBoard(app, cookie, space.id as number, `Board ${index}`));
    }
    const now = new Date().toISOString();
    const insert = app.db.prepare(
      `INSERT INTO items (board_id, group_id, name, position, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const values = app.db.prepare(
      'INSERT INTO item_values (item_id, column_id, value, updated_at) VALUES (?, ?, ?, ?)',
    );
    app.db.transaction(() => {
      for (const board of boards) {
        const people = (board.columns as Column[]).find((column) => column.type === 'people')!;
        const date = (board.columns as Column[]).find((column) => column.type === 'date')!;
        for (let index = 0; index < 500; index++) {
          const info = insert.run(
            board.board.id,
            board.groups[0].id,
            `Item ${index}`,
            index + 1,
            user.id,
            now,
            now,
          );
          const id = Number(info.lastInsertRowid);
          values.run(id, people.id, JSON.stringify({ userIds: [user.id] }), now);
          values.run(id, date.id, JSON.stringify({ date: addDays(today(), index % 7) }), now);
        }
      }
    })();

    const started = performance.now();
    const home = getHome(app.db, user, new Date());
    const elapsed = performance.now() - started;
    expect(home.counts.open).toBe(2000);
    expect(home.boards).toHaveLength(4);
    expect(elapsed).toBeLessThan(1000);

    await app.close();
  });
});
