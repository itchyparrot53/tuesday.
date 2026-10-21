import type { Db } from '../db/db';
import {
  cellToText,
  SERVER_MANAGED_TYPES,
  isEmptyValue,
  validateValue,
  type CellValue,
  type ColumnType,
  type AiCellValue,
} from '../../shared/columns';
import type { Board, Item, Update, User } from '../../shared/types';
import { badRequest, notFound } from '../lib/errors';
import { parseJson } from '../lib/json';
import { positionAfter } from '../lib/positions';
import { getBoardRow, toBoard } from './boards';
import { getGroupRow } from './groups';
import { assertBoardAccess, boardIdForItem } from './permissions';
import { logActivity } from './activity';
import { queueIndex } from '../knowledge/indexer';
import { listItemUpdates } from './updates';
import { notify } from './notifications';
import { reindexItem } from './search';
import { enqueueAiForItem } from '../jobs/ai-enqueue';
import { attachComputed } from './computed';
import { assertNoCycle, autoShiftDependents } from './dependencies';
import { bus } from '../realtime/bus';

export interface ItemRow {
  id: number;
  board_id: number;
  group_id: number;
  parent_id: number | null;
  name: string;
  position: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface ColumnRow {
  id: number;
  board_id: number;
  title: string;
  type: ColumnType;
  settings: string;
}

function userNameMap(db: Db): Map<number, string> {
  return new Map(
    (db.prepare('SELECT id, name FROM users').all() as { id: number; name: string }[]).map((r) => [
      r.id,
      r.name,
    ]),
  );
}

function valuesFor(db: Db, itemIds: number[]): Map<number, Record<string, CellValue>> {
  const out = new Map<number, Record<string, CellValue>>();
  if (!itemIds.length) return out;
  const placeholders = itemIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT item_id, column_id, value FROM item_values WHERE item_id IN (${placeholders})`)
    .all(...itemIds) as { item_id: number; column_id: number; value: string }[];
  for (const row of rows) {
    const bucket = out.get(row.item_id) ?? {};
    bucket[String(row.column_id)] = parseJson<CellValue>(row.value, { text: '' });
    out.set(row.item_id, bucket);
  }
  return out;
}

function toItem(row: ItemRow, values: Record<string, CellValue>, updateCount: number): Item {
  return {
    id: row.id,
    boardId: row.board_id,
    groupId: row.group_id,
    parentId: row.parent_id,
    name: row.name,
    position: row.position,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    values,
    updateCount,
  };
}

export function getItemRow(db: Db, itemId: number): ItemRow {
  const row = db.prepare('SELECT * FROM items WHERE id = ? AND archived_at IS NULL').get(itemId) as
    ItemRow | undefined;
  if (!row) throw notFound('Item not found');
  return row;
}

export function listItems(db: Db, u: User, boardId: number): Item[] {
  assertBoardAccess(db, u, boardId, 'view');
  const rows = db
    .prepare('SELECT * FROM items WHERE board_id = ? AND archived_at IS NULL ORDER BY position, id')
    .all(boardId) as ItemRow[];
  const values = valuesFor(
    db,
    rows.map((r) => r.id),
  );
  const counts = new Map(
    (
      db
        .prepare(
          `SELECT u.item_id, count(*) AS n FROM updates u JOIN items i ON i.id = u.item_id
           WHERE i.board_id = ? GROUP BY u.item_id`,
        )
        .all(boardId) as { item_id: number; n: number }[]
    ).map((r) => [r.item_id, r.n]),
  );
  const items = rows.map((r) => toItem(r, values.get(r.id) ?? {}, counts.get(r.id) ?? 0));
  return attachComputed(db, u, boardId, items);
}

export function getItemDto(db: Db, itemId: number): Item {
  const row = getItemRow(db, itemId);
  const values = valuesFor(db, [row.id]).get(row.id) ?? {};
  const count = (
    db.prepare('SELECT count(*) AS n FROM updates WHERE item_id = ?').get(itemId) as { n: number }
  ).n;
  return toItem(row, values, count);
}

function columnRow(db: Db, columnId: number): ColumnRow {
  const row = db.prepare('SELECT * FROM columns WHERE id = ?').get(columnId) as
    ColumnRow | undefined;
  if (!row) throw notFound('Column not found');
  return row;
}

function peopleIds(db: Db, itemId: number, columnId: number): number[] {
  const row = db
    .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
    .get(itemId, columnId) as { value: string } | undefined;
  if (!row) return [];
  return parseJson<{ userIds?: number[] }>(row.value, {}).userIds ?? [];
}

function applyValue(
  db: Db,
  u: User,
  item: ItemRow,
  columnId: number,
  raw: unknown,
  kind: 'user' | 'ai' | 'system',
  depth = 0,
): void {
  const column = columnRow(db, columnId);
  if (column.board_id !== item.board_id) throw badRequest('Column is on another board');
  if (SERVER_MANAGED_TYPES.includes(column.type)) {
    throw badRequest(`${column.type} cells can't be edited directly`);
  }
  const settings = parseJson(column.settings, {});
  const names = userNameMap(db);
  const oldRow = db
    .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
    .get(item.id, columnId) as { value: string } | undefined;
  const oldValue = oldRow ? parseJson<CellValue>(oldRow.value, { text: '' }) : undefined;
  const from = cellToText(column.type, settings, oldValue, (id) => names.get(id) ?? '');

