import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db/db';

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createPasswordReset(
  db: Db,
  input: { userId: number; createdBy?: number | null; appUrl: string; now?: Date },
): { token: string; link: string; expiresAt: string } {
  const token = randomBytes(32).toString('base64url');
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO password_resets (user_id, token_hash, expires_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(input.userId, hashResetToken(token), expiresAt, input.createdBy ?? null, now.toISOString());
  return { token, link: `${input.appUrl}/reset-password/${token}`, expiresAt };
}

export function getPasswordReset(db: Db, token: string, now = new Date()) {
  const row = db
    .prepare(
      `SELECT pr.*, u.email, u.name FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.token_hash = ?`,
    )
    .get(hashResetToken(token)) as
    | {
        id: number;
        user_id: number;
        expires_at: string;
        used_at: string | null;
        email: string;
        name: string;
      }
    | undefined;
  if (!row || row.used_at || new Date(row.expires_at).getTime() <= now.getTime()) return null;
  return row;
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 1)}***@${domain}`;
}
