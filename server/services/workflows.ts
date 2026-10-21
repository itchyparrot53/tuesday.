import type { Db } from '../db/db';
import type { User } from '../../shared/types';
import type { Workflow, WorkflowInput, WorkflowRun } from '../../shared/workflows';
import { parseJson } from '../lib/json';
import { badRequest, notFound } from '../lib/errors';
import { getBoardRow } from './boards';
import { assertBoardAccess } from './permissions';
import { bus } from '../realtime/bus';

interface WorkflowRow {
  id: number;
  name: string;
  description: string;
  enabled: number;
  trigger_board_id: number;
  trigger: string;
  conditions: string;
  steps: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  run_count: number;
  last_run_at: string | null;
}

interface RunRow {
  id: number;
  workflow_id: number;
  source_item_id: number | null;
  created_item_id: number | null;
  status: 'success' | 'failed' | 'skipped';
  error: string | null;
  created_at: string;
}

export function toWorkflow(row: WorkflowRow): Workflow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled === 1,
    triggerBoardId: row.trigger_board_id,
    trigger: parseJson(row.trigger, { type: 'item_created' }),
    conditions: parseJson(row.conditions, []),
    steps: parseJson(row.steps, []),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    runCount: row.run_count,
    lastRunAt: row.last_run_at,
  };
}

function toRun(row: RunRow): WorkflowRun {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    sourceItemId: row.source_item_id,
    createdItemId: row.created_item_id,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
  };
}

export function getWorkflowRow(db: Db, id: number): WorkflowRow {
  const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as WorkflowRow | undefined;
  if (!row) throw notFound('Workflow not found');
  return row;
}

export function getWorkflow(db: Db, id: number): Workflow {
  return toWorkflow(getWorkflowRow(db, id));
}

export function listWorkflows(db: Db): Workflow[] {
  const rows = db.prepare('SELECT * FROM workflows ORDER BY id DESC').all() as WorkflowRow[];
  return rows.map(toWorkflow);
}

function boardFullColumns(db: Db, boardId: number) {
  return db
    .prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position, id')
    .all(boardId) as {
    id: number;
    title: string;
    type: string;
    settings: string;
  }[];
}

function boardGroups(db: Db, boardId: number) {
  return db.prepare('SELECT id FROM item_groups WHERE board_id = ?').all(boardId) as {
    id: number;
  }[];
}

export function validateWorkflow(db: Db, user: User, input: WorkflowInput): void {
  const source = getBoardRow(db, input.triggerBoardId);
  assertBoardAccess(db, user, source.id, 'manage');
  const sourceColumns = boardFullColumns(db, source.id);
  const sourceGroups = boardGroups(db, source.id);
  const column = (id: number) => sourceColumns.find((entry) => entry.id === id);
  const trigger = input.trigger;
  if (trigger.type === 'item_created' && trigger.groupId) {
    if (!sourceGroups.some((group) => group.id === trigger.groupId)) {
      throw badRequest('Unknown group in trigger');
    }
  }
  if (trigger.type === 'status_changed') {
    const target = column(trigger.columnId);
    if (!target || target.type !== 'status')
      throw badRequest('Status trigger needs a Status column');
    if (
      trigger.toLabelId &&
      !(parseJson<{ labels?: { id: string }[] }>(target.settings, {}).labels ?? []).some(
        (label) => label.id === trigger.toLabelId,
      )
    ) {
      throw badRequest('Unknown status label');
    }
  }
  if (trigger.type === 'column_changed' && !column(trigger.columnId)) {
    throw badRequest('Unknown column in trigger');
  }
  if (trigger.type === 'person_assigned') {
    const target = column(trigger.columnId);
    if (!target || target.type !== 'people') {
      throw badRequest('Assignment trigger needs a People column');
    }
  }
  if (
    trigger.type === 'item_moved_to_group' &&
    !sourceGroups.some((g) => g.id === trigger.groupId)
  ) {
    throw badRequest('Unknown group in trigger');
  }
  for (const condition of input.conditions) {
    if (!column(condition.columnId)) throw badRequest('Unknown column in condition');
  }

  let currentBoardId = source.id;
  let currentColumns = sourceColumns;
  let currentGroups = sourceGroups;
  let created = false;
  const sourceColumn = (id: number) => sourceColumns.find((entry) => entry.id === id);

  for (const step of input.steps) {
    if (step.type === 'create_item') {
      const target = getBoardRow(db, step.boardId);
      if (target.archived_at) throw badRequest('Target board is archived');
      assertBoardAccess(db, user, target.id, 'edit');
      currentBoardId = target.id;
      currentColumns = boardFullColumns(db, target.id);
      currentGroups = boardGroups(db, target.id);
      if (step.groupId && !currentGroups.some((group) => group.id === step.groupId)) {
        throw badRequest('Unknown group in create item');
      }
      created = true;
      continue;
    }
    const targetColumn = (id: number) => currentColumns.find((entry) => entry.id === id);
    if (step.type === 'copy_value') {
      if (!sourceColumn(step.sourceColumnId)) throw badRequest('Unknown source column');
      if (!targetColumn(step.targetColumnId)) throw badRequest('Unknown target column');
    }
    if (step.type === 'assign_from') {
      const from = sourceColumn(step.sourceColumnId);
      const to = targetColumn(step.targetColumnId);
      if (!from || from.type !== 'people') throw badRequest('Assign from a People column');
      if (!to || to.type !== 'people') throw badRequest('Assign to a People column');
    }
    if (step.type === 'set_value' && !targetColumn(step.columnId)) {
      throw badRequest('Unknown target column');
    }
    if (
      step.type === 'move_to_group' &&
      !currentGroups.some((group) => group.id === step.groupId)
    ) {
      throw badRequest('Unknown target group');
    }
    if (step.type === 'post_update' && step.mentionFromColumnId) {
      const mention = sourceColumn(step.mentionFromColumnId);
      if (!mention || mention.type !== 'people') throw badRequest('Mention a People column');
    }
    if (step.type === 'notify' && typeof step.to === 'object') {
      for (const userId of step.to.userIds) {
        if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
          throw badRequest('Unknown user in notify step');
        }
      }
    }
    void currentBoardId;
  }
  void created;
}

