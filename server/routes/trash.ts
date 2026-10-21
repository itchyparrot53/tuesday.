import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody, parseId } from '../lib/validate';
import { listTrash, purge, restore } from '../services/trash';
import type { TrashKind } from '../../shared/types';
import { parseId as _parseId } from '../lib/validate';

const restoreSchema = z.object({
  kind: z.enum(['item', 'board', 'doc', 'dashboard', 'workspace']),
  id: z.number().int().positive(),
});

export async function trashRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/trash', async (req) => ({ entries: listTrash(app.db, req.user!) }));

  app.post('/api/trash/restore', async (req, reply) => {
    const body = parseBody(restoreSchema, req.body);
    restore(app.db, req.user!, body.kind, body.id);
    reply.code(204);
    return null;
  });

  app.delete('/api/trash/:kind/:id', async (req, reply) => {
    const kind = String((req.params as { kind: string }).kind) as TrashKind;
    const id = parseId((req.params as { id: string }).id);
    purge(app.db, req.user!, kind, id, app.config.uploadsDir);
    reply.code(204);
    return null;
  });

  app.post('/api/items/:id/restore', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    restore(app.db, req.user!, 'item', id);
    return { item: { id } };
  });
}

void _parseId;
