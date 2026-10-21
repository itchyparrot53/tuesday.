import type { Db } from '../db/db';
import { cellToText, type CellValue } from '../../shared/columns';
import type { BoardDraft } from '../../shared/ai';
import type { Column, Item, User } from '../../shared/types';
import { badRequest, notFound } from '../lib/errors';
import { createBoardFromDraft, getBoardFull } from '../services/boards';
import { createAutomation } from '../services/automations';
import { resolveAutomationDraft } from './features';
import {
  listItems,
  createItem,
  updateItem,
  setValue,
  getItem,
  getItemDto,
} from '../services/items';
import { postUpdate, listItemUpdates } from '../services/updates';
import { createGroup } from '../services/groups';
import { listWorkspacesForUser } from '../services/workspaces';
import { createDoc, getDoc, searchDocs } from '../services/docs';
import { assertBoardAccess, boardAccess } from '../services/permissions';
import { search } from '../services/search';
import { searchKnowledgeKeyword } from '../knowledge/search';
import { getRisks, riskLines } from '../services/risks';
import { parseHumanValue } from './human-values';
import { getMyWork } from '../services/mywork';
import { listBoardActivity } from '../services/activity';
import { describeActivity } from '../../shared/activity';
import type { ToolDef } from './openrouter';

export interface ToolContext {
  db: Db;
  user: User;
  users: User[];
}

export interface AiTool<A = any> {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  mutates: boolean;
  describe(args: A, ctx: ToolContext): string;
  run(args: A, ctx: ToolContext): unknown;
}

function nameMap(users: User[]): Map<number, string> {
  return new Map(users.map((user) => [user.id, user.name]));
}

function readableValues(
  item: Item,
  columns: Column[],
  names: Map<number, string>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const column of columns) {
    const text = cellToText(
      column.type,
      column.settings,
      item.values[String(column.id)] as CellValue | undefined,
      (id) => names.get(id) ?? '',
    );
    if (text) values[column.title] = text;
  }
  return values;
}

function buildValues(
  raw: Record<string, string> | undefined,
  columns: Column[],
  users: User[],
  ctx: ToolContext,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [title, input] of Object.entries(raw ?? {})) {
    const column = columns.find((c) => c.title.toLowerCase() === title.toLowerCase());
    if (!column) throw badRequest(`Unknown column "${title}"`);
    let items: { id: number; name: string }[] | undefined;
    if (column.type === 'dependency') {
      items = ctx.db
        .prepare('SELECT id, name FROM items WHERE board_id = ? AND archived_at IS NULL')
        .all(column.boardId) as { id: number; name: string }[];
    } else if (column.type === 'connect') {
      const target = column.settings.targetBoardId;
      items = target
        ? (ctx.db
            .prepare('SELECT id, name FROM items WHERE board_id = ? AND archived_at IS NULL')
            .all(target) as { id: number; name: string }[])
        : undefined;
    }
    const parsed = parseHumanValue(column, String(input), users, items);
    if (parsed !== null) values[String(column.id)] = parsed;
  }
  return values;
}

function boardName(ctx: ToolContext, boardId: number): string {
  const row = ctx.db
    .prepare('SELECT b.name, b.workspace_id FROM boards b WHERE b.id = ?')
    .get(boardId) as { name: string; workspace_id: number } | undefined;
  if (!row || boardAccess(ctx.db, ctx.user, boardId) === 'none') return `board #${boardId}`;
  return row.name;
}

function itemName(ctx: ToolContext, itemId: number): string {
  const row = ctx.db
    .prepare(
      'SELECT i.name, i.board_id, b.workspace_id FROM items i JOIN boards b ON b.id = i.board_id WHERE i.id = ?',
    )
    .get(itemId) as { name: string; board_id: number; workspace_id: number } | undefined;
  if (!row || boardAccess(ctx.db, ctx.user, row.board_id) === 'none') return `item #${itemId}`;
  return row.name;
}

function groupName(ctx: ToolContext, groupId: number): string {
  const row = ctx.db
    .prepare(
      'SELECT g.title, g.board_id, b.workspace_id FROM item_groups g JOIN boards b ON b.id = g.board_id WHERE g.id = ?',
    )
    .get(groupId) as { title: string; board_id: number; workspace_id: number } | undefined;
  if (!row || boardAccess(ctx.db, ctx.user, row.board_id) === 'none') return `group #${groupId}`;
  return row.title;
}

