import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, fakeOpenRouter, setupOwner } from './helpers';
import { runTool, type ToolContext } from '../server/ai/tools';
import { listUsers } from '../server/services/users';
import { listItems } from '../server/services/items';

describe('meeting notes', () => {
  test('extracts actions, creates items with owners/dates/notes and saves a doc', async () => {
    const fake = fakeOpenRouter([
      {
        text: JSON.stringify({
          actions: [
            {
              name: 'Send meeting recap',
              owner: 'Olivia Owner',
              dueDate: '2026-10-21',
              notes: 'Agreed in the meeting',
            },
            {
              name: 'Book follow-up session',
              owner: null,
              dueDate: null,
              notes: '',
            },
          ],
        }),
      },
    ]);
    const app = await createTestApp({ aiFetch: fake });
    const { cookie, user } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const extracted = await app.inject({
      method: 'POST',
      url: '/api/ai/extract-actions',
      headers: { ...H, cookie },
      payload: { boardId: board.board.id, text: 'We agreed to send a recap and book a follow-up.' },
    });
    expect(extracted.statusCode).toBe(200);
    const actions = extracted.json().actions;
    expect(actions[0].ownerUserId).toBe(user.id);

    const created = await app.inject({
      method: 'POST',
      url: '/api/ai/create-actions',
      headers: { ...H, cookie },
      payload: {
        boardId: board.board.id,
        groupId: board.groups[0].id,
        actions,
        saveDoc: {
          workspaceId: space.id,
          title: 'Meeting notes 2026-10-18',
          text: 'We agreed to send a recap and book a follow-up.',
        },
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().itemIds).toHaveLength(2);
    expect(created.json().docId).toBeTruthy();
    const items = listItems(app.db, user, board.board.id);
    const recap = items.find((item) => item.name === 'Send meeting recap')!;
    const people = board.columns.find((column: { type: string }) => column.type === 'people');
    const date = board.columns.find((column: { type: string }) => column.type === 'date');
    expect(recap.values[String(people.id)]).toEqual({ userIds: [user.id] });
    expect(recap.values[String(date.id)]).toEqual({ date: '2026-10-21' });

    const ctx: ToolContext = { db: app.db, user, users: listUsers(app.db) };
    const search = runTool('search_docs', JSON.stringify({ query: 'recap' }), ctx);
    expect(search.ok).toBe(true);
    const docs = search.result as { id: number }[];
    expect(docs.length).toBeGreaterThan(0);
    const read = runTool('get_doc', JSON.stringify({ docId: docs[0].id }), ctx);
    expect(read.ok).toBe(true);
    expect((read.result as { content: string }).content).toContain('Created items');
    await app.close();
  });
});
