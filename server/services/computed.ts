import type { Db } from '../db/db';
import type { CellValue } from '../../shared/columns';
import { computeFormulas } from '../../shared/formula';
import type { Column, Item, User } from '../../shared/types';
import { parseJson } from '../lib/json';
import { zonedParts } from '../lib/timezone';
import { getOrg } from './settings';
import { listUsers } from './users';
import { listColumnRows } from './columns';
import { toColumn, getBoardRow } from './boards';
import { canReadWorkspace } from './permissions';

export function attachComputed(db: Db, user: User, boardId: number, items: Item[]): Item[] {
  const columns = listColumnRows(db, boardId).map(toColumn);
  if (!columns.some((column) => column.type === 'formula' || column.type === 'mirror')) {
    return items;
  }
  const names = new Map(listUsers(db).map((entry) => [entry.id, entry.name]));
  const itemNames = new Map(
    (
      db.prepare('SELECT id, name FROM items WHERE board_id = ?').all(boardId) as {
        id: number;
        name: string;
      }[]
    ).map((row) => [row.id, row.name]),
  );
  const today = zonedParts(new Date(), getOrg(db).timezone).date;
  for (const item of items) {
    const formulas = computeFormulas(columns, item, {
      today,
      userName: (id) => names.get(id) ?? '',
      itemName: (id) => itemNames.get(id) ?? `#${id}`,
    });
    for (const [columnId, value] of Object.entries(formulas)) {
      item.values[columnId] = value as CellValue;
    }
    const mirrors = computeMirrors(db, user, columns, item, {
      userName: (id) => names.get(id) ?? '',
      itemName: (id) => itemNames.get(id) ?? `#${id}`,
    });
    for (const [columnId, value] of Object.entries(mirrors)) {
      item.values[columnId] = value as CellValue;
    }
  }
  return items;
}

interface MirrorContext {
  userName: (id: number) => string;
  itemName: (id: number) => string;
}

export function computeMirrors(
  db: Db,
  user: User,
  columns: Column[],
  item: Item,
  ctx: MirrorContext,
): Record<number, { mirror: number | string | null; error?: string }> {
  const output: Record<number, { mirror: number | string | null; error?: string }> = {};
  for (const column of columns) {
    if (column.type !== 'mirror') continue;
    const connect = columns.find((entry) => entry.id === column.settings.connectColumnId);
    if (!connect || connect.type !== 'connect') {
      output[column.id] = { mirror: null, error: 'No connect column' };
      continue;
    }
    const linked = ((item.values[String(connect.id)] as { itemIds?: number[] } | undefined)
      ?.itemIds ?? []) as number[];
    const targetBoardId = connect.settings.targetBoardId;
    const targetColumnId = column.settings.targetColumnId;
    if (targetBoardId) {
      try {
        const board = getBoardRow(db, targetBoardId);
        if (!canReadWorkspace(db, user, board.workspace_id)) {
          output[column.id] = { mirror: null, error: 'No access' };
          continue;
        }
      } catch {
        output[column.id] = { mirror: null, error: 'No access' };
        continue;
      }
    }
    if (!targetBoardId || !targetColumnId || !linked.length) {
      output[column.id] = { mirror: column.settings.aggregate === 'count' ? 0 : null };
      continue;
    }
    const targetColumnRow = db
      .prepare('SELECT * FROM columns WHERE id = ? AND board_id = ?')
      .get(targetColumnId, targetBoardId) as Parameters<typeof toColumn>[0] | undefined;
    if (!targetColumnRow) {
      output[column.id] = { mirror: null, error: '#REF' };
      continue;
    }
    const target = toColumn(targetColumnRow);
    const values: (string | number | null)[] = [];
    for (const id of linked) {
      const row = db
        .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
        .get(id, targetColumnId) as { value: string } | undefined;
      if (!row) continue;
      const raw = parseJson<CellValue>(row.value, { text: '' });
      const text =
        target.type === 'number'
          ? Number((raw as { number?: number }).number ?? NaN)
          : target.type === 'date'
            ? ((raw as { date?: string }).date ?? null)
            : target.type === 'timeline'
              ? ((raw as { from?: string }).from ?? null)
              : target.type === 'status'
                ? (target.settings.labels?.find(
                    (label) => label.id === (raw as { labelId?: string }).labelId,
                  )?.name ?? null)
                : target.type === 'people'
                  ? ((raw as { userIds?: number[] }).userIds?.map(ctx.userName).join(', ') ?? null)
                  : ((raw as { text?: string }).text ?? null);
      if (text !== null && text !== '' && !(typeof text === 'number' && Number.isNaN(text))) {
        values.push(text);
      }
    }
    const aggregate = column.settings.aggregate ?? 'list';
    if (aggregate === 'count') {
      output[column.id] = { mirror: values.length };
    } else if (
      aggregate === 'sum' ||
      aggregate === 'avg' ||
      aggregate === 'min' ||
      aggregate === 'max'
    ) {
      const numbers = values.map(Number).filter((value) => Number.isFinite(value));
      if (!numbers.length) output[column.id] = { mirror: null };
      else if (aggregate === 'sum')
        output[column.id] = { mirror: numbers.reduce((a, b) => a + b, 0) };
      else if (aggregate === 'avg')
        output[column.id] = { mirror: numbers.reduce((a, b) => a + b, 0) / numbers.length };
      else if (aggregate === 'min') output[column.id] = { mirror: Math.min(...numbers) };
      else output[column.id] = { mirror: Math.max(...numbers) };
    } else if (aggregate === 'earliest' || aggregate === 'latest') {
      const dates = values
        .map(String)
        .filter((value) => /^\d{4}-\d{2}-\d{2}/.test(value))
        .sort();
      output[column.id] = {
        mirror: dates.length
          ? aggregate === 'earliest'
            ? dates[0]
            : dates[dates.length - 1]
          : null,
      };
    } else {
      output[column.id] = { mirror: values.length ? values.join(', ') : null };
    }
  }
  return output;
}
