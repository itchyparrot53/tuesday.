import type { FastifyInstance } from 'fastify';
import { notificationsReadSchema } from '../../shared/schemas';
import { parseBody } from '../lib/validate';
import { listNotifications, markRead } from '../services/notifications';
import { search } from '../services/search';
import { getMyWork } from '../services/mywork';

export async function miscRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/notifications', async (req) => {
    const query = req.query as { unreadOnly?: string };
    return listNotifications(app.db, req.user!.id, query.unreadOnly === '1');
  });

  app.post('/api/notifications/read', async (req, reply) => {
    const body = parseBody(notificationsReadSchema, req.body);
    markRead(app.db, req.user!.id, body);
    reply.code(204);
    return null;
  });

  app.get('/api/my-work', async (req) => {
    const query = req.query as { includeDone?: string };
    return { entries: getMyWork(app.db, req.user!, query.includeDone === '1') };
  });

  app.get('/api/search', async (req) => {
    const query = req.query as { q?: string };
    const q = (query.q ?? '').trim();
    if (q.length < 2) return { items: [], boards: [], docs: [] };
    return search(app.db, req.user!, q);
  });
}