  const value =
    raw === null
      ? null
      : (() => {
          try {
            const parsed = validateValue(column.type, settings, raw);
            if (column.type === 'dependency' && 'itemIds' in parsed) {
              for (const id of parsed.itemIds) {
                const target = db
                  .prepare('SELECT board_id, archived_at FROM items WHERE id = ?')
                  .get(id) as { board_id: number; archived_at: string | null } | undefined;
                if (!target || target.board_id !== item.board_id || target.archived_at) {
                  throw new Error('Dependencies must be items on this board');
                }
              }
              assertNoCycle(db, column.id, item.id, parsed.itemIds);
            }
            if (column.type === 'connect' && 'itemIds' in parsed) {
              const targetBoardId = parseJson<{ targetBoardId?: number }>(
                column.settings,
                {},
              ).targetBoardId;
              if (targetBoardId) {
                for (const id of parsed.itemIds) {
                  const target = db
                    .prepare('SELECT board_id, archived_at FROM items WHERE id = ?')
                    .get(id) as { board_id: number; archived_at: string | null } | undefined;
                  if (!target || target.board_id !== targetBoardId || target.archived_at) {
                    throw new Error('Connected items must be on the target board');
                  }
                }
              }
            }
            if (column.type === 'file' && 'fileIds' in parsed) {
              const existing = db
                .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
                .get(item.id, columnId) as { value: string } | undefined;
              const allowed = new Set(
                existing
                  ? (parseJson<{ fileIds?: number[] }>(existing.value, {}).fileIds ?? [])
                  : [],
              );
              if (!parsed.fileIds.every((id) => allowed.has(id))) {
                throw new Error('Files can only be removed here');
              }
            }
            return parsed;
          } catch (err) {
            throw badRequest(err instanceof Error ? err.message : 'Invalid value');
          }
        })();
  const now = new Date().toISOString();
  let to = '';
  if (value === null || isEmptyValue(column.type, value)) {
    db.prepare('DELETE FROM item_values WHERE item_id = ? AND column_id = ?').run(
      item.id,
      columnId,
    );
  } else {
    to = cellToText(column.type, settings, value, (id) => names.get(id) ?? '');
    db.prepare(
      `INSERT INTO item_values (item_id, column_id, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, column_id) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).run(item.id, columnId, JSON.stringify(value), now, u.id);
  }
  db.prepare('UPDATE items SET updated_at = ? WHERE id = ?').run(now, item.id);

  if (from !== to) {
    autoShiftDependents(
      db,
      u,
      item.id,
      item.board_id,
      column.id,
      column.type,
      oldValue,
      value,
      depth,
    );
    logActivity(db, {
      boardId: item.board_id,
      itemId: item.id,
      actorId: u.id,
      actorKind: kind,
      action: 'value_changed',
      depth,
      data: {
        columnId,
        columnTitle: column.title,
        columnType: column.type,
        from,
        to,
        fromValue: oldValue ?? null,
        toValue: value,
      },
    });
  }
  if (column.type === 'people' && value && 'userIds' in value) {
    const before = oldValue && 'userIds' in oldValue ? (oldValue.userIds as number[]) : [];
    const added = (value.userIds as number[]).filter((id) => !before.includes(id) && id !== u.id);
    for (const userId of added) {
      const workspaceId = (
        db.prepare('SELECT workspace_id FROM boards WHERE id = ?').get(item.board_id) as {
          workspace_id: number;
        }
      ).workspace_id;
      notify(db, {
        userId,
        workspaceId,
        kind: 'assigned',
        title: `${u.name} assigned you to ${item.name}`,
        body: from ? `Previously: ${from}` : '',
        link: `/boards/${item.board_id}?item=${item.id}`,
        actorId: u.id,
        boardId: item.board_id,
      });
    }
  }
  enqueueAiForItem(db, item.board_id, item.id, u.id, { columnTitle: column.title });
  reindexItem(db, item.id);
  bus.publish({ event: { type: 'board.changed', boardId: item.board_id }, boardId: item.board_id });
}

export function setValue(
  db: Db,
  u: User,
  itemId: number,
  columnId: number,
  raw: unknown | null,
  kind: 'user' | 'ai' | 'system' = 'user',
  depth = 0,
): Item {
  const boardId = boardIdForItem(db, itemId);
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, u, boardId, 'edit');
  const item = getItemRow(db, itemId);
  applyValue(db, u, item, columnId, raw, kind, depth);
  queueIndex(db, 'item', itemId);
  return getItemDto(db, itemId);
}

function firstOrLast(db: Db, item: ItemRow, parentId: number | null, at: 'top' | 'bottom') {
  const row = db
    .prepare(
      `SELECT ${at === 'top' ? 'min' : 'max'}(position) AS p FROM items
       WHERE board_id = ? AND group_id = ? AND archived_at IS NULL AND parent_id IS ?`,
    )
    .get(item.board_id, item.group_id, parentId) as { p: number | null };
  return at === 'top' ? positionAfter(null, row.p) : positionAfter(row.p, null);
}

export function createItem(
  db: Db,
  u: User,
  boardId: number,
  input: {
    groupId: number;
    name: string;
    parentId?: number;
    at?: 'top' | 'bottom';
    values?: Record<string, unknown>;
  },
  kind: 'user' | 'ai' | 'system' = 'user',
  depth = 0,
): Item {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, u, boardId, 'edit');
  const group = getGroupRow(db, input.groupId);
  if (group.board_id !== boardId) throw badRequest('Group is on another board');

  let parentId: number | null = null;
  let groupId = input.groupId;
  if (input.parentId !== undefined) {
    const parent = getItemRow(db, input.parentId);
    if (parent.board_id !== boardId) throw badRequest('Parent is on another board');
    if (parent.parent_id !== null) throw badRequest('Subitems cannot have subitems');
    parentId = parent.id;
    groupId = parent.group_id;
  }

  const now = new Date().toISOString();
  const itemId = db.transaction(() => {
    const placeholder: ItemRow = {
      id: 0,
      board_id: boardId,
      group_id: groupId,
      parent_id: parentId,
      name: input.name,
      position: 0,
      created_by: u.id,
      created_at: now,
      updated_at: now,
      archived_at: null,
    };
    const position = firstOrLast(db, placeholder, parentId, input.at ?? 'bottom');
    const info = db
      .prepare(
        `INSERT INTO items (board_id, group_id, parent_id, name, position, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(boardId, groupId, parentId, input.name, position, u.id, now, now);
    const id = Number(info.lastInsertRowid);
    const row = getItemRow(db, id);
    for (const [columnId, value] of Object.entries(input.values ?? {})) {
      applyValue(db, u, row, Number(columnId), value, kind, depth);
    }
    logActivity(db, {
      boardId,
      itemId: id,
      actorId: u.id,
      actorKind: kind,
      action: 'item_created',
      depth,
      data: { name: input.name },
    });
    reindexItem(db, id);
    return id;
  })();

  enqueueAiForItem(db, boardId, itemId, u.id, { name: true });
  queueIndex(db, 'item', itemId);
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return getItemDto(db, itemId);
}

export function updateItem(
  db: Db,
  u: User,
  itemId: number,
  input: { name?: string; groupId?: number; afterItemId?: number | null },
  kind: 'user' | 'ai' | 'system' = 'user',
  depth = 0,
): Item {
  const boardId = boardIdForItem(db, itemId);
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, u, boardId, 'edit');
  const row = getItemRow(db, itemId);

