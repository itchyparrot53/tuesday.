import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, fakeOpenRouter, setupOwner } from './helpers';

const validFilter = JSON.stringify({
  filters: [],
  sort: null,
  search: 'write brief',
  personUserId: null,
  explanation: 'Items matching "write brief"',
});

describe('AI helpers', () => {
  test('an invalid JSON reply is retried once', async () => {
    const app = await createTestApp({
      aiFetch: fakeOpenRouter([{ text: 'not json' }, { text: validFilter }]),
    });
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number);
    const response = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/ai-filter`,
      headers: { ...H, cookie: owner.cookie },
      payload: { text: 'show write brief' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().settings.search).toBe('write brief');
    expect(response.json().explanation).toContain('write brief');
    await app.close();
  });

  test('two invalid replies return 422 and unknown ids are rejected', async () => {
    const app = await createTestApp({
      aiFetch: fakeOpenRouter([
        { text: 'nope' },
        { text: 'still nope' },
        {
          text: JSON.stringify({
            filters: [{ columnId: 999, op: 'is', value: 'x' }],
            sort: null,
            search: '',
            personUserId: null,
            explanation: 'bad',
          }),
        },
        {
          text: JSON.stringify({
            filters: [{ columnId: 999, op: 'is', value: 'x' }],
            sort: null,
            search: '',
            personUserId: null,
            explanation: 'bad',
          }),
        },
      ]),
    });
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number);
    const invalid = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/ai-filter`,
      headers: { ...H, cookie: owner.cookie },
      payload: { text: 'show something' },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error.code).toBe('ai_invalid_output');
    const badId = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/ai-filter`,
      headers: { ...H, cookie: owner.cookie },
      payload: { text: 'show something' },
    });
    expect(badId.statusCode).toBe(422);
    await app.close();
  });

  test('formula and column suggestions validate against the board', async () => {
    const app = await createTestApp({
      aiFetch: fakeOpenRouter([
        { text: JSON.stringify({ formula: '1 + 1', explanation: 'Adds one and one.' }) },
        {
          text: JSON.stringify({
            suggestions: [
              {
                title: 'Priority',
                type: 'status',
                settings: { labels: [{ name: 'High', color: '#E5484D' }] },
                reason: 'Prioritise work.',
              },
            ],
          }),
        },
      ]),
    });
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number);
    const formula = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/ai-formula`,
      headers: { ...H, cookie: owner.cookie },
      payload: { description: 'add one and one' },
    });
    expect(formula.statusCode).toBe(200);
    expect(formula.json().formula).toBe('1 + 1');
    const suggestions = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/ai-column-suggestions`,
      headers: { ...H, cookie: owner.cookie },
    });
    expect(suggestions.statusCode).toBe(200);
    expect(suggestions.json().suggestions[0].title).toBe('Priority');
    await app.close();
  });
});

describe('helper permissions and validation', () => {
  test('a formula referencing a missing column is retried then rejected', async () => {
    const bad = JSON.stringify({ formula: '{Nope} * 2', explanation: 'bad ref' });
    const app = await createTestApp({ aiFetch: fakeOpenRouter([{ text: bad }, { text: bad }]) });
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number);
    const response = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/ai-formula`,
      headers: { ...H, cookie: owner.cookie },
      payload: { description: 'double nope' },
    });
    expect(response.statusCode).toBe(422);
    await app.close();
  });

  test('viewers cannot use formula or suggestions but can filter', async () => {
    const app = await createTestApp({ aiFetch: fakeOpenRouter([{ text: validFilter }]) });
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number);
    const { inviteAndJoin } = await import('./helpers');
    const viewer = await inviteAndJoin(app, owner.cookie, 'viewer', 'helper-viewer@acme.test');
    const formula = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/ai-formula`,
      headers: { ...H, cookie: viewer.cookie },
      payload: { description: 'x' },
    });
    expect(formula.statusCode).toBe(403);
    const suggestions = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/ai-column-suggestions`,
      headers: { ...H, cookie: viewer.cookie },
    });
    expect(suggestions.statusCode).toBe(403);
    const filter = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/ai-filter`,
      headers: { ...H, cookie: viewer.cookie },
      payload: { text: 'show write brief' },
    });
    expect(filter.statusCode).toBe(200);
    await app.close();
  });
});
