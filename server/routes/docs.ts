import type { FastifyInstance } from 'fastify';
import { docCreateSchema, docUpdateSchema } from '../../shared/schemas';
import { z } from 'zod';
import { parseBody, parseId } from '../lib/validate';
import {
  archiveDoc,
  createDoc,
  getDoc,
  getVersion,
  listVersions,
  restoreVersion,
  updateDoc,
} from '../services/docs';

export async function docsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/docs/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    return { doc: getDoc(app.db, req.user!, id) };
  });

  app.post('/api/docs', async (req, reply) => {
    const body = parseBody(docCreateSchema, req.body);
    const doc = createDoc(app.db, req.user!, body);
    reply.code(201);
    return { doc };
  });

  app.put('/api/docs/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(docUpdateSchema, req.body);
    return { doc: updateDoc(app.db, req.user!, id, body) };
  });

  app.delete('/api/docs/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    archiveDoc(app.db, req.user!, id);
    reply.code(204);
    return null;
  });

  app.get('/api/docs/:id/versions', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    return { versions: listVersions(app.db, req.user!, id) };
  });

  app.get('/api/docs/:id/versions/:versionId', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const versionId = parseId((req.params as { versionId: string }).versionId);
    return { version: getVersion(app.db, req.user!, id, versionId) };
  });

  app.post('/api/docs/:id/restore', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(z.object({ versionId: z.number().int().positive() }), req.body);
    return { doc: restoreVersion(app.db, req.user!, id, body.versionId) };
  });
}
