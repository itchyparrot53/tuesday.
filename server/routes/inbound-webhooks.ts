import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody, parseId } from '../lib/validate';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError, badRequest } from '../lib/errors';
import { audit } from '../services/audit';
import {
  deleteInboundWebhook,
  getInboundWebhook,
  receiveInboundWebhook,
  recordInboundDelivery,
  rotateInboundWebhook,
  setInboundWebhookSecret,
} from '../services/inbound-webhooks';

const receiveSchema = z
  .object({
    name: z.string().trim().min(1).max(500).optional(),
    title: z.string().trim().min(1).max(500).optional(),
    subject: z.string().trim().min(1).max(500).optional(),
    groupId: z.number().int().positive().optional(),
    group: z.string().trim().min(1).max(80).optional(),
    status: z.string().trim().min(1).max(80).optional(),
    dueDate: z.string().trim().min(1).max(80).optional(),
    assignee: z.string().trim().email().max(200).optional(),
    description: z.string().trim().min(1).max(20000).optional(),
    values: z.record(z.unknown()).optional(),
  })
  .passthrough();

const KNOWN_FIELDS = new Set([
  'name',
  'title',
  'subject',
  'groupId',
  'group',
  'status',
  'dueDate',
  'assignee',
  'description',
  'values',
]);

function urlFor(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, '')}/api/hooks/board/${token}`;
}

export async function inboundWebhooksRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/boards/:id/inbound-webhook', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    const hook = getInboundWebhook(app.db, req.user!, boardId);
    return {
      webhook: hook
        ? {
            id: hook.id,
            token: hook.token,
            url: urlFor(app.config.appUrl, hook.token),
            createdAt: hook.created_at,
            lastUsedAt: hook.last_used_at,
            secretSet: Boolean(hook.secret),
          }
        : null,
    };
  });

  app.post('/api/boards/:id/inbound-webhook', async (req, reply) => {
    const boardId = parseId((req.params as { id: string }).id);
    const hook = rotateInboundWebhook(app.db, req.user!, boardId);
    audit(app.db, req, {
      action: 'webhook.inbound_created',
      targetKind: 'board',
      targetId: boardId,
    });
    reply.code(201);
    return {
      webhook: {
        id: hook.id,
        token: hook.token,
        url: urlFor(app.config.appUrl, hook.token),
        createdAt: hook.created_at,
        lastUsedAt: hook.last_used_at,
        secretSet: Boolean(hook.secret),
      },
    };
  });

  app.get('/api/boards/:id/inbound-webhook/deliveries', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    const hook = getInboundWebhook(app.db, req.user!, boardId);
    if (!hook) return { deliveries: [] };
    const rows = app.db
      .prepare(
        'SELECT * FROM inbound_webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT 100',
      )
      .all(hook.id) as {
      id: number;
      created_at: string;
      status_code: number;
      item_id: number | null;
      ignored: string;
      errors: string;
      body: string;
      ip: string | null;
    }[];
    return {
      deliveries: rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        statusCode: row.status_code,
        itemId: row.item_id,
        ignored: JSON.parse(row.ignored) as string[],
        errors: JSON.parse(row.errors) as { field: string; message: string }[],
        body: row.body,
        ip: row.ip,
      })),
    };
  });

  app.patch('/api/boards/:id/inbound-webhook', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    const body = parseBody(z.object({ secret: z.string().min(16).max(200).nullable() }), req.body);
    const hook = setInboundWebhookSecret(app.db, req.user!, boardId, body.secret);
    audit(app.db, req, {
      action: body.secret ? 'webhook.inbound_secret_set' : 'webhook.inbound_secret_removed',
      targetKind: 'board',
      targetId: boardId,
    });
    return {
      webhook: {
        id: hook.id,
        token: hook.token,
        url: urlFor(app.config.appUrl, hook.token),
        createdAt: hook.created_at,
        lastUsedAt: hook.last_used_at,
        secretSet: Boolean(hook.secret),
      },
    };
  });

  app.post('/api/boards/:id/inbound-webhook/test', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    const hook = getInboundWebhook(app.db, req.user!, boardId);
    if (!hook) throw badRequest('Create a webhook first');
    const payload = { name: 'Webhook test item' };
    const result = receiveInboundWebhook(app.db, hook.token, {
      name: payload.name,
      description: 'Test delivery from the Tuesday webhook settings.',
    });
    recordInboundDelivery(app.db, result.webhookId, {
      statusCode: 201,
      itemId: result.item.id,
      ignored: [],
      errors: result.errors,
      body: JSON.stringify(payload),
      ip: req.ip ?? null,
    });
    return { item: result.item, boardId: result.boardId };
  });

  app.delete('/api/boards/:id/inbound-webhook', async (req, reply) => {
    const boardId = parseId((req.params as { id: string }).id);
    deleteInboundWebhook(app.db, req.user!, boardId);
    audit(app.db, req, {
      action: 'webhook.inbound_deleted',
      targetKind: 'board',
      targetId: boardId,
    });
    reply.code(204);
    return null;
  });

  app.post(
    '/api/hooks/board/:token',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const token = String((req.params as { token: string }).token);
      const raw = (req.body ?? {}) as Record<string, unknown>;
      const bodyText = JSON.stringify(raw).slice(0, 2048);
      const hook = app.db
        .prepare('SELECT id, secret FROM inbound_webhooks WHERE token = ?')
        .get(token) as { id: number; secret: string | null } | undefined;
      if (hook?.secret) {
        const header = String(req.headers['x-tuesday-signature'] ?? '');
        const received = header.startsWith('sha256=') ? header.slice(7) : '';
        const expected = createHmac('sha256', hook.secret)
          .update((req as typeof req & { rawBody?: string }).rawBody ?? '')
          .digest('hex');
        const valid =
          received.length === expected.length &&
          timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
        if (!valid) {
          recordInboundDelivery(app.db, hook.id, {
            statusCode: 401,
            itemId: null,
            ignored: [],
            errors: [{ field: 'signature', message: 'Invalid or missing signature' }],
            body: bodyText,
            ip: req.ip ?? null,
          });
          throw new AppError(401, 'invalid_signature', 'Invalid signature');
        }
      }
      try {
        const body = parseBody(receiveSchema, raw);
        const name = body.name ?? body.title ?? body.subject ?? 'Webhook item';
        const ignored = Object.keys(raw).filter((key) => !KNOWN_FIELDS.has(key));
        const result = receiveInboundWebhook(app.db, token, {
          name,
          groupId: body.groupId,
          group: body.group,
          status: body.status,
          dueDate: body.dueDate,
          assignee: body.assignee,
          description: body.description,
          values: body.values,
          ignored,
        });
        recordInboundDelivery(app.db, result.webhookId, {
          statusCode: 201,
          itemId: result.item.id,
          ignored: result.ignored,
          errors: result.errors,
          body: bodyText,
          ip: req.ip ?? null,
        });
        reply.code(201);
        return {
          item: result.item,
          boardId: result.boardId,
          ignored: result.ignored,
          errors: result.errors,
        };
      } catch (error) {
        const hook = app.db
          .prepare('SELECT id FROM inbound_webhooks WHERE token = ?')
          .get(token) as { id: number } | undefined;
        if (hook) {
          recordInboundDelivery(app.db, hook.id, {
            statusCode: error instanceof AppError ? error.status : 500,
            itemId: null,
            ignored: [],
            errors: [
              {
                field: 'request',
                message: error instanceof Error ? error.message : 'Webhook failed',
              },
            ],
            body: bodyText,
            ip: req.ip ?? null,
          });
        }
        throw error;
      }
    },
  );
}
