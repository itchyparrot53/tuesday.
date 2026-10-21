import type { Db } from '../db/db';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '../../shared/types';
import { parseJson } from '../lib/json';

export function getNotificationPrefs(db: Db, userId: number): NotificationPrefs {
  const row = db.prepare('SELECT notification_prefs FROM users WHERE id = ?').get(userId) as
    { notification_prefs: string } | undefined;
  const stored = parseJson<Partial<NotificationPrefs>>(row?.notification_prefs, {});
  return {
    email: {
      ...DEFAULT_NOTIFICATION_PREFS.email,
      ...(stored.email ?? {}),
    },
    digest: {
      ...DEFAULT_NOTIFICATION_PREFS.digest,
      ...(stored.digest ?? {}),
    },
    push: {
      ...DEFAULT_NOTIFICATION_PREFS.push,
      ...(stored.push ?? {}),
    },
  };
}

export function setNotificationPrefs(
  db: Db,
  userId: number,
  patch: {
    email?: Partial<NotificationPrefs['email']>;
    digest?: Partial<NotificationPrefs['digest']>;
    push?: Partial<NotificationPrefs['push']>;
  },
): NotificationPrefs {
  const current = getNotificationPrefs(db, userId);
  const next: NotificationPrefs = {
    email: { ...current.email, ...(patch.email ?? {}) },
    digest: { ...current.digest, ...(patch.digest ?? {}) },
    push: { ...current.push, ...(patch.push ?? {}) },
  };
  db.prepare('UPDATE users SET notification_prefs = ? WHERE id = ?').run(
    JSON.stringify(next),
    userId,
  );
  return next;
}
