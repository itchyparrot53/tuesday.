import type { Db } from '../db/db';
import type { AiCellValue, ColumnSettings } from '../../shared/columns';
import { parseJson } from '../lib/json';
import { enqueue } from './queue';

interface AiColumnRow {
  id: number;
  board_id: number;
  title: string;
  settings: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pendingValue(db: Db, columnId: number, itemId: number): void {
  const existing = db
    .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
    .get(itemId, columnId) as { value: string } | undefined;
  const previous = existing
    ? parseJson<AiCellValue>(existing.value, { text: '', state: 'done', at: '' })
    : null;
  const value: AiCellValue = {
    text: previous?.text ?? '',
    ...(previous?.labelId ? { labelId: previous.labelId } : {}),
    state: 'pending',
    at: new Date().toISOString(),
  };
  db.prepare(
    `INSERT INTO item_values (item_id, column_id, value, updated_at, updated_by)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(item_id, column_id) DO UPDATE SET value = excluded.value,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(itemId, columnId, JSON.stringify(value), new Date().toISOString());
}

export function enqueueAiForItem(
  db: Db,
  boardId: number,
  itemId: number,
  userId: number | null,
  trigger: { name?: boolean; columnTitle?: string },
): number {
  const columns = db
    .prepare("SELECT id, board_id, title, settings FROM columns WHERE board_id = ? AND type = 'ai'")
    .all(boardId) as AiColumnRow[];
  let queued = 0;
  for (const column of columns) {
    const settings = parseJson<ColumnSettings>(column.settings, {});
    if (!settings.autoRun) continue;
    const prompt = settings.prompt ?? '';
    const nameMatches = Boolean(trigger.name) && /\{\{\s*name\s*\}\}/i.test(prompt);
    const columnMatches =
      Boolean(trigger.columnTitle) &&
      new RegExp(`\\{\\{\\s*${escapeRegExp(trigger.columnTitle!)}\\s*\\}\\}`, 'i').test(prompt);
    if (!nameMatches && !columnMatches) continue;
    pendingValue(db, column.id, itemId);
    if (
      enqueue(
        db,
        'ai_column_fill',
        { columnId: column.id, itemId, userId },
        { dedupeKey: `ai:${column.id}:${itemId}` },
      )
    ) {
      queued++;
    }
  }
  return queued;
}

export function enqueueAiForColumn(
  db: Db,
  columnId: number,
  userId: number | null,
  itemIds?: number[],
): number {
  const column = db
    .prepare("SELECT id, board_id, title, settings FROM columns WHERE id = ? AND type = 'ai'")
    .get(columnId) as AiColumnRow | undefined;
  if (!column) return 0;
  const ids = itemIds
    ? itemIds
    : (
        db
          .prepare('SELECT id FROM items WHERE board_id = ? AND archived_at IS NULL')
          .all(column.board_id) as { id: number }[]
      ).map((row) => row.id);
  let queued = 0;
  for (const itemId of ids.slice(0, 500)) {
    const item = db
      .prepare('SELECT id FROM items WHERE id = ? AND board_id = ? AND archived_at IS NULL')
      .get(itemId, column.board_id);
    if (!item) continue;
    pendingValue(db, column.id, itemId);
    if (
      enqueue(
        db,
        'ai_column_fill',
        { columnId: column.id, itemId, userId },
        { dedupeKey: `ai:${column.id}:${itemId}` },
      )
    ) {
      queued++;
    }
  }
  return queued;
}
