import { describe, expect, test } from 'vitest';
import { notificationEmail } from '../server/email/templates';
import { getNotificationPrefs } from '../server/services/notify-prefs';
import {
  buildUnsubscribeUrl,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from '../server/services/unsubscribe';
import { H, createTestApp, setupOwner } from './helpers';

describe('email unsubscribe', () => {
  test('a valid token turns every email preference off', async () => {
    const app = await createTestApp();
    const { user } = await setupOwner(app);
    const token = unsubscribeToken(app.db, user.id);
    expect(verifyUnsubscribeToken(app.db, token)).toBe(user.id);

    const response = await app.inject({
      method: 'POST',
      url: '/api/email/unsubscribe',
      headers: H,
      payload: { token },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, email: user.email });

    const prefs = getNotificationPrefs(app.db, user.id);
    expect(prefs.email).toEqual({
      mention: 'off',
      assigned: 'off',
      update_on_item: 'off',
      automation: 'off',
    });
    expect(prefs.digest.enabled).toBe(false);
  });

  test('tampered and malformed tokens are rejected', async () => {
    const app = await createTestApp();
    const { user } = await setupOwner(app);
    const token = unsubscribeToken(app.db, user.id);
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

    for (const candidate of [tampered, 'not-a-token']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/email/unsubscribe',
        headers: H,
        payload: { token: candidate },
      });
      expect(response.statusCode).toBe(400);
    }
  });

  test('the URL is absolute and the notification email carries it with the logo', async () => {
    const app = await createTestApp();
    const { user } = await setupOwner(app);
    const url = buildUnsubscribeUrl(app.db, 'http://localhost:3000', user.id);
    expect(url.startsWith('http://localhost:3000/unsubscribe?token=')).toBe(true);

    const mail = notificationEmail({
      appUrl: 'http://localhost:3000',
      unsubscribeUrl: url,
      name: user.name,
      items: [{ title: 'Mentioned you', body: 'Hello', link: '/boards/1', actorName: 'Sam' }],
    });
    expect(mail.html).toContain('email-logo.png');
    expect(mail.html).toContain('Unsubscribe');
    expect(mail.html).toContain('Sent by Tuesday');
    expect(mail.html).toContain(url.replaceAll('&', '&amp;'));
  });
});
