import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/db';

const SECRET_KEY = 'email:unsubscribe_secret';
const TOKEN_DAYS = 180;

function secret(db: Db): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SECRET_KEY) as
    { value: string } | undefined;
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as unknown;
      if (typeof parsed === 'string' && parsed.length >= 32) return parsed;
    } catch {}
  }
  const generated = randomBytes(32).toString('hex');
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(
    SECRET_KEY,
    JSON.stringify(generated),
  );
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get(SECRET_KEY) as {
    value: string;
  };
  return JSON.parse(stored.value) as string;
}

function sign(db: Db, payload: string): string {
  return createHmac('sha256', secret(db)).update(payload).digest('base64url');
}

/** A stateless, expiring unsubscribe token. Only email preferences can be changed with it. */
export function unsubscribeToken(db: Db, userId: number): string {
  const expires = Date.now() + TOKEN_DAYS * 86_400_000;
  const payload = `${userId}.${expires}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(db, payload)}`;
}

export function verifyUnsubscribeToken(db: Db, token: string): number | null {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = sign(db, payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  const [rawUserId, rawExpires] = payload.split('.');
  const userId = Number(rawUserId);
  const expires = Number(rawExpires);
  if (!Number.isInteger(userId) || userId <= 0) return null;
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  return userId;
}

export function buildUnsubscribeUrl(db: Db, appUrl: string, userId: number): string {
  const base = appUrl.replace(/\/$/, '');
  return `${base}/unsubscribe?token=${encodeURIComponent(unsubscribeToken(db, userId))}`;
}
