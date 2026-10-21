import type { Db } from '../db/db';
import { randomBytes } from 'node:crypto';
import type { ApiToken, User } from '../../shared/types';
import { badRequest, conflict } from '../lib/errors';
import { sha256 } from '../lib/tokens';

interface TokenRow {
  id: number;
  user_id: number;
  name: string;
  token_hash: string;
  prefix: string;
  scope: 'read' | 'write';
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

function toToken(row: TokenRow): ApiToken {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scope: row.scope,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

export function listTokens(db: Db, user: User): ApiToken[] {
  return (
    db
      .prepare('SELECT * FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL ORDER BY id DESC')
      .all(user.id) as TokenRow[]
  ).map(toToken);
}

export function createToken(
  db: Db,
  user: User,
  input: { name: string; scope: 'read' | 'write' },
): { token: ApiToken; secret: string } {
  if (user.role === 'viewer' && input.scope === 'write') {
    throw badRequest('Viewers can only create read tokens');
  }
  const count = (
    db
      .prepare('SELECT count(*) AS n FROM api_tokens WHERE user_id = ? AND revoked_at IS NULL')
      .get(user.id) as { n: number }
  ).n;
  if (count >= 20) throw conflict('You already have 20 active tokens');
  const secret = `tue_${randomBytes(30).toString('base64url')}`;
  const prefix = secret.slice(4, 12);
  const info = db
    .prepare(
      `INSERT INTO api_tokens (user_id, name, token_hash, prefix, scope, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(user.id, input.name, sha256(secret), prefix, input.scope, new Date().toISOString());
  const row = db
    .prepare('SELECT * FROM api_tokens WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as TokenRow;
  return { token: toToken(row), secret };
}

export function revokeToken(db: Db, user: User, id: number): void {
  db.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ?').run(
    new Date().toISOString(),
    id,
    user.id,
  );
}

export function getTokenBySecret(
  db: Db,
  secret: string,
): {
  user: User;
  scope: 'read' | 'write';
  prefix: string;
  id: number;
  lastUsedAt: string | null;
} | null {
  const row = db
    .prepare(
      `SELECT t.*, u.email, u.name, u.role, u.title, u.color, u.is_active,
              u.preferences, u.created_at AS user_created_at
       FROM api_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.revoked_at IS NULL`,
    )
    .get(sha256(secret)) as
    | (TokenRow & {
        email: string;
        name: string;
        role: User['role'];
        title: string;
        color: string;
        is_active: number;
        user_created_at: string;
        preferences: string;
      })
    | undefined;
  if (!row || row.is_active !== 1) return null;
  return {
    id: row.id,
    prefix: row.prefix,
    scope: row.scope,
    lastUsedAt: row.last_used_at,
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      title: row.title,
      color: row.color,
      isActive: true,
      createdAt: row.user_created_at,
      preferences: {
        theme: 'system',
        density: 'comfortable',
        sidebarCollapsed: false,
        ...JSON.parse(row.preferences || '{}'),
      },
      isGuest: false,
      sso: false,
    },
  };
}

export function touchToken(db: Db, id: number, lastUsedAt: string | null): void {
  if (lastUsedAt && Date.now() - new Date(lastUsedAt).getTime() < 60_000) return;
  db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id,
  );
}
