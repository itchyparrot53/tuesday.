import type { Db } from '../db/db';
import type { FileInfo, User } from '../../shared/types';
import { badRequest, notFound } from '../lib/errors';
import { logActivity } from './activity';
import { bus } from '../realtime/bus';

export interface FileRow {
  id: number;
  item_id: number;
  column_id: number | null;
  update_id: number | null;
  filename: string;
  mime: string;
  size: number;
  storage_key: string;
  uploaded_by: number;
  created_at: string;
}

const INLINE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

export function normalizeMime(mime: string): string {
  return (mime || 'application/octet-stream').split(';')[0].trim().toLowerCase();
}

export function isInlineMime(mime: string): boolean {
  return INLINE_MIME.has(normalizeMime(mime));
}

export function toFileInfo(row: FileRow): FileInfo {
  return {
    id: row.id,
    itemId: row.item_id,
    columnId: row.column_id,
    updateId: row.update_id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    url: `/api/files/${row.id}`,
    isImage: isInlineMime(row.mime) && normalizeMime(row.mime).startsWith('image/'),
  };
}

export function getFileRow(db: Db, id: number): FileRow {
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(id) as FileRow | undefined;
  if (!row) throw notFound('File not found');
  return row;
}

export function listFiles(db: Db, itemId: number): FileInfo[] {
  return (
    db.prepare('SELECT * FROM files WHERE item_id = ? ORDER BY id').all(itemId) as FileRow[]
  ).map(toFileInfo);
}

export function addFile(
  db: Db,
  user: User,
  input: {
    itemId: number;
    boardId: number;
    columnId: number | null;
    updateId: number | null;
    filename: string;
    mime: string;
    size: number;
    storageKey: string;
  },
): FileInfo {
  const info = db
    .prepare(
      `INSERT INTO files
        (item_id, column_id, update_id, filename, mime, size, storage_key, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.itemId,
      input.columnId,
      input.updateId,
      input.filename,
      normalizeMime(input.mime),
      input.size,
      input.storageKey,
      user.id,
      new Date().toISOString(),
    );
  const file = toFileInfo(getFileRow(db, Number(info.lastInsertRowid)));
  if (input.columnId) {
    const existing = db
      .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
      .get(input.itemId, input.columnId) as { value: string } | undefined;
    const ids = existing
      ? ((JSON.parse(existing.value) as { fileIds?: number[] }).fileIds ?? [])
      : [];
    const value = { fileIds: [...ids, file.id] };
    db.prepare(
      `INSERT INTO item_values (item_id, column_id, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id, column_id) DO UPDATE SET value = excluded.value,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    ).run(input.itemId, input.columnId, JSON.stringify(value), new Date().toISOString(), user.id);
  }
  logActivity(db, {
    boardId: input.boardId,
    itemId: input.itemId,
    actorId: user.id,
    action: 'file_added',
    data: { fileId: file.id, filename: file.filename },
  });
  bus.publish({ event: { type: 'board.changed', boardId: input.boardId }, boardId: input.boardId });
  return file;
}

export function removeFileRow(db: Db, user: User, id: number, boardId: number): FileRow {
  const row = getFileRow(db, id);
  db.transaction(() => {
    const cells = db
      .prepare(
        `SELECT v.item_id, v.column_id, v.value FROM item_values v
         JOIN columns c ON c.id = v.column_id
         WHERE v.item_id = ? AND c.type = 'file'`,
      )
      .all(row.item_id) as { item_id: number; column_id: number; value: string }[];
    for (const cell of cells) {
      const ids = (JSON.parse(cell.value) as { fileIds?: number[] }).fileIds ?? [];
      if (!ids.includes(id)) continue;
      const next = ids.filter((fileId) => fileId !== id);
      if (next.length) {
        db.prepare(
          'UPDATE item_values SET value = ?, updated_at = ? WHERE item_id = ? AND column_id = ?',
        ).run(
          JSON.stringify({ fileIds: next }),
          new Date().toISOString(),
          cell.item_id,
          cell.column_id,
        );
      } else {
        db.prepare('DELETE FROM item_values WHERE item_id = ? AND column_id = ?').run(
          cell.item_id,
          cell.column_id,
        );
      }
    }
    db.prepare('DELETE FROM files WHERE id = ?').run(id);
    logActivity(db, {
      boardId,
      itemId: row.item_id,
      actorId: user.id,
      action: 'file_deleted',
      data: { fileId: id, filename: row.filename },
    });
  })();
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return row;
}

export function sanitizeFilename(name: string): string {
  const clean = name
    .replace(/[\\/\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 200);
  if (!clean || clean === '.' || clean === '..') throw badRequest('Invalid filename');
  return clean;
}
