import { describe, expect, test } from 'vitest';
import {
  H,
  createBoard,
  createSpace,
  createTestApp,
  fakeOpenRouter,
  inviteAndJoin,
  setupOwner,
} from './helpers';
import type { AiStreamEvent } from '../shared/ai';
import { buildAttachedContext } from '../server/ai/context';
import { JOB_HANDLERS } from '../server/jobs/handlers';

function parseEvents(body: string): AiStreamEvent[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AiStreamEvent);
}

describe('AI page conversations', () => {
  test('creates a conversation with attached context and returns it on read', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const full = await createBoard(app, cookie, space.id as number);
    const item = await app.inject({
      method: 'POST',
      url: `/api/boards/${full.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId: full.groups[0].id, name: 'Context item' },
    });
    const itemId = item.json().item.id as number;

    const created = await app.inject({
      method: 'POST',
      url: '/api/ai/conversations',
      headers: { ...H, cookie },
      payload: { context: { boardIds: [full.board.id], itemIds: [itemId] } },
    });
    expect(created.statusCode).toBe(201);
    const conversation = created.json().conversation;
    expect(conversation.context).toEqual({
      boardIds: [full.board.id],
      itemIds: [itemId],
      docIds: [],
    });
    expect(conversation.pinned).toBe(false);
    expect(conversation.titleSource).toBe('auto');
    expect(conversation.preview).toBe('');

    const read = await app.inject({
      method: 'GET',
      url: `/api/ai/conversations/${conversation.id}`,
      headers: { cookie },
    });
    expect(read.json().conversation.context.boardIds).toEqual([full.board.id]);

    await app.close();
  });

  test('rejects context the user cannot read with a 400', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const privateSpace = await createSpace(app, owner.cookie, 'Private', { isPrivate: true });
    const full = await createBoard(app, owner.cookie, privateSpace.id as number);
    const member = await inviteAndJoin(app, owner.cookie, 'member', 'member@acme.test');

    const created = await app.inject({
      method: 'POST',
      url: '/api/ai/conversations',
      headers: { ...H, cookie: member.cookie },
      payload: { context: { boardIds: [full.board.id] } },
    });
    expect(created.statusCode).toBe(400);
    expect(created.json().error.code).toBe('validation_error');

    const own = (
      await app.inject({
        method: 'POST',
        url: '/api/ai/conversations',
        headers: { ...H, cookie: member.cookie },
        payload: {},
      })
    ).json().conversation;
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/ai/conversations/${own.id}`,
      headers: { ...H, cookie: member.cookie },
      payload: { context: { boardIds: [full.board.id], itemIds: [], docIds: [] } },
    });
    expect(patch.statusCode).toBe(400);
    expect(patch.json().error.code).toBe('validation_error');

    await app.close();
  });

  test('renames, pins and orders pinned conversations first', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const first = (
      await app.inject({
        method: 'POST',
        url: '/api/ai/conversations',
        headers: { ...H, cookie },
        payload: {},
      })
    ).json().conversation;
    const second = (
      await app.inject({
        method: 'POST',
        url: '/api/ai/conversations',
        headers: { ...H, cookie },
        payload: {},
      })
    ).json().conversation;

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/ai/conversations/${second.id}`,
      headers: { ...H, cookie },
      payload: { title: 'Launch risks', pinned: true },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().conversation.title).toBe('Launch risks');
    expect(renamed.json().conversation.titleSource).toBe('user');
    expect(renamed.json().conversation.pinned).toBe(true);

    const list = await app.inject({
      method: 'GET',
      url: '/api/ai/conversations',
      headers: { cookie },
    });
    expect(list.json().conversations[0].id).toBe(second.id);

    const unpinned = await app.inject({
      method: 'PATCH',
      url: `/api/ai/conversations/${second.id}`,
      headers: { ...H, cookie },
      payload: { pinned: false },
    });
    expect(unpinned.json().conversation.pinned).toBe(false);
    expect(unpinned.json().conversation.titleSource).toBe('user');
    expect(first.id).toBeLessThan(second.id);

    await app.close();
  });

  test('searches by title and by the latest message text', async () => {
    const app = await createTestApp({
      aiFetch: fakeOpenRouter([{ text: 'unique needle answer' }]),
    });
    const { cookie } = await setupOwner(app);

    const titled = await app.inject({
      method: 'POST',
      url: '/api/ai/conversations',
      headers: { ...H, cookie },
      payload: {},
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/ai/conversations/${titled.json().conversation.id}`,
      headers: { ...H, cookie },
      payload: { title: 'Hiring pipeline questions' },
    });

    const chatted = await app.inject({
      method: 'POST',
      url: '/api/ai/conversations',
      headers: { ...H, cookie },
      payload: {},
    });
    const conversationId = chatted.json().conversation.id as number;
    await app.inject({
      method: 'POST',
      url: `/api/ai/conversations/${conversationId}/messages`,
      headers: { ...H, cookie },
      payload: { content: 'hello there' },
    });

    const byTitle = await app.inject({
      method: 'GET',
      url: '/api/ai/conversations?q=hiring',
      headers: { cookie },
    });
    expect(byTitle.json().conversations).toHaveLength(1);
    expect(byTitle.json().conversations[0].title).toBe('Hiring pipeline questions');

    const byMessage = await app.inject({
      method: 'GET',
      url: '/api/ai/conversations?q=needle',
      headers: { cookie },
    });
    expect(byMessage.json().conversations).toHaveLength(1);
    expect(byMessage.json().conversations[0].id).toBe(conversationId);
    expect(byMessage.json().conversations[0].preview).toContain('needle');

    const none = await app.inject({
      method: 'GET',
      url: '/api/ai/conversations?q=zzz-nothing',
      headers: { cookie },
    });
    expect(none.json().conversations).toHaveLength(0);

    await app.close();
  });

  test("another user gets a 404 for someone else's conversation", async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const member = await inviteAndJoin(app, owner.cookie, 'member', 'other@acme.test');
    const conversation = (
      await app.inject({
        method: 'POST',
        url: '/api/ai/conversations',
        headers: { ...H, cookie: owner.cookie },
        payload: {},
      })
    ).json().conversation;

    for (const [method, url] of [
      ['GET', `/api/ai/conversations/${conversation.id}`],
      ['PATCH', `/api/ai/conversations/${conversation.id}`],
      ['DELETE', `/api/ai/conversations/${conversation.id}`],
      ['POST', `/api/ai/conversations/${conversation.id}/regenerate`],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        headers: { ...H, cookie: member.cookie },
        ...(method === 'PATCH' ? { payload: { pinned: true } } : {}),
      });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }

    await app.close();
  });

  test('regenerate replaces the last answer', async () => {
    const app = await createTestApp({
      aiFetch: fakeOpenRouter([{ text: 'First answer' }, { text: 'Second answer' }]),
    });
    const { cookie } = await setupOwner(app);
    const conversation = (
      await app.inject({
        method: 'POST',
        url: '/api/ai/conversations',
        headers: { ...H, cookie },
        payload: {},
      })
    ).json().conversation;

    await app.inject({
      method: 'POST',
      url: `/api/ai/conversations/${conversation.id}/messages`,
      headers: { ...H, cookie },
      payload: { content: 'Tell me something' },
    });

    const regenerated = await app.inject({
      method: 'POST',
      url: `/api/ai/conversations/${conversation.id}/regenerate`,
      headers: { ...H, cookie },
    });
    expect(parseEvents(regenerated.body).at(-1)).toMatchObject({ type: 'done' });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/ai/conversations/${conversation.id}`,
      headers: { cookie },
    });
    const assistant = detail
      .json()
      .messages.filter((message: { role: string }) => message.role === 'assistant');
    expect(assistant).toHaveLength(1);
    expect(assistant[0].content).toBe('Second answer');

    await app.close();
  });

  test('regenerate returns 409 while an approval is pending', async () => {
    const app = await createTestApp({
      aiFetch: fakeOpenRouter([{ toolCalls: [{ name: 'list_people', args: {} }] }]),
    });
    const { cookie } = await setupOwner(app);
    const conversation = (
      await app.inject({
        method: 'POST',
        url: '/api/ai/conversations',
        headers: { ...H, cookie },
        payload: {},
      })
    ).json().conversation;
    app.db
      .prepare(
        `INSERT INTO ai_messages (conversation_id, role, content, status, created_at)
         VALUES (?, 'assistant', '', 'pending_approval', ?)`,
      )
      .run(conversation.id, new Date().toISOString());

    const res = await app.inject({
      method: 'POST',
      url: `/api/ai/conversations/${conversation.id}/regenerate`,
      headers: { ...H, cookie },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('conflict');

    await app.close();
  });
});

describe('attached context and titles', () => {
  test('attached context includes a readable board and disappears after access is removed', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie, 'Studio');
    const full = await createBoard(app, owner.cookie, space.id as number, 'Website relaunch');
    const member = await inviteAndJoin(app, owner.cookie, 'member', 'context@acme.test');

    const before = buildAttachedContext(app, member.user, {
      boardIds: [full.board.id],
      itemIds: [],
      docIds: [],
    });
    expect(before).toContain('Website relaunch');

    const madePrivate = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${space.id}`,
      headers: { ...H, cookie: owner.cookie },
      payload: { isPrivate: true },
    });
    expect(madePrivate.statusCode).toBe(200);

    const after = buildAttachedContext(app, member.user, {
      boardIds: [full.board.id],
      itemIds: [],
      docIds: [],
    });
    expect(after).toBe('');

    await app.close();
  });

  test('the title job writes a fake title without overwriting a user title', async () => {
    const app = await createTestApp({
      aiFetch: fakeOpenRouter([{ text: 'Fake chat title' }, { text: 'Should not be used' }]),
    });
    const { cookie, user } = await setupOwner(app);
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/ai/conversations',
        headers: { ...H, cookie },
        payload: {},
      })
    ).json().conversation;
    app.db
      .prepare(
        `INSERT INTO ai_messages (conversation_id, role, content, status, created_at)
         VALUES (?, 'user', 'Plan my launch', 'complete', ?)`,
      )
      .run(created.id, new Date().toISOString());
    app.db
      .prepare(
        `INSERT INTO ai_messages (conversation_id, role, content, status, created_at)
         VALUES (?, 'assistant', 'Here is a plan', 'complete', ?)`,
      )
      .run(created.id, new Date().toISOString());

    await JOB_HANDLERS.ai_title(app, { conversationId: created.id });
    let row = app.db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(created.id) as {
      title: string;
      title_source: string;
    };
    expect(row.title).toBe('Fake chat title');
    expect(row.title_source).toBe('ai');

    await app.inject({
      method: 'PATCH',
      url: `/api/ai/conversations/${created.id}`,
      headers: { ...H, cookie },
      payload: { title: 'My own title' },
    });
    await JOB_HANDLERS.ai_title(app, { conversationId: created.id });
    row = app.db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(created.id) as {
      title: string;
      title_source: string;
    };
    expect(row.title).toBe('My own title');
    expect(row.title_source).toBe('user');
    expect(user.id).toBeGreaterThan(0);

    await app.close();
  });
});
