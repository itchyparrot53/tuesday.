import type { Db } from '../db/db';
import { PALETTE } from '../../shared/columns';
import { DEFAULT_PREFERENCES, type Preferences, type Role, type User } from '../../shared/types';
import { normalizeColorTheme } from '../../shared/themes';

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  title: string;
  color: string;
  is_active: number;
  created_at: string;
  preferences: string;
  is_guest: number;
  sso_subject: string | null;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    title: row.title,
    color: row.color,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    preferences: (() => {
      const stored = { ...DEFAULT_PREFERENCES, ...JSON.parse(row.preferences || '{}') };
      return { ...stored, colorTheme: normalizeColorTheme(stored.colorTheme) };
    })(),
    isGuest: row.is_guest === 1,
    sso: Boolean(row.sso_subject),
  };
}

export function getUserById(db: Db, id: number): User | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function getUserRowByEmail(db: Db, email: string): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  return row ?? null;
}

export function listUsers(db: Db): User[] {
  const rows = db.prepare('SELECT * FROM users ORDER BY id').all() as UserRow[];
  return rows.map(toUser);
}

export function createUser(
  db: Db,
  input: { email: string; name: string; password_hash: string; role: Role },
): User {
  const count = (db.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n;
  const color = PALETTE[count % PALETTE.length];
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO users (email, name, password_hash, role, title, color, is_active, created_at)
       VALUES (?, ?, ?, ?, '', ?, 1, ?)`,
    )
    .run(input.email, input.name, input.password_hash, input.role, color, now);
  return getUserById(db, Number(info.lastInsertRowid))!;
}

export function updateUser(
  db: Db,
  id: number,
  patch: {
    name?: string;
    title?: string;
    role?: Role;
    isActive?: boolean;
    password_hash?: string;
    preferences?: Preferences;
  },
): User {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    values.push(patch.name);
  }
  if (patch.title !== undefined) {
    sets.push('title = ?');
    values.push(patch.title);
  }
  if (patch.role !== undefined) {
    sets.push('role = ?');
    values.push(patch.role);
  }
  if (patch.isActive !== undefined) {
    sets.push('is_active = ?');
    values.push(patch.isActive ? 1 : 0);
  }
  if (patch.preferences !== undefined) {
    sets.push('preferences = ?');
    values.push(JSON.stringify(patch.preferences));
  }
  if (patch.password_hash !== undefined) {
    sets.push('password_hash = ?');
    values.push(patch.password_hash);
  }
  if (sets.length) {
    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  }
  return getUserById(db, id)!;
}
