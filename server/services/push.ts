import webpush from 'web-push';
import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting } from './settings';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  unread: number;
}

const outbox: { userId: number; endpoint: string; payload: PushPayload; at: string }[] = [];

export function vapidKeys(app: FastifyInstance): {
  publicKey: string;
  privateKey: string;
  subject: string;
} {
  if (app.config.push) {
    return app.config.push;
  }
  const stored = getSetting<{ publicKey: string; privateKey: string } | null>(
    app.db,
    'push:vapid',
    null,
  );
  if (stored) return { ...stored, subject: 'mailto:admin@localhost' };
  const generated = webpush.generateVAPIDKeys();
  setSetting(app.db, 'push:vapid', generated);
  return { ...generated, subject: 'mailto:admin@localhost' };
}

export function pushOutbox() {
  return outbox;
}

export async function sendPush(
  app: FastifyInstance,
  subscription: {
    id: number;
    endpoint: string;
    p256dh: string;
    auth: string;
    failures: number;
    user_id?: number;
  },
  payload: PushPayload,
  urgency: 'normal' | 'high',
): Promise<'ok' | 'gone' | 'failed'> {
  if (app.config.pushFake) {
    outbox.push({
      userId: subscription.user_id ?? 0,
      endpoint: subscription.endpoint,
      payload,
      at: new Date().toISOString(),
    });
    if (outbox.length > 200) outbox.shift();
    return 'ok';
  }
  const keys = vapidKeys(app);
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 86_400, urgency },
    );
    return 'ok';
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return 'gone';
    return 'failed';
  }
}
