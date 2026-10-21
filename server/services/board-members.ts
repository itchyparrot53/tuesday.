import type { Db } from '../db/db';
import type { BoardAccess, BoardMember, User } from '../../shared/types';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { bus } from '../realtime/bus';

function boardRow(db: Db, boardId: number) {
  const row = db
    .prepare(
      `SELECT b.*, w.name AS workspace_name FROM boards b
       JOIN workspaces w ON w.id = b.workspace_id WHERE b.id = ? AND b.archived_at IS NULL`,
    )
    .get(boardId) as
    | {
        id: number;
        workspace_id: number;
        name: string;
        is_private: number;
        created_by: number;
        workspace_name: string;
      }
    | undefined;
  if (!row) throw notFound('Board not found');
  return row;
}

export function listBoardMembers(db: Db, boardId: number): BoardMember[] {
  const board = boardRow(db, boardId);
  const rows = db
    .prepare(
      `SELECT bm.user_id, bm.access, u.name, u.color, u.email, u.is_guest
       FROM board_members bm JOIN users u ON u.id = bm.user_id
       WHERE bm.board_id = ? ORDER BY bm.created_at, bm.user_id`,
    )
    .all(boardId) as {
    user_id: number;
    access: Exclude<BoardAccess, 'none'>;
    name: string;
    color: string;
    email: string;
    is_guest: number;
  }[];
  const explicit = new Map<number, BoardMember>();
  for (const row of rows) {
    explicit.set(row.user_id, {
      userId: row.user_id,
      name: row.name,
      color: row.color,
      email: row.email,
      isGuest: row.is_guest === 1,
      access: row.access,
      source: 'member',
    });
  }
  const creator = db
    .prepare('SELECT id, name, color, email, is_guest FROM users WHERE id = ?')
    .get(board.created_by) as
    { id: number; name: string; color: string; email: string; is_guest: number } | undefined;
  if (creator && !explicit.has(creator.id)) {
    explicit.set(creator.id, {
      userId: creator.id,
      name: creator.name,
      color: creator.color,
      email: creator.email,
      isGuest: false,
      access: 'manage',
      source: 'creator',
    });
  }
  const admins = db
    .prepare(
      "SELECT id, name, color, email, is_guest FROM users WHERE role IN ('owner','admin') AND is_active = 1",
    )
    .all() as { id: number; name: string; color: string; email: string; is_guest: number }[];
  for (const admin of admins) {
    if (explicit.has(admin.id)) continue;
    explicit.set(admin.id, {
      userId: admin.id,
      name: admin.name,
      color: admin.color,
      email: admin.email,
      isGuest: false,
      access: 'manage',
      source: 'admin',
    });
  }
  const members = [...explicit.values()]
    .filter((member) => !member.isGuest)
    .sort((a, b) => a.name.localeCompare(b.name));
  const guests = [...explicit.values()]
    .filter((member) => member.isGuest)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!board.is_private) {
    members.push({
      userId: 0,
      name: `Everyone in ${board.workspace_name}`,
      color: '#9CA3AF',
      email: '',
      isGuest: false,
      access: 'view',
      source: 'workspace',
    });
  }
  return [...members, ...guests];
}

export function setBoardMember(
  db: Db,
  actor: User,
  boardId: number,
  userId: number,
  access: Exclude<BoardAccess, 'none'>,
): { members: BoardMember[]; affected: number[] } {
  const board = boardRow(db, boardId);
  const target = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(userId) as
    { id: number; role: string; is_guest: number } | undefined;
  if (!target) throw notFound('User not found');
  if ((target.role === 'owner' || target.role === 'admin') && target.id !== actor.id) {
    throw forbidden('Admins always have access');
  }
  const next = target.is_guest === 1 && access === 'manage' ? 'edit' : access;
  db.prepare(
    `INSERT INTO board_members (board_id, user_id, access, added_by, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(board_id, user_id) DO UPDATE SET access = excluded.access`,
  ).run(boardId, userId, next, actor.id, new Date().toISOString());
  const members = listBoardMembers(db, boardId);
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  bus.publish({ event: { type: 'boards.access.changed' }, userId });
  return { members, affected: [userId] };
}

export function removeBoardMember(
  db: Db,
  actor: User,
  boardId: number,
  userId: number,
): { members: BoardMember[] } {
  const board = boardRow(db, boardId);
  if (board.created_by === userId) throw badRequest('The board creator cannot be removed');
  db.prepare('DELETE FROM board_members WHERE board_id = ? AND user_id = ?').run(boardId, userId);
  const members = listBoardMembers(db, boardId);
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  bus.publish({ event: { type: 'boards.access.changed' }, userId });
  return { members };
}

export function setBoardPrivacy(
  db: Db,
  actor: User,
  boardId: number,
  isPrivate: boolean,
): { board: { id: number; isPrivate: boolean }; members: BoardMember[] } {
  const board = boardRow(db, boardId);
  db.prepare('UPDATE boards SET is_private = ? WHERE id = ?').run(isPrivate ? 1 : 0, boardId);
  if (isPrivate) {
    db.prepare(
      `INSERT INTO board_members (board_id, user_id, access, added_by, created_at)
       VALUES (?, ?, 'manage', ?, ?)
       ON CONFLICT(board_id, user_id) DO NOTHING`,
    ).run(boardId, actor.id, actor.id, new Date().toISOString());
  }
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  bus.publish({ event: { type: 'boards.access.changed' }, userId: board.created_by });
  return { board: { id: boardId, isPrivate }, members: listBoardMembers(db, boardId) };
}

export function addGuestToBoard(
  db: Db,
  actor: User,
  boardId: number,
  email: string,
  access: 'view' | 'comment' | 'edit',
): { existing: boolean; userId: number | null; members: BoardMember[] } {
  const existing = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email) as
    { id: number; is_guest: number } | undefined;
  if (existing) {
    if (existing.is_guest !== 1) {
      throw conflict('Add them as a member instead');
    }
    db.prepare(
      `INSERT INTO board_members (board_id, user_id, access, added_by, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(board_id, user_id) DO UPDATE SET access = excluded.access`,
    ).run(boardId, existing.id, access, actor.id, new Date().toISOString());
    bus.publish({ event: { type: 'boards.access.changed' }, userId: existing.id });
    return { existing: true, userId: existing.id, members: listBoardMembers(db, boardId) };
  }
  return { existing: false, userId: null, members: listBoardMembers(db, boardId) };
}
