import type { Db } from '../db/db';
import { DEFAULT_STATUS_LABELS, defaultSettings, type ColumnType } from '../../shared/columns';
import {
  DEFAULT_VIEW_SETTINGS,
  type Board,
  type BoardFull,
  type Column,
  type Group,
  type User,
  type View,
  type ViewSettings,
} from '../../shared/types';
import { parseJson } from '../lib/json';
import { GAP } from '../lib/positions';
import { notFound } from '../lib/errors';
import { boardDraftSchema } from '../../shared/schemas';
import type { BoardDraft } from '../../shared/ai';
import { DEFAULT_STATUS_LABELS as STATUS_LABELS, newLabelId } from '../../shared/columns';
import { createColumn } from './columns';
import { createGroup } from './groups';
import { createItem } from './items';
import { parseHumanValue } from '../ai/human-values';
import { listUsers } from './users';
import { PALETTE } from '../../shared/columns';
import {
  assertBoardAccess,
  assertWriteWorkspace,
  boardAccess,
  workspaceIdForBoard,
} from './permissions';
import { logActivity } from './activity';
import { bus } from '../realtime/bus';

export interface BoardRow {
  id: number;
  workspace_id: number;
  name: string;
  description: string;
  position: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  is_private?: number;
}

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

interface GroupRow {
  id: number;
  board_id: number;
  title: string;
  color: string;
  position: number;
  collapsed: number;
}

interface ViewRow {
  id: number;
  board_id: number;
  name: string;
  type: 'table' | 'kanban' | 'calendar' | 'timeline';
  settings: string;
  position: number;
}

export function toBoard(row: BoardRow): Board {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    isPrivate: row.is_private === 1,
    myAccess: 'manage',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toColumn(row: ColumnRow): Column {
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    type: row.type,
    settings: parseJson(row.settings, {}),
    position: row.position,
    width: row.width,
  };
}

export function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    color: row.color,
    position: row.position,
    collapsed: row.collapsed === 1,
  };
}

export function toView(row: ViewRow): View {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    type: row.type,
    settings: { ...DEFAULT_VIEW_SETTINGS, ...parseJson<Partial<ViewSettings>>(row.settings, {}) },
    position: row.position,
  };
}

export function getBoardRow(db: Db, boardId: number): BoardRow {
  const row = db
    .prepare('SELECT * FROM boards WHERE id = ? AND archived_at IS NULL')
    .get(boardId) as BoardRow | undefined;
  if (!row) throw notFound('Board not found');
  return row;
}

export function getBoardFull(db: Db, u: User, boardId: number): BoardFull {
  assertBoardAccess(db, u, boardId, 'view');
  const board = getBoardRow(db, boardId);
  const access = boardAccess(db, u, boardId);
  const columns = db
    .prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position, id')
    .all(boardId) as ColumnRow[];
  const groups = db
    .prepare('SELECT * FROM item_groups WHERE board_id = ? ORDER BY position, id')
    .all(boardId) as GroupRow[];
  const views = db
    .prepare('SELECT * FROM views WHERE board_id = ? ORDER BY position, id')
    .all(boardId) as ViewRow[];
  return {
    board: {
      ...toBoard(board),
      isPrivate: board.is_private === 1,
      myAccess: access === 'none' ? 'view' : access,
    },
    columns: columns.map(toColumn),
    groups: groups.map(toGroup),
    views: views.map(toView),
  };
}

