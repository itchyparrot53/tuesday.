import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { forbidden, notFound } from '../lib/errors';
import { parseBody } from '../lib/validate';
import { isAdmin } from '../services/permissions';
import { pushOutbox, sendPush, vapidKeys } from '../services/push';

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/push/key', async () => ({ publicKey: vapidKeys(app).publicKey }));

  app.post('/api/push/subscriptions', async (req, reply) => {
    const body = parseBody(subscriptionSchema, req.body);
    const now = new Date().toISOString();
    app.db
      .prepare(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at, failures)
         VALUES (?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh,
           auth = excluded.auth, user_agent = excluded.user_agent, failures = 0`,
      )
      .run(
        req.user!.id,
        body.endpoint,
        body.keys.p256dh,
        body.keys.auth,
        String(req.headers['user-agent'] ?? '').slice(0, 200),
        now,
      );
    reply.code(201);
    return { ok: true };
  });

  app.delete('/api/push/subscriptions', async (req, reply) => {
    const body = parseBody(z.object({ endpoint: z.string().max(1000) }), req.body);
    app.db
      .prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
      .run(body.endpoint, req.user!.id);
    reply.code(204);
    return null;
  });

  app.post('/api/push/test', async (req, reply) => {
    const rows = app.db
      .prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
      .all(req.user!.id) as {
      id: number;
      endpoint: string;
      p256dh: string;
      auth: string;
      failures: number;
    }[];
    for (const row of rows) {
      await sendPush(
        app,
        row,
        {
          title: 'Tuesday',
          body: 'Push notifications are working.',
          url: '/',
          tag: 'test',
          unread: 0,
        },
        'normal',
      );
    }
    reply.code(202);
    return { ok: true };
  });

  app.get('/api/admin/push/outbox', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    if (!app.config.pushFake) throw notFound('Not found');
    return { messages: pushOutbox() };
  });
}
