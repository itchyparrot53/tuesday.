import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, fakeOpenRouter, setupOwner } from './helpers';
import { AI_COLUMN_HANDLERS } from '../server/jobs/ai-column';
import { runOnce } from '../server/jobs/worker';
import { listItems } from '../server/services/items';
import type { AiCellValue } from '../shared/columns';

const LABELS = [
  { id: 'bug', name: 'Bug', color: '#E5484D' },
  { id: 'feature', name: 'Feature', color: '#3E8EF7' },
];

async function fixture(replies: { text?: string }[]) {
  const fake = fakeOpenRouter(replies);
  const app = await createTestApp({ aiFetch: fake });
  const { cookie, user } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const board = await createBoard(app, cookie, space.id as number);
  const boardId = board.board.id as number;
  const groupId = board.groups[0].id as number;
  async function addItem(name: string) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/boards/${boardId}/items`,
      headers: { ...H, cookie },
      payload: { groupId, name },
    });
    return res.json().item;
  }
  async function addAiColumn(autoRun: boolean) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/boards/${boardId}/columns`,
      headers: { ...H, cookie },
      payload: {
        title: 'Category',
        type: 'ai',
        settings: {
          prompt: 'Category for {{name}}',
          autoRun,
          output: 'label',
          labels: LABELS,
        },
      },
    });
    return res.json().column;
  }
  return { app, cookie, user, boardId, addItem, addAiColumn, fake };
}

describe('ai columns', () => {
  test('run-all queues every item and fills label values', async () => {
    const f = await fixture([{ text: 'Bug' }, { text: 'Bug' }]);
    const first = await f.addItem('Broken login');
    await f.addItem('Slow page');
    const column = await f.addAiColumn(false);
    const run = await f.app.inject({
      method: 'POST',
      url: `/api/columns/${column.id}/ai-run`,
      headers: { ...H, cookie: f.cookie },
      payload: {},
    });
    expect(run.statusCode).toBe(200);
    expect(run.json().queued).toBe(2);
    f.app.db.prepare("DELETE FROM jobs WHERE kind <> 'ai_column_fill'").run();
    expect(await runOnce(f.app, AI_COLUMN_HANDLERS)).toBe(2);
    const items = listItems(f.app.db, f.user, f.boardId);
    for (const item of items) {
      const value = item.values[String(column.id)] as AiCellValue;
      expect(value.state).toBe('done');
      expect(value.labelId).toBe('bug');
    }
    expect(items.map((item) => item.id)).toContain(first.id);
    await f.app.close();
  });

  test('a reply that does not match a label stores an error', async () => {
    const f = await fixture([{ text: 'Banana' }]);
    await f.addItem('Odd one');
    const column = await f.addAiColumn(false);
    await f.app.inject({
      method: 'POST',
      url: `/api/columns/${column.id}/ai-run`,
      headers: { ...H, cookie: f.cookie },
      payload: {},
    });
    await runOnce(f.app, AI_COLUMN_HANDLERS);
    const item = listItems(f.app.db, f.user, f.boardId)[0];
    const value = item.values[String(column.id)] as AiCellValue;
    expect(value.state).toBe('error');
    expect(value.error).toBe('Reply did not match a label');
    await f.app.close();
  });

  test('renaming an item re-queues it once thanks to the dedupe key', async () => {
    const f = await fixture([]);
    const item = await f.addItem('Original');
    const column = await f.addAiColumn(true);
    expect(column.type).toBe('ai');
    f.app.db.prepare('DELETE FROM jobs').run();
    await f.app.inject({
      method: 'PATCH',
      url: `/api/items/${item.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { name: 'Renamed once' },
    });
    let jobs = f.app.db
      .prepare("SELECT * FROM jobs WHERE kind = 'ai_column_fill' AND status = ?")
      .all('queued') as {
      dedupe_key: string;
    }[];
    expect(jobs).toHaveLength(1);
    expect(jobs[0].dedupe_key).toBe(`ai:${column.id}:${item.id}`);
    await f.app.inject({
      method: 'PATCH',
      url: `/api/items/${item.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { name: 'Renamed twice' },
    });
    jobs = f.app.db
      .prepare("SELECT * FROM jobs WHERE kind = 'ai_column_fill' AND status = ?")
      .all('queued') as {
      dedupe_key: string;
    }[];
    expect(jobs).toHaveLength(1);
    await f.app.close();
  });
});
