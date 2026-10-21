import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { migrate } from './migrate';

export type Db = Database.Database;

export function openDb(filePath: string): Db {
  if (filePath !== ':memory:') {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  if (filePath !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  migrate(db);
  return db;
}