  db.transaction(() => {
    const now = new Date().toISOString();
    if (input.name !== undefined && input.name !== row.name) {
      db.prepare('UPDATE items SET name = ?, updated_at = ? WHERE id = ?').run(
        input.name,
        now,
        itemId,
      );
      logActivity(db, {
        boardId,
        itemId,
        actorId: u.id,
        actorKind: kind,
        action: 'item_renamed',
        depth,
        data: { from: row.name, to: input.name },
      });
      reindexItem(db, itemId);
    }

    const targetGroupId = input.groupId ?? row.group_id;
    const group = getGroupRow(db, targetGroupId);
    if (group.board_id !== boardId) throw badRequest('Group is on another board');
    const groupChanged = targetGroupId !== row.group_id;

    let position = row.position;
    if (input.afterItemId !== undefined) {
      if (input.afterItemId === null) {
        const min = (
          db
            .prepare(
              `SELECT min(position) AS p FROM items WHERE board_id = ? AND group_id = ?
               AND archived_at IS NULL AND parent_id IS ? AND id != ?`,
            )
            .get(boardId, targetGroupId, row.parent_id, itemId) as { p: number | null }
        ).p;
        position = positionAfter(null, min);
      } else {
        const after = getItemRow(db, input.afterItemId);
        if (after.board_id !== boardId || after.group_id !== targetGroupId) {
          throw badRequest('Target item is in another group');
        }
        const next = (
          db
            .prepare(
              `SELECT min(position) AS p FROM items WHERE board_id = ? AND group_id = ?
               AND archived_at IS NULL AND parent_id IS ? AND position > ? AND id != ?`,
            )
            .get(boardId, targetGroupId, row.parent_id, after.position, itemId) as {
            p: number | null;
          }
        ).p;
        position = positionAfter(after.position, next);
      }
    } else if (groupChanged) {
      const max = (
        db
          .prepare(
            `SELECT max(position) AS p FROM items WHERE board_id = ? AND group_id = ?
             AND archived_at IS NULL AND parent_id IS ?`,
          )
          .get(boardId, targetGroupId, row.parent_id) as { p: number | null }
      ).p;
      position = positionAfter(max, null);
    }

    db.prepare('UPDATE items SET group_id = ?, position = ?, updated_at = ? WHERE id = ?').run(
      targetGroupId,
      position,
      now,
      itemId,
    );
    if (groupChanged && row.parent_id === null) {
      db.prepare('UPDATE items SET group_id = ? WHERE parent_id = ?').run(targetGroupId, itemId);
    }
    if (groupChanged) {
      const fromGroup = getGroupRow(db, row.group_id);
      logActivity(db, {
        boardId,
        itemId,
        actorId: u.id,
        actorKind: kind,
        action: 'item_moved',
        depth,
        data: { from: fromGroup.title, to: group.title, groupId: targetGroupId },
      });
    }
  })();

