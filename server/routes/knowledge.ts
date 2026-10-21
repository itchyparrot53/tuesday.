import type { FastifyInstance } from 'fastify';
import { forbidden } from '../lib/errors';
import { isAdmin } from '../services/permissions';
import { knowledgeStatus } from '../knowledge/indexer';
import { enqueue } from '../jobs/queue';
import { setSetting } from '../services/settings';
import { audit } from '../services/audit';
import { searchKnowledge } from '../knowledge/search';

export async function knowledgeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/knowledge/search', async (req) => {
    const query = req.query as { q?: string; limit?: string; boardId?: string };
    const q = String(query.q ?? '').trim();
    if (!q || q.length > 300) return { hits: [] };
    const boardId = query.boardId ? Number(query.boardId) : undefined;
    return {
      hits: await searchKnowledge(app, req.user!, q, {
        limit: query.limit ? Number(query.limit) : 8,
        boardIds: boardId ? [boardId] : undefined,
      }),
    };
  });

  app.get('/api/knowledge/status', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    return knowledgeStatus(app);
  });

  app.post('/api/knowledge/rebuild', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    setSetting(app.db, 'knowledge:backfill', null);
    enqueue(app.db, 'knowledge_backfill', {}, { dedupeKey: 'kb' });
    audit(app.db, req, { action: 'settings.ai_changed', targetKind: 'knowledge' });
    reply.code(202);
    return { ok: true };
  });
}
