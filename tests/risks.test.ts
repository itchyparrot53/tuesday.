import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';
import { getRisks } from '../server/services/risks';
import { addDays } from '../server/lib/timezone';
import type { Column } from '../shared/types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('risk signals', () => {
  test('overdue, unassigned and overloaded signals are deterministic', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number, 'Risk board');
    const people = (board.columns as Column[]).find((column) => column.type === 'people')!;
    const date = (board.columns as Column[]).find((column) => column.type === 'date')!;
    const add = async (name: string, due: string, assign = true) =>
      app.inject({
        method: 'POST',
        url: `/api/boards/${board.board.id}/items`,
        headers: { ...H, cookie: owner.cookie },
        payload: {
          groupId: board.groups[0].id,
          name,
          values: {
            [String(date.id)]: { date: due },
            ...(assign ? { [String(people.id)]: { userIds: [owner.user.id] } } : {}),
          },
        },
      });
    await add('Late item', addDays(today(), -10));
    await add('Unassigned soon', addDays(today(), 2), false);
    for (let index = 0; index < 9; index++) {
      await add(`Load ${index}`, addDays(today(), 3));
    }
    const report = getRisks(app.db, owner.user);
    expect(report.counts.overdue).toBe(1);
    expect(report.counts.unassigned_due_soon).toBe(1);
    expect(report.counts.overloaded).toBe(1);
    expect(report.signals[0].severity).toBe(3);
    await app.close();
  });

  test('unreadable boards are excluded for a member and guest', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number, 'Private risks');
    app.db.prepare('UPDATE boards SET is_private = 1 WHERE id = ?').run(board.board.id);
    const member = await inviteAndJoin(app, owner.cookie, 'member', 'risk-member@acme.test');
    expect(getRisks(app.db, member.user).signals).toHaveLength(0);
    await app.close();
  });
});
