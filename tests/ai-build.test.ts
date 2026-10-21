import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, fakeOpenRouter, setupOwner } from './helpers';

describe('AI builders', () => {
  test('a fake dashboard draft validates and previews', async () => {
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number);
    const draft = await app.inject({
      method: 'POST',
      url: '/api/ai/dashboard-draft',
      headers: { ...H, cookie: owner.cookie },
      payload: { workspaceId: space.id, prompt: 'Track status', boardIds: [board.board.id] },
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json().draft.widgets).toHaveLength(2);
    const preview = await app.inject({
      method: 'POST',
      url: '/api/dashboards/preview',
      headers: { ...H, cookie: owner.cookie },
      payload: { boardIds: [board.board.id], widgets: draft.json().draft.widgets },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().data).toHaveLength(2);
    await app.close();
  });

  test('view drafts validate column types and unknown titles retry then fail', async () => {
    const bad = JSON.stringify({
      name: 'Bad view',
      type: 'kanban',
      settings: { kanbanColumnId: 999 },
    });
    const app = await createTestApp({ aiFetch: fakeOpenRouter([{ text: bad }, { text: bad }]) });
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number);
    const response = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/ai-view`,
      headers: { ...H, cookie: owner.cookie },
      payload: { prompt: 'kanban' },
    });
    expect(response.statusCode).toBe(422);
    await app.close();
  });

  test('the create_dashboard tool creates only after approval', async () => {
    const app = await createTestApp({
      aiFetch: fakeOpenRouter([
        {
          toolCalls: [
            { name: 'create_dashboard', args: { workspaceId: 1, prompt: 'Status dashboard' } },
          ],
        },
        {
          text: JSON.stringify({
            name: 'Fake dashboard',
            boardIds: [1],
            widgets: [
              { id: 'w-count', type: 'number', title: 'Items', w: 4, h: 1, config: {} },
              {
                id: 'w-chart',
                type: 'chart',
                title: 'By status',
                w: 8,
                h: 2,
                config: { groupBy: 'status', chartKind: 'bar' },
              },
            ],
          }),
        },
        { text: 'Created it' },
      ]),
    });
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    await createBoard(app, owner.cookie, space.id as number);
    const conversation = (
      await app.inject({
        method: 'POST',
        url: '/api/ai/conversations',
        headers: { ...H, cookie: owner.cookie },
        payload: {},
      })
    ).json().conversation;
    const sent = await app.inject({
      method: 'POST',
      url: `/api/ai/conversations/${conversation.id}/messages`,
      headers: { ...H, cookie: owner.cookie },
      payload: { content: 'make a dashboard' },
    });
    expect(sent.body).toContain('approval_required');
    expect((app.db.prepare('SELECT count(*) AS n FROM dashboards').get() as { n: number }).n).toBe(
      0,
    );
    await app.inject({
      method: 'POST',
      url: `/api/ai/conversations/${conversation.id}/decision`,
      headers: { ...H, cookie: owner.cookie },
      payload: { approve: true },
    });
    expect((app.db.prepare('SELECT count(*) AS n FROM dashboards').get() as { n: number }).n).toBe(
      1,
    );
    await app.close();
  });
});
