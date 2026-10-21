import { randomBytes } from 'node:crypto';
import type { Db } from '../db/db';
import type { Item, User } from '../../shared/types';
import { badRequest, notFound } from '../lib/errors';
import { assertBoardAccess, boardAccess } from './permissions';
import { getUserById, listUsers } from './users';
import { createItem, getItemDto, setValue } from './items';
import { postUpdate } from './updates';
import { getOrg } from './settings';
import { zonedParts } from '../lib/timezone';

interface InboundWebhookRow {
  id: number;
  board_id: number;
  token: string;
  created_by: number;
  created_at: string;
  last_used_at: string | null;
  secret: string | null;
}

function rowFor(db: Db, boardId: number): InboundWebhookRow | undefined {
  return db.prepare('SELECT * FROM inbound_webhooks WHERE board_id = ?').get(boardId) as
    InboundWebhookRow | undefined;
}

export function getInboundWebhook(db: Db, user: User, boardId: number): InboundWebhookRow | null {
  assertBoardAccess(db, user, boardId, 'manage');
  return rowFor(db, boardId) ?? null;
}

export function rotateInboundWebhook(db: Db, user: User, boardId: number): InboundWebhookRow {
  assertBoardAccess(db, user, boardId, 'manage');
  const token = `tue_hook_${randomBytes(24).toString('hex')}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO inbound_webhooks (board_id, token, created_by, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(board_id) DO UPDATE SET
       token = excluded.token,
       created_by = excluded.created_by,
       created_at = excluded.created_at,
       last_used_at = NULL`,
  ).run(boardId, token, user.id, now);
  return rowFor(db, boardId)!;
}

export function deleteInboundWebhook(db: Db, user: User, boardId: number): void {
  assertBoardAccess(db, user, boardId, 'manage');
  db.prepare('DELETE FROM inbound_webhooks WHERE board_id = ?').run(boardId);
}

export function setInboundWebhookSecret(
  db: Db,
  user: User,
  boardId: number,
  secret: string | null,
): InboundWebhookRow {
  assertBoardAccess(db, user, boardId, 'manage');
  const hook = rowFor(db, boardId);
  if (!hook) throw notFound('Webhook not found');
  db.prepare('UPDATE inbound_webhooks SET secret = ? WHERE id = ?').run(secret, hook.id);
  return rowFor(db, boardId)!;
}

export interface InboundWebhookInput {
  name: string;
  groupId?: number;
  group?: string;
  status?: string;
  dueDate?: string;
  assignee?: string;
  description?: string;
  values?: Record<string, unknown>;
  ignored?: string[];
}

interface ColumnRow {
  id: number;
  title: string;
  type: string;
  settings: string;
}

function settingsFor(column: ColumnRow): Record<string, unknown> {
  try {
    return JSON.parse(column.settings) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function normalizeDate(raw: string, timezone: string): string {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const check = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== value) {
      throw new Error('Invalid date');
    }
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
  return zonedParts(date, timezone).date;
}

function optionId(column: ColumnRow, name: string): string {
  const options = (settingsFor(column).options ?? []) as { id: string; name: string }[];
  const found = options.find((option) => option.name.toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`Unknown dropdown option "${name}"`);
  return found.id;
}

function labelId(column: ColumnRow, name: string): string {
  const labels = (settingsFor(column).labels ?? []) as { id: string; name: string }[];
  const found = labels.find((label) => label.name.toLowerCase() === name.toLowerCase());
  if (!found) throw new Error(`Unknown status "${name}"`);
  return found.id;
}

function visibleUser(db: Db, boardId: number, email: string): User | null {
  return (
    listUsers(db).find(
      (user) =>
        user.isActive &&
        user.email.toLowerCase() === email.toLowerCase() &&
        boardAccess(db, user, boardId) !== 'none',
    ) ?? null
  );
}

function mapValue(db: Db, boardId: number, column: ColumnRow, raw: unknown): unknown {
  if (
    column.type === 'text' ||
    column.type === 'long_text' ||
    column.type === 'email' ||
    column.type === 'phone'
  ) {
    if (typeof raw !== 'string') throw new Error('Expected text');
    return raw;
  }
  if (column.type === 'number') {
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(value)) throw new Error('Expected a number');
    return value;
  }
  if (column.type === 'link') {
    if (typeof raw === 'string') return { url: raw };
    if (raw && typeof raw === 'object' && typeof (raw as { url?: unknown }).url === 'string')
      return raw;
    throw new Error('Expected a URL string or {url,label}');
  }
  if (column.type === 'dropdown') {
    if (typeof raw === 'string') return { optionIds: [optionId(column, raw)] };
    if (Array.isArray(raw)) {
      if (!raw.every((entry) => typeof entry === 'string'))
        throw new Error('Expected option names');
      return { optionIds: raw.map((entry) => optionId(column, entry as string)) };
    }
    throw new Error('Expected an option name or an array of option names');
  }
  if (column.type === 'checkbox') {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') {
      const normalized = raw.toLowerCase();
      if (['true', 'yes', 'checked', '1'].includes(normalized)) return true;
      if (['false', 'no', 'unchecked', '0'].includes(normalized)) return false;
    }
    throw new Error('Expected a boolean');
  }
  if (column.type === 'status') {
    if (typeof raw === 'string') return { labelId: labelId(column, raw) };
    throw new Error('Expected a status label name');
  }
  if (column.type === 'date') {
    if (typeof raw !== 'string') throw new Error('Expected a date string');
    return { date: normalizeDate(raw, getOrg(db).timezone) };
  }
  if (column.type === 'people') {
    if (typeof raw === 'string') {
      const user = visibleUser(db, boardId, raw);
      if (!user) throw new Error(`Unknown or invisible assignee "${raw}"`);
      return { userIds: [user.id] };
    }
    throw new Error('Expected a user email');
  }
  throw new Error(`Unsupported column type "${column.type}"`);
}

