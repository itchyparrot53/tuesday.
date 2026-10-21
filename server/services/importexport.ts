import type { Db } from '../db/db';
import type { Column, User } from '../../shared/types';
import type { ImportMapping, ImportPreview, ImportTarget } from '../../shared/types';
import { cellToText, type CellValue, type ColumnType } from '../../shared/columns';
import { badRequest } from '../lib/errors';
import { parseCsv, toCsv } from '../lib/csv';
import { parseJson } from '../lib/json';
import { getBoardFull, getBoardRow } from './boards';
import { listItems, createItem } from './items';
import { createColumn } from './columns';
import { createGroup } from './groups';
import { assertReadWorkspace, assertBoardAccess } from './permissions';
import { listUsers } from './users';
import { parseHumanValue } from '../ai/human-values';
import { bus } from '../realtime/bus';

function safeCell(text: string): string {
  if (/^[=+\-@]/.test(text)) return `'${text}`;
  return text;
}

export function exportBoard(
  db: Db,
  user: User,
  boardId: number,
): { csv: string; filename: string } {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, board.id, 'view');
  const full = getBoardFull(db, user, boardId);
  const items = listItems(db, user, boardId);
  const names = new Map(listUsers(db).map((entry) => [entry.id, entry.name]));
  const byId = new Map(items.map((item) => [item.id, item]));
  const header = ['Item', 'Group', 'Parent item', ...full.columns.map((column) => column.title)];
  const rows = items.map((item) => [
    item.name,
    full.groups.find((group) => group.id === item.groupId)?.title ?? '',
    item.parentId ? (byId.get(item.parentId)?.name ?? '') : '',
    ...full.columns.map((column) =>
      cellToText(
        column.type,
        column.settings,
        item.values[String(column.id)] as CellValue | undefined,
        (id) => names.get(id) ?? '',
        (id) => byId.get(id)?.name ?? `#${id}`,
      ),
    ),
  ]);
  return {
    csv: toCsv([header, ...rows.map((row) => row.map(safeCell))]),
    filename: `${board.name.replace(/[^a-zA-Z0-9._ -]/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`,
  };
}

function parseDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function suggestType(values: string[]): ColumnType {
  const nonEmpty = values.filter((value) => value.trim() !== '');
  if (!nonEmpty.length) return 'text';
  const numbers = nonEmpty.filter((value) => Number.isFinite(Number(value))).length;
  if (numbers / nonEmpty.length >= 0.9) return 'number';
  const dates = nonEmpty.filter((value) => parseDate(value)).length;
  if (dates / nonEmpty.length >= 0.9) return 'date';
  return 'text';
}

export function previewImport(db: Db, user: User, boardId: number, csv: string): ImportPreview {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, board.id, 'manage');
  const full = getBoardFull(db, user, boardId);
  const rows = parseCsv(csv);
  if (!rows.length) throw badRequest('The CSV is empty');
  const headers = rows[0];
  const body = rows.slice(1);
  const suggested: ImportMapping[] = headers.map((header, index) => {
    const lower = header.trim().toLowerCase();
    if (['item', 'name', 'title'].includes(lower)) return { header, target: 'name' };
    if (lower === 'group') return { header, target: 'group' };
    const column = full.columns.find((entry) => entry.title.toLowerCase() === lower);
    if (column) return { header, target: { columnId: column.id } };
    return {
      header,
      target: {
        newColumn: {
          title: header || `Column ${index + 1}`,
          type: suggestType(body.map((row) => row[index] ?? '')),
        },
      },
    };
  });
  return {
    headers,
    rows: body.slice(0, 10),
    rowCount: body.length,
    suggested,
  };
}