export function createWorkflow(db: Db, user: User, input: WorkflowInput): Workflow {
  validateWorkflow(db, user, input);
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO workflows
        (name, description, enabled, trigger_board_id, trigger, conditions, steps, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.description,
      input.enabled === false ? 0 : 1,
      input.triggerBoardId,
      JSON.stringify(input.trigger),
      JSON.stringify(input.conditions),
      JSON.stringify(input.steps),
      user.id,
      now,
      now,
    );
  bus.publish({
    event: { type: 'board.changed', boardId: input.triggerBoardId },
    boardId: input.triggerBoardId,
  });
  return getWorkflow(db, Number(info.lastInsertRowid));
}

export function updateWorkflow(
  db: Db,
  user: User,
  id: number,
  patch: Partial<WorkflowInput>,
): Workflow {
  const row = getWorkflowRow(db, id);
  const current = toWorkflow(row);
  const next: WorkflowInput = {
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    enabled: patch.enabled ?? current.enabled,
    triggerBoardId: patch.triggerBoardId ?? current.triggerBoardId,
    trigger: patch.trigger ?? current.trigger,
    conditions: patch.conditions ?? current.conditions,
    steps: patch.steps ?? current.steps,
  };
  validateWorkflow(db, user, next);
  db.prepare(
    `UPDATE workflows SET name = ?, description = ?, enabled = ?, trigger_board_id = ?,
       trigger = ?, conditions = ?, steps = ?, updated_at = ? WHERE id = ?`,
  ).run(
    next.name,
    next.description,
    next.enabled ? 1 : 0,
    next.triggerBoardId,
    JSON.stringify(next.trigger),
    JSON.stringify(next.conditions),
    JSON.stringify(next.steps),
    new Date().toISOString(),
    id,
  );
  return getWorkflow(db, id);
}

export function deleteWorkflow(db: Db, id: number): void {
  getWorkflowRow(db, id);
  db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
}

export function listWorkflowRuns(db: Db, id: number, limit = 100): WorkflowRun[] {
  getWorkflowRow(db, id);
  const rows = db
    .prepare('SELECT * FROM workflow_runs WHERE workflow_id = ? ORDER BY id DESC LIMIT ?')
    .all(id, Math.min(200, Math.max(1, limit))) as RunRow[];
  return rows.map(toRun);
}

export function recordWorkflowRun(
  db: Db,
  input: {
    workflowId: number;
    sourceItemId: number | null;
    createdItemId: number | null;
    status: 'success' | 'failed' | 'skipped';
    error?: string | null;
    dedupeKey?: string | null;
    count?: boolean;
  },
): boolean {
  let inserted = true;
  try {
    db.prepare(
      `INSERT INTO workflow_runs
        (workflow_id, source_item_id, created_item_id, status, error, dedupe_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.workflowId,
      input.sourceItemId,
      input.createdItemId,
      input.status,
      input.error ?? null,
      input.dedupeKey ?? null,
      new Date().toISOString(),
    );
  } catch {
    inserted = false;
  }
  if (inserted && input.count !== false && input.status === 'success') {
    db.prepare('UPDATE workflows SET run_count = run_count + 1, last_run_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      input.workflowId,
    );
  }
  return inserted;
}
