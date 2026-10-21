import { afterAll, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createHmac } from 'node:crypto';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';
import { JOB_HANDLERS } from '../server/jobs/handlers';
import { runOnce } from '../server/jobs/worker';

const flush = async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

interface Captured {
  body: string;
  signature: string;
  event: string;
}

let server: Server | null = null;
let captured: Captured[] = [];
let port = 0;

async function startReceiver(): Promise<void> {
  captured = [];
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      captured.push({
        body,
        signature: String(req.headers['x-tuesday-signature'] ?? ''),
        event: String(req.headers['x-tuesday-event'] ?? ''),
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  port = (server!.address() as { port: number }).port;
}

afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

describe('webhooks', () => {
  test('delivers signed events from activity and records deliveries', async () => {
    await startReceiver();
    const app = await createTestApp({ config: { webhooksAllowPrivate: true } });
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const created = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: { ...H, cookie },
      payload: {
        url: `http://127.0.0.1:${port}/hook`,
        events: ['item.created'],
        workspaceId: space.id,
      },
    });
    expect(created.statusCode).toBe(201);
    const secret = created.json().secret as string;
    const webhookId = created.json().webhook.id as number;

    await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId: board.groups[0].id, name: 'Webhook item' },
    });
    await flush();
    expect(await runOnce(app, JOB_HANDLERS)).toBeGreaterThanOrEqual(1);
    expect(captured.length).toBeGreaterThanOrEqual(1);
    const delivery = captured[captured.length - 1];
    expect(delivery.event).toBe('item.created');
    const expected = createHmac('sha256', secret).update(delivery.body).digest('hex');
    expect(delivery.signature).toBe(`sha256=${expected}`);
    const payload = JSON.parse(delivery.body);
    expect(payload.item.name).toBe('Webhook item');
    expect(payload.board.id).toBe(board.board.id);

    const deliveries = await app.inject({
      method: 'GET',
      url: `/api/webhooks/${webhookId}/deliveries`,
      headers: { cookie },
    });
    expect(deliveries.json().deliveries[0]).toMatchObject({ ok: true, statusCode: 200 });
    await app.close();
  });

  test('rejects private addresses unless explicitly allowed', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: { ...H, cookie },
      payload: { url: 'http://127.0.0.1:9999/hook', events: ['item.created'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toContain('Private');
    await app.close();
  });

  test('test deliveries record failures', async () => {
    const app = await createTestApp({ config: { webhooksAllowPrivate: true } });
    const { cookie } = await setupOwner(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: { ...H, cookie },
      payload: { url: 'http://127.0.0.1:65534/hook', events: ['item.created'] },
    });
    const id = created.json().webhook.id;
    const tested = await app.inject({
      method: 'POST',
      url: `/api/webhooks/${id}/test`,
      headers: { ...H, cookie },
    });
    expect(tested.json().delivery.ok).toBe(false);
    expect(tested.json().delivery.error).toBeTruthy();
    await app.close();
  });
});
