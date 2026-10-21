import type { Db } from '../db/db';
import type {
  Action,
  Automation,
  AutomationInput,
  AutomationRun,
  Condition,
  Trigger,
} from '../../shared/automations';
import type { Column, User } from '../../shared/types';
import { validateValue, type ColumnType } from '../../shared/columns';
import { badRequest, notFound } from '../lib/errors';
import { parseJson } from '../lib/json';
import { getBoardRow, toColumn } from './boards';
import { assertReadWorkspace, assertBoardAccess } from './permissions';
import { bus } from '../realtime/bus';

interface AutomationRow {
  id: number;
  board_id: number;
  name: string;
  enabled: number;
  trigger: string;
  conditions: string;
  actions: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  run_count: number;
  last_run_at: string | null;
}

interface RunRow {
  id: number;
  automation_id: number;
  item_id: number | null;
  status: 'success' | 'failed' | 'skipped';
  error: string | null;
  created_at: string;
}

const SERVER_MANAGED: string[] = ['ai', 'formula', 'mirror', 'time_tracking'];

export function toAutomation(row: AutomationRow): Automation {
  return {
    id: row.id,
    boardId: row.board_id,
    name: row.name,
    enabled: row.enabled === 1,
    trigger: parseJson<Trigger>(row.trigger, { type: 'item_created' }),
    conditions: parseJson<Condition[]>(row.conditions, []),
    actions: parseJson<Action[]>(row.actions, []),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    runCount: row.run_count,
    lastRunAt: row.last_run_at,
  };
}

function toRun(row: RunRow): AutomationRun {
  return {
    id: row.id,
    automationId: row.automation_id,
    itemId: row.item_id,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
  };
}

export function getAutomationRow(db: Db, id: number): AutomationRow {
  const row = db.prepare('SELECT * FROM automations WHERE id = ?').get(id) as
    AutomationRow | undefined;
  if (!row) throw notFound('Automation not found');
  return row;
}

export function listAutomations(db: Db, user: User, boardId: number): Automation[] {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, board.id, 'view');
  const rows = db
    .prepare('SELECT * FROM automations WHERE board_id = ? ORDER BY id')
    .all(boardId) as AutomationRow[];
  return rows.map(toAutomation);
}

function boardColumns(db: Db, boardId: number): Column[] {
  return (
    db
      .prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position, id')
      .all(boardId) as Parameters<typeof toColumn>[0][]
  ).map(toColumn);
}

function validateAction(
  db: Db,
  boardId: number,
  columns: Column[],
  action: Action,
  groups: { id: number }[],
): void {
  const column = (id: number) => columns.find((entry) => entry.id === id);
  if (action.type === 'set_value') {
    const target = column(action.columnId);
    if (!target) throw badRequest('Unknown column in action');
    if (SERVER_MANAGED.includes(target.type)) {
      throw badRequest(`${target.type} columns cannot be set by automations`);
    }
    const isRelativeDate =
      target.type === 'date' &&
      typeof action.value === 'object' &&
      action.value !== null &&
      Number.isInteger((action.value as { relativeDays?: number }).relativeDays);
    if (!isRelativeDate && action.value !== null) {
      try {
        validateValue(target.type, target.settings, action.value);
      } catch (err) {
        throw badRequest(err instanceof Error ? err.message : 'Invalid action value');
      }
    }
  }
  if (action.type === 'move_to_group' && !groups.some((group) => group.id === action.groupId)) {
    throw badRequest('Unknown group in action');
  }
  if (action.type === 'assign') {
    const target = column(action.columnId);
    if (!target || target.type !== 'people') throw badRequest('Assign needs a People column');
    if (typeof action.who === 'object' && 'fromColumnId' in action.who) {
      const source = column(action.who.fromColumnId);
      if (!source || source.type !== 'people') {
        throw badRequest('Copy person from a People column');
      }
    } else if (typeof action.who === 'object') {
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(action.who.userId);
      if (!user) throw badRequest('Unknown user in assign action');
    }
  }
  if (action.type === 'notify' && typeof action.to === 'object') {
    for (const userId of action.to.userIds) {
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!user) throw badRequest('Unknown user in notify action');
    }
  }
  if (action.type === 'create_item') {
    const target = db
      .prepare('SELECT id, workspace_id, archived_at FROM boards WHERE id = ?')
      .get(action.boardId) as
      { id: number; workspace_id: number; archived_at: string | null } | undefined;
    if (!target || target.archived_at) throw badRequest('Unknown target board');
    if (action.groupId) {
      const group = db
        .prepare('SELECT id FROM item_groups WHERE id = ? AND board_id = ?')
        .get(action.groupId, action.boardId);
      if (!group) throw badRequest('Unknown target group');
    }
  }
  if (action.type === 'post_update' && action.mentionFromColumnId) {
    const source = column(action.mentionFromColumnId);
    if (!source || source.type !== 'people') {
      throw badRequest('Mention people from a People column');
    }
  }
  if (action.type === 'create_subitem' || action.type === 'archive_item') {
    // These are item actions; validated by the item trigger being present.
  }
  if (action.type === 'ai_prompt') {
    const target = column(action.targetColumnId);
    if (!target || (target.type !== 'text' && target.type !== 'long_text')) {
      throw badRequest('AI prompt target must be a Text or Long text column');
    }
  }
  if (action.type === 'send_webhook') {
    if (!/^https?:\/\//.test(action.url)) throw badRequest('Invalid webhook URL');
  }
  void boardId;
}