export const TOOLS: AiTool[] = [
  {
    name: 'list_workspaces_and_boards',
    description: 'List the workspaces and boards the user can read.',
    parameters: { type: 'object', properties: {} },
    mutates: false,
    describe: () => 'List workspaces and boards',
    run: (_args, ctx) => {
      return listWorkspacesForUser(ctx.db, ctx.user).map((workspace) => ({
        workspaceId: workspace.id,
        workspace: workspace.name,
        boards: workspace.boards.map((board) => ({ id: board.id, name: board.name })),
      }));
    },
  },
  {
    name: 'get_board',
    description: 'Read a board with its columns, groups and item count.',
    parameters: {
      type: 'object',
      properties: { boardId: { type: 'number', description: 'Board id' } },
      required: ['boardId'],
    },
    mutates: false,
    describe: (args, ctx) => `Read board "${boardName(ctx, args.boardId)}"`,
    run: (args, ctx) => {
      const full = getBoardFull(ctx.db, ctx.user, args.boardId);
      const items = listItems(ctx.db, ctx.user, args.boardId);
      return {
        id: full.board.id,
        name: full.board.name,
        description: full.board.description,
        columns: full.columns.map((column) => ({
          id: column.id,
          title: column.title,
          type: column.type,
          ...(column.settings.labels ? { labels: column.settings.labels.map((l) => l.name) } : {}),
        })),
        groups: full.groups.map((group) => ({ id: group.id, title: group.title })),
        itemCount: items.length,
      };
    },
  },
  {
    name: 'find_items',
    description: 'Find items by text, group, assignee or status. Requires boardId or query.',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'number' },
        query: { type: 'string' },
        groupId: { type: 'number' },
        assigneeName: { type: 'string' },
        status: { type: 'string' },
        limit: { type: 'number' },
      },
    },
    mutates: false,
    describe: (args) => `Find items${args.query ? ` matching "${args.query}"` : ''}`,
    run: (args, ctx) => {
      const limit = Math.min(50, Number(args.limit) || 25);
      const names = nameMap(ctx.users);
      const output: {
        id: number;
        name: string;
        board: string;
        group: string;
        values: Record<string, string>;
      }[] = [];

      if (args.boardId) {
        const full = getBoardFull(ctx.db, ctx.user, args.boardId);
        const items = listItems(ctx.db, ctx.user, args.boardId);
        const needle = args.query ? String(args.query).toLowerCase() : '';
        for (const item of items) {
          if (args.groupId && item.groupId !== args.groupId) continue;
          const values = readableValues(item, full.columns, names);
          if (needle) {
            const haystack = `${item.name} ${Object.values(values).join(' ')}`.toLowerCase();
            if (!haystack.includes(needle)) continue;
          }
          if (args.assigneeName) {
            const wanted = String(args.assigneeName).toLowerCase();
            const assigned = full.columns
              .filter((c) => c.type === 'people')
              .some((column) => {
                const value = item.values[String(column.id)] as { userIds?: number[] } | undefined;
                return (value?.userIds ?? []).some((id) =>
                  (names.get(id) ?? '').toLowerCase().includes(wanted),
                );
              });
            if (!assigned) continue;
          }
          if (args.status) {
            const wanted = String(args.status).toLowerCase();
            const matches = full.columns
              .filter((c) => c.type === 'status')
              .some((column) => {
                const value = item.values[String(column.id)] as { labelId?: string } | undefined;
                const label = column.settings.labels?.find((l) => l.id === value?.labelId);
                return label?.name.toLowerCase() === wanted;
              });
            if (!matches) continue;
          }
          output.push({
            id: item.id,
            name: item.name,
            board: full.board.name,
            group: full.groups.find((g) => g.id === item.groupId)?.title ?? '',
            values,
          });
          if (output.length >= limit) break;
        }
      } else {
        if (!args.query) throw badRequest('query is required when boardId is missing');
        const found = search(ctx.db, ctx.user, String(args.query));
        for (const hit of found.items) {
          const detail = getItemDto(ctx.db, hit.id);
          const full = getBoardFull(ctx.db, ctx.user, hit.boardId);
          output.push({
            id: detail.id,
            name: detail.name,
            board: hit.boardName,
            group: full.groups.find((g) => g.id === detail.groupId)?.title ?? '',
            values: readableValues(detail, full.columns, names),
          });
          if (output.length >= limit) break;
        }
      }
      return output;
    },
  },
  {
    name: 'get_item',
    description: 'Read one item with readable values, subitems and recent updates.',
    parameters: {
      type: 'object',
      properties: { itemId: { type: 'number' } },
      required: ['itemId'],
    },
    mutates: false,
    describe: (args, ctx) => `Read "${itemName(ctx, args.itemId)}"`,
    run: (args, ctx) => {
      const detail = getItem(ctx.db, ctx.user, args.itemId);
      const full = getBoardFull(ctx.db, ctx.user, detail.board.id);
      const names = nameMap(ctx.users);
      return {
        id: detail.item.id,
        name: detail.item.name,
        board: detail.board.name,
        group: full.groups.find((g) => g.id === detail.item.groupId)?.title ?? '',
        values: readableValues(detail.item, full.columns, names),
        subitems: detail.subitems.map((sub) => ({
          id: sub.id,
          name: sub.name,
          values: readableValues(sub, full.columns, names),
        })),
        updates: listItemUpdates(ctx.db, args.itemId)
          .slice(-20)
          .map((update) => ({
            author: update.authorId ? (names.get(update.authorId) ?? 'Someone') : 'Tuesday AI',
            body: update.body,
            createdAt: update.createdAt,
          })),
      };
    },
  },
  {
    name: 'list_people',
    description: 'List active people in the organisation.',
    parameters: { type: 'object', properties: {} },
    mutates: false,
    describe: () => 'List people',
    run: (_args, ctx) =>
      ctx.users
        .filter((user) => user.isActive)
        .map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          title: user.title,
          role: user.role,
        })),
  },
  {
    name: 'create_item',
    description: 'Create an item on a board, optionally with values by column title.',
    parameters: {
      type: 'object',
      properties: {
        boardId: { type: 'number' },
        name: { type: 'string' },
        groupId: { type: 'number' },
        values: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['boardId', 'name'],
    },
    mutates: true,
    describe: (args, ctx) => `Create item "${args.name}" on ${boardName(ctx, args.boardId)}`,
    run: (args, ctx) => {
      const full = getBoardFull(ctx.db, ctx.user, args.boardId);
      const groupId = args.groupId ?? full.groups[0]?.id;
      if (!groupId) throw notFound('Board has no groups');
      const values = buildValues(args.values, full.columns, ctx.users, ctx);
      const item = createItem(
        ctx.db,
        ctx.user,
        args.boardId,
        { groupId, name: String(args.name), values },
        'ai',
      );
      return { id: item.id, name: item.name };
    },
  },
  {
    name: 'update_item',
    description: 'Rename an item or set values by column title.',
    parameters: {
      type: 'object',
      properties: {
        itemId: { type: 'number' },
        name: { type: 'string' },
        values: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['itemId'],
    },
    mutates: true,
    describe: (args, ctx) => {
      const parts: string[] = [];
      if (args.name) parts.push(`Rename to "${args.name}"`);
      for (const [title, value] of Object.entries(args.values ?? {})) {
        parts.push(`Set ${title} to ${String(value)}`);
      }
      return `${parts.join('; ') || 'Update'} on "${itemName(ctx, args.itemId)}"`;
    },
    run: (args, ctx) => {
      const detail = getItem(ctx.db, ctx.user, args.itemId);
      const full = getBoardFull(ctx.db, ctx.user, detail.board.id);
      if (args.name) {
        updateItem(ctx.db, ctx.user, args.itemId, { name: String(args.name) }, 'ai');
      }
      const values = buildValues(args.values, full.columns, ctx.users, ctx);
      for (const [columnId, value] of Object.entries(values)) {
        setValue(ctx.db, ctx.user, args.itemId, Number(columnId), value, 'ai');
      }
      const updated = getItemDto(ctx.db, args.itemId);
      return { id: updated.id, name: updated.name };
    },
  },
  {
    name: 'move_item',
    description: 'Move an item to another group.',
    parameters: {
      type: 'object',
      properties: { itemId: { type: 'number' }, groupId: { type: 'number' } },
      required: ['itemId', 'groupId'],
    },
    mutates: true,
    describe: (args, ctx) =>
      `Move "${itemName(ctx, args.itemId)}" to ${groupName(ctx, args.groupId)}`,
    run: (args, ctx) => {
      const updated = updateItem(ctx.db, ctx.user, args.itemId, { groupId: args.groupId }, 'ai');
      return { id: updated.id, groupId: updated.groupId };
    },
  },
  {
    name: 'post_update',
    description: 'Post an update on an item as AI.',
    parameters: {
      type: 'object',
      properties: { itemId: { type: 'number' }, body: { type: 'string' } },
      required: ['itemId', 'body'],
    },
    mutates: true,
    describe: (args, ctx) => `Post an update on "${itemName(ctx, args.itemId)}"`,
    run: (args, ctx) => {
      const update = postUpdate(ctx.db, ctx.user, args.itemId, String(args.body), undefined, 'ai');
      return { id: update.id };
    },
  },
  {
    name: 'create_dashboard',
    description: 'Create a dashboard from a plain-language prompt in a workspace.',
    parameters: {
      type: 'object',
      properties: { workspaceId: { type: 'number' }, prompt: { type: 'string' } },
      required: ['workspaceId', 'prompt'],
    },
    mutates: true,
    describe: (args) => `Create dashboard from "${String(args.prompt ?? '')}"`,
    run: () => ({ pending: true }),
  },
  {
    name: 'create_group',
    description: 'Create a group at the bottom of a board.',
    parameters: {
      type: 'object',
      properties: { boardId: { type: 'number' }, title: { type: 'string' } },
      required: ['boardId', 'title'],
    },
    mutates: true,
    describe: (args, ctx) => `Create group "${args.title}" on ${boardName(ctx, args.boardId)}`,
    run: (args, ctx) => {
      const group = createGroup(ctx.db, ctx.user, args.boardId, {
        title: String(args.title),
        at: 'bottom',
      });
      return { id: group.id, title: group.title };
    },
  },
  {
    name: 'search_docs',
    description: 'Search organisation docs and return matching titles and snippets.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    },
    mutates: false,
    describe: (args) => `Search docs for "${args.query}"`,
    run: (args, ctx) =>
      searchDocs(ctx.db, ctx.user, String(args.query), Math.min(20, Number(args.limit) || 10)),
  },
  {
    name: 'get_doc',
    description: 'Read a doc by id (first 20,000 characters).',
    parameters: {
      type: 'object',
      properties: { docId: { type: 'number' } },
      required: ['docId'],
    },
    mutates: false,
    describe: (args) => `Read doc ${args.docId}`,
    run: (args, ctx) => {
      const doc = getDoc(ctx.db, ctx.user, args.docId);
      return {
        id: doc.id,
        title: doc.title,
        content: doc.content.slice(0, 20000),
        updatedAt: doc.updatedAt,
      };
    },
  },
  {
    name: 'create_doc',
    description: 'Create a workspace doc (Markdown).',
    parameters: {
      type: 'object',
      properties: {
        workspaceId: { type: 'number' },
        title: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['workspaceId', 'title', 'content'],
    },
    mutates: true,
    describe: (args) => `Create doc "${args.title}"`,
    run: (args, ctx) => {
      const doc = createDoc(ctx.db, ctx.user, {
        workspaceId: args.workspaceId,
        title: String(args.title),
        content: String(args.content),
      });
      return { id: doc.id, title: doc.title };
    },
  },
  {
    name: 'create_automation',
    description: 'Create a board automation from a plain-English draft.',
    parameters: {
      type: 'object',
      properties: { boardId: { type: 'number' }, draft: { type: 'object' } },
      required: ['boardId', 'draft'],
    },
    mutates: true,
    describe: (args) => `Create automation "${args.draft?.name ?? 'Untitled'}"`,
    run: (args, ctx) => {
      const resolved = resolveAutomationDraft({ db: ctx.db }, ctx.user, args.boardId, args.draft);
      const automation = createAutomation(ctx.db, ctx.user, args.boardId, resolved.input);
      return { id: automation.id, name: automation.name, description: resolved.description };
    },
  },
  {
    name: 'search_knowledge',
    description:
      'Search organisation memory across items, updates and docs. Use it for past decisions, discussions and notes.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        boardId: { type: 'number' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
    mutates: false,
    describe: (args) => `Search memory for "${args.query}"`,
    run: (args, ctx) => {
      if (args.boardId) assertBoardAccess(ctx.db, ctx.user, args.boardId, 'view');
      return searchKnowledgeKeyword(
        { db: ctx.db } as never,
        ctx.user,
        String(args.query),
        Math.min(20, Number(args.limit) || 8),
      ).map((hit) => ({
        ...hit,
        line: `${hit.sourceKind === 'doc' ? `[[doc:${hit.docId}]]` : `[[item:${hit.itemId}]]`} ${hit.title}: ${hit.snippet}`,
      }));
    },
  },
  {
    name: 'get_risks',
    description: 'List overdue, stuck, unassigned-soon and overloaded work on readable boards.',
    parameters: {
      type: 'object',
      properties: { boardIds: { type: 'array', items: { type: 'number' } } },
    },
    mutates: false,
    describe: () => 'Read project risks',
    run: (args, ctx) => {
      const report = getRisks(ctx.db, ctx.user, args.boardIds);
      return { counts: report.counts, lines: riskLines(report) };
    },
  },
  {
    name: 'get_my_work',
    description: "Read the user's assigned work, grouped by due bucket.",
    parameters: {
      type: 'object',
      properties: { includeDone: { type: 'boolean' } },
    },
    mutates: false,
    describe: () => 'Read my work',
    run: (args, ctx) => {
      const entries = getMyWork(ctx.db, ctx.user, Boolean(args.includeDone));
      const names = nameMap(ctx.users);
      const fullByBoard = new Map<number, ReturnType<typeof getBoardFull>>();
      const grouped: Record<string, unknown[]> = {};
      for (const entry of entries) {
        let full = fullByBoard.get(entry.board.id);
        if (!full) {
          full = getBoardFull(ctx.db, ctx.user, entry.board.id);
          fullByBoard.set(entry.board.id, full);
        }
        const statusColumn = full.columns.find((column) => column.id === entry.statusColumnId);
        const status = statusColumn
          ? cellToText(
              statusColumn.type,
              statusColumn.settings,
              entry.item.values[String(statusColumn.id)] as CellValue | undefined,
              (id) => names.get(id) ?? '',
            )
          : '';
        (grouped[entry.bucket] ??= []).push({
          id: entry.item.id,
          name: entry.item.name,
          board: entry.board.name,
          group: entry.groupTitle,
          dueDate: entry.dueDate,
          status,
          done: entry.isDone,
        });
      }
      return grouped;
    },
  },
  {
    name: 'get_recent_activity',
    description: 'Read recent activity on boards the user can read.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', minimum: 1, maximum: 14 },
        boardId: { type: 'number' },
      },
    },
    mutates: false,
    describe: (args) => `Read activity from the last ${args.days ?? 7} days`,
    run: (args, ctx) => {
      const days = Math.min(14, Math.max(1, Number(args.days) || 7));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const names = nameMap(ctx.users);
      let boards: { id: number; name: string }[];
      if (args.boardId) {
        const full = getBoardFull(ctx.db, ctx.user, args.boardId);
        boards = [{ id: full.board.id, name: full.board.name }];
      } else {
        boards = listWorkspacesForUser(ctx.db, ctx.user).flatMap((workspace) =>
          workspace.boards.map((board) => ({ id: board.id, name: board.name })),
        );
      }
      const rows: {
        board: string;
        itemId: number | null;
        actor: string | null;
        summary: string;
        createdAt: string;
      }[] = [];
      for (const board of boards) {
        for (const activity of listBoardActivity(ctx.db, board.id, undefined, 100)) {
          if (activity.createdAt < since) continue;
          rows.push({
            board: board.name,
            itemId: activity.itemId,
            actor: activity.actorId ? (names.get(activity.actorId) ?? 'Someone') : null,
            summary: describeActivity(activity),
            createdAt: activity.createdAt,
          });
        }
      }
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return rows.slice(0, 100);
    },
  },
];

export function toolsFor(user: User): AiTool[] {
  return TOOLS.filter((tool) => (user.role === 'viewer' ? !tool.mutates : true));
}

export function toToolDefs(tools: AiTool[]): ToolDef[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function runTool(
  name: string,
  argsJson: string,
  ctx: ToolContext,
): { ok: boolean; result: unknown; summary: string } {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) return { ok: false, result: { error: 'Unknown tool' }, summary: 'Unknown tool' };
  let args: any;
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    return {
      ok: false,
      result: { error: 'Invalid tool arguments' },
      summary: 'Invalid tool arguments',
    };
  }
  try {
    if (tool.mutates && ctx.user.role === 'viewer') {
      return { ok: false, result: { error: 'Viewers cannot change data' }, summary: 'Forbidden' };
    }
    const result = tool.run(args, ctx);
    let summary = tool.name;
    try {
      summary = tool.describe(args, ctx);
    } catch {}
    return { ok: true, result, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool failed';
    return { ok: false, result: { error: message }, summary: message };
  }
}

export type { BoardDraft };
