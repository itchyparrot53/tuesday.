import type { FastifyInstance } from 'fastify';
import { audit } from '../services/audit';
import { z } from 'zod';
import { parseBody, parseId } from '../lib/validate';
import { forbidden } from '../lib/errors';
import { isAdmin } from '../services/permissions';
import {
  createWebhook,
  deleteWebhook,
  deliverWebhook,
  listDeliveries,
  listWebhooks,
  updateWebhook,
} from '../services/webhooks';

const events = z
  .array(z.enum(['item.created', 'item.updated', 'item.moved', 'item.archived', 'update.posted']))
  .min(1);

export async function webhooksRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/webhooks', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    return { webhooks: listWebhooks(app) };
  });

  app.post('/api/webhooks', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const body = parseBody(
      z.object({
        url: z.string().max(2000),
        events,
        workspaceId: z.number().int().positive().optional(),
        boardId: z.number().int().positive().optional(),
      }),
      req.body,
    );
    const result = await createWebhook(app, req.user!.id, body);
    audit(app.db, req, { action: 'webhook.created', targetKind: 'webhook' });
    reply.code(201);
    return result;
  });

  app.patch('/api/webhooks/:id', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(
      z.object({
        url: z.string().max(2000).optional(),
        events: events.optional(),
        enabled: z.boolean().optional(),
      }),
      req.body,
    );
    return { webhook: updateWebhook(app, id, body) };
  });

  app.delete('/api/webhooks/:id', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const id = parseId((req.params as { id: string }).id);
    deleteWebhook(app, id);
    audit(app.db, req, { action: 'webhook.deleted', targetKind: 'webhook', targetId: id });
    reply.code(204);
    return null;
  });

  app.get('/api/webhooks/:id/deliveries', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const id = parseId((req.params as { id: string }).id);
    return { deliveries: listDeliveries(app, id) };
  });

  app.post('/api/webhooks/:id/test', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const id = parseId((req.params as { id: string }).id);
    const row = app.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as
      { id: number; url: string; secret: string } | undefined;
    if (!row) throw forbidden('Webhook not found');
    let delivery;
    try {
      delivery = await deliverWebhook(app, {
        webhookId: row.id,
        url: row.url,
        secret: row.secret,
        event: 'ping',
        payload: { event: 'ping', occurredAt: new Date().toISOString() },
      });
    } catch (err) {
      return {
        delivery: { statusCode: null, ok: false, error: (err as Error).message, durationMs: 0 },
      };
    }
    return { delivery };
  });
}
