import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { AppError, forbidden } from '../lib/errors';
import { isAdmin } from '../services/permissions';
import { deepHealth } from '../services/health';
import { renderMetrics } from '../services/metrics';

function allowed(app: FastifyInstance, req: FastifyRequest): boolean {
  const header = req.headers.authorization;
  const token = app.config.healthToken;
  if (header?.startsWith('Bearer ') && token) {
    const given = Buffer.from(header.slice('Bearer '.length));
    const expected = Buffer.from(token);
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return Boolean(req.user && isAdmin(req.user));
}

export async function opsRoutes(app: FastifyInstance): Promise<void> {
  function check(req: FastifyRequest): void {
    if (req.headers.authorization?.startsWith('Bearer ')) {
      if (!allowed(app, req)) throw new AppError(401, 'unauthenticated', 'Invalid health token');
      return;
    }
    if (!req.user) throw new AppError(401, 'unauthenticated', 'Sign in to continue');
    if (!isAdmin(req.user)) throw forbidden('Not allowed');
  }

  app.get('/api/health/deep', async (req, reply) => {
    check(req);
    const health = await deepHealth(app);
    reply.code(health.ok ? 200 : 503);
    return health;
  });

  app.get('/api/metrics', async (req, reply) => {
    check(req);
    reply.header('content-type', 'text/plain; version=0.0.4');
    return renderMetrics(app);
  });
}
