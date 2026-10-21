import { describe, expect, test } from 'vitest';
import { H, createTestApp, setupOwner } from './helpers';

describe('preferences', () => {
  test('PATCH /api/me merges preferences and validates them', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const first = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...H, cookie },
      payload: { preferences: { theme: 'dark' } },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().user.preferences).toMatchObject({
      theme: 'dark',
      colorTheme: 'tuesday',
      density: 'comfortable',
      sidebarCollapsed: false,
    });
    const merged = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...H, cookie },
      payload: {
        preferences: { density: 'compact', sidebarCollapsed: true, colorTheme: 'wednesday' },
      },
    });
    expect(merged.json().user.preferences).toMatchObject({
      theme: 'dark',
      density: 'compact',
      sidebarCollapsed: true,
      colorTheme: 'wednesday',
    });
    const invalid = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...H, cookie },
      payload: { preferences: { theme: 'neon' } },
    });
    expect(invalid.statusCode).toBe(400);
    const invalidColor = await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...H, cookie },
      payload: { preferences: { colorTheme: 'neon' } },
    });
    expect(invalidColor.statusCode).toBe(400);
    await app.close();
  });

  test('setup and invite acceptance accept an initial colour theme', async () => {
    const app = await createTestApp();
    const setup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      headers: H,
      payload: {
        orgName: 'Themes',
        name: 'Theme Owner',
        email: 'themes@example.test',
        password: 'password123',
        colorTheme: 'monday',
      },
    });
    expect(setup.statusCode).toBe(201);
    expect(setup.json().user.preferences.colorTheme).toBe('monday');
    const ownerCookie = String(setup.headers['set-cookie']).split(';')[0];
    const invite = await app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { ...H, cookie: ownerCookie },
      payload: { role: 'member' },
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/auth/accept-invite',
      headers: H,
      payload: {
        token: invite.json().invite.token,
        name: 'Theme Member',
        email: 'theme-member@example.test',
        password: 'password123',
        colorTheme: 'friday',
      },
    });
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json().user.preferences.colorTheme).toBe('friday');
    await app.close();
  });
});
