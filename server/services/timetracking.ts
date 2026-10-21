import type { Db } from '../db/db';
import type { User } from '../../shared/types';
import { conflict, notFound } from '../lib/errors';
import { boardIdForItem, assertBoardAccess } from './permissions';
import { getBoardRow } from './boards';
import { getItemDto } from './items';
import { bus } from '../realtime/bus';

interface EntryRow {
  id: number;
  item_id: number;
  column_id: number;
  user_id: number;
  started_at: string;
  ended_at: string | null;
  seconds: number;
  note: string;
}

function columnOnBoard(db: Db, columnId: number, boardId: number) {
  const column = db
    .prepare('SELECT id, type FROM columns WHERE id = ? AND board_id = ?')
    .get(columnId, boardId) as { id: number; type: string } | undefined;
  if (!column || column.type !== 'time_tracking') throw notFound('Time tracking column not found');
  return column;
}

function totalFor(db: Db, itemId: number, columnId: number): number {
  const row = db
    .prepare(
      'SELECT coalesce(sum(seconds), 0) AS total FROM time_entries WHERE item_id = ? AND column_id = ? AND ended_at IS NOT NULL',
    )
    .get(itemId, columnId) as { total: number };
  return row.total;
}

function writeCell(
  db: Db,
  itemId: number,
  columnId: number,
  userId: number,
  runningSince: string | null,
  runningUserId: number | null,
): void {
  const totalSeconds = totalFor(db, itemId, columnId);
  const value = { totalSeconds, runningSince, runningUserId };
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO item_values (item_id, column_id, value, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(item_id, column_id) DO UPDATE SET value = excluded.value,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(itemId, columnId, JSON.stringify(value), now, userId);
  db.prepare('UPDATE items SET updated_at = ? WHERE id = ?').run(now, itemId);
}

function stopEntry(db: Db, entry: EntryRow): void {
  const ended = new Date();
  const started = new Date(entry.started_at);
  const seconds = Math.max(1, Math.round((ended.getTime() - started.getTime()) / 1000));
  db.prepare('UPDATE time_entries SET ended_at = ?, seconds = ? WHERE id = ?').run(
    ended.toISOString(),
    seconds,
    entry.id,
  );
  writeCell(db, entry.item_id, entry.column_id, entry.user_id, null, null);
}

export function stopRunningForUser(db: Db, userId: number): void {
  const entries = db
    .prepare('SELECT * FROM time_entries WHERE user_id = ? AND ended_at IS NULL')
    .all(userId) as EntryRow[];
  for (const entry of entries) stopEntry(db, entry);
}

export function startTimer(db: Db, user: User, itemId: number, columnId: number) {
  const boardId = boardIdForItem(db, itemId);
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, board.id, 'edit');
  columnOnBoard(db, columnId, boardId);
  const running = db
    .prepare('SELECT * FROM time_entries WHERE item_id = ? AND column_id = ? AND ended_at IS NULL')
    .get(itemId, columnId) as EntryRow | undefined;
  if (running && running.user_id !== user.id) {
    const other = db.prepare('SELECT name FROM users WHERE id = ?').get(running.user_id) as {
      name: string;
    };
    throw conflict(`${other.name} is tracking time on this item`);
  }
  stopRunningForUser(db, user.id);
  if (!running) {
    db.prepare(
      'INSERT INTO time_entries (item_id, column_id, user_id, started_at, note) VALUES (?, ?, ?, ?, ?)',
    ).run(itemId, columnId, user.id, new Date().toISOString(), '');
  }
  writeCell(db, itemId, columnId, user.id, new Date().toISOString(), user.id);
  bus.publish({ event: { type: 'timer.changed', userId: user.id } });
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return getItemDto(db, itemId);
}

export function stopTimer(db: Db, user: User, itemId: number, columnId: number) {
  const boardId = boardIdForItem(db, itemId);
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, board.id, 'edit');
  columnOnBoard(db, columnId, boardId);
  const entry = db
    .prepare(
      'SELECT * FROM time_entries WHERE item_id = ? AND column_id = ? AND user_id = ? AND ended_at IS NULL',
    )
    .get(itemId, columnId, user.id) as EntryRow | undefined;
  if (entry) stopEntry(db, entry);
  writeCell(db, itemId, columnId, user.id, null, null);
  bus.publish({ event: { type: 'timer.changed', userId: user.id } });
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return getItemDto(db, itemId);
}

export function addManualEntry(
  db: Db,
  user: User,
  itemId: number,
  columnId: number,
  seconds: number,
  note = '',
) {
  const boardId = boardIdForItem(db, itemId);
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, board.id, 'edit');
  columnOnBoard(db, columnId, boardId);
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO time_entries (item_id, column_id, user_id, started_at, ended_at, seconds, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(itemId, columnId, user.id, now, now, seconds, note);
  const running = db
    .prepare('SELECT * FROM time_entries WHERE item_id = ? AND column_id = ? AND ended_at IS NULL')
    .get(itemId, columnId) as EntryRow | undefined;
  writeCell(db, itemId, columnId, user.id, running?.started_at ?? null, running?.user_id ?? null);
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return getItemDto(db, itemId);
}

export function listEntries(db: Db, user: User, itemId: number, columnId: number) {
  const boardId = boardIdForItem(db, itemId);
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, board.id, 'edit');
  return db
    .prepare(
      `SELECT e.id, e.user_id AS userId, u.name AS userName, e.started_at AS startedAt,
              e.ended_at AS endedAt, e.seconds, e.note
       FROM time_entries e JOIN users u ON u.id = e.user_id
       WHERE e.item_id = ? AND e.column_id = ? ORDER BY e.id DESC LIMIT 200`,
    )
    .all(itemId, columnId);
}

export function getRunningTimer(db: Db, userId: number) {
  const row = db
    .prepare(
      `SELECT e.item_id AS itemId, e.column_id AS columnId, e.started_at AS startedAt,
              i.name AS itemName, i.board_id AS boardId
       FROM time_entries e JOIN items i ON i.id = e.item_id
       WHERE e.user_id = ? AND e.ended_at IS NULL ORDER BY e.id DESC LIMIT 1`,
    )
    .get(userId) as
    | { itemId: number; columnId: number; startedAt: string; itemName: string; boardId: number }
    | undefined;
  return { running: row ?? null };
}
