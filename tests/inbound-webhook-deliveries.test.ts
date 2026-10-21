import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';
import { recordInboundDelivery } from '../server/services/inbound-webhooks';

async function setup() {
  const app = await createTestApp();
  const owner = await setupOwner(app);
  const space = await createSpace(app, owner.cookie);
  const board = await createBoard(app, owner.cookie, space.id as number, 'Deliveries');
  const hook = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.board.id}/inbound-webhook`,
    headers: { ...H, cookie: owner.cookie },
  });
  return { app, owner, board, hook: hook.json().webhook as { token: string; id: number } };
}

describe('inbound webhook deliveries', () => {
  test('records a successful delivery with body, ignored and errors', async () => {
    const { app, owner, board, hook } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: `/api/hooks/board/${hook.token}`,
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Logged request', extra: true, values: { Missing: 1 } },
    });
    expect(response.statusCode).toBe(201);
    const itemId = response.json().item.id as number;
    const log = await app.inject({
      method: 'GET',
      url: `/api/boards/${board.board.id}/inbound-webhook/deliveries`,
      headers: { ...H, cookie: owner.cookie },
    });
    const delivery = log.json().deliveries[0];
    expect(delivery).toMatchObject({
      statusCode: 201,
      itemId,
      ignored: ['extra'],
    });
    expect(delivery.body).toContain('Logged request');
    expect(delivery.errors[0].field).toBe('values.Missing');
    await app.close();
  });

  test('records a failed request for a valid token', async () => {
    const { app, owner, board, hook } = await setup();
    const response = await app.inject({
      method: 'POST',
      url: `/api/hooks/board/${hook.token}`,
      headers: { 'content-type': 'application/json' },
      payload: { name: 'No group', group: 'Does not exist' },
    });
    expect(response.statusCode).toBe(400);
    const log = await app.inject({
      method: 'GET',
      url: `/api/boards/${board.board.id}/inbound-webhook/deliveries`,
      headers: { ...H, cookie: owner.cookie },
    });
    expect(log.json().deliveries[0]).toMatchObject({ statusCode: 400, itemId: null });
    await app.close();
  });

  test('keeps only the newest 100 deliveries per webhook', async () => {
    const { app, owner, board, hook } = await setup();
    for (let index = 0; index < 105; index++) {
      recordInboundDelivery(app.db, hook.id, {
        statusCode: 201,
        itemId: index,
        ignored: [],
        errors: [],
        body: `body ${index}`,
        ip: '127.0.0.1',
      });
    }
    const log = await app.inject({
      method: 'GET',
      url: `/api/boards/${board.board.id}/inbound-webhook/deliveries`,
      headers: { ...H, cookie: owner.cookie },
    });
    expect(log.json().deliveries).toHaveLength(100);
    expect(log.json().deliveries[0].body).toBe('body 104');
    await app.close();
  });
});
