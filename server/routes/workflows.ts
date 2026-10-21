import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { workflowInputSchema } from '../../shared/workflows';
import { forbidden } from '../lib/errors';
import { parseBody, parseId } from '../lib/validate';
import { isAdmin } from '../services/permissions';
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflow,
  listWorkflowRuns,
  listWorkflows,
  updateWorkflow,
} from '../services/workflows';

export async function workflowsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
  });

  app.get('/api/workflows', async () => ({ workflows: listWorkflows(app.db) }));

  app.post('/api/workflows', async (req, reply) => {
    const input = parseBody(workflowInputSchema, req.body);
    reply.code(201);
    return {
      workflow: createWorkflow(app.db, req.user!, {
        ...input,
        description: input.description ?? '',
        conditions: input.conditions ?? [],
      }),
    };
  });

  app.patch('/api/workflows/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const patch = parseBody(workflowInputSchema.partial(), req.body);
    return { workflow: updateWorkflow(app.db, req.user!, id, patch) };
  });

  app.delete('/api/workflows/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    deleteWorkflow(app.db, id);
    reply.code(204);
    return null;
  });

  app.get('/api/workflows/:id/runs', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const query = req.query as { limit?: string };
    const workflow = getWorkflow(app.db, id);
    return {
      workflow: { id: workflow.id, name: workflow.name },
      runs: listWorkflowRuns(app.db, id, Number(query.limit ?? 100)),
    };
  });
}
