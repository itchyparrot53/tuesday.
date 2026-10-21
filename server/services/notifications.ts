import type { Db } from '../db/db';
import type { Notification, NotificationKind } from '../../shared/types';
import { bus } from '../realtime/bus';
import { boardAccess, canReadWorkspace } from './permissions';
import { enqueue } from '../jobs/queue';
import { getNotificationPrefs } from './notify-prefs';
import { mailModeFromEnv } from './email';

interface NotificationRow {
  id: number;
  user_id: number;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string;
  actor_id: number | null;
  read_at: string | null;
  created_at: string;
}

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    actorId: row.actor_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function notify(
  db: Db,
  input: {
    userId: number;
    workspaceId: number;
    kind: NotificationKind;
    title: string;
    body?: string;
    link: string;
    actorId: number | null;
    boardId?: number;
  },
): void {
  if (input.userId === input.actorId) return;
  const user = db.prepare('SELECT is_active, role FROM users WHERE id = ?').get(input.userId) as
    { is_active: number; role: string } | undefined;
  if (!user || user.is_active !== 1) return;
  const recipient = { id: input.userId, role: user.role } as never;
  if (input.boardId) {
    if (boardAccess(db, recipient, input.boardId) === 'none') return;
  } else if (!canReadWorkspace(db, recipient, input.workspaceId)) return;
  const info = db
    .prepare(
      `INSERT INTO notifications (user_id, kind, title, body, link, actor_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.userId,
      input.kind,
      input.title,
      input.body ?? '',
      input.link,
      input.actorId,
      new Date().toISOString(),
    );
  const row = db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as NotificationRow;
  bus.publish({
    event: { type: 'notification', notification: toNotification(row) },
    userId: input.userId,
  });
  const prefs = getNotificationPrefs(db, input.userId);
  const pref = prefs.email[input.kind as keyof typeof prefs.email];
  const pushPref = prefs.push[input.kind as keyof typeof prefs.push];
  const subscriptions = (
    db
      .prepare('SELECT count(*) AS n FROM push_subscriptions WHERE user_id = ?')
      .get(input.userId) as {
      n: number;
    }
  ).n;
  if (pushPref && subscriptions > 0) {
    enqueue(db, 'push_send', { notificationId: row.id }, { dedupeKey: `push:${row.id}` });
  }
  if (pref === 'instant' && mailModeFromEnv() !== 'off') {
    enqueue(
      db,
      'email_notification',
      { userId: input.userId },
      { delayMs: 120_000, dedupeKey: `en:${input.userId}:${Math.floor(Date.now() / 120_000)}` },
    );
  }
}

export function listNotifications(
  db: Db,
  userId: number,
  unreadOnly = false,
): { notifications: Notification[]; unreadCount: number } {
  const rows = db
    .prepare(
      `SELECT * FROM notifications WHERE user_id = ? ${unreadOnly ? 'AND read_at IS NULL' : ''}
       ORDER BY id DESC LIMIT 100`,
    )
    .all(userId) as NotificationRow[];
  const unread = (
    db
      .prepare('SELECT count(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
      .get(userId) as { n: number }
  ).n;
  return { notifications: rows.map(toNotification), unreadCount: unread };
}

export function markRead(db: Db, userId: number, input: { ids?: number[]; all?: boolean }): void {
  const now = new Date().toISOString();
  if (input.all) {
    db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(
      now,
      userId,
    );
    return;
  }
  const ids = input.ids ?? [];
  const update = db.prepare(
    'UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL',
  );
  for (const id of ids) update.run(now, id, userId);
}
