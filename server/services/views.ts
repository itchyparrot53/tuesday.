import type { Db } from '../db/db';
import {
  DEFAULT_VIEW_SETTINGS,
  type User,
  type View,
  type ViewSettings,
  type ViewType,
} from '../../shared/types';
import { viewSettingsSchema } from '../../shared/schemas';
import { badRequest, conflict, notFound } from '../lib/errors';
import type { ColumnType } from '../../shared/columns';
import { parseJson } from '../lib/json';
import { GAP } from '../lib/positions';
import { getBoardRow, toView } from './boards';
import { assertBoardAccess } from './permissions';
import { bus } from '../realtime/bus';

function boardColumns(db: Db, boardId: number): { id: number; type: ColumnType }[] {
  return db
    .prepare('SELECT id, type FROM columns WHERE board_id = ? ORDER BY position, id')
    .all(boardId) as { id: number; type: ColumnType }[];
}

function validateSettings(db: Db, boardId: number, type: ViewType, settings: ViewSettings): void {
  const columns = boardColumns(db, boardId);
  const byId = new Map(columns.map((column) => [column.id, column]));

  const requireColumn = (
    key: 'kanbanColumnId' | 'calendarColumnId' | 'timelineColumnId',
    types: ColumnType[],
    message: string,
  ) => {
    const value = settings[key];
    if (value === undefined || value === null) {
      const first = columns.find((column) => types.includes(column.type));
      if (!first) throw badRequest(message);
      settings[key] = first.id;
      return;
    }
    const column = byId.get(value);
    if (!column || !types.includes(column.type)) {
      throw badRequest('That column cannot be used for this view');
    }
  };

  if (type === 'kanban') {
    requireColumn('kanbanColumnId', ['status', 'dropdown', 'people'], 'Add a Status column first');
  }
  if (type === 'calendar') {
    requireColumn('calendarColumnId', ['date', 'timeline'], 'Add a Date column first');
  }
  if (type === 'timeline') {
    requireColumn('timelineColumnId', ['timeline', 'date'], 'Add a Timeline column first');
  }
  for (const key of ['kanbanColumnId', 'calendarColumnId', 'timelineColumnId'] as const) {
    const value = settings[key];
    if (value !== undefined && value !== null && !byId.has(value)) {
      throw badRequest('That column is not on this board');
    }
  }
  for (const id of settings.cardColumnIds ?? []) {
    if (!byId.has(id)) throw badRequest('That card field is not on this board');
  }
}

interface ViewRow {
  id: number;
  board_id: number;
  name: string;
  type: 'table' | 'kanban' | 'calendar' | 'timeline';
  settings: string;
  position: number;
}

export function getViewRow(db: Db, viewId: number): ViewRow {
  const row = db.prepare('SELECT * FROM views WHERE id = ?').get(viewId) as ViewRow | undefined;
  if (!row) throw notFound('View not found');
  return row;
}

export function createView(
  db: Db,
  u: User,
  boardId: number,
  input: { name: string; type: string; settings?: Record<string, unknown> },
): View {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, u, board.id, 'manage');
  const type = input.type as ViewType;
  const merged = { ...DEFAULT_VIEW_SETTINGS, ...(input.settings ?? {}) };
  const settings = viewSettingsSchema.parse(merged);
  validateSettings(db, boardId, type, settings);
  const max = (
    db.prepare('SELECT max(position) AS p FROM views WHERE board_id = ?').get(boardId) as {
      p: number | null;
    }
  ).p;
  const position = max === null ? GAP : max + GAP;
  const info = db
    .prepare('INSERT INTO views (board_id, name, type, settings, position) VALUES (?, ?, ?, ?, ?)')
    .run(boardId, input.name, type, JSON.stringify(settings), position);
  const view = toView(getViewRow(db, Number(info.lastInsertRowid)));
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return view;
}

export function updateView(
  db: Db,
  u: User,
  viewId: number,
  patch: { name?: string; settings?: Record<string, unknown> },
): View {
  const row = getViewRow(db, viewId);
  const board = getBoardRow(db, row.board_id);
  assertBoardAccess(db, u, board.id, 'manage');
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    values.push(patch.name);
  }
  if (patch.settings !== undefined) {
    const current = parseJson<Record<string, unknown>>(row.settings, {});
    const merged = { ...DEFAULT_VIEW_SETTINGS, ...current, ...patch.settings };
    const settings = viewSettingsSchema.parse(merged);
    validateSettings(db, row.board_id, row.type, settings);
    sets.push('settings = ?');
    values.push(JSON.stringify(settings));
  }
  if (sets.length) {
    db.prepare(`UPDATE views SET ${sets.join(', ')} WHERE id = ?`).run(...values, viewId);
  }
  const view = toView(getViewRow(db, viewId));
  bus.publish({ event: { type: 'board.changed', boardId: row.board_id }, boardId: row.board_id });
  return view;
}

export function deleteView(db: Db, u: User, viewId: number): void {
  const row = getViewRow(db, viewId);
  const board = getBoardRow(db, row.board_id);
  assertBoardAccess(db, u, board.id, 'manage');
  const count = (
    db.prepare('SELECT count(*) AS n FROM views WHERE board_id = ?').get(row.board_id) as {
      n: number;
    }
  ).n;
  if (count <= 1) throw conflict('A board must have at least one view');
  db.prepare('DELETE FROM views WHERE id = ?').run(viewId);
  bus.publish({ event: { type: 'board.changed', boardId: row.board_id }, boardId: row.board_id });
}
