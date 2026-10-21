import type { Db } from '../db/db';
import { PALETTE } from '../../shared/columns';
import type { Group, User } from '../../shared/types';
import { conflict, notFound } from '../lib/errors';
import { positionAfter } from '../lib/positions';
import { getBoardRow, toGroup } from './boards';
import { assertBoardAccess } from './permissions';
import { logActivity } from './activity';
import { bus } from '../realtime/bus';

interface GroupRow {
  id: number;
  board_id: number;
  title: string;
  color: string;
  position: number;
  collapsed: number;
}

export function getGroupRow(db: Db, groupId: number): GroupRow {
  const row = db.prepare('SELECT * FROM item_groups WHERE id = ?').get(groupId) as
    GroupRow | undefined;
  if (!row) throw notFound('Group not found');
  return row;
}

function nextColor(db: Db, boardId: number): string {
  const used = new Set(
    (
      db.prepare('SELECT color FROM item_groups WHERE board_id = ?').all(boardId) as {
        color: string;
      }[]
    ).map((r) => r.color),
  );
  return PALETTE.find((c) => !used.has(c)) ?? PALETTE[0];
}

export function createGroup(
  db: Db,
  u: User,
  boardId: number,
  input: { title: string; color?: string; at?: 'top' | 'bottom' },
): Group {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, u, board.id, 'manage');
  const at = input.at ?? 'bottom';
  const extreme = (
    db
      .prepare(
        at === 'top'
          ? 'SELECT min(position) AS p FROM item_groups WHERE board_id = ?'
          : 'SELECT max(position) AS p FROM item_groups WHERE board_id = ?',
      )
      .get(boardId) as { p: number | null }
  ).p;
  const position = at === 'top' ? positionAfter(null, extreme) : positionAfter(extreme, null);
  const color = input.color ?? nextColor(db, boardId);
  const info = db
    .prepare(
      'INSERT INTO item_groups (board_id, title, color, position, collapsed) VALUES (?, ?, ?, ?, 0)',
    )
    .run(boardId, input.title, color, position);
  const group = toGroup(getGroupRow(db, Number(info.lastInsertRowid)));
  logActivity(db, {
    boardId,
    actorId: u.id,
    action: 'group_created',
    data: { title: group.title },
  });
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return group;
}

export function updateGroup(
  db: Db,
  u: User,
  groupId: number,
  patch: {
    title?: string;
    color?: string;
    collapsed?: boolean;
    afterGroupId?: number | null;
  },
): Group {
  const row = getGroupRow(db, groupId);
  const board = getBoardRow(db, row.board_id);
  assertBoardAccess(db, u, board.id, 'manage');
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    values.push(patch.title);
  }
  if (patch.color !== undefined) {
    sets.push('color = ?');
    values.push(patch.color);
  }
  if (patch.collapsed !== undefined) {
    sets.push('collapsed = ?');
    values.push(patch.collapsed ? 1 : 0);
  }
  if (patch.afterGroupId !== undefined) {
    let position: number;
    if (patch.afterGroupId === null) {
      const min = (
        db
          .prepare('SELECT min(position) AS p FROM item_groups WHERE board_id = ?')
          .get(row.board_id) as { p: number | null }
      ).p;
      position = positionAfter(null, min);
    } else {
      const after = getGroupRow(db, patch.afterGroupId);
      if (after.board_id !== row.board_id) throw notFound('Group not found');
      const next = db
        .prepare('SELECT min(position) AS p FROM item_groups WHERE board_id = ? AND position > ?')
        .get(row.board_id, after.position) as { p: number | null };
      position = positionAfter(after.position, next.p);
    }
    sets.push('position = ?');
    values.push(position);
  }
  if (sets.length) {
    db.prepare(`UPDATE item_groups SET ${sets.join(', ')} WHERE id = ?`).run(...values, groupId);
  }
  const group = toGroup(getGroupRow(db, groupId));
  bus.publish({ event: { type: 'board.changed', boardId: row.board_id }, boardId: row.board_id });
  return group;
}

export function deleteGroup(db: Db, u: User, groupId: number): void {
  const row = getGroupRow(db, groupId);
  const board = getBoardRow(db, row.board_id);
  assertBoardAccess(db, u, board.id, 'manage');
  const count = (
    db.prepare('SELECT count(*) AS n FROM item_groups WHERE board_id = ?').get(row.board_id) as {
      n: number;
    }
  ).n;
  if (count <= 1) throw conflict('A board must have at least one group');
  db.prepare('DELETE FROM item_groups WHERE id = ?').run(groupId);
  logActivity(db, {
    boardId: row.board_id,
    actorId: u.id,
    action: 'group_deleted',
    data: { title: row.title },
  });
  bus.publish({ event: { type: 'board.changed', boardId: row.board_id }, boardId: row.board_id });
}