export function recordInboundDelivery(
  db: Db,
  webhookId: number,
  delivery: {
    statusCode: number;
    itemId: number | null;
    ignored: string[];
    errors: { field: string; message: string }[];
    body: string;
    ip: string | null;
  },
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO inbound_webhook_deliveries
      (webhook_id, created_at, status_code, item_id, ignored, errors, body, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    webhookId,
    now,
    delivery.statusCode,
    delivery.itemId,
    JSON.stringify(delivery.ignored),
    JSON.stringify(delivery.errors),
    delivery.body.slice(0, 2048),
    delivery.ip,
  );
  db.prepare(
    `DELETE FROM inbound_webhook_deliveries
     WHERE webhook_id = ?
       AND id NOT IN (
         SELECT id FROM inbound_webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT 100
       )`,
  ).run(webhookId, webhookId);
}

export function receiveInboundWebhook(
  db: Db,
  token: string,
  input: InboundWebhookInput,
): {
  item: Item;
  boardId: number;
  webhookId: number;
  ignored: string[];
  errors: { field: string; message: string }[];
} {
  const hook = db.prepare('SELECT * FROM inbound_webhooks WHERE token = ?').get(token) as
    InboundWebhookRow | undefined;
  if (!hook) throw notFound('Webhook not found');

  const board = db
    .prepare(
      `SELECT b.id, b.created_by FROM boards b
       JOIN workspaces w ON w.id = b.workspace_id
       WHERE b.id = ? AND b.archived_at IS NULL AND w.archived_at IS NULL`,
    )
    .get(hook.board_id) as { id: number; created_by: number } | undefined;
  if (!board) throw notFound('Board not found');

  let actor = getUserById(db, hook.created_by);
  if (!actor || boardAccess(db, actor, board.id) === 'none') {
    actor = getUserById(db, board.created_by);
  }
  if (!actor) throw badRequest('This webhook has no active owner');

  const group = input.groupId
    ? (db
        .prepare('SELECT id FROM item_groups WHERE id = ? AND board_id = ?')
        .get(input.groupId, board.id) as { id: number } | undefined)
    : input.group
      ? (db
          .prepare('SELECT id FROM item_groups WHERE board_id = ? AND lower(title) = lower(?)')
          .get(board.id, input.group) as { id: number } | undefined)
      : (db
          .prepare('SELECT id FROM item_groups WHERE board_id = ? ORDER BY position, id LIMIT 1')
          .get(board.id) as { id: number } | undefined);
  if (!group) throw badRequest('Board has no group to add items to');

  const created = createItem(db, actor, board.id, { groupId: group.id, name: input.name }, 'user');
  const itemId = created.id;
  const columns = db
    .prepare(
      'SELECT id, title, type, settings FROM columns WHERE board_id = ? ORDER BY position, id',
    )
    .all(board.id) as ColumnRow[];
  const errors: { field: string; message: string }[] = [];
  const apply = (field: string, column: ColumnRow | undefined, value: unknown) => {
    if (!column) {
      errors.push({ field, message: 'No matching column on this board' });
      return;
    }
    try {
      setValue(db, actor!, itemId, column.id, value, 'user');
    } catch (error) {
      errors.push({ field, message: error instanceof Error ? error.message : 'Invalid value' });
    }
  };

  if (input.status !== undefined) {
    const column = columns.find((entry) => entry.type === 'status');
    if (!column) errors.push({ field: 'status', message: 'No status column on this board' });
    else {
      try {
        apply('status', column, { labelId: labelId(column, input.status) });
      } catch (error) {
        errors.push({
          field: 'status',
          message: error instanceof Error ? error.message : 'Invalid status',
        });
      }
    }
  }

  if (input.dueDate !== undefined) {
    const column = columns.find((entry) => entry.type === 'date');
    try {
      apply('dueDate', column, { date: normalizeDate(input.dueDate, getOrg(db).timezone) });
    } catch (error) {
      errors.push({
        field: 'dueDate',
        message: error instanceof Error ? error.message : 'Invalid date',
      });
    }
  }

  if (input.assignee !== undefined) {
    const column = columns.find((entry) => entry.type === 'people');
    const user = visibleUser(db, board.id, input.assignee);
    if (!column) errors.push({ field: 'assignee', message: 'No people column on this board' });
    else if (!user) errors.push({ field: 'assignee', message: 'Unknown or invisible assignee' });
    else apply('assignee', column, { userIds: [user.id] });
  }

  if (input.description !== undefined) {
    try {
      postUpdate(db, actor, itemId, input.description);
    } catch (error) {
      errors.push({
        field: 'description',
        message: error instanceof Error ? error.message : 'Could not post update',
      });
    }
  }

  for (const [title, raw] of Object.entries(input.values ?? {})) {
    const column = columns.find((entry) => entry.title.toLowerCase() === title.toLowerCase());
    if (!column) {
      errors.push({ field: `values.${title}`, message: 'Unknown column' });
      continue;
    }
    try {
      apply(`values.${title}`, column, mapValue(db, board.id, column, raw));
    } catch (error) {
      errors.push({
        field: `values.${title}`,
        message: error instanceof Error ? error.message : 'Invalid value',
      });
    }
  }

  db.prepare('UPDATE inbound_webhooks SET last_used_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    hook.id,
  );
  return {
    item: getItemDto(db, itemId),
    boardId: board.id,
    webhookId: hook.id,
    ignored: input.ignored ?? [],
    errors,
  };
}
