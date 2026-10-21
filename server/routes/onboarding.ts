import type { FastifyInstance } from 'fastify';
import { onboardingStarterSchema } from '../../shared/schemas';
import { forbidden } from '../lib/errors';
import { parseBody } from '../lib/validate';
import { isAdmin } from '../services/permissions';
import { createStarter } from '../services/onboarding';

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/onboarding/starter', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const body = parseBody(onboardingStarterSchema, req.body ?? {});
    const result = createStarter(app.db, req.user!, body.useCase);
    reply.code(201);
    return result;
  });
}
