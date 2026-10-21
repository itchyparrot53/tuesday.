import type { FastifyInstance } from 'fastify';
import { getMyWork } from './mywork';
import { getNotificationPrefs } from './notify-prefs';
import { listNotifications } from './notifications';
import { listFavorites } from './favorites';
import { getUserById, listUsers } from './users';
import { zonedParts } from '../lib/timezone';
import { getOrg } from './settings';
import { digestEmail } from '../email/templates';
import { buildUnsubscribeUrl } from './unsubscribe';
import { queueEmail } from './email';
import { enqueue } from '../jobs/queue';

export interface DigestContent {
  due: { id: number; name: string; board: string; dueDate: string | null }[];
  overdue: { id: number; name: string; board: string; dueDate: string | null }[];
  mentions: { title: string; link: string }[];
  boardChanges: { board: string; count: number }[];
  notificationIds: number[];
}

export function buildDigest(
  db: FastifyInstance['db'],
  userId: number,
  now = new Date(),
): DigestContent {
  const user = getUserById(db, userId);
  if (!user) return { due: [], overdue: [], mentions: [], boardChanges: [], notificationIds: [] };
  const work = getMyWork(db, user, false, now);
  const due = work
    .filter((entry) => entry.bucket === 'today')
    .map((entry) => ({
      id: entry.item.id,
      name: entry.item.name,
      board: entry.board.name,
      dueDate: entry.dueDate,
    }));
  const overdue = work
    .filter((entry) => entry.bucket === 'overdue')
    .map((entry) => ({
      id: entry.item.id,
      name: entry.item.name,
      board: entry.board.name,
      dueDate: entry.dueDate,
    }));
  const prefsValue = getNotificationPrefs(db, userId);
  const notifications = listNotifications(db, userId, true).notifications;
  const mentions = notifications
    .filter(
      (notification) =>
        notification.kind === 'mention' ||
        (notification.kind === 'assigned' && prefsValue.email.assigned === 'digest'),
    )
    .slice(0, 10)
    .map((notification) => ({ title: notification.title, link: notification.link }));
  const notificationIds = notifications
    .filter(
      (notification) =>
        notification.kind === 'mention' ||
        prefsValue.email[notification.kind as keyof typeof prefsValue.email] === 'digest',
    )
    .map((notification) => notification.id);
  const favorites = listFavorites(db, user).filter((favorite) => favorite.kind === 'board');
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const boardChanges = favorites
    .map((favorite) => {
      const row = db
        .prepare(
          'SELECT count(*) AS n FROM activity WHERE board_id = ? AND created_at >= ? AND actor_id IS NOT ?',
        )
        .get(favorite.id, since, userId) as { n: number };
      return { board: favorite.name, count: row.n };
    })
    .filter((entry) => entry.count > 0);
  return { due, overdue, mentions, boardChanges, notificationIds };
}

export function digestTick(app: FastifyInstance, now: Date): void {
  const org = getOrg(app.db);
  const parts = zonedParts(now, org.timezone);
  for (const user of listUsers(app.db)) {
    if (!user.isActive) continue;
    const prefsValue = getNotificationPrefs(app.db, user.id);
    if (!prefsValue.digest.enabled || prefsValue.digest.hour !== parts.hour) continue;
    if (prefsValue.digest.weekdaysOnly && (parts.weekday === 0 || parts.weekday === 6)) continue;
    const key = `digest:last:${user.id}`;
    const last = app.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined;
    if (last && JSON.parse(last.value) === parts.date) continue;
    app.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(key, JSON.stringify(parts.date));
    enqueue(
      app.db,
      'email_digest',
      { userId: user.id, date: parts.date },
      { dedupeKey: `digest:${user.id}:${parts.date}` },
    );
  }
}

export async function sendDigest(
  app: FastifyInstance,
  userId: number,
  date: string,
): Promise<void> {
  const user = getUserById(app.db, userId);
  if (!user || !user.isActive) return;
  const content = buildDigest(app.db, userId);
  if (
    !content.due.length &&
    !content.overdue.length &&
    !content.mentions.length &&
    !content.boardChanges.length
  ) {
    app.db
      .prepare(
        `INSERT INTO email_log (to_address, user_id, kind, subject, status, error, created_at)
         VALUES (?, ?, 'digest', 'Your Tuesday digest', 'skipped', 'nothing to send', ?)`,
      )
      .run(user.email, user.id, new Date().toISOString());
    return;
  }
  const mail = digestEmail({
    appUrl: app.config.appUrl,
    unsubscribeUrl: buildUnsubscribeUrl(app.db, app.config.appUrl, user.id),
    name: user.name,
    date,
    due: content.due,
    overdue: content.overdue,
    mentions: content.mentions,
    boardChanges: content.boardChanges,
  });
  queueEmail(app.db, {
    to: user.email,
    userId: user.id,
    kind: 'digest',
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    mode: app.mailer.mode,
  });
  const mark = app.db.prepare('UPDATE notifications SET emailed_at = ? WHERE id = ?');
  const at = new Date().toISOString();
  for (const id of content.notificationIds) mark.run(at, id);
}
