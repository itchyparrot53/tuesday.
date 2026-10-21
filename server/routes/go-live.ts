import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { forbidden } from '../lib/errors';
import { isAdmin } from '../services/permissions';
import { audit } from '../services/audit';
import { goLiveReport } from '../services/go-live';
import { setSetting } from '../services/settings';
import { parseBody } from '../lib/validate';

export async function goLiveRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/go-live', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    return goLiveReport(app);
  });

  app.patch('/api/admin/go-live', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const body = parseBody(z.object({ restoreDrillDone: z.boolean() }), req.body);
    setSetting(app.db, 'goLive:restoreDrillDone', body.restoreDrillDone);
    audit(app.db, req, {
      action: 'settings.go_live_restore_drill',
      targetKind: 'org',
      data: body,
    });
    return goLiveReport(app);
  });
}
