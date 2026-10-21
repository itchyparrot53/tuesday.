import { describe, expect, test } from 'vitest';
import { H, cookieFrom, createTestApp, inviteAndJoin, setupOwner } from './helpers';

describe('auth', () => {
  test('state reports setup needed, then done', async () => {
    const app = await createTestApp();
    const before = await app.inject({ method: 'GET', url: '/api/auth/state' });
    expect(before.json()).toMatchObject({
      needsSetup: true,
      orgName: null,
      mail: false,
      sso: { enabled: false },
    });
    await setupOwner(app);
    const after = await app.inject({ method: 'GET', url: '/api/auth/state' });
    expect(after.json()).toMatchObject({
      needsSetup: false,
      orgName: 'Acme',
      mail: false,
      sso: { enabled: false },
    });
    await app.close();
  });

  test('second setup is rejected', async () => {
    const app = await createTestApp();
    await setupOwner(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      headers: H,
      payload: {
        orgName: 'Other',
        name: 'X',
        email: 'x@y.test',
        password: 'password123',
      },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  test('login with a wrong password is rejected', async () => {
    const app = await createTestApp();
    await setupOwner(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: 'owner@acme.test', password: 'nope-nope' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_credentials');
    await app.close();
  });

  test('login returns a cookie and me returns the user', async () => {
    const app = await createTestApp();
    await setupOwner(app);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: 'OWNER@acme.test', password: 'password123' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieFrom(login);
    expect(cookie.startsWith('tue_session=')).toBe(true);
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('owner@acme.test');
    expect(me.json().org.name).toBe('Acme');
    await app.close();
  });

  test('mutating requests without the CSRF header are rejected', async () => {
    const app = await createTestApp();
    await setupOwner(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'owner@acme.test', password: 'password123' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('csrf');
    await app.close();
  });

  test('me without a cookie is unauthenticated', async () => {
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('unauthenticated');
    await app.close();
  });

  test('logout clears the session', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const out = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { ...H, cookie },
    });
    expect(out.statusCode).toBe(204);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  test('invite acceptance creates a member with the invite role', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const joined = await inviteAndJoin(app, cookie, 'member', 'member@acme.test');
    expect(joined.user.role).toBe('member');
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: joined.cookie },
    });
    expect(me.json().user.email).toBe('member@acme.test');
    await app.close();
  });

  test('a used invite is gone', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const invite = await app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { ...H, cookie },
      payload: { role: 'member' },
    });
    const token = invite.json().invite.token;
    await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: H,
      payload: { token, name: 'Mem', email: 'mem@acme.test', password: 'password123' },
    });
    const res = await app.inject({ method: 'GET', url: `/api/invites/${token}` });
    expect(res.statusCode).toBe(410);
    await app.close();
  });

  test('members cannot create invites', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const member = await inviteAndJoin(app, cookie, 'member', 'member@acme.test');
    const res = await app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { ...H, cookie: member.cookie },
      payload: { role: 'member' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  test('deactivated users cannot log in', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const member = await inviteAndJoin(app, cookie, 'member', 'member@acme.test');
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/users/${member.user.id}`,
      headers: { ...H, cookie },
      payload: { isActive: false },
    });
    expect(patch.statusCode).toBe(200);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: 'member@acme.test', password: 'password123' },
    });
    expect(login.statusCode).toBe(401);
    await app.close();
  });

  test('profile updates and password changes work', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const named = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...H, cookie },
      payload: { name: 'Olivia O', title: 'CEO' },
    });
    expect(named.json().user.name).toBe('Olivia O');
    const wrong = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...H, cookie },
      payload: { currentPassword: 'bad', newPassword: 'new-password' },
    });
    expect(wrong.statusCode).toBe(401);
    const changed = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...H, cookie },
      payload: { currentPassword: 'password123', newPassword: 'new-password' },
    });
    expect(changed.statusCode).toBe(200);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: 'owner@acme.test', password: 'new-password' },
    });
    expect(login.statusCode).toBe(200);
    await app.close();
  });
});
