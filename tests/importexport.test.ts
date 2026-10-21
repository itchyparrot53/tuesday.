import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';

async function fixture() {
  const app = await createTestApp();
  const { cookie } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const first = await createBoard(app, cookie, space.id as number, 'Source');
  const second = await createBoard(app, cookie, space.id as number, 'Target');
  const status = (first.columns as { id: number; type: string }[]).find(
    (column) => column.type === 'status',
  )!;
  const due = (first.columns as { id: number; type: string }[]).find(
    (column) => column.type === 'date',
  )!;
  await app.inject({
    method: 'POST',
    url: `/api/boards/${first.board.id}/items`,
    headers: { ...H, cookie },
    payload: {
      groupId: first.groups[0].id,
      name: 'Export one',
      values: {
        [status.id]: { labelId: 'progress' },
        [due.id]: { date: '2026-11-01' },
      },
    },
  });
  await app.inject({
    method: 'POST',
    url: `/api/boards/${first.board.id}/items`,
    headers: { ...H, cookie },
    payload: {
      groupId: first.groups[0].id,
      name: 'Export two',
      values: { [status.id]: { labelId: 'done' } },
    },
  });
  return { app, cookie, first, second, status, due };
}

describe('CSV import and export', () => {
  test('exports a board and re-imports it into another board', async () => {
    const f = await fixture();
    const exported = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.first.board.id}/export.csv`,
      headers: { cookie: f.cookie },
    });
    expect(exported.statusCode).toBe(200);
    const csv = exported.body;
    const preview = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.second.board.id}/import/preview`,
      headers: { ...H, cookie: f.cookie },
      payload: { csv },
    });
    expect(preview.statusCode).toBe(200);
    const imported = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.second.board.id}/import`,
      headers: { ...H, cookie: f.cookie },
      payload: { csv, mapping: preview.json().suggested },
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().created).toBe(2);
    const items = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.second.board.id}/items`,
      headers: { cookie: f.cookie },
    });
    expect(items.json().items).toHaveLength(2);
    const one = items.json().items.find((entry: { name: string }) => entry.name === 'Export one');
    const targetStatus = (f.second.columns as { id: number; type: string }[]).find(
      (column) => column.type === 'status',
    )!;
    const targetDue = (f.second.columns as { id: number; type: string }[]).find(
      (column) => column.type === 'date',
    )!;
    expect(one.values[String(targetStatus.id)]).toEqual({ labelId: 'progress' });
    expect(one.values[String(targetDue.id)]).toEqual({ date: '2026-11-01' });
    await f.app.close();
  });

  test('creates new columns and reports bad cells, and requires a name mapping', async () => {
    const f = await fixture();
    const csv = 'Item,Extra,Due date\nNew row,hello,not-a-date';
    const preview = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.second.board.id}/import/preview`,
      headers: { ...H, cookie: f.cookie },
      payload: { csv },
    });
    const mappings = preview.json().suggested as { header: string; target: unknown }[];
    const extra = mappings.find((entry) => entry.header === 'Extra');
    expect(extra?.target).toMatchObject({ newColumn: { type: 'text' } });
    const imported = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.second.board.id}/import`,
      headers: { ...H, cookie: f.cookie },
      payload: { csv, mapping: mappings },
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json().created).toBe(1);
    expect(imported.json().errors).toHaveLength(1);
    expect(imported.json().errors[0].row).toBe(2);
    const board = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.second.board.id}`,
      headers: { cookie: f.cookie },
    });
    expect(board.json().columns.some((column: { title: string }) => column.title === 'Extra')).toBe(
      true,
    );

    const badMapping = mappings.filter((entry) => entry.target !== 'name');
    const noName = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.second.board.id}/import`,
      headers: { ...H, cookie: f.cookie },
      payload: { csv, mapping: badMapping },
    });
    expect(noName.statusCode).toBe(400);
    await f.app.close();
  });
});