  if (input.name !== undefined && input.name !== row.name) {
    enqueueAiForItem(db, boardId, itemId, u.id, { name: true });
  }
  queueIndex(db, 'item', itemId);
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return getItemDto(db, itemId);
}

export function archiveItem(
  db: Db,
  u: User,
  itemId: number,
  depth = 0,
  kind: 'user' | 'system' = 'user',
): void {
  const boardId = boardIdForItem(db, itemId);
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, u, boardId, 'edit');
  const row = getItemRow(db, itemId);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      'UPDATE items SET archived_at = ?, archived_by = ? WHERE id = ? OR parent_id = ?',
    ).run(now, u.id, itemId, itemId);
    logActivity(db, {
      boardId,
      itemId,
      actorId: u.id,
      actorKind: kind,
      action: 'item_archived',
      depth,
      data: { name: row.name },
    });
    reindexItem(db, itemId);
    const subs = db.prepare('SELECT id FROM items WHERE parent_id = ?').all(itemId) as {
      id: number;
    }[];
    for (const sub of subs) reindexItem(db, sub.id);
  })();
  queueIndex(db, 'item', itemId);
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
}

export function bulkItems(
  db: Db,
  u: User,
  input: { itemIds: number[]; action: 'archive' | 'move'; groupId?: number },
): number {
  const rows = input.itemIds.map((id) => getItemRow(db, id));
  if (!rows.length) return 0;
  const boardId = rows[0].board_id;
  if (rows.some((r) => r.board_id !== boardId)) throw badRequest('All items must be on one board');
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, u, boardId, 'edit');
  const now = new Date().toISOString();

  db.transaction(() => {
    if (input.action === 'archive') {
      for (const row of rows) {
        db.prepare(
          'UPDATE items SET archived_at = ?, archived_by = ? WHERE id = ? OR parent_id = ?',
        ).run(now, u.id, row.id, row.id);
        logActivity(db, {
          boardId,
          itemId: row.id,
          actorId: u.id,
          action: 'item_archived',
          data: { name: row.name },
        });
        reindexItem(db, row.id);
      }
    } else {
      if (!input.groupId) throw badRequest('groupId is required to move items');
      const group = getGroupRow(db, input.groupId);
      if (group.board_id !== boardId) throw badRequest('Group is on another board');
      const maxRow = db
        .prepare(
          `SELECT max(position) AS p FROM items WHERE board_id = ? AND group_id = ?
           AND archived_at IS NULL AND parent_id IS NULL`,
        )
        .get(boardId, group.id) as { p: number | null };
      let position = maxRow.p;
      for (const row of rows) {
        position = positionAfter(position, null);
        db.prepare('UPDATE items SET group_id = ?, position = ?, updated_at = ? WHERE id = ?').run(
          group.id,
          position,
          now,
          row.id,
        );
        db.prepare('UPDATE items SET group_id = ? WHERE parent_id = ?').run(group.id, row.id);
      }
    }
  })();
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return rows.length;
}