export function validateAutomationRefs(
  db: Db,
  boardId: number,
  input: Pick<AutomationInput, 'trigger' | 'conditions' | 'actions'>,
): void {
  const columns = boardColumns(db, boardId);
  const groups = db
    .prepare('SELECT id, title FROM item_groups WHERE board_id = ?')
    .all(boardId) as { id: number; title: string }[];
  const column = (id: number) => columns.find((entry) => entry.id === id);
  const trigger = input.trigger;
  if (trigger.type === 'status_changed') {
    const target = column(trigger.columnId);
    if (!target || target.type !== 'status')
      throw badRequest('Status trigger needs a Status column');
    if (
      trigger.toLabelId &&
      !target.settings.labels?.some((label) => label.id === trigger.toLabelId)
    ) {
      throw badRequest('Unknown status label');
    }
  }
  if (
    trigger.type === 'item_created' &&
    trigger.groupId !== undefined &&
    !groups.some((group) => group.id === trigger.groupId)
  ) {
    throw badRequest('Unknown group in trigger');
  }
  if (trigger.type === 'column_changed' && !column(trigger.columnId)) {
    throw badRequest('Unknown column in trigger');
  }
  if (trigger.type === 'person_assigned') {
    const target = column(trigger.columnId);
    if (!target || target.type !== 'people')
      throw badRequest('Assignment trigger needs a People column');
  }
  if (
    trigger.type === 'item_moved_to_group' &&
    !groups.some((group) => group.id === trigger.groupId)
  ) {
    throw badRequest('Unknown group in trigger');
  }
  if (trigger.type === 'date_arrives' || trigger.type === 'date_passed') {
    const target = column(trigger.columnId);
    if (!target || (target.type !== 'date' && target.type !== 'timeline')) {
      throw badRequest('Date trigger needs a Date or Timeline column');
    }
  }
  for (const condition of input.conditions) {
    if (!column(condition.columnId)) throw badRequest('Unknown column in condition');
  }
  if (trigger.type === 'recurring') {
    for (const action of input.actions) {
      if (!['create_item', 'notify', 'send_webhook'].includes(action.type)) {
        throw badRequest('Recurring automations can only create items, notify or send webhooks');
      }
    }
  }
  let createdAvailable = false;
  for (const action of input.actions) {
    if (action.type === 'create_subitem') createdAvailable = true;
    if ('target' in action && action.target === 'created' && !createdAvailable) {
      throw badRequest('Add a “Create a subitem” action before targeting the created subitem');
    }
    validateAction(db, boardId, columns, action, groups);
  }
}

