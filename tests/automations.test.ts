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
import { JOB_HANDLERS } from '../server/jobs/handlers';
import { runOnce } from '../server/jobs/worker';
import { logActivity } from '../server/services/activity';
import { getItemDto } from '../server/services/items';

const flush = async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

async function fixture(aiFetch?: typeof fetch) {
  const app = await createTestApp({ aiFetch });
  const { cookie, user } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const board = await createBoard(app, cookie, space.id as number);
  const columns = board.columns as { id: number; type: string; title: string }[];
  const status = columns.find((column) => column.type === 'status')!;
  const due = columns.find((column) => column.type === 'date')!;
  const owner = columns.find((column) => column.type === 'people')!;
  const groupId = board.groups[0].id as number;
  const completed = board.groups[1].id as number;
  const addItem = async (name: string) => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId, name },
    });
    return res.json().item.id as number;
  };
  return { app, cookie, user, board, status, due, owner, groupId, completed, addItem };
}

describe('automations', () => {
  test('status Done moves the item and notifies the creator', async () => {
    const f = await fixture();
    const member = await inviteAndJoin(f.app, f.cookie, 'member', 'automation@acme.test');
    const itemId = await f.addItem('Automated item');
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Move when done',
        trigger: { type: 'status_changed', columnId: f.status.id, toLabelId: 'done' },
        conditions: [],
        actions: [
          { type: 'move_to_group', groupId: f.completed },
          { type: 'notify', to: 'creator', message: '{{name}} is done' },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    await f.app.inject({
      method: 'PUT',
      url: `/api/items/${itemId}/values/${f.status.id}`,
      headers: { ...H, cookie: member.cookie },
      payload: { value: { labelId: 'done' } },
    });
    await flush();
    expect(await runOnce(f.app, JOB_HANDLERS)).toBeGreaterThanOrEqual(1);
    const item = getItemDto(f.app.db, itemId);
    expect(item.groupId).toBe(f.completed);
    const notes = await f.app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie: f.cookie },
    });
    expect(
      notes.json().notifications.some((note: { kind: string }) => note.kind === 'automation'),
    ).toBe(true);
    const runs = f.app.db
      .prepare("SELECT status FROM automation_runs WHERE status = 'success'")
      .all() as { status: string }[];
    expect(runs.length).toBeGreaterThanOrEqual(1);
    await f.app.close();
  });

  test('conditions are evaluated and a miss is recorded as skipped', async () => {
    const f = await fixture();
    const itemId = await f.addItem('Conditional item');
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Only when todo',
        trigger: { type: 'status_changed', columnId: f.status.id, toLabelId: 'done' },
        conditions: [{ columnId: f.status.id, op: 'is', value: 'todo' }],
        actions: [{ type: 'move_to_group', groupId: f.completed }],
      },
    });
    const automationId = created.json().automation.id;
    await f.app.inject({
      method: 'PUT',
      url: `/api/items/${itemId}/values/${f.status.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { value: { labelId: 'done' } },
    });
    await flush();
    await runOnce(f.app, JOB_HANDLERS);
    const item = getItemDto(f.app.db, itemId);
    expect(item.groupId).toBe(f.groupId);
    const run = f.app.db
      .prepare('SELECT status, error FROM automation_runs WHERE automation_id = ?')
      .get(automationId) as { status: string; error: string };
    expect(run.status).toBe('skipped');
    expect(run.error).toBe('Conditions not met');
    await f.app.close();
  });

  test('invalid refs and recurring with item actions are rejected', async () => {
    const f = await fixture();
    const bad = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Bad',
        trigger: { type: 'status_changed', columnId: 99999, toLabelId: null },
        conditions: [],
        actions: [{ type: 'archive_item' }],
      },
    });
    expect(bad.statusCode).toBe(400);
    const recurring = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Recurring bad',
        trigger: { type: 'recurring', every: 'day', hour: 9 },
        conditions: [],
        actions: [{ type: 'archive_item' }],
      },
    });
    expect(recurring.statusCode).toBe(400);
    await f.app.close();
  });

  test('ai_prompt writes the fake AI result into a text column', async () => {
    const fake = fakeOpenRouter([{ text: 'AI generated value' }]);
    const f = await fixture(fake);
    const textColumn = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/columns`,
      headers: { ...H, cookie: f.cookie },
      payload: { title: 'AI result', type: 'text' },
    });
    const textId = textColumn.json().column.id as number;
    await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Fill text',
        trigger: { type: 'item_created' },
        conditions: [],
        actions: [{ type: 'ai_prompt', prompt: 'Write for {{name}}', targetColumnId: textId }],
      },
    });
    const itemId = await f.addItem('Prompted item');
    await flush();
    await runOnce(f.app, JOB_HANDLERS);
    const item = getItemDto(f.app.db, itemId);
    expect((item.values[String(textId)] as { text: string }).text).toBe('AI generated value');
    await f.app.close();
  });

  test('depth 3 activity is skipped with a chain depth run', async () => {
    const f = await fixture();
    const itemId = await f.addItem('Depth item');
    const automation = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Depth probe',
        trigger: { type: 'column_changed', columnId: f.status.id },
        conditions: [],
        actions: [{ type: 'notify', to: 'creator', message: 'depth' }],
      },
    });
    const automationId = automation.json().automation.id;
    logActivity(f.app.db, {
      boardId: f.board.board.id,
      itemId,
      actorId: f.user.id,
      action: 'value_changed',
      depth: 3,
      data: {
        columnId: f.status.id,
        columnType: 'status',
        fromValue: null,
        toValue: { labelId: 'done' },
      },
    });
    await flush();
    const run = f.app.db
      .prepare('SELECT status, error FROM automation_runs WHERE automation_id = ?')
      .get(automationId) as { status: string; error: string };
    expect(run.status).toBe('skipped');
    expect(run.error).toBe('Chain depth limit');
    await f.app.close();
  });

  test('deactivating the automation owner disables the automation on the next run', async () => {
    const f = await fixture();
    const admin = await inviteAndJoin(f.app, f.cookie, 'admin', 'automation-admin@acme.test');
    const itemId = await f.addItem('Ownerless item');
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: admin.cookie },
      payload: {
        name: 'Admin automation',
        trigger: { type: 'status_changed', columnId: f.status.id, toLabelId: 'done' },
        conditions: [],
        actions: [{ type: 'move_to_group', groupId: f.completed }],
      },
    });
    const automationId = created.json().automation.id;
    await f.app.inject({
      method: 'PATCH',
      url: `/api/users/${admin.user.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { isActive: false },
    });
    await f.app.inject({
      method: 'PUT',
      url: `/api/items/${itemId}/values/${f.status.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { value: { labelId: 'done' } },
    });
    await flush();
    await runOnce(f.app, JOB_HANDLERS);
    const row = f.app.db
      .prepare('SELECT enabled FROM automations WHERE id = ?')
      .get(automationId) as { enabled: number };
    expect(row.enabled).toBe(0);
    const run = f.app.db
      .prepare(
        'SELECT status, error FROM automation_runs WHERE automation_id = ? ORDER BY id DESC LIMIT 1',
      )
      .get(automationId) as { status: string; error: string };
    expect(run.status).toBe('failed');
    expect(run.error).toContain('owner can no longer edit');
    await f.app.close();
  });

  test('item_created can be scoped to a group', async () => {
    const f = await fixture();
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Only completed intake',
        trigger: { type: 'item_created', groupId: f.completed },
        conditions: [],
        actions: [{ type: 'notify', to: 'creator', message: '{{name}} arrived' }],
      },
    });
    expect(created.statusCode).toBe(201);
    const automationId = created.json().automation.id as number;

    await f.addItem('Not in the target group');
    await flush();
    await runOnce(f.app, JOB_HANDLERS);
    expect(
      f.app.db
        .prepare('SELECT count(*) AS n FROM automation_runs WHERE automation_id = ?')
        .get(automationId) as { n: number },
    ).toEqual({ n: 0 });

    const scoped = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/items`,
      headers: { ...H, cookie: f.cookie },
      payload: { groupId: f.completed, name: 'In the target group' },
    });
    expect(scoped.statusCode).toBe(201);
    await flush();
    await runOnce(f.app, JOB_HANDLERS);
    const run = f.app.db
      .prepare(
        'SELECT status FROM automation_runs WHERE automation_id = ? ORDER BY id DESC LIMIT 1',
      )
      .get(automationId) as { status: string };
    expect(run.status).toBe('success');
    await f.app.close();
  });

  test('subitem_created fires for subitems but not parent items', async () => {
    const f = await fixture();
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Notify on subitem',
        trigger: { type: 'subitem_created' },
        conditions: [],
        actions: [{ type: 'notify', to: 'creator', message: 'Subitem on {{name}}' }],
      },
    });
    const automationId = created.json().automation.id as number;
    const parentId = await f.addItem('Parent item');
    await flush();
    await runOnce(f.app, JOB_HANDLERS);
    expect(
      f.app.db
        .prepare('SELECT count(*) AS n FROM automation_runs WHERE automation_id = ?')
        .get(automationId) as { n: number },
    ).toEqual({ n: 0 });

    const subitem = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/items`,
      headers: { ...H, cookie: f.cookie },
      payload: { groupId: f.groupId, name: 'Child task', parentId },
    });
    expect(subitem.statusCode).toBe(201);
    await flush();
    await runOnce(f.app, JOB_HANDLERS);
    const run = f.app.db
      .prepare(
        'SELECT status FROM automation_runs WHERE automation_id = ? ORDER BY id DESC LIMIT 1',
      )
      .get(automationId) as { status: string };
    expect(run.status).toBe('success');
    await f.app.close();
  });

  test('item_created rejects an unknown group', async () => {
    const f = await fixture();
    const rejected = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Unknown group',
        trigger: { type: 'item_created', groupId: 999999 },
        conditions: [],
        actions: [{ type: 'notify', to: 'creator', message: 'x' }],
      },
    });
    expect(rejected.statusCode).toBe(400);
    await f.app.close();
  });

  test('creates a subitem, copies the CSM and tags them in a note', async () => {
    const f = await fixture();
    const member = await inviteAndJoin(f.app, f.cookie, 'member', 'csm@acme.test');
    const itemId = await f.addItem('Overdue onboarding');
    await f.app.inject({
      method: 'PUT',
      url: `/api/items/${itemId}/values/${f.owner.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { value: { userIds: [member.user.id] } },
    });
    const created = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Overdue chase',
        trigger: { type: 'status_changed', columnId: f.status.id, toLabelId: 'done' },
        conditions: [],
        actions: [
          { type: 'create_subitem', name: 'Chase {{name}}' },
          {
            type: 'assign',
            columnId: f.owner.id,
            who: { fromColumnId: f.owner.id },
            target: 'created',
          },
          {
            type: 'post_update',
            body: 'This work is overdue. Please chase it today.',
            target: 'created',
            mentionFromColumnId: f.owner.id,
          },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    await f.app.inject({
      method: 'PUT',
      url: `/api/items/${itemId}/values/${f.status.id}`,
      headers: { ...H, cookie: f.cookie },
      payload: { value: { labelId: 'done' } },
    });
    await flush();
    expect(await runOnce(f.app, JOB_HANDLERS)).toBeGreaterThanOrEqual(1);

    const subitem = f.app.db
      .prepare('SELECT id, name FROM items WHERE parent_id = ? ORDER BY id DESC LIMIT 1')
      .get(itemId) as { id: number; name: string };
    expect(subitem.name).toBe('Chase Overdue onboarding');
    const ownerValue = f.app.db
      .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
      .get(subitem.id, f.owner.id) as { value: string };
    expect(JSON.parse(ownerValue.value).userIds).toContain(member.user.id);
    const update = f.app.db
      .prepare('SELECT body FROM updates WHERE item_id = ? ORDER BY id DESC LIMIT 1')
      .get(subitem.id) as { body: string };
    expect(update.body).toContain(`@[${member.user.name}](user:${member.user.id})`);
    expect(update.body).toContain('overdue');
    await f.app.close();
  });

  test('rejects targeting a created subitem without creating one', async () => {
    const f = await fixture();
    const rejected = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/automations`,
      headers: { ...H, cookie: f.cookie },
      payload: {
        name: 'Bad target',
        trigger: { type: 'item_created' },
        conditions: [],
        actions: [
          {
            type: 'post_update',
            body: 'No subitem exists',
            target: 'created',
          },
        ],
      },
    });
    expect(rejected.statusCode).toBe(400);
    await f.app.close();
  });

  test('AI can copy a people column onto a created subitem and tag it', async () => {
    const reply = JSON.stringify({
      name: 'Overdue chase',
      trigger: {
        type: 'date_passed',
        column: 'Kick off date',
        hour: 9,
      },
      conditions: [],
      actions: [
        { type: 'create_subitem', name: 'Chase {{name}}' },
        { type: 'assign', column: 'CSM', fromColumn: 'CSM', target: 'created' },
        {
          type: 'post_update',
          body: 'This work is overdue. Please chase it today.',
          target: 'created',
          mentionColumn: 'CSM',
        },
      ],
    });
    const fake = fakeOpenRouter([{ text: reply }]);
    const f = await fixture(fake);
    const csm = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/columns`,
      headers: { ...H, cookie: f.cookie },
      payload: { title: 'CSM', type: 'people' },
    });
    const csmId = csm.json().column.id as number;
    const kickoff = await f.app.inject({
      method: 'POST',
      url: `/api/boards/${f.board.board.id}/columns`,
      headers: { ...H, cookie: f.cookie },
      payload: { title: 'Kick off date', type: 'date' },
    });
    const kickoffId = kickoff.json().column.id as number;

    const generated = await f.app.inject({
      method: 'POST',
      url: '/api/ai/generate-automation',
      headers: { ...H, cookie: f.cookie },
      payload: {
        boardId: f.board.board.id,
        prompt:
          'When the Kick off date passes, create a subitem, assign the CSM from the item and tag them in an overdue note',
      },
    });
    expect(generated.statusCode).toBe(200);
    const body = generated.json() as {
      input: {
        trigger: { type: string; columnId: number };
        actions: {
          type: string;
          target?: string;
          who?: { fromColumnId?: number };
          mentionFromColumnId?: number;
        }[];
      };
      description: string;
    };
    expect(body.input.trigger).toMatchObject({ type: 'date_passed', columnId: kickoffId });
    expect(body.input.actions[1]).toMatchObject({
      type: 'assign',
      target: 'created',
      who: { fromColumnId: csmId },
    });
    expect(body.input.actions[2]).toMatchObject({
      type: 'post_update',
      target: 'created',
      mentionFromColumnId: csmId,
    });
    expect(body.description).toContain('created subitem');
    expect(body.description).toContain('person in CSM');
    await f.app.close();
  });

  test('AI reference errors return a useful 422 instead of a blank 500', async () => {
    const fake = fakeOpenRouter([
      {
        text: JSON.stringify({
          name: 'Bad assign',
          trigger: { type: 'item_created' },
          conditions: [],
          actions: [{ type: 'assign', column: 'Owner', who: 'Onboarding CSM' }],
        }),
      },
    ]);
    const f = await fixture(fake);
    const response = await f.app.inject({
      method: 'POST',
      url: '/api/ai/generate-automation',
      headers: { ...H, cookie: f.cookie },
      payload: { boardId: f.board.board.id, prompt: 'assign the onboarding CSM' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.message).toContain('does not fit this board');
    expect(response.json().error.message).toContain('Unknown person "Onboarding CSM"');
    await f.app.close();
  });
});
