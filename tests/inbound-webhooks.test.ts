import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';

async function boardFixture(app: FastifyInstance) {
  const owner = await setupOwner(app);
  const space = await createSpace(app, owner.cookie, 'Webhook space');
  const board = await createBoard(app, owner.cookie, space.id as number, 'Webhook board');
  return { owner, board };
}

async function createHook(app: FastifyInstance, cookie: string, boardId: number) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/boards/${boardId}/inbound-webhook`,
    headers: { ...H, cookie },
  });
  expect(response.statusCode).toBe(201);
  return response.json().webhook as { id: number; token: string; url: string };
}

function postHook(app: FastifyInstance, token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: `/api/hooks/board/${token}`,
    headers: { 'content-type': 'application/json' },
    payload,
  });
}

describe('inbound board webhooks', () => {
  test('creates an item in the requested group', async () => {
    const app = await createTestApp();
    const { owner, board } = await boardFixture(app);
    const hook = await createHook(app, owner.cookie, board.board.id);
    const group = board.groups[0] as { id: number; title: string };

    const response = await postHook(app, hook.token, {
      name: 'Hooked item',
      group: group.title,
    });
    expect(response.statusCode).toBe(201);
    const itemId = response.json().item.id as number;
    const row = app.db.prepare('SELECT group_id FROM items WHERE id = ?').get(itemId) as
      { group_id: number } | undefined;
    expect(row?.group_id).toBe(group.id);
    await app.close();
  });

  test('rejects an unknown token', async () => {
    const app = await createTestApp();
    const response = await postHook(app, 'not-a-real-token', { name: 'Nope' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  test('a disabled token stops working', async () => {
    const app = await createTestApp();
    const { owner, board } = await boardFixture(app);
    const hook = await createHook(app, owner.cookie, board.board.id);
    const disabled = await app.inject({
      method: 'DELETE',
      url: `/api/boards/${board.board.id}/inbound-webhook`,
      headers: { ...H, cookie: owner.cookie },
    });
    expect(disabled.statusCode).toBe(204);
    const response = await postHook(app, hook.token, { name: 'Nope' });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  test('rotating a token invalidates the old URL and keeps the new one', async () => {
    const app = await createTestApp();
    const { owner, board } = await boardFixture(app);
    const first = await createHook(app, owner.cookie, board.board.id);
    const second = await createHook(app, owner.cookie, board.board.id);
    expect(second.token).not.toBe(first.token);

    const old = await postHook(app, first.token, { name: 'Old' });
    expect(old.statusCode).toBe(404);
    const fresh = await postHook(app, second.token, { name: 'New' });
    expect(fresh.statusCode).toBe(201);
    await app.close();
  });

  test('the 61st request in a minute is rate limited', { timeout: 20_000 }, async () => {
    const app = await createTestApp();
    const { owner, board } = await boardFixture(app);
    const hook = await createHook(app, owner.cookie, board.board.id);
    for (let index = 0; index < 60; index++) {
      const response = await postHook(app, hook.token, { name: `Burst ${index}` });
      expect(response.statusCode).toBe(201);
    }
    const blocked = await postHook(app, hook.token, { name: 'Too many' });
    expect(blocked.statusCode).toBe(429);
    await app.close();
  });
});
