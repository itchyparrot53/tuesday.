import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';
import { logActivity, onActivity, type ActivityEvent } from '../server/services/activity';
import { zonedParts, addDays } from '../server/lib/timezone';
import { renderTemplate } from '../shared/templates-text';
import { isDoneValue } from '../shared/columns';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('shared plumbing', () => {
  test('onActivity fires after commit with raw values and depth', async () => {
    const app = await createTestApp();
    const { cookie, user } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const status = board.columns.find((column: { type: string }) => column.type === 'status');
    const itemResponse = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId: board.groups[0].id, name: 'Plumbing item' },
    });
    const itemId = itemResponse.json().item.id as number;

    const events: ActivityEvent[] = [];
    const off = onActivity((event) => events.push(event));
    try {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/items/${itemId}/values/${status.id}`,
        headers: { ...H, cookie },
        payload: { value: { labelId: 'done' } },
      });
      expect(res.statusCode).toBe(200);
      await flush();
      await flush();
      const changed = events.find((event) => event.activity.action === 'value_changed');
      expect(changed).toBeTruthy();
      expect(changed!.actor?.id).toBe(user.id);
      expect(changed!.depth).toBe(0);
      expect(changed!.activity.data.fromValue).toBeNull();
      expect(changed!.activity.data.toValue).toEqual({ labelId: 'done' });
      expect(changed!.activity.data.columnType).toBe('status');
    } finally {
      off();
      await app.close();
    }
  });

  test('onActivity does not fire for rolled-back work', async () => {
    const app = await createTestApp();
    const { cookie, user } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const events: ActivityEvent[] = [];
    const off = onActivity((event) => events.push(event));
    try {
      try {
        app.db.transaction(() => {
          logActivity(app.db, {
            boardId: board.board.id,
            actorId: user.id,
            action: 'value_changed',
            data: { rolledBack: true },
          });
          throw new Error('rollback');
        })();
      } catch {}
      await flush();
      expect(events.some((event) => event.activity.data.rolledBack === true)).toBe(false);
    } finally {
      off();
      await app.close();
    }
  });

  test('zonedParts and addDays handle the organisation timezone', () => {
    const parts = zonedParts(new Date('2026-07-01T23:30:00Z'), 'Europe/London');
    expect(parts.date).toBe('2026-07-02');
    expect(parts.hour).toBe(0);
    expect(addDays('2026-10-20', 3)).toBe('2026-10-23');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('renderTemplate replaces known tokens and blanks unknown ones', () => {
    const text = renderTemplate(
      '{{name}} on {{board}} by {{user}}: {{Status}}, {{Missing}}, {{updates}}',
      {
        itemName: 'Write brief',
        boardName: 'Launch',
        actorName: 'Aidan',
        values: { status: 'Done' },
        updates: 'two updates',
      },
    );
    expect(text).toBe('Write brief on Launch by Aidan: Done, , two updates');
  });

  test('isDoneValue recognises the default id, completed names and doneLabelIds', () => {
    const done = {
      type: 'status' as const,
      settings: { labels: [{ id: 'done', name: 'Anything', color: '#2BB673' }] },
    };
    expect(isDoneValue(done, { labelId: 'done' })).toBe(true);
    const completed = {
      type: 'status' as const,
      settings: { labels: [{ id: 'x', name: 'Completed', color: '#2BB673' }] },
    };
    expect(isDoneValue(completed, { labelId: 'x' })).toBe(true);
    const other = {
      type: 'status' as const,
      settings: { labels: [{ id: 'x', name: 'Blocked', color: '#E5484D' }] },
    };
    expect(isDoneValue(other, { labelId: 'x' })).toBe(false);
    const configured = {
      type: 'status' as const,
      settings: {
        labels: [{ id: 'x', name: 'Blocked', color: '#E5484D' }],
        doneLabelIds: ['x'],
      },
    };
    expect(isDoneValue(configured, { labelId: 'x' })).toBe(true);
  });
});
