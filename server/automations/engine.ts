import type { FastifyInstance } from 'fastify';
import type { Trigger } from '../../shared/automations';
import type { ActivityEvent } from '../services/activity';
import { onActivity } from '../services/activity';
import { getAutomationForRun, recordRun, toAutomation } from '../services/automations';
import { enqueue } from '../jobs/queue';

interface AutomationRowShape {
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
    case 'subitem_created': {
      if (activity.action !== 'item_created' || !event.itemId) return false;
      const item = app.db.prepare('SELECT parent_id FROM items WHERE id = ?').get(event.itemId) as
        { parent_id: number | null } | undefined;
      return Boolean(item && item.parent_id !== null);
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
  if (!event.itemId && event.activity.action !== 'update_posted') return;
  const rows = app.db
    .prepare('SELECT * FROM automations WHERE board_id = ? AND enabled = 1')
    .all(event.boardId) as AutomationRowShape[];
  if (!rows.length) return;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  for (const row of rows) {
    const automation = toAutomation(row);
    if (!matches(automation.trigger, event, app)) continue;
    if (event.depth >= 3) {
      recordRun(app.db, {
        automationId: automation.id,
        itemId: event.itemId,
        status: 'skipped',
        error: 'Chain depth limit',
        dedupeKey: `depth:${automation.id}:${event.activity.id}`,
        count: false,
      });
      continue;
    }
    const recent = (
      app.db
        .prepare(
          'SELECT count(*) AS n FROM automation_runs WHERE automation_id = ? AND created_at >= ?',
        )
        .get(automation.id, since) as { n: number }
    ).n;
    if (recent >= 200) {
      recordRun(app.db, {
        automationId: automation.id,
        itemId: event.itemId,
        status: 'skipped',
        error: 'Rate limit',
        dedupeKey: `rate:${automation.id}:${event.activity.id}`,
        count: false,
      });
      continue;
    }
    enqueue(
      app.db,
      'automation_run',
      {
        automationId: automation.id,
        itemId: event.itemId,
        actorId: event.actor?.id ?? null,
        depth: event.depth + 1,
        activityId: event.activity.id,
      },
      { dedupeKey: `auto:${automation.id}:${event.activity.id}` },
    );
  }
}

export function registerAutomationEngine(app: FastifyInstance): () => void {
  const off = onActivity((event) => {
    try {
      handle(app, event);
    } catch {}
  });
  app.addHook('onClose', async () => off());
  return off;
}

export { getAutomationForRun };
