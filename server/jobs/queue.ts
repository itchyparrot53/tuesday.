import type { Db } from '../db/db';

export interface Job {
  id: number;
  kind: string;
  payload: string;
  dedupe_key: string | null;
  status: 'queued' | 'running' | 'done' | 'failed';
  attempts: number;
  run_after: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export function enqueue(
  db: Db,
  kind: string,
  payload: unknown,
  options: { dedupeKey?: string; delayMs?: number } = {},
): boolean {
  const now = new Date().toISOString();
  const runAfter = new Date(Date.now() + (options.delayMs ?? 0)).toISOString();
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO jobs
        (kind, payload, dedupe_key, status, attempts, run_after, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', 0, ?, ?, ?)`,
    )
    .run(kind, JSON.stringify(payload), options.dedupeKey ?? null, runAfter, now, now);
  return info.changes > 0;
}

export function claimNext(db: Db): Job | null {
  const claim = db.transaction((): Job | null => {
    const now = new Date().toISOString();
    const row = db
      .prepare(
        `SELECT * FROM jobs WHERE status = 'queued' AND run_after <= ?
         ORDER BY run_after, id LIMIT 1`,
      )
      .get(now) as Job | undefined;
    if (!row) return null;
    db.prepare(
      "UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?",
    ).run(now, row.id);
    return { ...row, status: 'running', attempts: row.attempts + 1 };
  });
  return claim();
}

export function complete(db: Db, id: number): void {
  db.prepare("UPDATE jobs SET status = 'done', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
}

export function fail(db: Db, id: number, error: string): void {
  const row = db.prepare('SELECT attempts FROM jobs WHERE id = ?').get(id) as
    { attempts: number } | undefined;
  const attempts = row?.attempts ?? 1;
  const now = new Date().toISOString();
  if (attempts < 3) {
    const runAfter = new Date(Date.now() + 30_000 * attempts).toISOString();
    db.prepare(
      "UPDATE jobs SET status = 'queued', run_after = ?, last_error = ?, updated_at = ? WHERE id = ?",
    ).run(runAfter, error, now, id);
  } else {
    db.prepare(
      "UPDATE jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?",
    ).run(error, now, id);
  }
}

export function resetRunning(db: Db): void {
  db.prepare("UPDATE jobs SET status = 'queued', updated_at = ? WHERE status = 'running'").run(
    new Date().toISOString(),
  );
}
