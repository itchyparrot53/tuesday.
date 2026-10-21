import type { FastifyInstance } from 'fastify';
import type { Trigger } from '../../shared/automations';
import type { ActivityEvent } from '../services/activity';
import { onActivity } from '../services/activity';
import { enqueue } from '../jobs/queue';
import { recordWorkflowRun, toWorkflow } from '../services/workflows';

interface WorkflowRowShape {
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

function matches(trigger: Trigger, event: ActivityEvent, app: FastifyInstance): boolean {
  const activity = event.activity;
  const data = activity.data as Record<string, any>;
  switch (trigger.type) {
    case 'item_created': {
      if (activity.action !== 'item_created' || !event.itemId) return false;
      const item = app.db
        .prepare('SELECT parent_id, group_id FROM items WHERE id = ?')
        .get(event.itemId) as { parent_id: number | null; group_id: number } | undefined;
      if (!item || item.parent_id !== null) return false;
      return trigger.groupId === undefined || item.group_id === trigger.groupId;
    }
    case 'status_changed':
      return (
        activity.action === 'value_changed' &&
        data.columnId === trigger.columnId &&
        (trigger.toLabelId === null ||
          (data.toValue as { labelId?: string } | null)?.labelId === trigger.toLabelId)
      );
    case 'column_changed':
      return activity.action === 'value_changed' && data.columnId === trigger.columnId;
    case 'person_assigned': {
      if (activity.action !== 'value_changed' || data.columnId !== trigger.columnId) return false;
      const before = ((data.fromValue as { userIds?: number[] } | null)?.userIds ?? []) as number[];
      const after = ((data.toValue as { userIds?: number[] } | null)?.userIds ?? []) as number[];
      return after.some((id) => !before.includes(id));
    }
    case 'item_moved_to_group':
      return activity.action === 'item_moved' && data.groupId === trigger.groupId;
    case 'update_posted':
      return activity.action === 'update_posted';
    default:
      return false;
  }
}

function handle(app: FastifyInstance, event: ActivityEvent): void {
  if (!event.itemId) return;
  const rows = app.db
    .prepare('SELECT * FROM workflows WHERE trigger_board_id = ? AND enabled = 1')
    .all(event.boardId) as WorkflowRowShape[];
  if (!rows.length) return;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  for (const row of rows) {
    const workflow = toWorkflow(row);
    if (!matches(workflow.trigger as Trigger, event, app)) continue;
    if (event.depth >= 3) {
      recordWorkflowRun(app.db, {
        workflowId: workflow.id,
        sourceItemId: event.itemId,
        createdItemId: null,
        status: 'skipped',
        error: 'Chain depth limit',
        dedupeKey: `workflow-depth:${workflow.id}:${event.activity.id}`,
        count: false,
      });
      continue;
    }
    const recent = (
      app.db
        .prepare(
          'SELECT count(*) AS n FROM workflow_runs WHERE workflow_id = ? AND created_at >= ?',
        )
        .get(workflow.id, since) as { n: number }
    ).n;
    if (recent >= 200) {
      recordWorkflowRun(app.db, {
        workflowId: workflow.id,
        sourceItemId: event.itemId,
        createdItemId: null,
        status: 'skipped',
        error: 'Rate limit',
        dedupeKey: `workflow-rate:${workflow.id}:${event.activity.id}`,
        count: false,
      });
      continue;
    }
    enqueue(
      app.db,
      'workflow_run',
      {
        workflowId: workflow.id,
        sourceItemId: event.itemId,
        actorId: event.actor?.id ?? null,
        depth: event.depth + 1,
        activityId: event.activity.id,
      },
      { dedupeKey: `workflow:${workflow.id}:${event.activity.id}` },
    );
  }
}

export function registerWorkflowEngine(app: FastifyInstance): () => void {
  const off = onActivity((event) => {
    try {
      handle(app, event);
    } catch {}
  });
  app.addHook('onClose', async () => off());
  return off;
}
