import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';
import { JOB_HANDLERS } from '../server/jobs/handlers';
import { runOnce } from '../server/jobs/worker';
import { getItemDto } from '../server/services/items';

const flush = async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('workflows', () => {
  test('moves data across boards, copies the owner and tags them in a note', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const source = await createBoard(app, cookie, space.id as number, 'Onboarding');
    const target = await createBoard(app, cookie, space.id as number, 'Delivery');
    const member = await inviteAndJoin(app, cookie, 'member', 'workflow-csm@acme.test');
    const sourceOwner = (source.columns as { id: number; type: string }[]).find(
      (column) => column.type === 'people',
    )!;
    const targetOwner = (target.columns as { id: number; type: string }[]).find(
      (column) => column.type === 'people',
    )!;
    const sourceText = await app.inject({
      method: 'POST',
      url: `/api/boards/${source.board.id}/columns`,
      headers: { ...H, cookie },
      payload: { title: 'Account', type: 'text' },
    });
    const targetText = await app.inject({
      method: 'POST',
      url: `/api/boards/${target.board.id}/columns`,
      headers: { ...H, cookie },
      payload: { title: 'Account copy', type: 'text' },
    });
    const sourceTextId = sourceText.json().column.id as number;
    const targetTextId = targetText.json().column.id as number;

    const created = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { ...H, cookie },
      payload: {
        name: 'Onboarding to delivery',
        description: 'Create the delivery row and brief the CSM.',
        triggerBoardId: source.board.id,
        trigger: { type: 'item_created' },
        conditions: [],
        steps: [
          {
            type: 'create_item',
            boardId: target.board.id,
            groupId: target.groups[0].id,
            name: 'Delivery for {{name}}',
          },
          { type: 'copy_value', sourceColumnId: sourceTextId, targetColumnId: targetTextId },
          {
            type: 'assign_from',
            sourceColumnId: sourceOwner.id,
            targetColumnId: targetOwner.id,
          },
          {
            type: 'post_update',
            body: 'This account is waiting for delivery.',
            mentionFromColumnId: sourceOwner.id,
          },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const workflowId = created.json().workflow.id as number;

    const sourceItem = await app.inject({
      method: 'POST',
      url: `/api/boards/${source.board.id}/items`,
      headers: { ...H, cookie },
      payload: {
        groupId: source.groups[0].id,
        name: 'Acme onboarding',
        values: {
          [String(sourceOwner.id)]: { userIds: [member.user.id] },
          [String(sourceTextId)]: { text: 'Acme Corp' },
        },
      },
    });
    expect(sourceItem.statusCode).toBe(201);
    await flush();
    expect(await runOnce(app, JOB_HANDLERS)).toBeGreaterThanOrEqual(1);

    const targetItem = app.db
      .prepare('SELECT id, name FROM items WHERE board_id = ? ORDER BY id DESC LIMIT 1')
      .get(target.board.id) as { id: number; name: string };
    expect(targetItem.name).toBe('Delivery for Acme onboarding');
    const detail = getItemDto(app.db, targetItem.id);
    expect((detail.values[String(targetTextId)] as { text: string }).text).toBe('Acme Corp');
    expect(
      ((detail.values[String(targetOwner.id)] as { userIds: number[] }).userIds ?? []).includes(
        member.user.id,
      ),
    ).toBe(true);
    const update = app.db
      .prepare('SELECT body FROM updates WHERE item_id = ? ORDER BY id DESC LIMIT 1')
      .get(targetItem.id) as { body: string };
    expect(update.body).toContain(`@[${member.user.name}](user:${member.user.id})`);
    const run = app.db
      .prepare('SELECT status, created_item_id FROM workflow_runs WHERE workflow_id = ?')
      .get(workflowId) as { status: string; created_item_id: number };
    expect(run.status).toBe('success');
    expect(run.created_item_id).toBe(targetItem.id);
    await app.close();
  });

  test('viewers cannot list or create workflows', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    await createSpace(app, cookie);
    const viewer = await inviteAndJoin(app, cookie, 'viewer', 'viewer-workflow@acme.test');
    const list = await app.inject({
      method: 'GET',
      url: '/api/workflows',
      headers: { cookie: viewer.cookie },
    });
    expect(list.statusCode).toBe(403);
    const create = await app.inject({
      method: 'POST',
      url: '/api/workflows',
      headers: { ...H, cookie: viewer.cookie },
      payload: {},
    });
    expect(create.statusCode).toBe(403);
    await app.close();
  });
});
