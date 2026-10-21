import type { FastifyInstance } from 'fastify';
import {
  boardCreateSchema,
  boardUpdateSchema,
  columnCreateSchema,
  columnUpdateSchema,
  groupCreateSchema,
  groupUpdateSchema,
  viewCreateSchema,
  viewUpdateSchema,
} from '../../shared/schemas';
import { parseBody, parseId } from '../lib/validate';
import { archiveBoard, createBoard, getBoardFull, updateBoard } from '../services/boards';
import { createColumn, deleteColumn, updateColumn } from '../services/columns';
import { createGroup, deleteGroup, updateGroup } from '../services/groups';
import { createView, deleteView, updateView } from '../services/views';
import { listBoardActivity } from '../services/activity';
import { assertBoardAccess } from '../services/permissions';
import { audit } from '../services/audit';

export async function boardsRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/boards', async (req, reply) => {
    const body = parseBody(boardCreateSchema, req.body);
    const full = createBoard(app.db, req.user!, body);
    reply.code(201);
    return full;
  });

  app.get('/api/boards/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    return getBoardFull(app.db, req.user!, id);
  });

  app.patch('/api/boards/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(boardUpdateSchema, req.body);
    return { board: updateBoard(app.db, req.user!, id, body) };
  });

  app.delete('/api/boards/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    archiveBoard(app.db, req.user!, id);
    audit(app.db, req, { action: 'board.deleted', targetKind: 'board', targetId: id });
    reply.code(204);
    return null;
  });

  app.get('/api/boards/:id/activity', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    assertBoardAccess(app.db, req.user!, id, 'view');
    const query = req.query as { before?: string; limit?: string };
    const before = query.before ? Number(query.before) : undefined;
    const limit = Math.min(200, Math.max(1, Number(query.limit ?? 50) || 50));
    return { activity: listBoardActivity(app.db, id, before, limit) };
  });

  app.post('/api/boards/:id/columns', async (req, reply) => {
    const boardId = parseId((req.params as { id: string }).id);
    const body = parseBody(columnCreateSchema, req.body);
    const column = createColumn(app.db, req.user!, boardId, body);
    reply.code(201);
    return { column };
  });

  app.patch('/api/columns/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(columnUpdateSchema, req.body);
    return { column: updateColumn(app.db, req.user!, id, body) };
  });

  app.delete('/api/columns/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    deleteColumn(app.db, req.user!, id);
    reply.code(204);
    return null;
  });

  app.post('/api/boards/:id/groups', async (req, reply) => {
    const boardId = parseId((req.params as { id: string }).id);
    const body = parseBody(groupCreateSchema, req.body);
    const group = createGroup(app.db, req.user!, boardId, body);
    reply.code(201);
    return { group };
  });

  app.patch('/api/groups/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(groupUpdateSchema, req.body);
    return { group: updateGroup(app.db, req.user!, id, body) };
  });

  app.delete('/api/groups/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    deleteGroup(app.db, req.user!, id);
    reply.code(204);
    return null;
  });

  app.post('/api/boards/:id/views', async (req, reply) => {
    const boardId = parseId((req.params as { id: string }).id);
    const body = parseBody(viewCreateSchema, req.body);
    const view = createView(app.db, req.user!, boardId, body);
    reply.code(201);
    return { view };
  });

  app.patch('/api/views/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(viewUpdateSchema, req.body);
    return { view: updateView(app.db, req.user!, id, body) };
  });

  app.delete('/api/views/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    deleteView(app.db, req.user!, id);
    reply.code(204);
    return null;
  });
}