export function createAutomation(
  db: Db,
  user: User,
  boardId: number,
  input: AutomationInput,
): Automation {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, board.id, 'manage');
  validateAutomationRefs(db, boardId, input);
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO automations
        (board_id, name, enabled, trigger, conditions, actions, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      boardId,
      input.name,
      input.enabled === false ? 0 : 1,
      JSON.stringify(input.trigger),
      JSON.stringify(input.conditions ?? []),
      JSON.stringify(input.actions),
      user.id,
      now,
      now,
    );
  bus.publish({ event: { type: 'board.changed', boardId }, boardId });
  return toAutomation(getAutomationRow(db, Number(info.lastInsertRowid)));
}

export function updateAutomation(
  db: Db,
  user: User,
  id: number,
  patch: Partial<AutomationInput>,
): Automation {
  const row = getAutomationRow(db, id);
  const board = getBoardRow(db, row.board_id);
  assertBoardAccess(db, user, board.id, 'manage');
  const current = toAutomation(row);
  const next: AutomationInput = {
    name: patch.name ?? current.name,
    enabled: patch.enabled ?? current.enabled,
    trigger: patch.trigger ?? current.trigger,
    conditions: patch.conditions ?? current.conditions,
    actions: patch.actions ?? current.actions,
  };
  validateAutomationRefs(db, row.board_id, next);
  db.prepare(
    `UPDATE automations SET name = ?, enabled = ?, trigger = ?, conditions = ?, actions = ?,
       updated_at = ? WHERE id = ?`,
  ).run(
    next.name,
    next.enabled ? 1 : 0,
    JSON.stringify(next.trigger),
    JSON.stringify(next.conditions),
    JSON.stringify(next.actions),
    new Date().toISOString(),
    id,
  );
  bus.publish({ event: { type: 'board.changed', boardId: row.board_id }, boardId: row.board_id });
  return toAutomation(getAutomationRow(db, id));
}

export function deleteAutomation(db: Db, user: User, id: number): void {
  const row = getAutomationRow(db, id);
  const board = getBoardRow(db, row.board_id);
  assertBoardAccess(db, user, board.id, 'manage');
  db.prepare('DELETE FROM automations WHERE id = ?').run(id);
  bus.publish({ event: { type: 'board.changed', boardId: row.board_id }, boardId: row.board_id });
}

export function listRuns(db: Db, user: User, id: number, limit = 100): AutomationRun[] {
  const automation = getAutomationRow(db, id);
  const board = getBoardRow(db, automation.board_id);
  assertBoardAccess(db, user, board.id, 'view');
  const rows = db
    .prepare('SELECT * FROM automation_runs WHERE automation_id = ? ORDER BY id DESC LIMIT ?')
    .all(id, Math.min(200, Math.max(1, limit))) as RunRow[];
  return rows.map(toRun);
}

export function recordRun(
  db: Db,
  input: {
    automationId: number;
    itemId: number | null;
    status: 'success' | 'failed' | 'skipped';
    error?: string | null;
    dedupeKey?: string | null;
    count?: boolean;
  },
): boolean {
  let inserted = true;
  try {
    db.prepare(
      `INSERT INTO automation_runs (automation_id, item_id, status, error, dedupe_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.automationId,
      input.itemId,
      input.status,
      input.error ?? null,
      input.dedupeKey ?? null,
      new Date().toISOString(),
    );
  } catch {
    inserted = false;
  }
  if (inserted && input.count !== false && input.status === 'success') {
    db.prepare(
      'UPDATE automations SET run_count = run_count + 1, last_run_at = ? WHERE id = ?',
    ).run(new Date().toISOString(), input.automationId);
  }
  return inserted;
}

export function getAutomationForRun(db: Db, id: number): Automation | null {
  const row = db.prepare('SELECT * FROM automations WHERE id = ?').get(id) as
    AutomationRow | undefined;
  return row ? toAutomation(row) : null;
}
