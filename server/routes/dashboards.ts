import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dashboardInputSchema } from '../../shared/dashboards';
import { parseBody, parseId } from '../lib/validate';
import { badRequest } from '../lib/errors';
import {
  archiveDashboard,
  computeWidget,
  createDashboard,
  getDashboard,
  getDashboardRow,
  updateDashboard,
} from '../services/dashboards';
import { assertWriteWorkspace } from '../services/permissions';
import { startNdjson } from '../ai/ndjson';
import { dashboardInsight } from '../ai/features';
import { AppError } from '../lib/errors';
import { parseJson } from '../lib/json';

const createSchema = z.object({
  workspaceId: z.number().int().positive(),
  name: z.string().trim().min(1).max(80),
  boardIds: z.array(z.number().int().positive()).min(1).max(20),
});

export async function dashboardsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/dashboards/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    return { dashboard: getDashboard(app.db, req.user!, id) };
  });

  app.post('/api/dashboards', async (req, reply) => {
    const body = parseBody(createSchema, req.body);
    const dashboard = createDashboard(
      app.db,
      req.user!,
      body.workspaceId,
      body.name,
      body.boardIds,
    );
    reply.code(201);
    return { dashboard };
  });

  app.patch('/api/dashboards/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const row = getDashboardRow(app.db, id);
    assertWriteWorkspace(app.db, req.user!, row.workspace_id);
    const patch = parseBody(dashboardInputSchema.partial(), req.body);
    return { dashboard: updateDashboard(app.db, req.user!, id, patch) };
  });

  app.delete('/api/dashboards/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    archiveDashboard(app.db, req.user!, id);
    reply.code(204);
    return null;
  });

  app.post('/api/dashboards/:id/widgets/:widgetId/insight', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    const widgetId = String((req.params as { widgetId: string }).widgetId);
    const dashboard = getDashboard(app.db, req.user!, id);
    const widget = dashboard.widgets.find((entry) => entry.id === widgetId);
    if (!widget || widget.type !== 'ai_insight') throw badRequest('Unknown insight widget');
    app.ai.assertUsable();
    const { emit, end } = startNdjson(reply);
    try {
      const text = await dashboardInsight(app, req.user!, dashboard, widget, emit);
      const row = getDashboardRow(app.db, id);
      const cache = parseJson<Record<string, unknown>>(row.insight_cache, {});
      cache[widgetId] = { text, generatedAt: new Date().toISOString() };
      app.db
        .prepare('UPDATE dashboards SET insight_cache = ? WHERE id = ?')
        .run(JSON.stringify(cache), id);
      emit({ type: 'done', messageId: null });
    } catch (err) {
      emit({
        type: 'error',
        code: err instanceof AppError ? err.code : 'internal',
        message: err instanceof Error ? err.message : 'Something went wrong',
      });
    } finally {
      end();
    }
    return reply;
  });

  app.get('/api/dashboards/:id/widgets/:widgetId', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const widgetId = String((req.params as { widgetId: string }).widgetId);
    const dashboard = getDashboard(app.db, req.user!, id);
    const widget = dashboard.widgets.find((entry) => entry.id === widgetId);
    if (!widget) throw badRequest('Unknown widget');
    return { data: computeWidget(app.db, req.user!, dashboard, widget) };
  });
}
