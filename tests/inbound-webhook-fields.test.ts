import { describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';

async function fixture(app: FastifyInstance) {
  const owner = await setupOwner(app);
  const space = await createSpace(app, owner.cookie, 'Webhook fields');
  const board = await createBoard(app, owner.cookie, space.id as number, 'Webhook fields board');
  const full = await app.inject({
    method: 'GET',
    url: `/api/boards/${board.board.id}`,
    headers: { ...H, cookie: owner.cookie },
  });
  const data = full.json();
  const columns: Record<string, { id: number; type: string }> = {};
  for (const column of data.columns) columns[column.type] = column;
  const add = async (title: string, type: string, settings: Record<string, unknown> = {}) => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/columns`,
      headers: { ...H, cookie: owner.cookie },
      payload: { title, type, settings },
    });
    expect(response.statusCode).toBe(201);
    return response.json().column as { id: number };
  };
  const notes = await add('Notes', 'text');
  const budget = await add('Budget', 'number');
  const brief = await add('Brief', 'link');
  const contact = await add('Contact', 'email');
  const phone = await add('Phone', 'phone');
  const priority = await add('Priority', 'dropdown', {
    options: [{ id: 'high', name: 'High', color: '#E5484D' }],
  });
  const approved = await add('Approved', 'checkbox');
  const hookResponse = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.board.id}/inbound-webhook`,
    headers: { ...H, cookie: owner.cookie },
  });
  expect(hookResponse.statusCode).toBe(201);
  const hook = hookResponse.json().webhook as { token: string };
  return { owner, board, columns, notes, budget, brief, contact, phone, priority, approved, hook };
}

function post(app: FastifyInstance, token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: `/api/hooks/board/${token}`,
    headers: { 'content-type': 'application/json' },
    payload,
  });
}

describe('inbound webhook field mapping', () => {
  test('maps status, due date, assignee, description and typed column values', async () => {
    const app = await createTestApp();
    const f = await fixture(app);
    const response = await post(app, f.hook.token, {
      name: 'Mapped item',
      group: f.board.groups[0].title,
      status: 'in progress',
      dueDate: '2026-10-20',
      assignee: f.owner.user.email,
      description: 'Created by webhook',
      values: {
        Notes: 'hello',
        Budget: '42',
        Brief: 'https://example.com',
        Contact: 'person@example.com',
        Phone: '+44 20 0000 0000',
        Priority: 'High',
        Approved: true,
      },
      extra: 'ignored',
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.errors).toEqual([]);
    expect(body.ignored).toEqual(['extra']);
    const values = body.item.values as Record<string, Record<string, unknown>>;
    expect(values[String(f.columns.status.id)]).toEqual({ labelId: 'progress' });
    expect(values[String(f.columns.date.id)]).toEqual({ date: '2026-10-20' });
    expect(values[String(f.columns.people.id)]).toEqual({ userIds: [f.owner.user.id] });
    expect(values[String(f.notes.id)]).toEqual({ text: 'hello' });
    expect(values[String(f.budget.id)]).toEqual({ number: 42 });
    expect(values[String(f.brief.id)]).toEqual({ url: 'https://example.com' });
    expect(values[String(f.contact.id)]).toEqual({ text: 'person@example.com' });
    expect(values[String(f.phone.id)]).toEqual({ text: '+44 20 0000 0000' });
    expect(values[String(f.priority.id)]).toEqual({ optionIds: ['high'] });
    expect(values[String(f.approved.id)]).toEqual({ checked: true });

    const updates = await app.inject({
      method: 'GET',
      url: `/api/items/${body.item.id}`,
      headers: { ...H, cookie: f.owner.cookie },
    });
    expect(updates.json().updates[0].body).toBe('Created by webhook');
    await app.close();
  });

  test('reports invalid values but keeps the created item', async () => {
    const app = await createTestApp();
    const f = await fixture(app);
    const response = await post(app, f.hook.token, {
      name: 'Kept despite errors',
      group: f.board.groups[0].title,
      status: 'Nope',
      dueDate: 'not-a-date',
      assignee: 'ghost@example.com',
      values: {
        Budget: 'not-a-number',
        Brief: 'not-a-url',
        Approved: 'maybe',
        Priority: 'Nope',
        Missing: 'x',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.item.name).toBe('Kept despite errors');
    const fields = (body.errors as { field: string }[]).map((error) => error.field);
    expect(fields).toContain('status');
    expect(fields).toContain('dueDate');
    expect(fields).toContain('assignee');
    expect(fields).toContain('values.Budget');
    expect(fields).toContain('values.Brief');
    expect(fields).toContain('values.Approved');
    expect(fields).toContain('values.Priority');
    expect(fields).toContain('values.Missing');
    await app.close();
  });

  test('converts an ISO due date to the organisation timezone', async () => {
    const app = await createTestApp();
    const f = await fixture(app);
    const org = await app.inject({
      method: 'PATCH',
      url: '/api/org',
      headers: { ...H, cookie: f.owner.cookie },
      payload: { timezone: 'America/New_York' },
    });
    expect(org.statusCode).toBe(200);
    const response = await post(app, f.hook.token, {
      name: 'Timezone item',
      dueDate: '2026-10-21T02:00:00.000Z',
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.errors).toEqual([]);
    expect(body.item.values[String(f.columns.date.id)]).toEqual({ date: '2026-10-20' });
    await app.close();
  });
});
