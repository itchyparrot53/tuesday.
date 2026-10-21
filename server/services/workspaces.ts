import type { Db } from '../db/db';
import { PALETTE } from '../../shared/columns';
import type { BoardSummary, User, Workspace } from '../../shared/types';
import { GAP } from '../lib/positions';
import { forbidden, notFound } from '../lib/errors';
import { canReadWorkspace, isAdmin } from './permissions';
import { bus } from '../realtime/bus';
import { listWorkspaceDocs } from './docs';

export interface WorkspaceRow {
  id: number;
  name: string;
  description: string;
  color: string;
  is_private: number;
  position: number;
  created_by: number;
  created_at: string;
  archived_at: string | null;
}

interface BoardRow {
  id: number;
  workspace_id: number;
  name: string;
  position: number;
  updated_at: string;
  is_private?: number;
}

function boardsFor(db: Db, workspaceId: number): BoardSummary[] {
  const rows = db
    .prepare(
      'SELECT id, workspace_id, name, is_private, position, updated_at FROM boards WHERE workspace_id = ? AND archived_at IS NULL ORDER BY position, id',
    )
    .all(workspaceId) as BoardRow[];
  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    isPrivate: (r as { is_private?: number }).is_private === 1,
    position: r.position,
    updatedAt: r.updated_at,
  }));
}

function memberIdsFor(db: Db, workspaceId: number): number[] {
  const rows = db
    .prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ? ORDER BY user_id')
    .all(workspaceId) as { user_id: number }[];
  return rows.map((r) => r.user_id);
}

export function toWorkspace(db: Db, row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    isPrivate: row.is_private === 1,
    position: row.position,
    createdBy: row.created_by,
    memberIds: memberIdsFor(db, row.id),
    boards: boardsFor(db, row.id),
    docs: listWorkspaceDocs(db, row.id),
    dashboards: (
      db
        .prepare(
          'SELECT id, name, updated_at FROM dashboards WHERE workspace_id = ? AND archived_at IS NULL ORDER BY id',
        )
        .all(row.id) as { id: number; name: string; updated_at: string }[]
    ).map((dashboard) => ({
      id: dashboard.id,
      name: dashboard.name,
      updatedAt: dashboard.updated_at,
    })),
  };
}

export function getWorkspace(db: Db, u: User, id: number): Workspace {
  const row = db
    .prepare('SELECT * FROM workspaces WHERE id = ? AND archived_at IS NULL')
    .get(id) as WorkspaceRow | undefined;
  if (!row || !canReadWorkspace(db, u, id)) throw notFound('Workspace not found');
  return toWorkspace(db, row);
}

export function listWorkspacesForUser(db: Db, u: User): Workspace[] {
  if (u.isGuest) return [];
  const rows = db
    .prepare(
      `SELECT * FROM workspaces w
       WHERE w.archived_at IS NULL AND (
         ? = 1 OR w.is_private = 0 OR w.created_by = ?
         OR EXISTS (SELECT 1 FROM workspace_members m WHERE m.workspace_id = w.id AND m.user_id = ?)
       )
       ORDER BY w.position, w.id`,
    )
    .all(isAdmin(u) ? 1 : 0, u.id, u.id) as WorkspaceRow[];
  return rows.map((r) => toWorkspace(db, r));
}

export function createWorkspace(
  db: Db,
  u: User,
  input: { name: string; description?: string; color?: string; isPrivate?: boolean },
): Workspace {
  if (u.role === 'viewer' || u.isGuest) throw forbidden();
  const max = (
    db.prepare('SELECT max(position) AS p FROM workspaces WHERE archived_at IS NULL').get() as {
      p: number | null;
    }
  ).p;
  const position = max === null ? GAP : max + GAP;
  const now = new Date().toISOString();
  const workspace = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO workspaces (name, description, color, is_private, position, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        input.description ?? '',
        input.color ?? PALETTE[3],
        input.isPrivate ? 1 : 0,
        position,
        u.id,
        now,
      );
    const id = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO workspace_members (workspace_id, user_id) VALUES (?, ?)').run(id, u.id);
    return getWorkspace(db, u, id);
  })();
  bus.publish({ event: { type: 'workspaces.changed' } });
  return workspace;
}

export function updateWorkspace(
  db: Db,
  u: User,
  id: number,
  patch: { name?: string; description?: string; color?: string; isPrivate?: boolean },
): Workspace {
  if (!canReadWorkspace(db, u, id)) throw notFound('Workspace not found');
  if (u.role === 'viewer') throw forbidden();
  const row = db
    .prepare('SELECT * FROM workspaces WHERE id = ? AND archived_at IS NULL')
    .get(id) as WorkspaceRow | undefined;
  if (!row) throw notFound('Workspace not found');
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    values.push(patch.name);
  }
  if (patch.description !== undefined) {
    sets.push('description = ?');
    values.push(patch.description);
  }
  if (patch.color !== undefined) {
    sets.push('color = ?');
    values.push(patch.color);
  }
  if (patch.isPrivate !== undefined) {
    sets.push('is_private = ?');
    values.push(patch.isPrivate ? 1 : 0);
  }
  if (sets.length) {
    db.prepare(`UPDATE workspaces SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  }
  const workspace = getWorkspace(db, u, id);
  bus.publish({ event: { type: 'workspaces.changed' } });
  return workspace;
}

export function setWorkspaceMembers(db: Db, u: User, id: number, userIds: number[]): Workspace {
  if (!canReadWorkspace(db, u, id)) throw notFound('Workspace not found');
  if (u.role === 'viewer') throw forbidden();
  const row = db
    .prepare('SELECT * FROM workspaces WHERE id = ? AND archived_at IS NULL')
    .get(id) as WorkspaceRow | undefined;
  if (!row) throw notFound('Workspace not found');
  const valid = new Set(
    (db.prepare('SELECT id FROM users').all() as { id: number }[]).map((r) => r.id),
  );
  const all = new Set<number>([...userIds.filter((uid) => valid.has(uid)), row.created_by]);
  db.transaction(() => {
    db.prepare('DELETE FROM workspace_members WHERE workspace_id = ?').run(id);
    const insert = db.prepare(
      'INSERT OR IGNORE INTO workspace_members (workspace_id, user_id) VALUES (?, ?)',
    );
    for (const uid of all) insert.run(id, uid);
  })();
  const workspace = getWorkspace(db, u, id);
  bus.publish({ event: { type: 'workspaces.changed' } });
  return workspace;
}

export function archiveWorkspace(db: Db, u: User, id: number): void {
  const row = db
    .prepare('SELECT * FROM workspaces WHERE id = ? AND archived_at IS NULL')
    .get(id) as WorkspaceRow | undefined;
  if (!row) throw notFound('Workspace not found');
  if (!isAdmin(u) && row.created_by !== u.id) throw forbidden();
  db.prepare('UPDATE workspaces SET archived_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id,
  );
  bus.publish({ event: { type: 'workspaces.changed' } });
}
