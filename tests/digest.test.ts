import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';
import { digestTick, sendDigest, buildDigest } from '../server/services/digest';
import { setOrg } from '../server/services/settings';
import type { Column } from '../shared/types';

async function fixture() {
  const app = await createTestApp({ config: { mailFake: true } });
  const owner = await setupOwner(app);
  setOrg(app.db, { timezone: 'UTC' });
  const space = await createSpace(app, owner.cookie);
  const board = await createBoard(app, owner.cookie, space.id as number, 'Digest board');
  const people = (board.columns as Column[]).find((column) => column.type === 'people')!;
  const date = (board.columns as Column[]).find((column) => column.type === 'date')!;
  const item = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.board.id}/items`,
    headers: { ...H, cookie: owner.cookie },
    payload: {
      groupId: board.groups[0].id,
      name: 'Overdue digest item',
      values: {
        [String(people.id)]: { userIds: [owner.user.id] },
        [String(date.id)]: { date: '2000-01-01' },
      },
    },
  });
  expect(item.statusCode).toBe(201);
  return { app, owner, board };
}

describe('daily digest', () => {
  test('runs once at the chosen hour and skips weekends when asked', async () => {
    const { app, owner } = await fixture();
    app.db
      .prepare('UPDATE users SET notification_prefs = ? WHERE id = ?')
      .run(
        JSON.stringify({ digest: { enabled: true, hour: 9, weekdaysOnly: true } }),
        owner.user.id,
      );
    digestTick(app, new Date('2026-10-19T09:05:00.000Z')); // Monday
    digestTick(app, new Date('2026-10-19T09:10:00.000Z'));
    expect(
      (
        app.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind = 'email_digest'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
    digestTick(app, new Date('2026-10-17T09:05:00.000Z')); // Saturday
    expect(
      (
        app.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind = 'email_digest'").get() as {
          n: number;
        }
      ).n,
    ).toBe(1);
    await app.close();
  });

  test('content includes overdue work and marks notifications emailed', async () => {
    const { app, owner } = await fixture();
    app.db
      .prepare(
        `INSERT INTO notifications (user_id, kind, title, body, link, created_at)
         VALUES (?, 'mention', 'You were mentioned', '', '/x', ?)`,
      )
      .run(owner.user.id, new Date().toISOString());
    const content = buildDigest(app.db, owner.user.id);
    expect(content.overdue.some((row) => row.name === 'Overdue digest item')).toBe(true);
    expect(content.mentions).toHaveLength(1);
    await sendDigest(app, owner.user.id, '2026-10-19');
    const row = app.db.prepare('SELECT emailed_at FROM notifications LIMIT 1').get() as {
      emailed_at: string | null;
    };
    expect(row.emailed_at).toBeTruthy();
    await app.close();
  });

  test('an empty digest is logged as skipped', async () => {
    const app = await createTestApp({ config: { mailFake: true } });
    const owner = await setupOwner(app);
    await sendDigest(app, owner.user.id, '2026-10-19');
    const row = app.db
      .prepare("SELECT status, error FROM email_log WHERE kind = 'digest'")
      .get() as {
      status: string;
      error: string;
    };
    expect(row).toMatchObject({ status: 'skipped', error: 'nothing to send' });
    await app.close();
  });
});
