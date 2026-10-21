import type { Db } from '../db/db';
import { parseJson } from '../lib/json';

export function getSetting<T>(db: Db, key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  if (!row) return fallback;
  return parseJson<T>(row.value, fallback);
}

export function setSetting(db: Db, key: string, value: unknown): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value));
}

export interface OrgSettings {
  name: string;
  timezone: string;
}

export function getOrg(db: Db): OrgSettings {
  const raw = getSetting<Partial<OrgSettings>>(db, 'org', {});
  return { name: raw.name ?? '', timezone: raw.timezone ?? 'UTC' };
}

export function setOrg(db: Db, patch: Partial<OrgSettings>): OrgSettings {
  const next = { ...getOrg(db), ...patch };
  setSetting(db, 'org', next);
  return next;
}
