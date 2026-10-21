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

describe('board-specific automation templates', () => {
  test('generates and persists ten validated templates', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const boardId = board.board.id as number;

    const empty = await app.inject({
      method: 'GET',
      url: `/api/boards/${boardId}/automation-templates`,
      headers: { cookie },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ templates: [], generatedAt: null });

    const generated = await app.inject({
      method: 'POST',
      url: `/api/boards/${boardId}/automation-templates`,
      headers: { ...H, cookie },
    });
    expect(generated.statusCode).toBe(200);
    const body = generated.json() as {
      templates: {
        title: string;
        rationale: string;
        category: string;
        input: { trigger: { type: string }; actions: { type: string }[] };
      }[];
      generatedAt: string;
    };
    expect(body.templates).toHaveLength(10);
    expect(body.generatedAt).toBeTruthy();
    for (const template of body.templates) {
      expect(template.title.startsWith('When ')).toBe(true);
      expect(template.rationale.length).toBeGreaterThan(0);
      expect(template.input.trigger.type).toBeTruthy();
      expect(template.input.actions.length).toBeGreaterThan(0);
      expect(template.input.actions.some((action) => action.type === 'send_webhook')).toBe(false);
    }

    const cached = await app.inject({
      method: 'GET',
      url: `/api/boards/${boardId}/automation-templates`,
      headers: { cookie },
    });
    expect(cached.statusCode).toBe(200);
    expect(cached.json().generatedAt).toBe(body.generatedAt);
    expect(cached.json().templates.map((entry: { title: string }) => entry.title)).toEqual(
      body.templates.map((entry) => entry.title),
    );
    await app.close();
  });

  test('drops candidates that do not match the board and blocks viewers', async () => {
    const reply = JSON.stringify({
      templates: [
        {
          name: 'Invalid column',
          rationale: 'This should be discarded.',
          category: 'communicate',
          trigger: { type: 'column_changed', column: 'Missing column' },
          conditions: [],
          actions: [{ type: 'notify', to: 'creator', message: 'x' }],
        },
        {
          name: 'Valid rule',
          rationale: 'This one uses a real column.',
          category: 'communicate',
          trigger: { type: 'status_changed', column: 'Status', toLabel: 'Done' },
          conditions: [],
          actions: [{ type: 'notify', to: 'creator', message: '{{name}} is done' }],
        },
      ],
    });
    const fake = fakeOpenRouter([{ text: reply }]);
    const app = await createTestApp({ aiFetch: fake });
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const boardId = board.board.id as number;
    await app.inject({
      method: 'POST',
      url: `/api/boards/${boardId}/items`,
      headers: { ...H, cookie },
      payload: { groupId: board.groups[0].id, name: 'Board-specific launch item' },
    });

    const generated = await app.inject({
      method: 'POST',
      url: `/api/boards/${boardId}/automation-templates`,
      headers: { ...H, cookie },
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.json().templates).toHaveLength(1);
    expect(generated.json().templates[0].rationale).toBe('This one uses a real column.');

    const prompt = fake.calls[0] as { messages: { role: string; content: string }[] };
    const system = prompt.messages.find((message) => message.role === 'system')?.content ?? '';
    const user = prompt.messages.find((message) => message.role === 'user')?.content ?? '';
    expect(system).toContain('You design board-specific automations.');
    expect(system).toContain('Return 12 distinct candidate automations');
    expect(user).toContain(board.board.name);
    expect(user).toContain('Status (status');
    expect(user).toContain('Board-specific launch item');

    const viewer = await inviteAndJoin(app, cookie, 'viewer', 'viewer-templates@acme.test');
    const denied = await app.inject({
      method: 'POST',
      url: `/api/boards/${boardId}/automation-templates`,
      headers: { ...H, cookie: viewer.cookie },
    });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });
});
