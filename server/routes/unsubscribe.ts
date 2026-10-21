import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { getUserById } from '../services/users';
import { setNotificationPrefs } from '../services/notify-prefs';
import { verifyUnsubscribeToken } from '../services/unsubscribe';

const bodySchema = z.object({ token: z.string().min(20).max(500) });

export async function unsubscribeRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/email/unsubscribe', async (req) => {
    const body = bodySchema.parse(req.body);
    const userId = verifyUnsubscribeToken(app.db, body.token);
    if (!userId) {
      throw new AppError(400, 'invalid_token', 'This unsubscribe link is invalid or has expired.');
    }
    const user = getUserById(app.db, userId);
    if (!user || !user.isActive) {
      throw new AppError(400, 'invalid_token', 'This unsubscribe link is no longer valid.');
    }
    setNotificationPrefs(app.db, user.id, {
      email: {
        mention: 'off',
        assigned: 'off',
        update_on_item: 'off',
        automation: 'off',
      },
      digest: { enabled: false },
    });
    return { ok: true, email: user.email };
  });
}
