import type { Db } from '../db/db';
import { unlinkSync } from 'node:fs';
import path from 'node:path';
import type { TrashEntry, TrashKind, User } from '../../shared/types';
import { AppError, forbidden, notFound } from '../lib/errors';
import { boardAccess, canReadWorkspace, isAdmin } from './permissions';
import { logActivity } from './activity';
import { reindexItem } from './search';
import { getBoardFull } from './boards';
import { bus } from '../realtime/bus';
import { queueIndex } from '../knowledge/indexer';

function writeAccess(db: Db, user: User, workspaceId: number): boolean {
  if (isAdmin(user)) return true;
  if (user.role === 'viewer') return false;
  return canReadWorkspace(db, user, workspaceId);
}

export function listTrash(db: Db, user: User): TrashEntry[] {
  const entries: TrashEntry[] = [];
  const items = db
    .prepare(
      `SELECT i.id, i.name, i.archived_at, i.archived_by, b.name AS board_name, b.id AS board_id,
              w.name AS workspace_name, w.id AS workspace_id
       FROM items i JOIN boards b ON b.id = i.board_id JOIN workspaces w ON w.id = b.workspace_id
       WHERE i.archived_at IS NOT NULL`,
    )
    .all() as {
    id: number;
    name: string;
    archived_at: string;
    archived_by: number | null;
    board_name: string;
    workspace_name: string;
    workspace_id: number;
    board_id: number;
  }[];
  for (const item of items) {
    const access = boardAccess(db, user, item.board_id);
    if (access !== 'edit' && access !== 'manage') continue;
    entries.push({
      kind: 'item',
      id: item.id,
      name: item.name,
      location: `${item.workspace_name} › ${item.board_name}`,
      archivedAt: item.archived_at,
      archivedBy: item.archived_by,
    });
  }
  const boards = db
    .prepare(
      `SELECT b.id, b.name, b.archived_at, b.archived_by, w.name AS workspace_name, w.id AS workspace_id
       FROM boards b JOIN workspaces w ON w.id = b.workspace_id WHERE b.archived_at IS NOT NULL`,
    )
    .all() as {
    id: number;
    name: string;
    archived_at: string;
    archived_by: number | null;
    workspace_name: string;
    workspace_id: number;
  }[];
  for (const board of boards) {
    if (!writeAccess(db, user, board.workspace_id)) continue;
    entries.push({
      kind: 'board',
      id: board.id,
      name: board.name,
      location: board.workspace_name,
      archivedAt: board.archived_at,
      archivedBy: board.archived_by,
    });
  }
  const docs = db
    .prepare(
      `SELECT d.id, d.title, d.archived_at, d.archived_by, w.name AS workspace_name, w.id AS workspace_id
       FROM docs d JOIN workspaces w ON w.id = d.workspace_id WHERE d.archived_at IS NOT NULL`,
    )
    .all() as {
    id: number;
    title: string;
    archived_at: string;
    archived_by: number | null;
    workspace_name: string;
    workspace_id: number;
  }[];
  for (const doc of docs) {
    if (!writeAccess(db, user, doc.workspace_id)) continue;
    entries.push({
      kind: 'doc',
      id: doc.id,
      name: doc.title,
      location: doc.workspace_name,
      archivedAt: doc.archived_at,
      archivedBy: doc.archived_by,
    });
  }
  const dashboards = db
    .prepare(
      `SELECT d.id, d.name, d.archived_at, d.archived_by, w.name AS workspace_name, w.id AS workspace_id
       FROM dashboards d JOIN workspaces w ON w.id = d.workspace_id WHERE d.archived_at IS NOT NULL`,
    )
    .all() as {
    id: number;
    name: string;
    archived_at: string;
    archived_by: number | null;
    workspace_name: string;
    workspace_id: number;
  }[];
  for (const dashboard of dashboards) {
    if (!writeAccess(db, user, dashboard.workspace_id)) continue;
    entries.push({
      kind: 'dashboard',
      id: dashboard.id,
      name: dashboard.name,
      location: dashboard.workspace_name,
      archivedAt: dashboard.archived_at,
      archivedBy: dashboard.archived_by,
    });
  }
  const workspaces = db
    .prepare(
      'SELECT id, name, created_by, archived_at FROM workspaces WHERE archived_at IS NOT NULL',
    )
    .all() as { id: number; name: string; created_by: number; archived_at: string }[];
  for (const workspace of workspaces) {
    if (!isAdmin(user) && workspace.created_by !== user.id) continue;
    entries.push({
      kind: 'workspace',
      id: workspace.id,
      name: workspace.name,
      location: 'Workspace',
      archivedAt: workspace.archived_at,
      archivedBy: null,
    });
  }
  return entries.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

export function restore(db: Db, user: User, kind: TrashKind, id: number): void {
  if (kind === 'workspace') {
    const workspace = db
      .prepare(
        'SELECT id, name, created_by FROM workspaces WHERE id = ? AND archived_at IS NOT NULL',
      )
      .get(id) as { id: number; name: string; created_by: number } | undefined;
    if (!workspace) throw notFound('Workspace not found');
    if (!isAdmin(user) && workspace.created_by !== user.id) throw forbidden();
    db.prepare('UPDATE workspaces SET archived_at = NULL WHERE id = ?').run(id);
    bus.publish({ event: { type: 'workspaces.changed' } });
    return;
  }
  if (kind === 'item') {
    const item = db
      .prepare(
        `SELECT i.*, b.archived_at AS board_archived, b.workspace_id, b.id AS board_id FROM items i
         JOIN boards b ON b.id = i.board_id WHERE i.id = ?`,
      )
      .get(id) as
      | {
          archived_at: string | null;
          board_archived: string | null;
          workspace_id: number;
          board_id: number;
          name: string;
          group_id: number;
        }
      | undefined;
    if (!item) throw notFound('Item not found');
    if (item.board_archived) throw new AppError(409, 'conflict', 'Restore the board first');
    const access = boardAccess(db, user, item.board_id);
    if (access !== 'edit' && access !== 'manage') throw forbidden();
    const group = db.prepare('SELECT id FROM item_groups WHERE id = ?').get(item.group_id) as
      { id: number } | undefined;
    const firstGroup = group
      ? null
      : (db
          .prepare('SELECT id FROM item_groups WHERE board_id = ? ORDER BY position LIMIT 1')
          .get(item.board_id) as { id: number } | undefined);
    db.transaction(() => {
      db.prepare(
        'UPDATE items SET archived_at = NULL, archived_by = NULL, group_id = ? WHERE id = ? OR parent_id = ?',
      ).run(group?.id ?? firstGroup?.id ?? item.group_id, id, id);
      logActivity(db, {
        boardId: item.board_id,
        itemId: id,
        actorId: user.id,
        action: 'item_restored',
        data: { name: item.name },
      });
    })();
    reindexItem(db, id);
    queueIndex(db, 'item', id);
    bus.publish({
      event: { type: 'board.changed', boardId: item.board_id },
      boardId: item.board_id,
    });
    return;
  }
  if (kind === 'board') {
    const board = db
      .prepare('SELECT id, name, workspace_id, archived_at FROM boards WHERE id = ?')
      .get(id) as
      { id: number; name: string; workspace_id: number; archived_at: string | null } | undefined;
    if (!board) throw notFound('Board not found');
    if (!writeAccess(db, user, board.workspace_id)) throw forbidden();
    db.prepare('UPDATE boards SET archived_at = NULL, archived_by = NULL WHERE id = ?').run(id);
    bus.publish({ event: { type: 'workspaces.changed' } });
    return;
  }
  if (kind === 'doc') {
    const doc = db
      .prepare('SELECT id, title, workspace_id, content FROM docs WHERE id = ?')
      .get(id) as { id: number; title: string; workspace_id: number; content: string } | undefined;
    if (!doc) throw notFound('Doc not found');
    if (!writeAccess(db, user, doc.workspace_id)) throw forbidden();
    db.prepare('UPDATE docs SET archived_at = NULL, archived_by = NULL WHERE id = ?').run(id);
    db.prepare('DELETE FROM docs_fts WHERE rowid = ?').run(id);
    db.prepare('INSERT INTO docs_fts (rowid, title, content) VALUES (?, ?, ?)').run(
      id,
      doc.title,
      doc.content,
    );
    bus.publish({ event: { type: 'workspaces.changed' } });
    return;
  }
  const dashboard = db
    .prepare('SELECT id, name, workspace_id FROM dashboards WHERE id = ?')
    .get(id) as { id: number; name: string; workspace_id: number } | undefined;
  if (!dashboard) throw notFound('Dashboard not found');
  if (!writeAccess(db, user, dashboard.workspace_id)) throw forbidden();
  db.prepare('UPDATE dashboards SET archived_at = NULL, archived_by = NULL WHERE id = ?').run(id);
  bus.publish({ event: { type: 'workspaces.changed' } });
}

export function purge(db: Db, user: User, kind: TrashKind, id: number, uploadsDir?: string): void {
  if (kind === 'workspace') {
    const workspace = db
      .prepare('SELECT id, created_by FROM workspaces WHERE id = ? AND archived_at IS NOT NULL')
      .get(id) as { id: number; created_by: number } | undefined;
    if (!workspace) throw notFound('Workspace not found');
    if (!isAdmin(user) && workspace.created_by !== user.id) throw forbidden();
    const files = db
      .prepare(
        `SELECT f.storage_key FROM files f
         JOIN items i ON i.id = f.item_id
         JOIN boards b ON b.id = i.board_id
         WHERE b.workspace_id = ?`,
      )
      .all(id) as { storage_key: string }[];
    if (uploadsDir) {
      for (const file of files) {
        try {
          unlinkSync(path.join(uploadsDir, file.storage_key.slice(0, 2), file.storage_key));
        } catch {}
      }
    }
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    bus.publish({ event: { type: 'workspaces.changed' } });
    return;
  }
  const entry = listTrash(db, user).find(
    (candidate) => candidate.kind === kind && candidate.id === id,
  );
  if (!entry) throw notFound('Trash entry not found');
  if (!isAdmin(user) && entry.archivedBy !== user.id) throw forbidden();
  if (kind === 'item') {
    const files = db.prepare('SELECT storage_key FROM files WHERE item_id = ?').all(id) as {
      storage_key: string;
    }[];
    if (uploadsDir) {
      for (const file of files) {
        try {
          unlinkSync(path.join(uploadsDir, file.storage_key.slice(0, 2), file.storage_key));
        } catch {}
      }
    }
    db.prepare('DELETE FROM items_fts WHERE rowid = ?').run(id);
    db.prepare('DELETE FROM items WHERE id = ? OR parent_id = ?').run(id, id);
  } else if (kind === 'board') {
    db.prepare('DELETE FROM boards WHERE id = ?').run(id);
  } else if (kind === 'doc') {
    db.prepare('DELETE FROM docs_fts WHERE rowid = ?').run(id);
    db.prepare('DELETE FROM docs WHERE id = ?').run(id);
  } else {
    db.prepare('DELETE FROM dashboards WHERE id = ?').run(id);
  }
}

export function purgeOldTrash(db: Db, days = 30): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  let removed = 0;
  const items = db
    .prepare('SELECT id FROM items WHERE archived_at IS NOT NULL AND archived_at < ?')
    .all(cutoff) as { id: number }[];
  for (const item of items) {
    db.prepare('DELETE FROM items_fts WHERE rowid = ?').run(item.id);
    db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
    removed++;
  }
  const boards = db
    .prepare('SELECT id FROM boards WHERE archived_at IS NOT NULL AND archived_at < ?')
    .all(cutoff) as { id: number }[];
  for (const board of boards) {
    db.prepare('DELETE FROM boards WHERE id = ?').run(board.id);
    removed++;
  }
  const docs = db
    .prepare('SELECT id FROM docs WHERE archived_at IS NOT NULL AND archived_at < ?')
    .all(cutoff) as { id: number }[];
  for (const doc of docs) {
    db.prepare('DELETE FROM docs_fts WHERE rowid = ?').run(doc.id);
    db.prepare('DELETE FROM docs WHERE id = ?').run(doc.id);
    removed++;
  }
  const workspaces = db
    .prepare('SELECT id FROM workspaces WHERE archived_at IS NOT NULL AND archived_at < ?')
    .all(cutoff) as { id: number }[];
  for (const workspace of workspaces) {
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspace.id);
    removed++;
  }
  const dashboards = db
    .prepare('SELECT id FROM dashboards WHERE archived_at IS NOT NULL AND archived_at < ?')
    .all(cutoff) as { id: number }[];
  for (const dashboard of dashboards) {
    db.prepare('DELETE FROM dashboards WHERE id = ?').run(dashboard.id);
    removed++;
  }
  return removed;
}

export { getBoardFull };
