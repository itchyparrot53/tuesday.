import type { FastifyInstance } from 'fastify';
import type { Action, Automation } from '../../shared/automations';
import type { User } from '../../shared/types';
import { cellToText, type CellValue } from '../../shared/columns';
import { renderTemplate } from '../../shared/templates-text';
import { getBoardFull, getBoardRow } from '../services/boards';
import { archiveItem, createItem, getItemDto, setValue, updateItem } from '../services/items';
import { postUpdate, listItemUpdates } from '../services/updates';
import { notify } from '../services/notifications';
import { listUsers } from '../services/users';
import { getOrg } from '../services/settings';
import { zonedParts, addDays } from '../lib/timezone';
import { badRequest } from '../lib/errors';
import { randomBytes } from 'node:crypto';
import { getSetting, setSetting } from '../services/settings';
import { enqueue } from '../jobs/queue';

interface ActionContext {
  app: FastifyInstance;
  automation: Automation;
  creator: User;
  actorId: number | null;
  itemId: number | null;
  createdItemId?: number | null;
  depth: number;
}

function actionItemId(ctx: ActionContext, target?: 'created'): number {
  const id = target === 'created' ? ctx.createdItemId : ctx.itemId;
  if (!id) {
    throw badRequest(
      target === 'created'
        ? 'Create a subitem before targeting the created subitem'
        : 'This action needs an item',
    );
  }
  return id;
}

function templateContext(ctx: ActionContext) {
  const db = ctx.app.db;
  const users = listUsers(db);
  const names = new Map(users.map((user) => [user.id, user.name]));
  const board = getBoardRow(db, ctx.automation.boardId);
  let itemName = '';
  let values: Record<string, string> = {};
  let updates = '';
  if (ctx.itemId) {
    try {
      const item = getItemDto(db, ctx.itemId);
      const full = getBoardFull(db, ctx.creator, ctx.automation.boardId);
      itemName = item.name;
      for (const column of full.columns) {
        const text = cellToText(
          column.type,
          column.settings,
          item.values[String(column.id)] as CellValue | undefined,
          (id) => names.get(id) ?? '',
        );
        if (text) values[column.title] = text;
      }
      updates = listItemUpdates(db, ctx.itemId)
        .slice(-10)
        .map(
          (update) =>
            `${update.authorId ? (names.get(update.authorId) ?? 'Someone') : 'Tuesday AI'}: ${update.body}`,
        )
        .join('\n');
    } catch {}
  }
  const actor = ctx.actorId ? (names.get(ctx.actorId) ?? '') : '';
  return { itemName, boardName: board.name, actorName: actor, values, updates };
}

function recipients(ctx: ActionContext, to: Extract<Action, { type: 'notify' }>['to']): number[] {
  const db = ctx.app.db;
  if (typeof to === 'object') return to.userIds;
  if (to === 'creator') return ctx.automation.createdBy ? [ctx.automation.createdBy] : [];
  if (to === 'actor') return ctx.actorId ? [ctx.actorId] : [];
  if (!ctx.itemId) return [];
  const item = getItemDto(db, ctx.itemId);
  const full = getBoardFull(db, ctx.creator, ctx.automation.boardId);
  const ids = new Set<number>();
  for (const column of full.columns) {
    if (column.type !== 'people') continue;
    const value = item.values[String(column.id)] as { userIds?: number[] } | undefined;
    for (const id of value?.userIds ?? []) ids.add(id);
  }
  return [...ids];
}

