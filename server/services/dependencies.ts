import type { Db } from '../db/db';
import type { CellValue } from '../../shared/columns';
import type { User } from '../../shared/types';
import { parseJson } from '../lib/json';
import { addDays } from '../lib/timezone';
import { setValue } from './items';

export function assertNoCycle(db: Db, columnId: number, itemId: number, newIds: number[]): void {
  const rows = db
    .prepare('SELECT item_id, value FROM item_values WHERE column_id = ?')
    .all(columnId) as { item_id: number; value: string }[];
  const graph = new Map<number, number[]>();
  for (const row of rows) {
    graph.set(row.item_id, parseJson<{ itemIds?: number[] }>(row.value, {}).itemIds ?? []);
  }
  const reaches = (from: number, seen: Set<number>): boolean => {
    if (seen.has(from)) return false;
    seen.add(from);
    for (const next of graph.get(from) ?? []) {
      if (next === itemId) return true;
      if (reaches(next, seen)) return true;
    }
    return false;
  };
  for (const id of newIds) {
    if (id === itemId || reaches(id, new Set())) {
      throw new Error('That would create a circular dependency');
    }
  }
}

function dayNumber(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);
}

export function autoShiftDependents(
  db: Db,
  user: User,
  itemId: number,
  boardId: number,
  columnId: number,
  columnType: string,
  oldValue: CellValue | undefined,
  newValue: CellValue | null,
  depth: number,
): void {
  if (columnType !== 'timeline' && columnType !== 'date') return;
  if (!newValue) return;
  const oldEnd =
    columnType === 'date'
      ? (oldValue as { date?: string } | undefined)?.date
      : (oldValue as { to?: string } | undefined)?.to;
  const newEnd =
    columnType === 'date' ? (newValue as { date?: string }).date : (newValue as { to?: string }).to;
  if (!newEnd) return;
  const delta = oldEnd ? dayNumber(newEnd) - dayNumber(oldEnd) : 0;
  if (delta <= 0) return;

  const dependencyColumns = db
    .prepare("SELECT id, settings FROM columns WHERE board_id = ? AND type = 'dependency'")
    .all(boardId) as { id: number; settings: string }[];
  const dateColumn = db
    .prepare(
      "SELECT id, type FROM columns WHERE board_id = ? AND type IN ('timeline','date') ORDER BY CASE type WHEN 'timeline' THEN 0 ELSE 1 END, position LIMIT 1",
    )
    .get(boardId) as { id: number; type: string } | undefined;
  if (!dateColumn) return;

  for (const dependency of dependencyColumns) {
    const settings = parseJson<{ autoShift?: boolean }>(dependency.settings, {});
    if (settings.autoShift === false) continue;
    const rows = db
      .prepare('SELECT item_id, value FROM item_values WHERE column_id = ?')
      .all(dependency.id) as { item_id: number; value: string }[];
    for (const row of rows) {
      const ids = parseJson<{ itemIds?: number[] }>(row.value, {}).itemIds ?? [];
      if (!ids.includes(itemId)) continue;
      const dependent = db
        .prepare('SELECT archived_at FROM items WHERE id = ?')
        .get(row.item_id) as { archived_at: string | null } | undefined;
      if (!dependent || dependent.archived_at) continue;
      const dateRow = db
        .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
        .get(row.item_id, dateColumn.id) as { value: string } | undefined;
      const value = dateRow
        ? parseJson<{ from?: string; to?: string; date?: string }>(dateRow.value, {})
        : undefined;
      const start = dateColumn.type === 'timeline' ? value?.from : value?.date;
      if (start && start >= addDays(newEnd, 1)) continue;
      let next: CellValue;
      if (dateColumn.type === 'timeline') {
        const from = value?.from ?? newEnd;
        const to = value?.to ?? newEnd;
        next = { from: addDays(from, delta), to: addDays(to, delta) };
      } else {
        next = { date: addDays(value?.date ?? newEnd, delta) };
      }
      setValue(db, user, row.item_id, dateColumn.id, next, 'system', depth + 1);
    }
  }
}

export { columnIdUnused };
const columnIdUnused = 0;
