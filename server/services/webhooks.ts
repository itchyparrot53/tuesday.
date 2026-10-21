import type { FastifyInstance } from 'fastify';
import { createHmac, randomBytes } from 'node:crypto';
import type { ActivityEvent } from './activity';
import type { Webhook, WebhookDelivery, WebhookEvent } from '../../shared/types';
import { badRequest, notFound } from '../lib/errors';
import { parseJson } from '../lib/json';
import { cellToText, type CellValue } from '../../shared/columns';
import { getBoardFull } from './boards';
import { getItemDto } from './items';
import { listUsers } from './users';
import { assertPublicUrl, resolvePublic } from '../lib/ssrf';
import { Agent, fetch as undiciFetch } from 'undici';
import { notify } from './notifications';
import { enqueue } from '../jobs/queue';
import { onActivity } from './activity';

interface WebhookRow {
  id: number;
  workspace_id: number | null;
  board_id: number | null;
  url: string;
  secret: string;
  events: string;
  enabled: number;
  last_status: number | null;
  failure_count: number;
  created_by: number;
  created_at: string;
}

function toWebhook(row: WebhookRow): Webhook {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    boardId: row.board_id,
    url: row.url,
    events: parseJson<WebhookEvent[]>(row.events, []),
    enabled: row.enabled === 1,
    lastStatus: row.last_status,
    failureCount: row.failure_count,
    createdAt: row.created_at,
  };
}

export function listWebhooks(app: FastifyInstance): Webhook[] {
  return (app.db.prepare('SELECT * FROM webhooks ORDER BY id DESC').all() as WebhookRow[]).map(
    toWebhook,
  );
}

export async function createWebhook(
  app: FastifyInstance,
  userId: number,
  input: {
    url: string;
    events: WebhookEvent[];
    workspaceId?: number;
    boardId?: number;
  },
): Promise<{ webhook: Webhook; secret: string }> {
  await assertPublicUrl(input.url, app.config.webhooksAllowPrivate);
  const secret = `whsec_${randomBytes(32).toString('base64url')}`;
  const info = app.db
    .prepare(
      `INSERT INTO webhooks (workspace_id, board_id, url, secret, events, enabled, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      input.workspaceId ?? null,
      input.boardId ?? null,
      input.url,
      secret,
      JSON.stringify(input.events),
      userId,
      new Date().toISOString(),
    );
  const row = app.db
    .prepare('SELECT * FROM webhooks WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as WebhookRow;
  return { webhook: toWebhook(row), secret };
}

export function updateWebhook(
  app: FastifyInstance,
  id: number,
  patch: { url?: string; events?: WebhookEvent[]; enabled?: boolean },
): Webhook {
  const row = app.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as
    WebhookRow | undefined;
  if (!row) throw notFound('Webhook not found');
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.url !== undefined) {
    sets.push('url = ?');
    values.push(patch.url);
  }
  if (patch.events !== undefined) {
    sets.push('events = ?');
    values.push(JSON.stringify(patch.events));
  }
  if (patch.enabled !== undefined) {
    sets.push('enabled = ?');
    values.push(patch.enabled ? 1 : 0);
  }
  if (sets.length) {
    app.db.prepare(`UPDATE webhooks SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  }
  return toWebhook(app.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as WebhookRow);
}

export function deleteWebhook(app: FastifyInstance, id: number): void {
  app.db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
}

export function listDeliveries(app: FastifyInstance, id: number): WebhookDelivery[] {
  return (
    app.db
      .prepare('SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT 100')
      .all(id) as {
      id: number;
      webhook_id: number;
      event: string;
      status_code: number | null;
      ok: number;
      error: string | null;
      duration_ms: number;
      created_at: string;
    }[]
  ).map((row) => ({
    id: row.id,
    webhookId: row.webhook_id,
    event: row.event,
    statusCode: row.status_code,
    ok: row.ok === 1,
    error: row.error,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  }));
}

export function webhookEventForActivity(activity: ActivityEvent): WebhookEvent | null {
  switch (activity.activity.action) {
    case 'item_created':
      return 'item.created';
    case 'value_changed':
    case 'item_renamed':
      return 'item.updated';
    case 'item_moved':
      return 'item.moved';
    case 'item_archived':
      return 'item.archived';
    case 'update_posted':
      return 'update.posted';
    default:
      return null;
  }
}

function payloadFor(app: FastifyInstance, activity: ActivityEvent, event: WebhookEvent) {
  const full = getBoardFull(app.db, activity.actor!, activity.boardId);
  const item = activity.itemId ? getItemDto(app.db, activity.itemId) : null;
  const users = listUsers(app.db);
  const names = new Map(users.map((user) => [user.id, user.name]));
  const values: Record<string, string> = {};
  if (item) {
    for (const column of full.columns) {
      const text = cellToText(
        column.type,
        column.settings,
        item.values[String(column.id)] as CellValue | undefined,
        (id) => names.get(id) ?? '',
        (id) => `#${id}`,
      );
      if (text) values[column.title] = text;
    }
  }
  const data = activity.activity.data as Record<string, unknown>;
  return {
    event,
    occurredAt: activity.activity.createdAt,
    board: { id: full.board.id, name: full.board.name },
    item: item ? { id: item.id, name: item.name, groupId: item.groupId, values } : null,
    actor: activity.actor ? { id: activity.actor.id, name: activity.actor.name } : null,
    change:
      activity.activity.action === 'value_changed'
        ? {
            columnTitle: data.columnTitle,
            from: data.from,
            to: data.to,
          }
        : null,
    update: null,
  };
}

