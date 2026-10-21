import { expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { User } from '../shared/types';

export const OWNER = {
  orgName: 'E2E Org',
  name: 'Erin Owner',
  email: 'owner@e2e.test',
  password: 'password123',
};

export const H = { 'X-Requested-With': 'tuesday' };

export async function signIn(page: Page): Promise<User> {
  const authPath = 'e2e/.auth/owner.json';
  if (existsSync(authPath)) {
    try {
      const state = JSON.parse(readFileSync(authPath, 'utf8')) as {
        cookies: {
          name: string;
          value: string;
          domain: string;
          path: string;
          expires: number;
          httpOnly: boolean;
          secure: boolean;
          sameSite: 'Lax' | 'Strict' | 'None';
        }[];
      };
      if (state.cookies?.length) await page.context().addCookies(state.cookies);
      const me = await page.request.get('/api/auth/me');
      if (me.status() === 200) {
        const user = (await me.json()).user as User;
        if (!user.preferences.tourDone) {
          await page.request.patch('/api/me', {
            headers: H,
            data: { preferences: { tourDone: true } },
          });
          user.preferences.tourDone = true;
        }
        await page.goto('/');
        await expect(page.getByTestId('sidebar')).toBeVisible();
        return user;
      }
    } catch {}
  }
  const stateResponse = await page.request.get('/api/auth/state');
  const state = await stateResponse.json();
  if (state.needsSetup) {
    const setup = await page.request.post('/api/auth/setup', {
      headers: H,
      data: {
        orgName: OWNER.orgName,
        name: OWNER.name,
        email: OWNER.email,
        password: OWNER.password,
      },
    });
    expect(setup.status()).toBe(201);
  } else {
    const login = await page.request.post('/api/auth/login', {
      headers: H,
      data: { email: OWNER.email, password: OWNER.password },
    });
    expect(login.status()).toBe(200);
  }
  mkdirSync('e2e/.auth', { recursive: true });
  await page.context().storageState({ path: authPath });
  const me = await page.request.get('/api/auth/me');
  const user = (await me.json()).user as User;
  if (!user.preferences.tourDone) {
    await page.request.patch('/api/me', { headers: H, data: { preferences: { tourDone: true } } });
    user.preferences.tourDone = true;
  }
  await page.goto('/');
  await expect(page.getByTestId('sidebar')).toBeVisible();
  return user;
}

export async function createBoard(
  page: Page,
  name: string,
): Promise<{ workspaceId: number; boardId: number }> {
  const list = await (await page.request.get('/api/workspaces')).json();
  let workspaceId = list.workspaces[0]?.id as number | undefined;
  if (!workspaceId) {
    const created = await page.request.post('/api/workspaces', {
      headers: H,
      data: { name: `E2E Space ${Date.now()}` },
    });
    expect(created.status()).toBe(201);
    workspaceId = (await created.json()).workspace.id;
  }
  const board = await page.request.post('/api/boards', {
    headers: H,
    data: { workspaceId, name },
  });
  expect(board.status()).toBe(201);
  const full = await board.json();
  return { workspaceId: workspaceId!, boardId: full.board.id };
}

export async function shot(page: Page, name: string): Promise<void> {
  mkdirSync('e2e/screenshots', { recursive: true });
  await page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });
}
