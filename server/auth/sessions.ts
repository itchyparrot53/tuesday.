import type { FastifyReply } from 'fastify';
import type { Config } from '../config';
import type { Db } from '../db/db';
import { sha256, newToken } from '../lib/tokens';
import type { SessionInfo, User } from '../../shared/types';
import { toUser, type UserRow } from '../services/users';

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const FIFTEEN_DAYS = 60 * 60 * 24 * 15;

export function sessionCookieOptions(config: Config) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    path: '/',
    maxAge: THIRTY_DAYS,
  };
}

export function setSessionCookie(reply: FastifyReply, token: string, config: Config): void {
  reply.setCookie('tue_session', token, sessionCookieOptions(config));
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie('tue_session', { path: '/' });
}

export function createSession(
  db: Db,
  userId: number,
  meta: { userAgent?: string; ip?: string } = {},
): { token: string; expiresAt: string } {
  const token = newToken();
  const expiresAt = new Date(Date.now() + THIRTY_DAYS * 1000).toISOString();
  db.prepare(
    'INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent, ip, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    sha256(token),
    userId,
    expiresAt,
    new Date().toISOString(),
    String(meta.userAgent ?? '').slice(0, 200),
    meta.ip ?? '',
    new Date().toISOString(),
  );
  return { token, expiresAt };
}

export function touchSession(db: Db, token: string): void {
  const id = sha256(token);
  const row = db.prepare('SELECT last_seen_at FROM sessions WHERE id = ?').get(id) as
    { last_seen_at: string | null } | undefined;
  if (!row) return;
  if (row.last_seen_at && Date.now() - new Date(row.last_seen_at).getTime() < 5 * 60 * 1000) return;
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function listSessions(
  db: Db,
  userId: number,
  currentToken: string | undefined,
): SessionInfo[] {
  const current = currentToken ? sha256(currentToken) : '';
  const rows = db
    .prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId) as {
    id: string;
    user_agent: string;
    ip: string;
    created_at: string;
    last_seen_at: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id.slice(0, 8),
    current: row.id === current,
    userAgent: row.user_agent,
    ip: row.ip,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }));
}

export function deleteOtherSessions(db: Db, userId: number, token: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(userId, sha256(token));
}

export function getSessionUser(db: Db, token: string): { user: User; expiresAt: string } | null {
  const row = db
    .prepare(
      `SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    )
    .get(sha256(token)) as (UserRow & { expires_at: string }) | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token));
    return null;
  }
  if (row.is_active !== 1) return null;
  return { user: toUser(row), expiresAt: row.expires_at };
}

export function extendSession(db: Db, token: string): string {
  const expiresAt = new Date(Date.now() + THIRTY_DAYS * 1000).toISOString();
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiresAt, sha256(token));
  return expiresAt;
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token));
}

export function deleteUserSessions(db: Db, userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function sessionNeedsExtension(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - Date.now() < FIFTEEN_DAYS * 1000;
}
