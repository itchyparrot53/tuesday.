import type { Db } from '../db/db';
import type { Activity, ActivityAction, User } from '../../shared/types';
import { parseJson } from '../lib/json';
import { getUserById } from './users';

interface ActivityRow {
  id: number;
  board_id: number;
  item_id: number | null;
  actor_id: number | null;
  actor_kind: 'user' | 'ai' | 'system';
  action: ActivityAction;
  data: string;
  created_at: string;
}

export function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    boardId: row.board_id,
    itemId: row.item_id,
    actorId: row.actor_id,
    actorKind: row.actor_kind,
    action: row.action,
    data: parseJson<Record<string, unknown>>(row.data, {}),
    createdAt: row.created_at,
  };
}

export interface ActivityEvent {
  activity: Activity;
  boardId: number;
  itemId: number | null;
  actor: User | null;
  depth: number;
}

const listeners = new Set<(event: ActivityEvent) => void>();

export function onActivity(listener: (event: ActivityEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function logActivity(
  db: Db,
  input: {
    boardId: number;
    itemId?: number | null;
    actorId: number | null;
    actorKind?: 'user' | 'ai' | 'system';
    action: ActivityAction;
    data?: Record<string, unknown>;
    depth?: number;
  },
): number {
  const depth = input.depth ?? 0;
  const data = depth > 0 ? { ...(input.data ?? {}), automationDepth: depth } : (input.data ?? {});
  const info = db
    .prepare(
      `INSERT INTO activity (board_id, item_id, actor_id, actor_kind, action, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.boardId,
      input.itemId ?? null,
      input.actorId,
      input.actorKind ?? 'user',
      input.action,
      JSON.stringify(data),
      new Date().toISOString(),
    );
  const id = Number(info.lastInsertRowid);
  if (listeners.size) {
    setImmediate(() => {
      try {
        const row = db.prepare('SELECT * FROM activity WHERE id = ?').get(id) as
          ActivityRow | undefined;
        if (!row) return;
        const event: ActivityEvent = {
          activity: toActivity(row),
          boardId: row.board_id,
          itemId: row.item_id,
          actor: row.actor_id ? getUserById(db, row.actor_id) : null,
          depth,
        };
        for (const listener of listeners) {
          try {
            listener(event);
          } catch {}
        }
      } catch {}
    });
  }
  return id;
}

export function listBoardActivity(
  db: Db,
  boardId: number,
  before?: number,
  limit = 50,
): Activity[] {
  const rows = db
    .prepare(
      `SELECT * FROM activity WHERE board_id = ? AND (? IS NULL OR id < ?)
       ORDER BY id DESC LIMIT ?`,
    )
    .all(boardId, before ?? null, before ?? null, limit) as ActivityRow[];
  return rows.map(toActivity);
}

export function listItemActivity(db: Db, itemId: number): Activity[] {
  const rows = db
    .prepare('SELECT * FROM activity WHERE item_id = ? ORDER BY id DESC LIMIT 200')
    .all(itemId) as ActivityRow[];
  return rows.map(toActivity);
}
