import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, fakeOpenRouter, setupOwner } from './helpers';
import { listItems } from '../server/services/items';
import type { AiStreamEvent } from '../shared/ai';
import type { FakeReply } from './helpers';

async function aiFixture(replies: FakeReply[]) {
  const fake = fakeOpenRouter(replies);
  const app = await createTestApp({ aiFetch: fake });
  const { cookie, user } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const full = await createBoard(app, cookie, space.id as number);
  const conversationResponse = await app.inject({
    method: 'POST',
    url: '/api/ai/conversations',
    headers: { ...H, cookie },
    payload: { boardId: full.board.id },
  });
  const conversation = conversationResponse.json().conversation;
  return { app, cookie, user, fake, full, conversation };
}

function parseEvents(body: string): AiStreamEvent[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AiStreamEvent);
}

async function sendMessage(
  app: any,
  cookie: string,
  conversationId: number,
  content: string,
): Promise<AiStreamEvent[]> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/ai/conversations/${conversationId}/messages`,
    headers: { ...H, cookie },
    payload: { content },
  });
  return parseEvents(res.body);
}

describe('assistant', () => {
  test('answers a plain question and records usage', async () => {
    const f = await aiFixture([{ text: 'Hello from the assistant' }]);
    const events = await sendMessage(f.app, f.cookie, f.conversation.id, 'Hello');
    const streamed = events
      .filter((event): event is Extract<AiStreamEvent, { type: 'text' }> => event.type === 'text')
      .map((event) => event.delta)
      .join('');
    expect(streamed).toBe('Hello from the assistant');
    expect(events.at(-1)).toMatchObject({ type: 'done' });

    const conversation = await f.app.inject({
      method: 'GET',
      url: `/api/ai/conversations/${f.conversation.id}`,
      headers: { cookie: f.cookie },
    });
    const messages = conversation.json().messages;
    expect(messages.filter((m: { role: string }) => m.role === 'user')).toHaveLength(1);
    expect(messages.filter((m: { role: string }) => m.role === 'assistant')).toHaveLength(1);
    expect(messages.at(-1).content).toBe('Hello from the assistant');

    const usage = f.app.db.prepare('SELECT * FROM ai_usage').all() as {
      cost_usd: number;
      feature: string;
    }[];
    expect(usage).toHaveLength(1);
    expect(usage[0].feature).toBe('assistant');
    expect(usage[0].cost_usd).toBeCloseTo(0.001);
    await f.app.close();
  });

  test('a write tool needs approval and applies after approving', async () => {
    const reply = {
      toolCalls: [{ name: 'create_item', args: { boardId: 0, name: 'AI task' } }],
    } as FakeReply;
    const fake = fakeOpenRouter([reply, { text: 'Created it for you' }]);
    const app = await createTestApp({ aiFetch: fake });
    const { cookie, user } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const full = await createBoard(app, cookie, space.id as number);
    (reply.toolCalls![0].args as { boardId: number }).boardId = full.board.id;
    const conversation = (
      await app.inject({
        method: 'POST',
        url: '/api/ai/conversations',
        headers: { ...H, cookie },
        payload: { boardId: full.board.id },
      })
    ).json().conversation;

    const messages = await sendMessage(app, cookie, conversation.id, 'Create a task');
    expect(messages.some((event) => event.type === 'approval_required')).toBe(true);
    expect(listItems(app.db, user, full.board.id)).toHaveLength(0);

    const decision = await app.inject({
      method: 'POST',
      url: `/api/ai/conversations/${conversation.id}/decision`,
      headers: { ...H, cookie },
      payload: { approve: true },
    });
    const decisionEvents = parseEvents(decision.body);
    expect(decisionEvents.some((event) => event.type === 'tool_result')).toBe(true);
    expect(decisionEvents.at(-1)).toMatchObject({ type: 'done' });
    const items = listItems(app.db, user, full.board.id);
    expect(items.map((item) => item.name)).toContain('AI task');
    await app.close();
  });

  test('declining stores the declined tool result and creates nothing', async () => {
    const reply = {
      toolCalls: [{ name: 'create_item', args: { boardId: 0, name: 'Nope task' } }],
    } as FakeReply;
    const fake = fakeOpenRouter([reply, { text: 'Okay, I did not create it' }]);
    const app = await createTestApp({ aiFetch: fake });
    const { cookie, user } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const full = await createBoard(app, cookie, space.id as number);
    (reply.toolCalls![0].args as { boardId: number }).boardId = full.board.id;
    const conversation = (
      await app.inject({
        method: 'POST',
        url: '/api/ai/conversations',
        headers: { ...H, cookie },
        payload: { boardId: full.board.id },
      })
    ).json().conversation;

    const messages = await sendMessage(app, cookie, conversation.id, 'Create something');
    expect(messages.some((event) => event.type === 'approval_required')).toBe(true);

    const decision = await app.inject({
      method: 'POST',
      url: `/api/ai/conversations/${conversation.id}/decision`,
      headers: { ...H, cookie },
      payload: { approve: false },
    });
    expect(parseEvents(decision.body).at(-1)).toMatchObject({ type: 'done' });
    expect(listItems(app.db, user, full.board.id)).toHaveLength(0);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/ai/conversations/${conversation.id}`,
      headers: { cookie },
    });
    const toolMessages = detail
      .json()
      .messages.filter((message: { role: string }) => message.role === 'tool');
    expect(
      toolMessages.some((message: { content: string }) => message.content.includes('declined')),
    ).toBe(true);
    await app.close();
  });

  test('the monthly budget blocks messages with a 402', async () => {
    const f = await aiFixture([{ text: 'should not run' }]);
    const settings = f.app.ai.settings();
    const saved = await f.app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: { ...H, cookie: f.cookie },
      payload: { ...settings, monthlyBudgetUsd: 0.00001 },
    });
    expect(saved.statusCode).toBe(200);
    f.app.db
      .prepare(
        `INSERT INTO ai_usage (user_id, feature, model, prompt_tokens, completion_tokens, cost_usd, created_at)
         VALUES (?, 'assistant', 'x', 1, 1, 1, ?)`,
      )
      .run(f.user.id, new Date().toISOString());
    const res = await f.app.inject({
      method: 'POST',
      url: `/api/ai/conversations/${f.conversation.id}/messages`,
      headers: { ...H, cookie: f.cookie },
      payload: { content: 'Hello' },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe('ai_budget_exceeded');
    await f.app.close();
  });
});