export function importCsv(
  db: Db,
  user: User,
  boardId: number,
  input: { csv: string; mapping: ImportMapping[]; groupId?: number },
): {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
  automationsSkipped: boolean;
} {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, board.id, 'manage');
  const rows = parseCsv(input.csv);
  if (!rows.length) throw badRequest('The CSV is empty');
  const headers = rows[0];
  const body = rows.slice(1);
  if (body.length > 5000) throw badRequest('Too many rows (max 5000)');
  const nameMapping = input.mapping.find((entry) => entry.target === 'name');
  if (!nameMapping) throw badRequest('Choose a column for the item name');
  const nameIndex = headers.indexOf(nameMapping.header);
  if (nameIndex < 0) throw badRequest('Name mapping header is missing');

  const full = getBoardFull(db, user, boardId);
  const users = listUsers(db);
  const columnByIndex = new Map<number, Column>();
  const newColumns: { index: number; column: Column }[] = [];
  for (const mapping of input.mapping) {
    const index = headers.indexOf(mapping.header);
    if (index < 0) continue;
    if (typeof mapping.target === 'object' && 'columnId' in mapping.target) {
      const columnId = (mapping.target as { columnId: number }).columnId;
      const column = full.columns.find((entry) => entry.id === columnId);
      if (column) columnByIndex.set(index, column);
    }
    if (typeof mapping.target === 'object' && 'newColumn' in mapping.target) {
      const column = createColumn(db, user, boardId, {
        title: mapping.target.newColumn.title,
        type: mapping.target.newColumn.type,
      });
      columnByIndex.set(index, column);
      newColumns.push({ index, column });
    }
  }

  const allColumns = [...full.columns, ...newColumns.map((entry) => entry.column)];
  const groupIndex = headerIndex(headers, input.mapping, 'group');
  const groups = new Map(full.groups.map((group) => [group.title.toLowerCase(), group.id]));
  let defaultGroupId = input.groupId ?? full.groups[0]?.id;
  if (!defaultGroupId) throw badRequest('Board has no groups');

  const errors: { row: number; message: string }[] = [];
  let created = 0;
  let skipped = 0;
  const large = body.length > 100;
  const depth = large ? 3 : 0;

  const processChunk = db.transaction((chunk: string[][], offset: number) => {
    for (let index = 0; index < chunk.length; index++) {
      const row = chunk[index];
      const name = (row[nameIndex] ?? '').trim();
      if (!name) {
        skipped++;
        continue;
      }
      let groupId = defaultGroupId!;
      if (groupIndex !== null) {
        const title = (row[groupIndex] ?? '').trim();
        if (title) {
          const existing = groups.get(title.toLowerCase());
          if (existing) groupId = existing;
          else {
            const group = createGroup(db, user, boardId, { title, at: 'bottom' });
            groups.set(title.toLowerCase(), group.id);
            groupId = group.id;
          }
        }
      }
      const values: Record<string, unknown> = {};
      for (const [columnIndex, column] of columnByIndex) {
        const raw = row[columnIndex] ?? '';
        if (!raw.trim()) continue;
        try {
          let text = raw;
          if (column.type === 'date' || column.type === 'timeline') {
            const parts = text.split('..').map((part) => part.trim());
            const converted = parts.map((part) => parseDate(part) ?? part);
            text = converted.join('..');
          }
          let choices: { id: number; name: string }[] | undefined;
          if (column.type === 'dependency') {
            choices = db
              .prepare('SELECT id, name FROM items WHERE board_id = ? AND archived_at IS NULL')
              .all(boardId) as { id: number; name: string }[];
          } else if (column.type === 'connect') {
            const targetBoardId = (column.settings as { targetBoardId?: number }).targetBoardId;
            choices = targetBoardId
              ? (db
                  .prepare('SELECT id, name FROM items WHERE board_id = ? AND archived_at IS NULL')
                  .all(targetBoardId) as { id: number; name: string }[])
              : undefined;
          }
          const parsed = parseHumanValue(column, text, users, choices);
          if (parsed !== null) values[String(column.id)] = parsed;
        } catch (err) {
          errors.push({
            row: offset + index + 2,
            message: err instanceof Error ? err.message : 'Invalid value',
          });
        }
      }
      createItem(db, user, boardId, { groupId, name, values }, large ? 'system' : 'user', depth);
      created++;
    }
  });

  for (let offset = 0; offset < body.length; offset += 200) {
    processChunk(body.slice(offset, offset + 200), offset);
  }
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return { created, skipped, errors, automationsSkipped: large };
}

function headerIndex(headers: string[], mapping: ImportMapping[], target: 'group'): number | null {
  const entry = mapping.find((candidate) => candidate.target === target);
  if (!entry) return null;
  const index = headers.indexOf(entry.header);
  return index >= 0 ? index : null;
}

export type { ImportTarget };