export function registerWebhookListener(app: FastifyInstance): () => void {
  const handler = (activity: ActivityEvent) => {
    try {
      const event = webhookEventForActivity(activity);
      if (!event) return;
      const rows = app.db.prepare('SELECT * FROM webhooks WHERE enabled = 1').all() as WebhookRow[];
      for (const row of rows) {
        const events = parseJson<WebhookEvent[]>(row.events, []);
        if (!events.includes(event)) continue;
        if (row.board_id && row.board_id !== activity.boardId) continue;
        if (row.workspace_id) {
          const board = app.db
            .prepare('SELECT workspace_id FROM boards WHERE id = ?')
            .get(activity.boardId) as { workspace_id: number } | undefined;
          if (board?.workspace_id !== row.workspace_id) continue;
        }
        const payload = payloadFor(app, activity, event);
        enqueue(
          app.db,
          'webhook_deliver',
          { webhookId: row.id, event, payload },
          { dedupeKey: `wh:${row.id}:${activity.activity.id}` },
        );
      }
    } catch {}
  };
  const off = onActivity(handler);
  app.addHook('onClose', async () => off());
  return off;
}

export async function deliverWebhook(
  app: FastifyInstance,
  input: {
    webhookId: number | null;
    url: string;
    secret: string;
    event: string;
    payload: unknown;
    allowPrivate?: boolean;
  },
): Promise<{ statusCode: number; ok: boolean; error: string | null; durationMs: number }> {
  const allowPrivate = input.allowPrivate ?? app.config.webhooksAllowPrivate;
  const body = JSON.stringify(input.payload);
  const signature = createHmac('sha256', input.secret).update(body).digest('hex');
  const deliveryInfo = input.webhookId
    ? app.db
        .prepare(
          'INSERT INTO webhook_deliveries (webhook_id, event, ok, duration_ms, created_at) VALUES (?, ?, 0, 0, ?)',
        )
        .run(input.webhookId, input.event, new Date().toISOString())
    : null;
  const deliveryId = deliveryInfo ? Number(deliveryInfo.lastInsertRowid) : 0;
  const started = Date.now();
  let statusCode = 0;
  let error: string | null = null;
  let agent: Agent | null = null;
  try {
    const resolved = await resolvePublic(input.url, allowPrivate);
    agent = new Agent({
      connect: {
        lookup: ((_host: string, options: { all?: boolean }, callback: Function) => {
          if (options?.all) {
            callback(null, [{ address: resolved.address, family: resolved.family }]);
          } else {
            callback(null, resolved.address, resolved.family);
          }
        }) as never,
      },
    });
    const res = await undiciFetch(input.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Tuesday-Webhooks/1',
        'X-Tuesday-Event': input.event,
        'X-Tuesday-Delivery': String(deliveryId),
        'X-Tuesday-Signature': `sha256=${signature}`,
      },
      body,
      redirect: 'manual',
      dispatcher: agent,
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = res.status;
    if (statusCode >= 300 && statusCode < 400) {
      error = 'Redirects are not followed';
    } else if (!res.ok) {
      error = `HTTP ${statusCode}`;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Delivery failed';
  } finally {
    if (agent) await agent.close().catch(() => {});
  }
  const durationMs = Date.now() - started;
  if (deliveryInfo && input.webhookId) {
    app.db
      .prepare(
        'UPDATE webhook_deliveries SET status_code = ?, ok = ?, error = ?, duration_ms = ? WHERE id = ?',
      )
      .run(statusCode || null, error ? 0 : 1, error, durationMs, deliveryId);
    if (error) {
      app.db
        .prepare(
          'UPDATE webhooks SET last_status = ?, failure_count = failure_count + 1 WHERE id = ?',
        )
        .run(statusCode || null, input.webhookId);
      const row = app.db
        .prepare(
          `SELECT failure_count, created_by, workspace_id, board_id FROM webhooks WHERE id = ?`,
        )
        .get(input.webhookId) as {
        failure_count: number;
        created_by: number;
        workspace_id: number | null;
        board_id: number | null;
      };
      if (row.failure_count >= 20) {
        app.db.prepare('UPDATE webhooks SET enabled = 0 WHERE id = ?').run(input.webhookId);
        const workspaceId =
          row.workspace_id ??
          (row.board_id
            ? (
                app.db
                  .prepare('SELECT workspace_id FROM boards WHERE id = ?')
                  .get(row.board_id) as { workspace_id: number }
              ).workspace_id
            : ((
                app.db
                  .prepare(
                    'SELECT id FROM workspaces WHERE archived_at IS NULL ORDER BY id LIMIT 1',
                  )
                  .get() as { id: number } | undefined
              )?.id ?? null));
        if (workspaceId) {
          notify(app.db, {
            userId: row.created_by,
            workspaceId,
            kind: 'automation',
            title: 'Webhook paused after 20 failed deliveries',
            link: '/admin?tab=integrations',
            actorId: null,
          });
        }
      }
    } else {
      app.db
        .prepare('UPDATE webhooks SET last_status = ?, failure_count = 0 WHERE id = ?')
        .run(statusCode || null, input.webhookId);
    }
  }
  if (error) throw new Error(error);
  return { statusCode, ok: true, error: null, durationMs };
}

export { badRequest };
