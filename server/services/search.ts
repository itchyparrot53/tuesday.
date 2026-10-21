import type { Db } from '../db/db';
import type { SearchResult, User } from '../../shared/types';
import { cellToText, type ColumnType } from '../../shared/columns';
import { parseJson } from '../lib/json';
import { boardAccessMap } from './permissions';
import { searchDocs } from './docs';

interface ItemRow {
  id: number;
  board_id: number;
  name: string;
  archived_at: string | null;
}

interface ValueRow {
  column_id: number;
  type: ColumnType;
  settings: string;
  value: string;
}

export function reindexItem(db: Db, itemId: number): void {
  db.prepare('DELETE FROM items_fts WHERE rowid = ?').run(itemId);
  const item = db
    .prepare('SELECT id, board_id, name, archived_at FROM items WHERE id = ?')
    .get(itemId) as ItemRow | undefined;
  if (!item || item.archived_at) return;
  const values = db
    .prepare(
      `SELECT v.column_id, v.value, c.type, c.settings FROM item_values v
       JOIN columns c ON c.id = v.column_id WHERE v.item_id = ?`,
    )
    .all(itemId) as ValueRow[];
  const names = new Map(
    (db.prepare('SELECT id, name FROM users').all() as { id: number; name: string }[]).map((r) => [
      r.id,
      r.name,
    ]),
  );
  const content = values
    .map((v) =>
      cellToText(
        v.type,
        parseJson(v.settings, {}),
        parseJson(v.value, { text: '' }),
        (id) => names.get(id) ?? '',
      ),
    )
    .filter(Boolean)
    .join(' ');
  db.prepare('INSERT INTO items_fts (rowid, name, content) VALUES (?, ?, ?)').run(
    itemId,
    item.name,
    content,
  );
}

export function search(db: Db, u: User, q: string): SearchResult {
  const access = boardAccessMap(db, u);
  const tokens = q
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (!tokens.length) return { items: [], boards: [], docs: [] };
  const match = tokens.map((t) => `"${t}"*`).join(' ');
  let ids: number[] = [];
  try {
    ids = (
      db.prepare('SELECT rowid FROM items_fts WHERE items_fts MATCH ? LIMIT 100').all(match) as {
        rowid: number;
      }[]
    ).map((r) => r.rowid);
  } catch {
    return { items: [], boards: [], docs: [] };
  }
  const items: SearchResult['items'] = [];
  for (const id of ids) {
    const row = db
      .prepare(
        `SELECT i.id, i.name, i.board_id, b.name AS board_name, b.workspace_id
         FROM items i JOIN boards b ON b.id = i.board_id
         WHERE i.id = ? AND i.archived_at IS NULL AND b.archived_at IS NULL`,
      )
      .get(id) as
      | {
          id: number;
          name: string;
          board_id: number;
          board_name: string;
          workspace_id: number;
        }
      | undefined;
    if (!row) continue;
    if (!access.has(row.board_id)) continue;
    items.push({ id: row.id, name: row.name, boardId: row.board_id, boardName: row.board_name });
    if (items.length >= 20) break;
  }

  const boardRows = db
    .prepare(
      `SELECT id, name, workspace_id FROM boards
       WHERE archived_at IS NULL AND name LIKE ? ORDER BY updated_at DESC LIMIT 40`,
    )
    .all(`%${q}%`) as { id: number; name: string; workspace_id: number }[];
  const boards = boardRows
    .filter((b) => access.has(b.id))
    .slice(0, 10)
    .map((b) => ({ id: b.id, name: b.name, workspaceId: b.workspace_id }));

  const docs = searchDocs(db, u, q, 10).map((doc) => ({
    id: doc.id,
    title: doc.title,
    workspaceId: doc.workspaceId,
  }));
  return { items, boards, docs };
}
