import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { enqueue, isQueueable, listOutbox, replay } from '../web/src/pwa/outbox';

if (!('window' in globalThis)) {
  (globalThis as Record<string, unknown>).window = {
    dispatchEvent: () => true,
  };
}

describe('offline outbox', () => {
  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('tuesday');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  });

  test('queueable paths are recognised', () => {
    expect(isQueueable('PUT', '/items/12/values/3')).toContain('item #12');
    expect(isQueueable('PATCH', '/items/12')).toContain('Rename');
    expect(isQueueable('POST', '/boards/1/items')).toContain('Create');
    expect(isQueueable('POST', '/items/12/updates')).toContain('update');
    expect(isQueueable('POST', '/notifications/read')).toContain('notifications');
    expect(isQueueable('DELETE', '/items/12')).toBeNull();
    expect(isQueueable('GET', '/home')).toBeNull();
  });

  test('replay sends in order, drops 4xx with a failure and keeps 5xx', async () => {
    await enqueue({
      method: 'PUT',
      path: '/items/1/values/2',
      body: { value: 1 },
      label: 'first',
      userId: 1,
    });
    await enqueue({
      method: 'PATCH',
      path: '/items/2',
      body: { name: 'x' },
      label: 'second',
      userId: 1,
    });
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/items/1/')) return new Response('{}', { status: 200 });
      return new Response(JSON.stringify({ error: { message: 'Nope' } }), { status: 400 });
    }) as typeof fetch;
    const result = await replay();
    expect(calls).toHaveLength(2);
    expect(result.sent).toBe(1);
    expect(result.failed[0]).toEqual({ label: 'second', message: 'Nope' });
    expect(await listOutbox()).toHaveLength(0);

    await enqueue({ method: 'PATCH', path: '/items/3', body: {}, label: 'third', userId: 1 });
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 503 })) as typeof fetch;
    const retry = await replay();
    expect(retry.sent).toBe(0);
    expect(await listOutbox()).toHaveLength(1);
  });
});
