import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody, parseId } from '../lib/validate';
import {
  createFromTemplate,
  deleteTemplate,
  duplicateBoard,
  listTemplates,
  saveTemplate,
} from '../services/templates';
import { assertBoardAccess } from '../services/permissions';
import { getBoardRow } from '../services/boards';

const saveTemplateSchema = z.object({
  boardId: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).optional(),
  category: z.string().trim().max(60).optional(),
  includeItems: z.boolean(),
});

const fromTemplateSchema = z.object({
  templateId: z.string().min(1).max(100),
  workspaceId: z.number().int().positive(),
  name: z.string().trim().min(1).max(80),
});

const duplicateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  workspaceId: z.number().int().positive(),
  includeItems: z.boolean(),
});

export async function templatesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/templates', async (req) => {
    return { templates: listTemplates(app.db, req.user!) };
  });

  app.post('/api/templates', async (req, reply) => {
    const body = parseBody(saveTemplateSchema, req.body);
    const board = getBoardRow(app.db, body.boardId);
    assertBoardAccess(app.db, req.user!, board.id, 'manage');
    const template = saveTemplate(app.db, req.user!, body);
    reply.code(201);
    return { template };
  });

  app.delete('/api/templates/:id', async (req, reply) => {
    const id = String((req.params as { id: string }).id);
    deleteTemplate(app.db, req.user!, id);
    reply.code(204);
    return null;
  });

  app.post('/api/boards/from-template', async (req, reply) => {
    const body = parseBody(fromTemplateSchema, req.body);
    const full = createFromTemplate(
      app.db,
      req.user!,
      body.templateId,
      body.workspaceId,
      body.name,
    );
    reply.code(201);
    return full;
  });

  app.post('/api/boards/:id/duplicate', async (req, reply) => {
    const boardId = parseId((req.params as { id: string }).id);
    const body = parseBody(duplicateSchema, req.body);
    const full = duplicateBoard(
      app.db,
      req.user!,
      boardId,
      body.name,
      body.workspaceId,
      body.includeItems,
    );
    reply.code(201);
    return full;
  });
}
