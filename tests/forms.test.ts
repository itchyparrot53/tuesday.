import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';

async function fixture() {
  const app = await createTestApp();
  const { cookie } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const board = await createBoard(app, cookie, space.id as number);
  const created = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.board.id}/forms`,
    headers: { ...H, cookie },
    payload: { title: 'Signup' },
  });
  const form = created.json().form;
  const status = (board.columns as { id: number; type: string }[]).find(
    (column) => column.type === 'status',
  )!;
  return { app, cookie, board, form, status, groupId: board.groups[0].id as number };
}

describe('public forms', () => {
  test('serves the public form and creates an item from a valid submission', async () => {
    const f = await fixture();
    const pub = await f.app.inject({ method: 'GET', url: `/api/public/forms/${f.form.token}` });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().title).toBe('Signup');
    expect(pub.json().fields[0]).toMatchObject({ key: 'name', type: 'name' });
    const submit = await f.app.inject({
      method: 'POST',
      url: `/api/public/forms/${f.form.token}`,
      headers: H,
      payload: {
        values: {
          name: 'Form person',
          [`col:${f.status.id}`]: { labelId: 'done' },
        },
      },
    });
    expect(submit.statusCode).toBe(200);
    const items = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.board.board.id}/items`,
      headers: { cookie: f.cookie },
    });
    const item = items.json().items.find((entry: { name: string }) => entry.name === 'Form person');
    expect(item).toBeTruthy();
    expect(item.values[String(f.status.id)]).toEqual({ labelId: 'done' });
    await f.app.close();
  });

  test('rejects a missing required name, invalid labels, and silently drops honeypot posts', async () => {
    const f = await fixture();
    const missing = await f.app.inject({
      method: 'POST',
      url: `/api/public/forms/${f.form.token}`,
      headers: H,
      payload: { values: {} },
    });
    expect(missing.statusCode).toBe(400);
    const invalid = await f.app.inject({
      method: 'POST',
      url: `/api/public/forms/${f.form.token}`,
      headers: H,
      payload: {
        values: { name: 'Bad label', [`col:${f.status.id}`]: { labelId: 'nope' } },
      },
    });
    expect(invalid.statusCode).toBe(400);
    const bot = await f.app.inject({
      method: 'POST',
      url: `/api/public/forms/${f.form.token}`,
      headers: H,
      payload: { values: { name: 'Bot' }, website: 'https://spam.example' },
    });
    expect(bot.statusCode).toBe(200);
    const items = await f.app.inject({
      method: 'GET',
      url: `/api/boards/${f.board.board.id}/items`,
      headers: { cookie: f.cookie },
    });
    expect(items.json().items).toHaveLength(0);
    await f.app.close();
  });

  test('a disabled form is gone', async () => {
    const f = await fixture();
    await f.app.inject({
      method: 'PATCH',
      url: `/api/forms/${f.form.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { enabled: false },
    });
    const get = await f.app.inject({ method: 'GET', url: `/api/public/forms/${f.form.token}` });
    expect(get.statusCode).toBe(410);
    const post = await f.app.inject({
      method: 'POST',
      url: `/api/public/forms/${f.form.token}`,
      headers: H,
      payload: { values: { name: 'Nope' } },
    });
    expect(post.statusCode).toBe(410);
    await f.app.close();
  });
});
