import type { FastifyInstance } from 'fastify';
import { formCreateSchema, formUpdateSchema, publicFormSubmitSchema } from '../../shared/schemas';
import { parseBody, parseId } from '../lib/validate';
import {
  createForm,
  deleteForm,
  listForms,
  publicForm,
  submitPublicForm,
  updateForm,
} from '../services/forms';
import { getBoardRow } from '../services/boards';
import type { FormField } from '../../shared/types';
import { assertBoardAccess } from '../services/permissions';

export async function formsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/boards/:id/forms', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    const board = getBoardRow(app.db, boardId);
    assertBoardAccess(app.db, req.user!, board.id, 'view');
    return { forms: listForms(app.db, req.user!, boardId, app.config.appUrl) };
  });

  app.post('/api/boards/:id/forms', async (req, reply) => {
    const boardId = parseId((req.params as { id: string }).id);
    const body = parseBody(formCreateSchema, req.body);
    const form = createForm(app.db, req.user!, boardId, app.config.appUrl, body);
    reply.code(201);
    return { form };
  });

  app.patch('/api/forms/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(formUpdateSchema, req.body);
    return {
      form: updateForm(app.db, req.user!, id, app.config.appUrl, {
        ...body,
        fields: body.fields as FormField[] | undefined,
      }),
    };
  });

  app.delete('/api/forms/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    deleteForm(app.db, req.user!, id);
    reply.code(204);
    return null;
  });

  app.get('/api/public/forms/:token', async (req) => {
    const token = String((req.params as { token: string }).token);
    return publicForm(app.db, token);
  });

  app.post(
    '/api/public/forms/:token',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => {
      const token = String((req.params as { token: string }).token);
      const body = parseBody(publicFormSubmitSchema, req.body);
      return await submitPublicForm(app.db, token, body.values, body.website);
    },
  );
}
