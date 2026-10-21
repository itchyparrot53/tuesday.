import type { Db } from '../db/db';
import {
  defaultSettings,
  settingsSchema,
  type ColumnSettings,
  type ColumnType,
} from '../../shared/columns';
import type { Column, User } from '../../shared/types';
import { badRequest, notFound } from '../lib/errors';
import { parseJson } from '../lib/json';
import { positionAfter } from '../lib/positions';
import { getBoardRow, toColumn } from './boards';
import { assertBoardAccess } from './permissions';
import { logActivity } from './activity';
import { bus } from '../realtime/bus';
import { enqueueAiForColumn } from '../jobs/ai-enqueue';

interface ColumnRow {
  id: number;
  board_id: number;
  title: string;
  type: ColumnType;
  settings: string;
  position: number;
  width: number;
  created_by: number | null;
}

export function getColumnRow(db: Db, columnId: number): ColumnRow {
  const row = db.prepare('SELECT * FROM columns WHERE id = ?').get(columnId) as
    ColumnRow | undefined;
  if (!row) throw notFound('Column not found');
  return row;
}

export function listColumnRows(db: Db, boardId: number): ColumnRow[] {
  return db
    .prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position, id')
    .all(boardId) as ColumnRow[];
}

function positionForNewColumn(
  db: Db,
  boardId: number,
  afterColumnId: number | null | undefined,
): number {
  if (afterColumnId === undefined) {
    const max = (
      db.prepare('SELECT max(position) AS p FROM columns WHERE board_id = ?').get(boardId) as {
        p: number | null;
      }
    ).p;
    return max === null ? 1024 : max + 1024;
  }
  if (afterColumnId === null) {
    const min = (
      db.prepare('SELECT min(position) AS p FROM columns WHERE board_id = ?').get(boardId) as {
        p: number | null;
      }
    ).p;
    return positionAfter(null, min ?? null);
  }
  const after = getColumnRow(db, afterColumnId);
  if (after.board_id !== boardId) throw badRequest('Column is on another board');
  const next = db
    .prepare('SELECT min(position) AS p FROM columns WHERE board_id = ? AND position > ?')
    .get(boardId, after.position) as { p: number | null };
  return positionAfter(after.position, next.p);
}

function pruneValues(db: Db, column: ColumnRow, settings: ColumnSettings): void {
  if (column.type !== 'status' && column.type !== 'dropdown') return;
  const allowed = new Set(
    (column.type === 'status' ? settings.labels : settings.options)?.map((l) => l.id) ?? [],
  );
  const rows = db
    .prepare('SELECT item_id, value FROM item_values WHERE column_id = ?')
    .all(column.id) as { item_id: number; value: string }[];
  const del = db.prepare('DELETE FROM item_values WHERE item_id = ? AND column_id = ?');
  const update = db.prepare(
    'UPDATE item_values SET value = ?, updated_at = ? WHERE item_id = ? AND column_id = ?',
  );
  for (const row of rows) {
    if (column.type === 'status') {
      const value = parseJson<{ labelId?: string }>(row.value, {});
      if (!value.labelId || !allowed.has(value.labelId)) del.run(row.item_id, column.id);
    } else {
      const value = parseJson<{ optionIds?: string[] }>(row.value, {});
      const kept = (value.optionIds ?? []).filter((id) => allowed.has(id));
      if (kept.length) {
        update.run(
          JSON.stringify({ optionIds: kept }),
          new Date().toISOString(),
          row.item_id,
          column.id,
        );
      } else {
        del.run(row.item_id, column.id);
      }
    }
  }
}

export function createColumn(
  db: Db,
  u: User,
  boardId: number,
  input: {
    title: string;
    type: ColumnType;
    settings?: Record<string, unknown>;
    afterColumnId?: number | null;
  },
): Column {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, u, board.id, 'manage');
  const merged = { ...defaultSettings(input.type), ...(input.settings ?? {}) };
  const settings = settingsSchema(input.type).parse(merged);
  const position = positionForNewColumn(db, boardId, input.afterColumnId);
  const info = db
    .prepare(
      `INSERT INTO columns (board_id, title, type, settings, position, width, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(boardId, input.title, input.type, JSON.stringify(settings), position, 160, u.id);
  const column = toColumn(getColumnRow(db, Number(info.lastInsertRowid)));
  logActivity(db, {
    boardId,
    actorId: u.id,
    action: 'column_created',
    data: { title: column.title, type: column.type },
  });
  if (input.type === 'ai' && settings.autoRun) {
    enqueueAiForColumn(db, column.id, u.id);
  }
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return column;
}

export function updateColumn(
  db: Db,
  u: User,
  columnId: number,
  patch: {
    title?: string;
    settings?: Record<string, unknown>;
    width?: number;
    afterColumnId?: number | null;
  },
): Column {
  const row = getColumnRow(db, columnId);
  const board = getBoardRow(db, row.board_id);
  assertBoardAccess(db, u, board.id, 'manage');

  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    values.push(patch.title);
  }
  if (patch.settings !== undefined) {
    const current = parseJson<ColumnSettings>(row.settings, {});
    const merged = { ...current, ...patch.settings };
    const settings = settingsSchema(row.type).parse(merged);
    pruneValues(db, row, settings);
    sets.push('settings = ?');
    values.push(JSON.stringify(settings));
  }
  if (patch.width !== undefined) {
    sets.push('width = ?');
    values.push(Math.min(480, Math.max(80, Math.round(patch.width))));
  }
  if (patch.afterColumnId !== undefined) {
    sets.push('position = ?');
    values.push(positionForNewColumn(db, row.board_id, patch.afterColumnId));
  }
  if (sets.length) {
    db.prepare(`UPDATE columns SET ${sets.join(', ')} WHERE id = ?`).run(...values, columnId);
  }
  const column = toColumn(getColumnRow(db, columnId));
  bus.publish({ event: { type: 'board.changed', boardId: row.board_id }, boardId: row.board_id });
  return column;
}

export function deleteColumn(db: Db, u: User, columnId: number): void {
  const row = getColumnRow(db, columnId);
  const board = getBoardRow(db, row.board_id);
  assertBoardAccess(db, u, board.id, 'manage');
  db.prepare('DELETE FROM columns WHERE id = ?').run(columnId);
  logActivity(db, {
    boardId: row.board_id,
    actorId: u.id,
    action: 'column_deleted',
    data: { title: row.title },
  });
  bus.publish({ event: { type: 'board.changed', boardId: row.board_id }, boardId: row.board_id });
}
