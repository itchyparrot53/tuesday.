import type { FastifyInstance } from 'fastify';
import { automationInputSchema } from '../../shared/automations';
import { parseBody, parseId } from '../lib/validate';
import {
  createAutomation,
  deleteAutomation,
  getAutomationRow,
  listAutomations,
  listRuns,
  updateAutomation,
  validateAutomationRefs,
} from '../services/automations';
import {
  getBoardAutomationTemplates,
  saveBoardAutomationTemplates,
} from '../services/automation-templates';
import { generateAutomationTemplates } from '../ai/features';
import { getBoardRow } from '../services/boards';
import { assertBoardAccess } from '../services/permissions';

export async function automationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/boards/:id/automation-templates', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    getBoardRow(app.db, boardId);
    assertBoardAccess(app.db, req.user!, boardId, 'view');
    const latest = getBoardAutomationTemplates(app.db, boardId);
    const templates = latest.templates.filter((template) => {
      try {
        validateAutomationRefs(app.db, boardId, template.input);
        return true;
      } catch {
        return false;
      }
    });
    return {
      templates,
      generatedAt: templates.length ? latest.generatedAt : null,
    };
  });

  app.post('/api/boards/:id/automation-templates', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    getBoardRow(app.db, boardId);
    assertBoardAccess(app.db, req.user!, boardId, 'manage');
    const templates = await generateAutomationTemplates(app, req.user!, boardId);
    return saveBoardAutomationTemplates(app.db, boardId, req.user!.id, templates);
  });

  app.get('/api/boards/:id/automations', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    const board = getBoardRow(app.db, boardId);
    assertBoardAccess(app.db, req.user!, boardId, 'view');
    return { automations: listAutomations(app.db, req.user!, boardId) };
  });

  app.post('/api/boards/:id/automations', async (req, reply) => {
    const boardId = parseId((req.params as { id: string }).id);
    const input = parseBody(automationInputSchema, req.body);
    const automation = createAutomation(app.db, req.user!, boardId, {
      ...input,
      conditions: input.conditions ?? [],
    });
    reply.code(201);
    return { automation };
  });

  app.patch('/api/automations/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const row = getAutomationRow(app.db, id);
    const board = getBoardRow(app.db, row.board_id);
    assertBoardAccess(app.db, req.user!, board.id, 'manage');
    const patch = parseBody(automationInputSchema.partial(), req.body);
    return { automation: updateAutomation(app.db, req.user!, id, patch) };
  });

  app.delete('/api/automations/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    deleteAutomation(app.db, req.user!, id);
    reply.code(204);
    return null;
  });

  app.get('/api/automations/:id/runs', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const query = req.query as { limit?: string };
    return { runs: listRuns(app.db, req.user!, id, Number(query.limit ?? 100)) };
  });
}
