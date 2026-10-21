import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';

const SECRET = 'super-secret-webhook-key-1234';

async function setup() {
  const app = await createTestApp();
  const owner = await setupOwner(app);
  const space = await createSpace(app, owner.cookie);
  const board = await createBoard(app, owner.cookie, space.id as number, 'Signed hooks');
  const hookResponse = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.board.id}/inbound-webhook`,
    headers: { ...H, cookie: owner.cookie },
  });
  const hook = hookResponse.json().webhook as { token: string };
  const set = await app.inject({
    method: 'PATCH',
    url: `/api/boards/${board.board.id}/inbound-webhook`,
    headers: { ...H, cookie: owner.cookie },
    payload: { secret: SECRET },
  });
  expect(set.statusCode).toBe(200);
  return { app, owner, board, hook, set };
}

function signed(body: string): string {
  return createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('inbound webhook signing', () => {
  test('requires a valid signature when a secret is set', async () => {
    const { app, hook } = await setup();
    const body = JSON.stringify({ name: 'Signed item' });
    const response = await app.inject({
      method: 'POST',
      url: `/api/hooks/board/${hook.token}`,
      headers: {
        'content-type': 'application/json',
        'x-tuesday-signature': `sha256=${signed(body)}`,
      },
      payload: body,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().item.name).toBe('Signed item');
    await app.close();
  });

  test('rejects missing and wrong signatures and logs them', async () => {
    const { app, owner, board, hook } = await setup();
    const unsigned = await app.inject({
      method: 'POST',
      url: `/api/hooks/board/${hook.token}`,
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Unsigned' },
    });
    expect(unsigned.statusCode).toBe(401);
    const wrong = await app.inject({
      method: 'POST',
      url: `/api/hooks/board/${hook.token}`,
      headers: {
        'content-type': 'application/json',
        'x-tuesday-signature': `sha256=${'0'.repeat(64)}`,
      },
      payload: { name: 'Wrong' },
    });
    expect(wrong.statusCode).toBe(401);
    const log = await app.inject({
      method: 'GET',
      url: `/api/boards/${board.board.id}/inbound-webhook/deliveries`,
      headers: { ...H, cookie: owner.cookie },
    });
    expect(log.json().deliveries).toHaveLength(2);
    expect(log.json().deliveries[0]).toMatchObject({ statusCode: 401, itemId: null });
    await app.close();
  });

  test('the secret flag is reported but the secret value is not returned', async () => {
    const { app, owner, board, set } = await setup();
    expect(set.json().webhook.secretSet).toBe(true);
    expect(JSON.stringify(set.json())).not.toContain(SECRET);
    const get = await app.inject({
      method: 'GET',
      url: `/api/boards/${board.board.id}/inbound-webhook`,
      headers: { ...H, cookie: owner.cookie },
    });
    expect(get.json().webhook.secretSet).toBe(true);
    expect(JSON.stringify(get.json())).not.toContain(SECRET);
    await app.close();
  });

  test('removing the secret returns to unsigned requests', async () => {
    const { app, owner, board, hook } = await setup();
    const removed = await app.inject({
      method: 'PATCH',
      url: `/api/boards/${board.board.id}/inbound-webhook`,
      headers: { ...H, cookie: owner.cookie },
      payload: { secret: null },
    });
    expect(removed.json().webhook.secretSet).toBe(false);
    const response = await app.inject({
      method: 'POST',
      url: `/api/hooks/board/${hook.token}`,
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Unsigned again' },
    });
    expect(response.statusCode).toBe(201);
    await app.close();
  });

  test('the test button path creates an item and a delivery', async () => {
    const { app, owner, board, hook } = await setup();
    const testSend = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/inbound-webhook/test`,
      headers: { ...H, cookie: owner.cookie },
    });
    expect(testSend.statusCode).toBe(200);
    expect(testSend.json().item.name).toBe('Webhook test item');
    const log = await app.inject({
      method: 'GET',
      url: `/api/boards/${board.board.id}/inbound-webhook/deliveries`,
      headers: { ...H, cookie: owner.cookie },
    });
    expect(log.json().deliveries[0]).toMatchObject({ statusCode: 201 });
    expect(hook.token).toBeTruthy();
    await app.close();
  });
});
