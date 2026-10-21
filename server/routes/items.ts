import type { FastifyInstance } from 'fastify';
import type { User } from '../../shared/types';
import {
  bulkItemSchema,
  itemCreateSchema,
  itemUpdateSchema,
  setValueSchema,
  updateCreateSchema,
  updateEditSchema,
} from '../../shared/schemas';
import { parseBody, parseId } from '../lib/validate';
import {
  archiveItem,
  bulkItems,
  createItem,
  getItem,
  listItems,
  setValue,
  updateItem,
} from '../services/items';
import { deleteUpdate, editUpdate, postUpdate } from '../services/updates';
import { assertBoardAccess, assertItemAccess, boardIdForItem } from '../services/permissions';
import { getBoardRow } from '../services/boards';
import { listItemActivity } from '../services/activity';

function requireBoardRead(app: FastifyInstance, user: User, itemId: number): void {
  assertItemAccess(app.db, user, itemId, 'view');
}

export async function itemsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/boards/:id/items', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    return { items: listItems(app.db, req.user!, boardId) };
  });

  app.post('/api/boards/:id/items', async (req, reply) => {
    const boardId = parseId((req.params as { id: string }).id);
    const body = parseBody(itemCreateSchema, req.body);
    const item = createItem(app.db, req.user!, boardId, body);
    reply.code(201);
    return { item };
  });

  app.get('/api/items/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    return getItem(app.db, req.user!, id);
  });

  app.patch('/api/items/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(itemUpdateSchema, req.body);
    return { item: updateItem(app.db, req.user!, id, body) };
  });

  app.put('/api/items/:id/values/:columnId', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const columnId = parseId((req.params as { columnId: string }).columnId);
    const body = parseBody(setValueSchema, req.body);
    return { item: setValue(app.db, req.user!, id, columnId, body.value) };
  });

  app.delete('/api/items/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    archiveItem(app.db, req.user!, id);
    reply.code(204);
    return null;
  });

  app.post('/api/items/bulk', async (req) => {
    const body = parseBody(bulkItemSchema, req.body);
    return { count: bulkItems(app.db, req.user!, body) };
  });

  app.get('/api/items/:id/activity', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    requireBoardRead(app, req.user!, id);
    return { activity: listItemActivity(app.db, id) };
  });

  app.post('/api/items/:id/updates', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(updateCreateSchema, req.body);
    const update = postUpdate(app.db, req.user!, id, body.body, body.parentId);
    reply.code(201);
    return { update };
  });

  app.patch('/api/updates/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(updateEditSchema, req.body);
    return { update: editUpdate(app.db, req.user!, id, body.body) };
  });

  app.delete('/api/updates/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    deleteUpdate(app.db, req.user!, id);
    reply.code(204);
    return null;
  });
}