export function createBoard(
  db: Db,
  u: User,
  input: { workspaceId: number; name: string; description?: string; blank?: boolean },
): BoardFull {
  assertWriteWorkspace(db, u, input.workspaceId);
  const now = new Date().toISOString();
  const boardId = db.transaction(() => {
    const max = (
      db
        .prepare('SELECT max(position) AS p FROM boards WHERE workspace_id = ?')
        .get(input.workspaceId) as { p: number | null }
    ).p;
    const position = max === null ? GAP : max + GAP;
    const info = db
      .prepare(
        `INSERT INTO boards (workspace_id, name, description, position, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.workspaceId, input.name, input.description ?? '', position, u.id, now, now);
    const id = Number(info.lastInsertRowid);

    if (!input.blank) {
      const insertColumn = db.prepare(
        `INSERT INTO columns (board_id, title, type, settings, position, width, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      const statusSettings = { labels: DEFAULT_STATUS_LABELS.map((l) => ({ ...l })) };
      insertColumn.run(id, 'Owner', 'people', '{}', GAP, 140, u.id);
      insertColumn.run(id, 'Status', 'status', JSON.stringify(statusSettings), GAP * 2, 160, u.id);
      insertColumn.run(
        id,
        'Due date',
        'date',
        JSON.stringify(defaultSettings('date')),
        GAP * 3,
        140,
        u.id,
      );
      const insertGroup = db.prepare(
        'INSERT INTO item_groups (board_id, title, color, position, collapsed) VALUES (?, ?, ?, ?, 0)',
      );
      insertGroup.run(id, 'To do', '#3E8EF7', GAP);
      insertGroup.run(id, 'Completed', '#2BB673', GAP * 2);
    }

    db.prepare(
      'INSERT INTO views (board_id, name, type, settings, position) VALUES (?, ?, ?, ?, ?)',
    ).run(id, 'Main table', 'table', JSON.stringify(DEFAULT_VIEW_SETTINGS), GAP);

    logActivity(db, {
      boardId: id,
      actorId: u.id,
      action: 'board_created',
      data: { name: input.name },
    });
    return id;
  })();

  bus.publish({ event: { type: 'workspaces.changed' } });
  return getBoardFull(db, u, boardId);
}

export function updateBoard(
  db: Db,
  u: User,
  boardId: number,
  patch: { name?: string; description?: string; workspaceId?: number },
): Board {
  const current = getBoardRow(db, boardId);
  assertBoardAccess(db, u, boardId, 'manage');
  if (patch.workspaceId !== undefined && patch.workspaceId !== current.workspace_id) {
    assertWriteWorkspace(db, u, patch.workspaceId);
  }
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
  if (patch.workspaceId !== undefined) {
    sets.push('workspace_id = ?');
    values.push(patch.workspaceId);
  }
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  db.prepare(`UPDATE boards SET ${sets.join(', ')} WHERE id = ?`).run(...values, boardId);
  const board = toBoard(getBoardRow(db, boardId));
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  bus.publish({ event: { type: 'workspaces.changed' } });
  return board;
}

export function archiveBoard(db: Db, u: User, boardId: number): void {
  assertBoardAccess(db, u, boardId, 'manage');
  db.prepare('UPDATE boards SET archived_at = ?, archived_by = ? WHERE id = ?').run(
    new Date().toISOString(),
    u.id,
    boardId,
  );
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  bus.publish({ event: { type: 'workspaces.changed' } });
}

export function createBoardFromDraft(
  db: Db,
  u: User,
  workspaceId: number,
  input: BoardDraft,
): BoardFull {
  const draft = boardDraftSchema.parse(input) as BoardDraft;
  const full = createBoard(db, u, {
    workspaceId,
    name: draft.name,
    description: draft.description,
    blank: true,
  });
  const boardId = full.board.id;
  const users = listUsers(db);
  const columns: Column[] = [];

  for (const draftColumn of draft.columns) {
    let settings: Record<string, unknown> = {};
    if (draftColumn.type === 'status' || draftColumn.type === 'dropdown') {
      const labels =
        draftColumn.labels && draftColumn.labels.length
          ? draftColumn.labels.map((label, index) => ({
              id: newLabelId(),
              name: label.name,
              color: label.color ?? PALETTE[index % PALETTE.length],
            }))
          : draftColumn.type === 'status'
            ? STATUS_LABELS.map((label) => ({ ...label }))
            : [];
      settings = draftColumn.type === 'status' ? { labels } : { options: labels };
    }
    columns.push(
      createColumn(db, u, boardId, {
        title: draftColumn.title,
        type: draftColumn.type,
        settings,
      }),
    );
  }

  const groups: { id: number; title: string }[] = [];
  draft.groups.forEach((draftGroup, index) => {
    const group = createGroup(db, u, boardId, {
      title: draftGroup.title,
      color: draftGroup.color ?? PALETTE[index % PALETTE.length],
    });
    groups.push({ id: group.id, title: group.title });
  });

  for (const draftItem of draft.items) {
    const group = groups.find((entry) => entry.title === draftItem.group) ?? groups[0];
    if (!group) break;
    const values: Record<string, unknown> = {};
    for (const [title, raw] of Object.entries(draftItem.values ?? {})) {
      const column = columns.find(
        (candidate) => candidate.title.toLowerCase() === title.toLowerCase(),
      );
      if (!column) continue;
      try {
        const parsed = parseHumanValue(column, raw, users);
        if (parsed !== null) values[String(column.id)] = parsed;
      } catch {}
    }
    createItem(db, u, boardId, {
      groupId: group.id,
      name: draftItem.name,
      values,
    });
  }

  return getBoardFull(db, u, boardId);
}
