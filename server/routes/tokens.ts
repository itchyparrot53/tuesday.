import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody, parseId } from '../lib/validate';
import { createToken, listTokens, revokeToken } from '../services/tokens';
import { audit } from '../services/audit';

export async function tokensRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/me/tokens', async (req) => ({ tokens: listTokens(app.db, req.user!) }));

  app.post('/api/me/tokens', async (req, reply) => {
    const body = parseBody(
      z.object({ name: z.string().trim().min(1).max(80), scope: z.enum(['read', 'write']) }),
      req.body,
    );
    const result = createToken(app.db, req.user!, body);
    audit(app.db, req, {
      action: 'token.created',
      targetKind: 'token',
      data: { scope: body.scope },
    });
    reply.code(201);
    return result;
  });

  app.delete('/api/me/tokens/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    revokeToken(app.db, req.user!, id);
    audit(app.db, req, { action: 'token.revoked', targetKind: 'token', targetId: id });
    reply.code(204);
    return null;
  });
}
