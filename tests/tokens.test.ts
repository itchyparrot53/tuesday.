import { describe, expect, test } from 'vitest';
import { H, createTestApp, inviteAndJoin, setupOwner } from './helpers';

describe('API tokens', () => {
  test('read tokens can GET but not write; write tokens skip CSRF', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const read = await app.inject({
      method: 'POST',
      url: '/api/me/tokens',
      headers: { ...H, cookie },
      payload: { name: 'read', scope: 'read' },
    });
    const readSecret = read.json().secret;
    const list = await app.inject({
      method: 'GET',
      url: '/api/workspaces',
      headers: { Authorization: `Bearer ${readSecret}` },
    });
    expect(list.statusCode).toBe(200);
    const forbidden = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: { Authorization: `Bearer ${readSecret}` },
      payload: { name: 'Nope' },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.message).toContain('read-only');

    const write = await app.inject({
      method: 'POST',
      url: '/api/me/tokens',
      headers: { ...H, cookie },
      payload: { name: 'write', scope: 'write' },
    });
    const writeSecret = write.json().secret;
    const created = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: { Authorization: `Bearer ${writeSecret}` },
      payload: { name: 'Token space' },
    });
    expect(created.statusCode).toBe(201);

    await app.inject({
      method: 'DELETE',
      url: `/api/me/tokens/${write.json().token.id}`,
      headers: { ...H, cookie },
    });
    const revoked = await app.inject({
      method: 'GET',
      url: '/api/workspaces',
      headers: { Authorization: `Bearer ${writeSecret}` },
    });
    expect(revoked.statusCode).toBe(401);
    await app.close();
  });

  test('viewers cannot create write tokens and secrets are only returned once', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const viewer = await inviteAndJoin(app, cookie, 'viewer', 'token-viewer@acme.test');
    const denied = await app.inject({
      method: 'POST',
      url: '/api/me/tokens',
      headers: { ...H, cookie: viewer.cookie },
      payload: { name: 'bad', scope: 'write' },
    });
    expect(denied.statusCode).toBe(400);
    const read = await app.inject({
      method: 'POST',
      url: '/api/me/tokens',
      headers: { ...H, cookie: viewer.cookie },
      payload: { name: 'ok', scope: 'read' },
    });
    expect(read.json().secret).toMatch(/^tue_/);
    const list = await app.inject({
      method: 'GET',
      url: '/api/me/tokens',
      headers: { cookie: viewer.cookie },
    });
    expect(JSON.stringify(list.json())).not.toContain(read.json().secret);
    await app.close();
  });
});
