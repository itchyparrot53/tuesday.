import type { FastifyInstance } from 'fastify';
import {
  workspaceCreateSchema,
  workspaceMembersSchema,
  workspaceUpdateSchema,
} from '../../shared/schemas';
import { parseBody, parseId } from '../lib/validate';
import { audit } from '../services/audit';
import { listWorkspacesForUser } from '../services/workspaces';
import {
  createWorkspace,
  updateWorkspace,
  setWorkspaceMembers,
  archiveWorkspace,
} from '../services/workspaces';

export async function workspacesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/workspaces', async (req) => {
    return { workspaces: listWorkspacesForUser(app.db, req.user!) };
  });

  app.post('/api/workspaces', async (req, reply) => {
    const body = parseBody(workspaceCreateSchema, req.body);
    const workspace = createWorkspace(app.db, req.user!, body);
    reply.code(201);
    return { workspace };
  });

  app.patch('/api/workspaces/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(workspaceUpdateSchema, req.body);
    return { workspace: updateWorkspace(app.db, req.user!, id, body) };
  });

  app.put('/api/workspaces/:id/members', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const body = parseBody(workspaceMembersSchema, req.body);
    return { workspace: setWorkspaceMembers(app.db, req.user!, id, body.userIds) };
  });

  app.delete('/api/workspaces/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    const row = app.db
      .prepare('SELECT name FROM workspaces WHERE id = ? AND archived_at IS NULL')
      .get(id) as { name: string } | undefined;
    archiveWorkspace(app.db, req.user!, id);
    audit(app.db, req, {
      action: 'workspace.deleted',
      targetKind: 'workspace',
      targetId: id,
      targetLabel: row?.name ?? '',
    });
    reply.code(204);
    return null;
  });
}
