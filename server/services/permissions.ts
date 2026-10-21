import type { Db } from '../db/db';
import type { BoardAccess, User } from '../../shared/types';
import { forbidden, notFound } from '../lib/errors';

export function isAdmin(u: User): boolean {
  return u.role === 'owner' || u.role === 'admin';
}

export function canReadWorkspace(db: Db, u: User, workspaceId: number): boolean {
  if (u.isGuest) return false;
  const row = db
    .prepare(
      'SELECT id, is_private, created_by FROM workspaces WHERE id = ? AND archived_at IS NULL',
    )
    .get(workspaceId) as { id: number; is_private: number; created_by: number } | undefined;
  if (!row) return false;
  if (isAdmin(u)) return true;
  if (!row.is_private) return true;
  if (row.created_by === u.id) return true;
  const member = db
    .prepare('SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspaceId, u.id);
  return Boolean(member);
}

export function assertReadWorkspace(db: Db, u: User, workspaceId: number): void {
  if (!canReadWorkspace(db, u, workspaceId)) throw notFound('Workspace not found');
}

export function assertWriteWorkspace(db: Db, u: User, workspaceId: number): void {
  if (u.role === 'viewer' || u.isGuest) throw forbidden();
  assertReadWorkspace(db, u, workspaceId);
}

export function workspaceIdForBoard(db: Db, boardId: number): number {
  const row = db
    .prepare('SELECT workspace_id FROM boards WHERE id = ? AND archived_at IS NULL')
    .get(boardId) as { workspace_id: number } | undefined;
  if (!row) throw notFound('Board not found');
  return row.workspace_id;
}

export function boardIdForItem(db: Db, itemId: number): number {
  const row = db
    .prepare(
      `SELECT i.board_id FROM items i JOIN boards b ON b.id = i.board_id
       WHERE i.id = ? AND i.archived_at IS NULL AND b.archived_at IS NULL`,
    )
    .get(itemId) as { board_id: number } | undefined;
  if (!row) throw notFound('Item not found');
  return row.board_id;
}

const RANK: Record<BoardAccess, number> = { none: 0, view: 1, comment: 2, edit: 3, manage: 4 };
export const atLeast = (a: BoardAccess, need: BoardAccess): boolean => RANK[a] >= RANK[need];
const minAccess = (a: BoardAccess, b: BoardAccess): BoardAccess => (RANK[a] <= RANK[b] ? a : b);
export const VIEWER_ACCESS: BoardAccess = 'view';

interface BoardAccessRow {
  id: number;
  workspace_id: number;
  is_private: number;
  created_by: number;
  member_access: string | null;
}

function accessFromRow(
  db: Db,
  u: User,
  row: BoardAccessRow,
  readable: Map<number, boolean>,
): BoardAccess {
  if (!u.isGuest && isAdmin(u)) return 'manage';
  const member = (row.member_access as BoardAccess | null) ?? 'none';
  if (u.isGuest) return minAccess(member, 'edit');
  const roleCap: BoardAccess = u.role === 'viewer' ? VIEWER_ACCESS : 'manage';
  if (row.created_by === u.id) return roleCap;
  if (row.is_private) return member === 'none' ? 'none' : minAccess(member, roleCap);
  if (!readable.has(row.workspace_id)) {
    readable.set(row.workspace_id, canReadWorkspace(db, u, row.workspace_id));
  }
  if (!readable.get(row.workspace_id)) {
    return member === 'none' ? 'none' : minAccess(member, roleCap);
  }
  return roleCap;
}

const ACCESS_SQL = `SELECT b.id, b.workspace_id, b.is_private, b.created_by, bm.access AS member_access
  FROM boards b LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = ?
  WHERE b.archived_at IS NULL`;

export function boardAccess(db: Db, u: User, boardId: number): BoardAccess {
  const row = db.prepare(`${ACCESS_SQL} AND b.id = ?`).get(u.id, boardId) as
    BoardAccessRow | undefined;
  return row ? accessFromRow(db, u, row, new Map()) : 'none';
}

export function boardAccessMap(db: Db, u: User): Map<number, BoardAccess> {
  const rows = db.prepare(ACCESS_SQL).all(u.id) as BoardAccessRow[];
  const map = new Map<number, BoardAccess>();
  const readable = new Map<number, boolean>();
  for (const row of rows) {
    const access = accessFromRow(db, u, row, readable);
    if (access !== 'none') map.set(row.id, access);
  }
  return map;
}

export function assertBoardAccess(
  db: Db,
  u: User,
  boardId: number,
  need: Exclude<BoardAccess, 'none'>,
): BoardAccess {
  const access = boardAccess(db, u, boardId);
  if (access === 'none') throw notFound('Board not found');
  if (!atLeast(access, need)) throw forbidden();
  return access;
}

export function assertItemAccess(
  db: Db,
  u: User,
  itemId: number,
  need: Exclude<BoardAccess, 'none'>,
): number {
  const boardId = boardIdForItem(db, itemId);
  assertBoardAccess(db, u, boardId, need);
  return boardId;
}
