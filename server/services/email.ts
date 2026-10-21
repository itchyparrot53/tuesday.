import type { Db } from '../db/db';
import { enqueue } from '../jobs/queue';

export interface QueueEmailInput {
  to: string;
  userId?: number | null;
  kind: string;
  subject: string;
  html: string;
  text: string;
  mode?: 'smtp' | 'fake' | 'off';
}

let currentMailMode: 'smtp' | 'fake' | 'off' = 'off';

export function setMailMode(mode: 'smtp' | 'fake' | 'off'): void {
  currentMailMode = mode;
}

export function mailModeFromEnv(): 'smtp' | 'fake' | 'off' {
  return currentMailMode;
}

export function queueEmail(db: Db, input: QueueEmailInput): number {
  const now = new Date().toISOString();
  const mode = input.mode ?? mailModeFromEnv();
  if (mode === 'off') {
    const info = db
      .prepare(
        `INSERT INTO email_log (to_address, user_id, kind, subject, status, error, created_at)
         VALUES (?, ?, ?, ?, 'skipped', 'mail not configured', ?)`,
      )
      .run(input.to, input.userId ?? null, input.kind, input.subject, now);
    return Number(info.lastInsertRowid);
  }
  const info = db
    .prepare(
      `INSERT INTO email_log (to_address, user_id, kind, subject, status, created_at)
       VALUES (?, ?, ?, ?, 'queued', ?)`,
    )
    .run(input.to, input.userId ?? null, input.kind, input.subject, now);
  const logId = Number(info.lastInsertRowid);
  enqueue(db, 'email_send', {
    logId,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  return logId;
}
