import { describe, expect, test } from 'vitest';
import { H, createTestApp, inviteAndJoin, setupOwner } from './helpers';

const oidc = {
  issuer: 'http://127.0.0.1:9/oidc',
  clientId: 'tuesday-test',
  clientSecret: 'test-key',
  buttonLabel: 'Sign in with Acme',
  allowedDomains: ['acme.test'],
  defaultRole: 'member' as const,
  only: true,
};

describe('single sign-on', () => {
  test('state advertises SSO and OIDC_ONLY blocks password login for members', async () => {
    const app = await createTestApp({ config: { oidc } });
    const owner = await setupOwner(app);
    const member = await inviteAndJoin(app, owner.cookie, 'member', 'member@acme.test');
    const state = await app.inject({ method: 'GET', url: '/api/auth/state' });
    expect(state.json().sso).toEqual({
      enabled: true,
      label: 'Sign in with Acme',
      only: true,
    });
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: member.user.email, password: 'password123' },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('sso_required');
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: owner.user.email, password: 'password123' },
    });
    expect(ownerLogin.statusCode).toBe(200);
    await app.close();
  });

  test('a callback without a signed state cookie is denied', async () => {
    const app = await createTestApp({ config: { oidc } });
    await setupOwner(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/oidc/callback?code=x&state=y',
    });
    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain('/login?error=sso_failed');
    await app.close();
  });

  test('SSO is off when the env/config is incomplete', async () => {
    const app = await createTestApp();
    const state = await app.inject({ method: 'GET', url: '/api/auth/state' });
    expect(state.json().sso.enabled).toBe(false);
    const start = await app.inject({ method: 'GET', url: '/api/auth/oidc/start' });
    expect(start.statusCode).toBe(404);
    await app.close();
  });
});
