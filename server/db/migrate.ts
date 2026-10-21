import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db';

export function migrate(db: Db, options: { upTo?: string } = {}): string[] {
  db.exec(
    'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name),
  );
  const appliedNow: string[] = [];
  const apply = db.transaction((name: string, sql: string) => {
    db.exec(sql);
    db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)').run(
      name,
      new Date().toISOString(),
    );
  });
  for (const file of files) {
    if (applied.has(file)) continue;
    apply(file, readFileSync(path.join(dir, file), 'utf8'));
    appliedNow.push(file);
    if (options.upTo && file === options.upTo) break;
  }
  return appliedNow;
}
