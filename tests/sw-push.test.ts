import { describe, expect, test } from 'vitest';
import { toNotification } from '../web/src/sw/push';

describe('service worker push payload', () => {
  test('builds the notification, truncates the body and keeps the url', () => {
    const result = toNotification({
      title: 'Erin mentioned you',
      body: 'x'.repeat(200),
      url: '/boards/1?item=2',
      tag: 'n-4',
      unread: 3,
    });
    expect(result.title).toBe('Erin mentioned you');
    expect(result.options.body.length).toBeLessThanOrEqual(140);
    expect(result.options.body.endsWith('…')).toBe(true);
    expect(result.options.tag).toBe('n-4');
    expect(result.options.data.url).toBe('/boards/1?item=2');
    expect(result.options.icon).toBe('/pwa-192x192.png');
    expect(result.options.badge).toBe('/badge-96.png');
  });
});