describe('board generator', () => {
  test('accepts a fenced draft and creates the board with columns, groups and items', async () => {
    const draft = {
      name: 'Fake Launch Plan',
      description: 'Generated by the fake AI',
      columns: [
        {
          title: 'Status',
          type: 'status',
          labels: [{ name: 'Planned' }, { name: 'Doing' }, { name: 'Done' }],
        },
        { title: 'Owner', type: 'people' },
        { title: 'Due', type: 'date' },
      ],
      groups: [{ title: 'Now' }, { title: 'Later' }],
      items: [
        { group: 'Now', name: 'Write brief', values: { Status: 'Doing' } },
        { group: 'Now', name: 'Book venue' },
        { group: 'Later', name: 'Send invites' },
      ],
    };
    const fake = fakeOpenRouter([{ text: '```json\n' + JSON.stringify(draft) + '\n```' }]);
    const app = await createTestApp({ aiFetch: fake });
    const { cookie, user } = await setupOwner(app);
    const space = await createSpace(app, cookie);

    const generated = await app.inject({
      method: 'POST',
      url: '/api/ai/generate-board',
      headers: { ...H, cookie },
      payload: { workspaceId: space.id, prompt: 'Launch a mobile app' },
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().draft.name).toBe('Fake Launch Plan');

    const created = await app.inject({
      method: 'POST',
      url: '/api/ai/create-board',
      headers: { ...H, cookie },
      payload: { workspaceId: space.id, draft: generated.json().draft },
    });
    expect(created.statusCode).toBe(201);
    const full = created.json();
    expect(full.board.name).toBe('Fake Launch Plan');
    expect(full.columns.map((column: { title: string }) => column.title)).toEqual([
      'Status',
      'Owner',
      'Due',
    ]);
    expect(full.groups.map((group: { title: string }) => group.title)).toEqual(['Now', 'Later']);
    const items = listItems(app.db, user, full.board.id);
    expect(items.map((item) => item.name).sort()).toEqual(
      ['Book venue', 'Send invites', 'Write brief'].sort(),
    );
    const statusColumn = full.columns.find((column: { type: string }) => column.type === 'status');
    const brief = items.find((item) => item.name === 'Write brief')!;
    const doingLabel = statusColumn.settings.labels.find(
      (label: { name: string }) => label.name === 'Doing',
    );
    expect(brief.values[String(statusColumn.id)]).toEqual({ labelId: doingLabel.id });
    await app.close();
  });
});
