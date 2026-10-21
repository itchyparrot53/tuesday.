import { describe, expect, test } from 'vitest';
import {
  H,
  cookieFrom,
  createBoard,
  createTestApp,
  fakeOpenRouter,
  inviteAndJoin,
  setupOwner,
} from './helpers';
import { getOnboarding } from '../server/services/onboarding';
import type { User } from '../shared/types';

async function setupWithTimezone(app: any, timezone: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    headers: H,
    payload: {
      orgName: 'Acme',
      name: 'Olivia Owner',
      email: 'owner@acme.test',
      password: 'password123',
      timezone,
    },
  });
}

describe('onboarding', () => {
  test('setup saves a valid timezone and rejects an unknown one', async () => {
    const app = await createTestApp();
    const invalid = await setupWithTimezone(app, 'Mars/Olympus');
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('validation_error');

    const valid = await setupWithTimezone(app, 'Asia/Ulaanbaatar');
    expect(valid.statusCode).toBe(201);
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieFrom(valid) },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().org.timezone).toBe('Asia/Ulaanbaatar');
    const row = app.db.prepare("SELECT value FROM settings WHERE key = 'org'").get() as {
      value: string;
    };
    expect(JSON.parse(row.value).timezone).toBe('Asia/Ulaanbaatar');

    await app.close();
  });

  test('invite info shows the inviter and the people already there', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const invite = await app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { ...H, cookie: owner.cookie },
      payload: { email: 'new@acme.test', role: 'member' },
    });
    const token = invite.json().invite.token as string;

    const info = await app.inject({ method: 'GET', url: `/api/invites/${token}` });
    expect(info.statusCode).toBe(200);
    expect(info.json()).toMatchObject({
      email: 'new@acme.test',
      role: 'member',
      orgName: 'Acme',
      invitedBy: { name: 'Olivia Owner' },
      memberCount: 1,
    });
    expect(info.json().members).toHaveLength(1);
    expect(info.json().members[0].name).toBe('Olivia Owner');

    await app.close();
  });

  test('batch invites create links and reject duplicates and existing users', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/invites/batch',
      headers: { ...H, cookie: owner.cookie },
      payload: {
        invites: [
          { email: 'one@acme.test', role: 'member' },
          { email: 'two@acme.test', role: 'admin' },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().invites).toHaveLength(2);
    expect(created.json().invites[0].url).toContain('/invite/');

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/invites/batch',
      headers: { ...H, cookie: owner.cookie },
      payload: {
        invites: [
          { email: 'same@acme.test', role: 'member' },
          { email: 'same@acme.test', role: 'member' },
        ],
      },
    });
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json().error.details.emails).toEqual(['same@acme.test']);

    const existing = await app.inject({
      method: 'POST',
      url: '/api/invites/batch',
      headers: { ...H, cookie: owner.cookie },
      payload: { invites: [{ email: 'owner@acme.test', role: 'member' }] },
    });
    expect(existing.statusCode).toBe(400);
    expect(existing.json().error.details.emails).toEqual(['owner@acme.test']);

    await app.close();
  });

  test('starter creates the mapped template board once and empty creates none', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const first = await app.inject({
      method: 'POST',
      url: '/api/onboarding/starter',
      headers: { ...H, cookie: owner.cookie },
      payload: { useCase: 'projects' },
    });
    expect(first.statusCode).toBe(201);
    const boardId = first.json().boardId as number;
    const board = app.db.prepare('SELECT name FROM boards WHERE id = ?').get(boardId) as {
      name: string;
    };
    expect(board.name).toBe('Project tracker');

    const second = await app.inject({
      method: 'POST',
      url: '/api/onboarding/starter',
      headers: { ...H, cookie: owner.cookie },
      payload: { useCase: 'projects' },
    });
    expect(second.json().boardId).toBe(boardId);
    expect((app.db.prepare('SELECT count(*) AS n FROM boards').get() as { n: number }).n).toBe(1);

    const emptyApp = await createTestApp();
    const emptyOwner = await setupOwner(emptyApp);
    const empty = await emptyApp.inject({
      method: 'POST',
      url: '/api/onboarding/starter',
      headers: { ...H, cookie: emptyOwner.cookie },
      payload: { useCase: 'empty' },
    });
    expect(empty.json().boardId).toBeNull();
    expect((emptyApp.db.prepare('SELECT count(*) AS n FROM boards').get() as { n: number }).n).toBe(
      0,
    );
    await emptyApp.close();

    await app.close();
  });

  test('members cannot call starter', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const member = await inviteAndJoin(app, owner.cookie, 'member', 'member@acme.test');
    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding/starter',
      headers: { ...H, cookie: member.cookie },
      payload: { useCase: 'empty' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  test('checklist steps flip as data appears and hiding turns it off', async () => {
    const app = await createTestApp({ aiFetch: fakeOpenRouter([{ text: 'Hello there' }]) });
    const owner = await setupOwner(app);
    const before = getOnboarding(app.db, owner.user);
    expect(before.show).toBe(true);
    expect(before.steps.find((step) => step.id === 'create_board')?.done).toBe(false);

    const space = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: { ...H, cookie: owner.cookie },
      payload: { name: 'Acme work' },
    });
    const workspaceId = space.json().workspace.id as number;
    const board = await createBoard(app, owner.cookie, workspaceId, 'First board');
    await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie: owner.cookie },
      payload: { groupId: board.groups[0].id, name: 'First item' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/invites/batch',
      headers: { ...H, cookie: owner.cookie },
      payload: { invites: [{ email: 'teammate@acme.test', role: 'member' }] },
    });
    const conversation = (
      await app.inject({
        method: 'POST',
        url: '/api/ai/conversations',
        headers: { ...H, cookie: owner.cookie },
        payload: {},
      })
    ).json().conversation;
    await app.inject({
      method: 'POST',
      url: `/api/ai/conversations/${conversation.id}/messages`,
      headers: { ...H, cookie: owner.cookie },
      payload: { content: 'hello' },
    });
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: owner.cookie },
    });
    const updated = me.json().user as User;
    const after = getOnboarding(app.db, updated);
    for (const id of ['create_board', 'add_item', 'invite_team', 'try_ai'] as const) {
      expect(after.steps.find((step) => step.id === id)?.done, id).toBe(true);
    }
    expect(after.steps.find((step) => step.id === 'take_tour')?.done).toBe(false);

    await app.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...H, cookie: owner.cookie },
      payload: { preferences: { tourDone: true, appInstalled: true } },
    });
    const meAgain = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: owner.cookie },
    });
    const done = getOnboarding(app.db, meAgain.json().user as User);
    expect(done.steps.every((step) => step.done)).toBe(true);
    expect(done.show).toBe(false);

    const member = await inviteAndJoin(app, owner.cookie, 'member', 'checklist@acme.test');
    const memberState = getOnboarding(app.db, member.user);
    const ids = memberState.steps.map((step) => step.id);
    expect(ids).not.toContain('create_board');
    expect(ids).toContain('post_update');
    expect(ids).toContain('set_profile');

    const dismissApp = await createTestApp();
    const dismissOwner = await setupOwner(dismissApp);
    await dismissApp.inject({
      method: 'PATCH',
      url: '/api/me',
      headers: { ...H, cookie: dismissOwner.cookie },
      payload: { preferences: { onboardingDismissed: true } },
    });
    const meDismissed = await dismissApp.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: dismissOwner.cookie },
    });
    expect(getOnboarding(dismissApp.db, meDismissed.json().user as User).show).toBe(false);
    await dismissApp.close();

    await app.close();
  });
});
