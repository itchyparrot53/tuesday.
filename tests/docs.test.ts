import { describe, expect, test } from 'vitest';
import { H, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';

async function fixture() {
  const app = await createTestApp();
  const { cookie, user } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const created = await app.inject({
    method: 'POST',
    url: '/api/docs',
    headers: { ...H, cookie },
    payload: { workspaceId: space.id, title: 'Handbook', content: 'Initial content' },
  });
  return { app, cookie, user, space, doc: created.json().doc };
}

describe('docs', () => {
  test('saves versions, rejects stale edits and restores history', async () => {
    const f = await fixture();
    const first = await f.app.inject({
      method: 'PUT',
      url: `/api/docs/${f.doc.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { content: 'Second content', baseVersion: 1 },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().doc.version).toBe(2);
    const versions = await f.app.inject({
      method: 'GET',
      url: `/api/docs/${f.doc.id}/versions`,
      headers: { cookie: f.cookie },
    });
    expect(versions.json().versions).toHaveLength(1);
    const second = await f.app.inject({
      method: 'PUT',
      url: `/api/docs/${f.doc.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { content: 'Third content', baseVersion: 2 },
    });
    expect(second.statusCode).toBe(200);
    const versionsAgain = await f.app.inject({
      method: 'GET',
      url: `/api/docs/${f.doc.id}/versions`,
      headers: { cookie: f.cookie },
    });
    expect(versionsAgain.json().versions).toHaveLength(1);

    const stale = await f.app.inject({
      method: 'PUT',
      url: `/api/docs/${f.doc.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { content: 'Stale edit', baseVersion: 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.details.doc.content).toBe('Third content');

    const versionId = versionsAgain.json().versions[0].id;
    const restored = await f.app.inject({
      method: 'POST',
      url: `/api/docs/${f.doc.id}/restore`,
      headers: { ...H, cookie: f.cookie },
      payload: { versionId },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().doc.content).toBe('Initial content');
    await f.app.close();
  });

  test('searches readable docs and hides private workspace docs', async () => {
    const f = await fixture();
    await f.app.inject({
      method: 'PUT',
      url: `/api/docs/${f.doc.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { content: 'Our unique zebra policy lives here', baseVersion: 1 },
    });
    const search = await f.app.inject({
      method: 'GET',
      url: '/api/search?q=zebra',
      headers: { cookie: f.cookie },
    });
    expect(search.json().docs.map((doc: { id: number }) => doc.id)).toContain(f.doc.id);

    const privateSpace = await createSpace(f.app, f.cookie, 'Private docs', { isPrivate: true });
    const privateDoc = await f.app.inject({
      method: 'POST',
      url: '/api/docs',
      headers: { ...H, cookie: f.cookie },
      payload: { workspaceId: privateSpace.id, title: 'Secret', content: 'zebra secret' },
    });
    const member = await inviteAndJoin(f.app, f.cookie, 'member', 'docs-member@acme.test');
    const denied = await f.app.inject({
      method: 'GET',
      url: `/api/docs/${privateDoc.json().doc.id}`,
      headers: { cookie: member.cookie },
    });
    expect(denied.statusCode).toBe(404);
    const memberSearch = await f.app.inject({
      method: 'GET',
      url: '/api/search?q=zebra',
      headers: { cookie: member.cookie },
    });
    expect(memberSearch.json().docs.map((doc: { id: number }) => doc.id)).not.toContain(
      privateDoc.json().doc.id,
    );
    await f.app.close();
  });

  test('new mentions notify once', async () => {
    const f = await fixture();
    const member = await inviteAndJoin(f.app, f.cookie, 'member', 'docs-mention@acme.test');
    const body = `Please read @[Docs Member](user:${member.user.id})`;
    await f.app.inject({
      method: 'PUT',
      url: `/api/docs/${f.doc.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { content: body, baseVersion: 1 },
    });
    await f.app.inject({
      method: 'PUT',
      url: `/api/docs/${f.doc.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { content: `${body} again`, baseVersion: 2 },
    });
    const notes = await f.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie: member.cookie },
    });
    expect(
      notes.json().notifications.filter((note: { kind: string }) => note.kind === 'mention'),
    ).toHaveLength(1);
    await f.app.close();
  });
});