async function runAction(ctx: ActionContext, action: Action): Promise<void> {
  const db = ctx.app.db;
  const { creator, itemId, depth } = ctx;
  const template = templateContext(ctx);

  if (action.type === 'set_value') {
    const targetId = actionItemId(ctx, action.target);
    let value = action.value;
    if (
      typeof value === 'object' &&
      value !== null &&
      Number.isInteger((value as { relativeDays?: number }).relativeDays)
    ) {
      const today = zonedParts(new Date(), getOrg(db).timezone).date;
      value = { date: addDays(today, (value as { relativeDays: number }).relativeDays) };
    }
    setValue(db, creator, targetId, action.columnId, value, 'system', depth);
    return;
  }
  if (action.type === 'move_to_group') {
    if (!itemId) throw badRequest('This action needs an item');
    updateItem(db, creator, itemId, { groupId: action.groupId }, 'system', depth);
    return;
  }
  if (action.type === 'assign') {
    const targetId = actionItemId(ctx, action.target);
    let userIds: number[];
    if (typeof action.who === 'object' && 'fromColumnId' in action.who) {
      if (!itemId) throw badRequest('Copying a person needs an original item');
      const source = getItemDto(db, itemId);
      userIds = ((
        source.values[String(action.who.fromColumnId)] as { userIds?: number[] } | undefined
      )?.userIds ?? []) as number[];
      if (!userIds.length) return;
    } else {
      userIds = [
        action.who === 'creator'
          ? creator.id
          : action.who === 'actor'
            ? (ctx.actorId ?? creator.id)
            : action.who.userId,
      ];
    }
    const item = getItemDto(db, targetId);
    const current = ((item.values[String(action.columnId)] as { userIds?: number[] } | undefined)
      ?.userIds ?? []) as number[];
    const next = [...new Set([...current, ...userIds])];
    if (next.length !== current.length) {
      setValue(db, creator, targetId, action.columnId, { userIds: next }, 'system', depth);
    }
    return;
  }
  if (action.type === 'notify') {
    const message = renderTemplate(action.message, template);
    const link = itemId
      ? `/boards/${ctx.automation.boardId}?item=${itemId}`
      : `/boards/${ctx.automation.boardId}`;
    const workspaceId = (
      db.prepare('SELECT workspace_id FROM boards WHERE id = ?').get(ctx.automation.boardId) as {
        workspace_id: number;
      }
    ).workspace_id;
    for (const userId of recipients(ctx, action.to)) {
      notify(db, {
        userId,
        workspaceId,
        kind: 'automation',
        title: message,
        body: '',
        link,
        actorId: ctx.actorId ?? creator.id,
        boardId: ctx.automation.boardId,
      });
    }
    return;
  }
  if (action.type === 'create_item') {
    const targetGroup =
      action.groupId ?? getBoardFull(db, creator, action.boardId).groups[0]?.id ?? null;
    if (!targetGroup) throw badRequest('Target board has no groups');
    createItem(
      db,
      creator,
      action.boardId,
      { groupId: targetGroup, name: renderTemplate(action.name, template) },
      'system',
      depth,
    );
    return;
  }
  if (action.type === 'create_subitem') {
    if (!itemId) throw badRequest('This action needs an item');
    const item = getItemDto(db, itemId);
    const created = createItem(
      db,
      creator,
      ctx.automation.boardId,
      {
        groupId: item.groupId,
        name: renderTemplate(action.name, template),
        parentId: item.id,
      },
      'system',
      depth,
    );
    ctx.createdItemId = created.id;
    return;
  }
  if (action.type === 'post_update') {
    const targetId = actionItemId(ctx, action.target);
    let body = renderTemplate(action.body, template);
    if (action.mentionFromColumnId) {
      if (!itemId) throw badRequest('A mention needs an original item');
      const source = getItemDto(db, itemId);
      const ids = ((
        source.values[String(action.mentionFromColumnId)] as { userIds?: number[] } | undefined
      )?.userIds ?? []) as number[];
      if (ids.length) {
        const names = new Map(listUsers(db).map((user) => [user.id, user.name]));
        body = `${ids.map((id) => `@[${names.get(id) ?? 'Someone'}](user:${id})`).join(' ')} ${body}`;
      }
    }
    postUpdate(db, creator, targetId, `⚙️ ${body}`, undefined, 'user', depth);
    return;
  }
  if (action.type === 'archive_item') {
    if (!itemId) throw badRequest('This action needs an item');
    archiveItem(db, creator, itemId, depth, 'system');
    return;
  }
  if (action.type === 'ai_prompt') {
    if (!itemId) throw badRequest('This action needs an item');
    const prompt = renderTemplate(action.prompt, template);
    const result = await ctx.app.ai.chat(creator.id, 'automation', {
      model: ctx.app.ai.modelFor('automation').model,
      messages: [
        {
          role: 'system',
          content: 'You run a work-management automation. Reply with only the value, no preamble.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 400,
    });
    const text = result.content.trim();
    if (text) {
      setValue(db, creator, itemId, action.targetColumnId, { text }, 'system', depth);
    }
    return;
  }
  if (action.type === 'send_webhook') {
    let secret = getSetting<string>(db, 'automation:webhookSecret', '');
    if (!secret) {
      secret = `whsec_${randomBytes(32).toString('base64url')}`;
      setSetting(db, 'automation:webhookSecret', secret);
    }
    enqueue(db, 'webhook_deliver', {
      webhookId: null,
      url: action.url,
      secret,
      event: 'automation',
      payload: {
        event: 'automation',
        automationId: ctx.automation.id,
        automationName: ctx.automation.name,
        itemId,
        boardId: ctx.automation.boardId,
        occurredAt: new Date().toISOString(),
      },
    });
    return;
  }
}

export async function executeActions(ctx: ActionContext, actions: Action[]): Promise<void> {
  for (const action of actions) {
    await runAction(ctx, action);
  }
}
