import type { FastifyInstance } from 'fastify';
import type { User } from '../../shared/types';
import type { Workflow, WorkflowStep } from '../../shared/workflows';
import { cellToText, type CellValue } from '../../shared/columns';
import { matchFilter } from '../../shared/filters';
import { renderTemplate } from '../../shared/templates-text';
import { getWorkflow, recordWorkflowRun } from '../services/workflows';
import { getBoardFull, getBoardRow } from '../services/boards';
import { createItem, getItemDto, setValue, updateItem } from '../services/items';
import { postUpdate } from '../services/updates';
import { notify } from '../services/notifications';
import { listUsers, getUserById } from '../services/users';
import { assertBoardAccess } from '../services/permissions';
import { logActivity } from '../services/activity';
import { bus } from '../realtime/bus';
import { badRequest } from '../lib/errors';
import { getOrg } from '../services/settings';
import { addDays, zonedParts } from '../lib/timezone';

export interface WorkflowJobPayload {
  workflowId: number;
  sourceItemId: number | null;
  actorId: number | null;
  depth: number;
  activityId?: number;
  dedupeKey?: string;
}

function disable(app: FastifyInstance, id: number): void {
  app.db
    .prepare('UPDATE workflows SET enabled = 0, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
}

function sourceContext(
  app: FastifyInstance,
  workflow: Workflow,
  creator: User,
  sourceItemId: number,
) {
  const db = app.db;
  const users = listUsers(db);
  const names = new Map(users.map((user) => [user.id, user.name]));
  const full = getBoardFull(db, creator, workflow.triggerBoardId);
  const item = getItemDto(db, sourceItemId);
  const values: Record<string, string> = {};
  for (const column of full.columns) {
    const text = cellToText(
      column.type,
      column.settings,
      item.values[String(column.id)] as CellValue | undefined,
      (id) => names.get(id) ?? '',
    );
    if (text) values[column.title] = text;
  }
  return {
    names,
    item,
    full,
    template: {
      itemName: item.name,
      boardName: full.board.name,
      actorName: '',
      values,
    },
  };
}

function recipients(
  app: FastifyInstance,
  workflow: Workflow,
  sourceItemId: number,
  actorId: number | null,
  to: Extract<WorkflowStep, { type: 'notify' }>['to'],
): number[] {
  if (typeof to === 'object') return to.userIds;
  if (to === 'creator') return workflow.createdBy ? [workflow.createdBy] : [];
  if (to === 'actor') return actorId ? [actorId] : [];
  const creator = getUserById(app.db, workflow.createdBy);
  if (!creator) return [];
  const item = getItemDto(app.db, sourceItemId);
  const full = getBoardFull(app.db, creator, workflow.triggerBoardId);
  const ids = new Set<number>();
  for (const column of full.columns) {
    if (column.type !== 'people') continue;
    const value = item.values[String(column.id)] as { userIds?: number[] } | undefined;
    for (const id of value?.userIds ?? []) ids.add(id);
  }
  return [...ids];
}

async function runStep(
  app: FastifyInstance,
  workflow: Workflow,
  creator: User,
  sourceItemId: number,
  actorId: number | null,
  depth: number,
  step: WorkflowStep,
  state: { currentItemId: number; currentBoardId: number; createdItemId: number | null },
): Promise<void> {
  const db = app.db;
  const source = sourceContext(app, workflow, creator, sourceItemId);
  const template = {
    ...source.template,
    actorName: actorId ? (source.names.get(actorId) ?? '') : '',
  };
  const currentItemId = state.currentItemId;

  if (step.type === 'create_item') {
    const targetBoard = getBoardRow(db, step.boardId);
    const targetFull = getBoardFull(db, creator, targetBoard.id);
    const groupId = step.groupId ?? targetFull.groups[0]?.id;
    if (!groupId) throw badRequest('Target board has no groups');
    const created = createItem(
      db,
      creator,
      targetBoard.id,
      { groupId, name: renderTemplate(step.name, template) },
      'system',
      depth,
    );
    state.currentItemId = created.id;
    state.currentBoardId = targetBoard.id;
    state.createdItemId = created.id;
    return;
  }

  if (step.type === 'copy_value') {
    const value = source.item.values[String(step.sourceColumnId)];
    if (value === undefined || value === null) return;
    setValue(db, creator, currentItemId, step.targetColumnId, value, 'system', depth);
    return;
  }

  if (step.type === 'assign_from') {
    const from = ((
      source.item.values[String(step.sourceColumnId)] as { userIds?: number[] } | undefined
    )?.userIds ?? []) as number[];
    if (!from.length) return;
    const at = getItemDto(db, currentItemId);
    const current = ((at.values[String(step.targetColumnId)] as { userIds?: number[] } | undefined)
      ?.userIds ?? []) as number[];
    const merged = [...new Set([...current, ...from])];
    if (merged.length !== current.length) {
      setValue(
        db,
        creator,
        currentItemId,
        step.targetColumnId,
        { userIds: merged },
        'system',
        depth,
      );
    }
    return;
  }

  if (step.type === 'set_value') {
    let value = step.value;
    if (
      typeof value === 'object' &&
      value !== null &&
      Number.isInteger((value as { relativeDays?: number }).relativeDays)
    ) {
      const today = zonedParts(new Date(), getOrg(db).timezone).date;
      value = { date: addDays(today, (value as { relativeDays: number }).relativeDays) };
    }
    setValue(db, creator, currentItemId, step.columnId, value, 'system', depth);
    return;
  }

  if (step.type === 'move_to_group') {
    updateItem(db, creator, currentItemId, { groupId: step.groupId }, 'system', depth);
    return;
  }

  if (step.type === 'post_update') {
    let body = renderTemplate(step.body, template);
    if (step.mentionFromColumnId) {
      const ids = ((
        source.item.values[String(step.mentionFromColumnId)] as { userIds?: number[] } | undefined
      )?.userIds ?? []) as number[];
      if (ids.length) {
        body = `${ids
          .map((id) => `@[${source.names.get(id) ?? 'Someone'}](user:${id})`)
          .join(' ')} ${body}`;
      }
    }
    postUpdate(db, creator, currentItemId, `⚙️ ${body}`, undefined, 'user', depth);
    return;
  }

  if (step.type === 'notify') {
    const message = renderTemplate(step.message, template);
    const sourceBoard = getBoardRow(db, workflow.triggerBoardId);
    const link = `/boards/${workflow.triggerBoardId}?item=${sourceItemId}`;
    for (const userId of recipients(app, workflow, sourceItemId, actorId, step.to)) {
      notify(db, {
        userId,
        workspaceId: sourceBoard.workspace_id,
        kind: 'automation',
        title: message,
        body: '',
        link,
        actorId: actorId ?? creator.id,
        boardId: workflow.triggerBoardId,
      });
    }
  }
}

export async function runWorkflowJob(
  app: FastifyInstance,
  payload: WorkflowJobPayload,
): Promise<void> {
  const workflow = getWorkflow(app.db, payload.workflowId);
  if (!workflow.enabled) return;
  const creator = getUserById(app.db, workflow.createdBy);
  if (!creator || !creator.isActive) {
    recordWorkflowRun(app.db, {
      workflowId: workflow.id,
      sourceItemId: payload.sourceItemId,
      createdItemId: null,
      status: 'failed',
      error: 'Workflow owner can no longer edit this board',
      dedupeKey: payload.dedupeKey,
    });
    disable(app, workflow.id);
    return;
  }
  try {
    assertBoardAccess(app.db, creator, workflow.triggerBoardId, 'view');
    if (payload.sourceItemId) {
      const source = app.db
        .prepare('SELECT id, archived_at FROM items WHERE id = ?')
        .get(payload.sourceItemId) as { id: number; archived_at: string | null } | undefined;
      if (!source || source.archived_at) {
        recordWorkflowRun(app.db, {
          workflowId: workflow.id,
          sourceItemId: payload.sourceItemId,
          createdItemId: null,
          status: 'skipped',
          error: 'Item archived',
          dedupeKey: payload.dedupeKey,
          count: false,
        });
        return;
      }
    }
  } catch (err) {
    recordWorkflowRun(app.db, {
      workflowId: workflow.id,
      sourceItemId: payload.sourceItemId,
      createdItemId: null,
      status: 'failed',
      error: err instanceof Error ? err.message : 'No access to source board',
      dedupeKey: payload.dedupeKey,
    });
    return;
  }

  if (payload.sourceItemId && workflow.conditions.length) {
    const item = getItemDto(app.db, payload.sourceItemId);
    const full = getBoardFull(app.db, creator, workflow.triggerBoardId);
    const users = listUsers(app.db);
    const names = new Map(users.map((user) => [user.id, user.name]));
    const passed = workflow.conditions.every((condition) => {
      const column = full.columns.find((entry) => entry.id === condition.columnId);
      if (!column) return false;
      return matchFilter(item, column, condition, {
        userName: (id) => names.get(id) ?? '',
        itemName: (id) =>
          (
            app.db.prepare('SELECT name FROM items WHERE id = ?').get(id) as
              { name: string } | undefined
          )?.name ?? `#${id}`,
      });
    });
    if (!passed) {
      recordWorkflowRun(app.db, {
        workflowId: workflow.id,
        sourceItemId: payload.sourceItemId,
        createdItemId: null,
        status: 'skipped',
        error: 'Conditions not met',
        dedupeKey: payload.dedupeKey,
        count: false,
      });
      return;
    }
  }

  const state = {
    currentItemId: payload.sourceItemId ?? 0,
    currentBoardId: workflow.triggerBoardId,
    createdItemId: null as number | null,
  };
  try {
    for (const step of workflow.steps) {
      await runStep(
        app,
        workflow,
        creator,
        payload.sourceItemId ?? 0,
        payload.actorId,
        payload.depth,
        step,
        state,
      );
    }
    recordWorkflowRun(app.db, {
      workflowId: workflow.id,
      sourceItemId: payload.sourceItemId,
      createdItemId: state.createdItemId,
      status: 'success',
      dedupeKey: payload.dedupeKey,
    });
    logActivity(app.db, {
      boardId: workflow.triggerBoardId,
      itemId: payload.sourceItemId,
      actorId: creator.id,
      actorKind: 'system',
      action: 'workflow_ran',
      depth: payload.depth,
      data: { workflowId: workflow.id, name: workflow.name },
    });
    bus.publish({
      event: { type: 'board.changed', boardId: workflow.triggerBoardId },
      boardId: workflow.triggerBoardId,
    });
  } catch (err) {
    recordWorkflowRun(app.db, {
      workflowId: workflow.id,
      sourceItemId: payload.sourceItemId,
      createdItemId: state.createdItemId,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      dedupeKey: payload.dedupeKey,
    });
  }
}

export { disable };
