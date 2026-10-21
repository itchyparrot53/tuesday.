import type { Db } from '../db/db';
import type { Update, User } from '../../shared/types';
import { extractMentionIds } from '../../shared/mentions';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { boardIdForItem, assertBoardAccess } from './permissions';
import { isAdmin } from './permissions';
import { getBoardRow } from './boards';
import { logActivity } from './activity';
import { queueIndex } from '../knowledge/indexer';
import { notify } from './notifications';
import { bus } from '../realtime/bus';

interface UpdateRow {
  id: number;
  item_id: number;
  author_id: number | null;
  author_kind: 'user' | 'ai';
  parent_id: number | null;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export function toUpdate(row: UpdateRow): Update {
  return {
    id: row.id,
    itemId: row.item_id,
    authorId: row.author_id,
    authorKind: row.author_kind,
    parentId: row.parent_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  };
}

export function getUpdateRow(db: Db, id: number): UpdateRow {
  const row = db.prepare('SELECT * FROM updates WHERE id = ?').get(id) as UpdateRow | undefined;
  if (!row) throw notFound('Update not found');
  return row;
}

function itemBasics(db: Db, itemId: number) {
  const row = db
    .prepare(
      'SELECT id, name, created_by, board_id FROM items WHERE id = ? AND archived_at IS NULL',
    )
    .get(itemId) as
    { id: number; name: string; created_by: number | null; board_id: number } | undefined;
  if (!row) throw notFound('Item not found');
  return row;
}

export function listItemUpdates(db: Db, itemId: number): Update[] {
  const rows = db
    .prepare('SELECT * FROM updates WHERE item_id = ? ORDER BY created_at, id')
    .all(itemId) as UpdateRow[];
  return rows.map(toUpdate);
}

export function postUpdate(
  db: Db,
  u: User,
  itemId: number,
  body: string,
  parentId?: number,
  kind: 'user' | 'ai' = 'user',
  depth = 0,
): Update {
  const boardId = boardIdForItem(db, itemId);
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, u, board.id, 'comment');
  const item = itemBasics(db, itemId);
  if (parentId !== undefined) {
    const parent = getUpdateRow(db, parentId);
    if (parent.item_id !== itemId) throw badRequest('Parent update is on another item');
    if (parent.parent_id !== null) throw badRequest('Replies cannot be nested further');
  }
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO updates (item_id, author_id, author_kind, parent_id, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(itemId, u.id, kind, parentId ?? null, body, now);
  const update = toUpdate(getUpdateRow(db, Number(info.lastInsertRowid)));
  queueIndex(db, 'update', update.id);

  const link = `/boards/${boardId}?item=${itemId}`;
  const workspaceId = (
    db.prepare('SELECT workspace_id FROM boards WHERE id = ?').get(boardId) as {
      workspace_id: number;
    }
  ).workspace_id;
  const mentioned = extractMentionIds(body);
  for (const userId of mentioned) {
    notify(db, {
      userId,
      workspaceId,
      kind: 'mention',
      title: `${u.name} mentioned you on ${item.name}`,
      body: body.slice(0, 200),
      link,
      actorId: u.id,
      boardId,
    });
  }

  const recipients = new Set<number>();
  if (item.created_by) recipients.add(item.created_by);
  const peopleColumns = db
    .prepare("SELECT id FROM columns WHERE board_id = ? AND type = 'people'")
    .all(boardId) as { id: number }[];
  for (const column of peopleColumns) {
    const row = db
      .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
      .get(itemId, column.id) as { value: string } | undefined;
    if (!row) continue;
    try {
      const value = JSON.parse(row.value) as { userIds?: number[] };
      for (const id of value.userIds ?? []) recipients.add(id);
    } catch {}
  }
  for (const userId of recipients) {
    if (mentioned.includes(userId)) continue;
    notify(db, {
      userId,
      workspaceId,
      kind: 'update_on_item',
      title: `${u.name} posted an update on ${item.name}`,
      body: body.slice(0, 200),
      link,
      actorId: u.id,
      boardId,
    });
  }

  logActivity(db, {
    boardId,
    itemId,
    actorId: u.id,
    actorKind: kind,
    action: 'update_posted',
    depth,
    data: { preview: body.slice(0, 200) },
  });
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return update;
}

export function editUpdate(db: Db, u: User, updateId: number, body: string): Update {
  const row = getUpdateRow(db, updateId);
  if (row.author_id !== u.id) throw forbidden('Only the author can edit an update');
  const boardId = boardIdForItem(db, row.item_id);
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, u, board.id, 'comment');
  db.prepare('UPDATE updates SET body = ?, edited_at = ? WHERE id = ?').run(
    body,
    new Date().toISOString(),
    updateId,
  );
  const update = toUpdate(getUpdateRow(db, updateId));
  queueIndex(db, 'update', updateId);
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return update;
}

export function deleteUpdate(db: Db, u: User, updateId: number): void {
  const row = getUpdateRow(db, updateId);
  if (row.author_id !== u.id && !isAdmin(u)) throw forbidden();
  const boardId = boardIdForItem(db, row.item_id);
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, u, board.id, 'comment');
  db.prepare('DELETE FROM updates WHERE id = ?').run(updateId);
  queueIndex(db, 'update', updateId);
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
}
