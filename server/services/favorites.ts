import type { Db } from '../db/db';
import type { Favorite, FavoriteKind, User } from '../../shared/types';
import { notFound } from '../lib/errors';
import { bus } from '../realtime/bus';
import { boardAccess, canReadWorkspace } from './permissions';

interface FavoriteRow {
  user_id: number;
  kind: FavoriteKind;
  target_id: number;
  position: number;
  created_at: string;
}

export interface FavoriteTarget {
  id: number;
  name: string;
  workspaceId: number;
}

export function favoriteTarget(db: Db, kind: FavoriteKind, id: number): FavoriteTarget | null {
  if (kind === 'board') {
    const row = db
      .prepare('SELECT id, name, workspace_id, archived_at FROM boards WHERE id = ?')
      .get(id) as
      { id: number; name: string; workspace_id: number; archived_at: string | null } | undefined;
    if (!row || row.archived_at) return null;
    return { id: row.id, name: row.name, workspaceId: row.workspace_id };
  }
  if (kind === 'doc') {
    const row = db
      .prepare('SELECT id, title, workspace_id, archived_at FROM docs WHERE id = ?')
      .get(id) as
      { id: number; title: string; workspace_id: number; archived_at: string | null } | undefined;
    if (!row || row.archived_at) return null;
    return { id: row.id, name: row.title, workspaceId: row.workspace_id };
  }
  const row = db
    .prepare('SELECT id, name, workspace_id, archived_at FROM dashboards WHERE id = ?')
    .get(id) as
    { id: number; name: string; workspace_id: number; archived_at: string | null } | undefined;
  if (!row || row.archived_at) return null;
  return { id: row.id, name: row.name, workspaceId: row.workspace_id };
}

export function listFavorites(db: Db, user: User): Favorite[] {
  const rows = db
    .prepare('SELECT * FROM user_favorites WHERE user_id = ? ORDER BY position, created_at')
    .all(user.id) as FavoriteRow[];
  const favorites: Favorite[] = [];
  for (const row of rows) {
    const target = favoriteTarget(db, row.kind, row.target_id);
    if (!target) continue;
    if (
      row.kind === 'board'
        ? boardAccess(db, user, target.id) === 'none'
        : !canReadWorkspace(db, user, target.workspaceId)
    )
      continue;
    favorites.push({
      kind: row.kind,
      id: target.id,
      name: target.name,
      workspaceId: target.workspaceId,
      position: row.position,
    });
  }
  return favorites;
}

export function addFavorite(db: Db, user: User, kind: FavoriteKind, id: number): Favorite[] {
  const target = favoriteTarget(db, kind, id);
  if (
    !target ||
    (kind === 'board'
      ? boardAccess(db, user, target.id) === 'none'
      : !canReadWorkspace(db, user, target.workspaceId))
  ) {
    throw notFound('That item is not available');
  }
  const max = (
    db.prepare('SELECT max(position) AS p FROM user_favorites WHERE user_id = ?').get(user.id) as {
      p: number | null;
    }
  ).p;
  db.prepare(
    `INSERT INTO user_favorites (user_id, kind, target_id, position, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, kind, target_id) DO NOTHING`,
  ).run(user.id, kind, id, (max ?? 0) + 1, new Date().toISOString());
  bus.publish({ event: { type: 'favorites.changed' }, userId: user.id });
  return listFavorites(db, user);
}

export function removeFavorite(db: Db, user: User, kind: FavoriteKind, id: number): Favorite[] {
  db.prepare('DELETE FROM user_favorites WHERE user_id = ? AND kind = ? AND target_id = ?').run(
    user.id,
    kind,
    id,
  );
  bus.publish({ event: { type: 'favorites.changed' }, userId: user.id });
  return listFavorites(db, user);
}
