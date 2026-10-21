import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseId } from '../lib/validate';
import { parseBody } from '../lib/validate';
import { exportBoard, importCsv, previewImport } from '../services/importexport';
import { assertBoardAccess } from '../services/permissions';
import { getBoardRow } from '../services/boards';
import type { ImportMapping } from '../../shared/types';

const csvSchema = z.object({ csv: z.string().min(1).max(2_000_000) });
const importSchema = csvSchema.extend({
  mapping: z.array(
    z.object({
      header: z.string(),
      target: z.union([
        z.literal('name'),
        z.literal('group'),
        z.literal('skip'),
        z.object({ columnId: z.number().int().positive() }),
        z.object({
          newColumn: z.object({
            title: z.string().trim().min(1).max(80),
            type: z.enum([
              'text',
              'long_text',
              'number',
              'status',
              'dropdown',
              'people',
              'date',
              'timeline',
              'checkbox',
              'link',
              'email',
              'phone',
              'rating',
              'ai',
              'formula',
              'dependency',
              'connect',
              'mirror',
              'time_tracking',
              'file',
            ]),
          }),
        }),
      ]),
    }),
  ),
  groupId: z.number().int().positive().optional(),
});

export async function importexportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/boards/:id/export.csv', async (req, reply) => {
    const boardId = parseId((req.params as { id: string }).id);
    const board = getBoardRow(app.db, boardId);
    assertBoardAccess(app.db, req.user!, board.id, 'view');
    const result = exportBoard(app.db, req.user!, boardId);
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${result.filename}"`);
    return reply.send(result.csv);
  });

  app.post('/api/boards/:id/import/preview', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    const board = getBoardRow(app.db, boardId);
    assertBoardAccess(app.db, req.user!, board.id, 'manage');
    const body = parseBody(csvSchema, req.body);
    return previewImport(app.db, req.user!, boardId, body.csv);
  });

  app.post('/api/boards/:id/import', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    const board = getBoardRow(app.db, boardId);
    assertBoardAccess(app.db, req.user!, board.id, 'manage');
    const body = parseBody(importSchema, req.body);
    return importCsv(app.db, req.user!, boardId, {
      csv: body.csv,
      mapping: body.mapping as ImportMapping[],
      groupId: body.groupId,
    });
  });
}