export function getItem(
  db: Db,
  u: User,
  itemId: number,
): { item: Item; board: Board; subitems: Item[]; updates: Update[] } {
  const boardId = boardIdForItem(db, itemId);
  const boardRow = getBoardRow(db, boardId);
  assertBoardAccess(db, u, boardId, 'view');
  const item = getItemDto(db, itemId);
  const subRows = db
    .prepare(
      'SELECT * FROM items WHERE parent_id = ? AND archived_at IS NULL ORDER BY position, id',
    )
    .all(itemId) as ItemRow[];
  const values = valuesFor(
    db,
    subRows.map((r) => r.id),
  );
  const subitems = subRows.map((r) => toItem(r, values.get(r.id) ?? {}, 0));
  attachComputed(db, u, boardId, [item, ...subitems]);
  return {
    item,
    board: toBoard(boardRow),
    subitems,
    updates: listItemUpdates(db, itemId),
  };
}

export function setAiValue(
  db: Db,
  itemId: number,
  columnId: number,
  value: AiCellValue,
  userId: number | null,
  depth = 0,
): void {
  const item = getItemRow(db, itemId);
  const column = columnRow(db, columnId);
  if (column.type !== 'ai') throw badRequest('Not an AI column');
  const settings = parseJson<Record<string, unknown>>(column.settings, {});
  const names = userNameMap(db);
  const existing = db
    .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
    .get(itemId, columnId) as { value: string } | undefined;
  const previous = existing ? parseJson<CellValue>(existing.value, { text: '' }) : undefined;
  const from = cellToText('ai', settings, previous, (id) => names.get(id) ?? '');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO item_values (item_id, column_id, value, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(item_id, column_id) DO UPDATE SET value = excluded.value,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(itemId, columnId, JSON.stringify(value), now, userId);
  db.prepare('UPDATE items SET updated_at = ? WHERE id = ?').run(now, itemId);
  reindexItem(db, itemId);
  if (value.state === 'done') {
    const to = cellToText('ai', settings, value, (id) => names.get(id) ?? '');
    logActivity(db, {
      boardId: item.board_id,
      itemId,
      actorId: userId,
      actorKind: 'ai',
      action: 'value_changed',
      depth,
      data: {
        columnId,
        columnTitle: column.title,
        columnType: 'ai',
        from,
        to,
        fromValue: previous ?? null,
        toValue: value,
      },
    });
  }
  bus.publish({ event: { type: 'board.changed', boardId: item.board_id }, boardId: item.board_id });
}
