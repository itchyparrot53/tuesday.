import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { COLUMN_TYPES, type ColumnType } from '../../shared/columns';
import { parseFormula, columnRefs } from '../../shared/formula';
import type { FilterOp, ViewSettings } from '../../shared/types';
import { assertBoardAccess } from '../services/permissions';
import { getBoardFull } from '../services/boards';
import { getOrg } from '../services/settings';
import { zonedParts } from '../lib/timezone';
import { listUsers } from '../services/users';
import { generateStructured } from '../ai/structured';
import { badRequest } from '../lib/errors';
import { getRisks, riskLines } from '../services/risks';
import { dashboardDraft, viewDraft, previewWidgets } from '../services/ai-builders';
import { dashboardInputSchema } from '../../shared/dashboards';

const FILTER_OPS: FilterOp[] = ['is', 'is_not', 'contains', 'is_empty', 'is_not_empty', 'gt', 'lt'];

const filterSchema = z.object({
  filters: z
    .array(
      z.object({
        columnId: z.number(),
        op: z.enum(FILTER_OPS as [FilterOp, ...FilterOp[]]),
        value: z.union([z.string(), z.number(), z.null()]),
      }),
    )
    .max(20),
  sort: z
    .object({ columnId: z.union([z.number(), z.literal('name')]), dir: z.enum(['asc', 'desc']) })
    .nullable(),
  search: z.string().max(200),
  personUserId: z.number().nullable(),
  explanation: z.string().max(300),
});

const formulaSchema = z.object({
  formula: z.string().min(1).max(1000),
  explanation: z.string().max(300),
});

const suggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        type: z.string(),
        settings: z.record(z.unknown()).optional(),
        reason: z.string().max(200),
      }),
    )
    .max(5),
});

export async function aiHelpersRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/ai/dashboard-draft', async (req) => {
    const body = z
      .object({
        workspaceId: z.number().int().positive(),
        prompt: z.string().trim().min(1).max(1000),
        boardIds: z.array(z.number().int().positive()).max(20).optional(),
      })
      .parse(req.body);
    return {
      draft: await dashboardDraft(app, req.user!, body.workspaceId, body.prompt, body.boardIds),
    };
  });

  app.post('/api/dashboards/preview', async (req) => {
    const body = z
      .object({
        boardIds: z.array(z.number().int().positive()).min(1).max(20),
        widgets: z.array(z.any()).max(30),
      })
      .parse(req.body) as {
      boardIds: number[];
      widgets: import('../../shared/dashboards').Widget[];
    };
    return { data: await previewWidgets(app, req.user!, body.boardIds, body.widgets) };
  });

  app.post('/api/boards/:id/ai-view', async (req) => {
    const boardId = Number((req.params as { id: string }).id);
    const body = z.object({ prompt: z.string().trim().min(1).max(1000) }).parse(req.body);
    return { draft: await viewDraft(app, req.user!, boardId, body.prompt) };
  });

  app.get('/api/risks', async (req) => {
    const query = req.query as { boardIds?: string };
    const boardIds = query.boardIds
      ? query.boardIds
          .split(',')
          .map(Number)
          .filter((id) => Number.isInteger(id) && id > 0)
      : undefined;
    return getRisks(app.db, req.user!, boardIds);
  });

  app.post('/api/risks/explain', async (req) => {
    const body = z
      .object({ boardIds: z.array(z.number().int().positive()).optional() })
      .parse(req.body ?? {});
    const report = getRisks(app.db, req.user!, body.boardIds);
    if (!report.signals.length) return { text: 'No risks need attention right now.' };
    const route = app.ai.modelFor('risk_insight');
    const result = await app.ai.chat(req.user!.id, 'risk_insight', {
      model: route.model,
      max_tokens: 220,
      messages: [
        {
          role: 'system',
          content:
            'You explain project risks. Write at most 120 words, cite items as [[item:ID]], and do not invent ids.',
        },
        { role: 'user', content: riskLines(report).join('\n') },
      ],
    });
    return { text: result.content };
  });

  app.post('/api/boards/:id/ai-filter', async (req) => {
    const boardId = Number((req.params as { id: string }).id);
    assertBoardAccess(app.db, req.user!, boardId, 'view');
    const body = z.object({ text: z.string().trim().min(1).max(300) }).parse(req.body);
    const full = getBoardFull(app.db, req.user!, boardId);
    const users = listUsers(app.db);
    const org = getOrg(app.db);
    const today = zonedParts(new Date(), org.timezone).date;
    const columns = full.columns.map((column) => ({
      id: column.id,
      title: column.title,
      type: column.type,
      labels: column.settings.labels?.map((label) => ({ id: label.id, name: label.name })),
      options: column.settings.options?.map((option) => ({ id: option.id, name: option.name })),
    }));
    const draft = await generateStructured(app, {
      userId: req.user!.id,
      feature: 'nl_filter',
      system:
        'You turn a request into board filters. Today is ' +
        `${today}. Allowed ops: ${FILTER_OPS.join(', ')}. Columns: ${JSON.stringify(columns)}. ` +
        `People: ${JSON.stringify(users.map((user) => ({ id: user.id, name: user.name })))}. ` +
        'Reply with JSON {"filters":[{"columnId":number,"op":"...","value":...}],"sort":null,"search":"","personUserId":null,"explanation":"..."}. Use real ids only.',
      user: body.text,
      schema: filterSchema,
      validate: (value) => {
        for (const filter of value.filters) {
          const column = full.columns.find((entry) => entry.id === filter.columnId);
          if (!column) return `Unknown column ${filter.columnId}`;
          if ((column.type === 'status' || column.type === 'dropdown') && filter.op) {
            const ids = [
              ...(column.settings.labels ?? []).map((label) => label.id),
              ...(column.settings.options ?? []).map((option) => option.id),
            ];
            if (
              !['is_empty', 'is_not_empty'].includes(filter.op) &&
              !ids.includes(String(filter.value))
            ) {
              return `Unknown option for ${column.title}`;
            }
          }
          if (column.type === 'people' && !['is_empty', 'is_not_empty'].includes(filter.op)) {
            if (!users.some((user) => user.id === Number(filter.value))) {
              return `Unknown person for ${column.title}`;
            }
          }
          if (
            (column.type === 'date' || column.type === 'timeline') &&
            ['gt', 'lt', 'is'].includes(filter.op)
          ) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(filter.value)))
              return 'Dates must be YYYY-MM-DD';
          }
        }
        if (value.sort) {
          const column = full.columns.find((entry) => entry.id === value.sort!.columnId);
          if (value.sort.columnId !== 'name' && !column) return 'Unknown sort column';
        }
        if (value.personUserId !== null && !users.some((user) => user.id === value.personUserId)) {
          return 'Unknown person';
        }
        return null;
      },
    });
    const wantsMe = /\b(me|my|mine)\b/i.test(body.text);
    const settings: Pick<ViewSettings, 'filters' | 'sort' | 'search' | 'personUserId'> = {
      filters: draft.filters,
      sort: draft.sort,
      search: draft.search ?? '',
      personUserId: draft.personUserId ?? (wantsMe ? req.user!.id : null),
    };
    return { settings, explanation: draft.explanation };
  });

  app.post('/api/boards/:id/ai-formula', async (req) => {
    const boardId = Number((req.params as { id: string }).id);
    assertBoardAccess(app.db, req.user!, boardId, 'manage');
    const body = z.object({ description: z.string().trim().min(1).max(500) }).parse(req.body);
    const full = getBoardFull(app.db, req.user!, boardId);
    const draft = await generateStructured(app, {
      userId: req.user!.id,
      feature: 'formula',
      system:
        'You write Tuesday formulas. Reply with JSON {"formula":"...","explanation":"..."}. ' +
        `Columns: ${JSON.stringify(full.columns.map((column) => ({ title: column.title, type: column.type })))}.`,
      user: body.description,
      schema: formulaSchema,
      validate: (value) => {
        try {
          const ast = parseFormula(value.formula);
          for (const ref of columnRefs(ast)) {
            if (!full.columns.some((column) => column.title === ref))
              return `Unknown column ${ref}`;
          }
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : 'Invalid formula';
        }
      },
    });
    return draft;
  });

  app.post('/api/boards/:id/ai-column-suggestions', async (req) => {
    const boardId = Number((req.params as { id: string }).id);
    assertBoardAccess(app.db, req.user!, boardId, 'manage');
    const full = getBoardFull(app.db, req.user!, boardId);
    const items = app.db
      .prepare('SELECT name FROM items WHERE board_id = ? AND archived_at IS NULL LIMIT 10')
      .all(boardId) as { name: string }[];
    const allowed = COLUMN_TYPES.filter(
      (type) => !['ai', 'formula', 'mirror', 'connect', 'dependency'].includes(type),
    );
    const draft = await generateStructured(app, {
      userId: req.user!.id,
      feature: 'column_suggest',
      system:
        'You suggest useful columns. Reply with JSON {"suggestions":[{"title":"...","type":"...","settings":{},"reason":"..."}]} with at most 5. ' +
        `Board: ${full.board.name}. Description: ${full.board.description}. Groups: ${full.groups.map((group) => group.title).join(', ')}. ` +
        `Existing columns: ${full.columns.map((column) => column.title).join(', ')}. Items: ${items.map((item) => item.name).join(', ')}. ` +
        `Allowed types: ${allowed.join(', ')}.`,
      user: 'Suggest columns for this board.',
      schema: suggestionSchema,
      validate: (value) => {
        if (value.suggestions.length > 5) return 'Too many suggestions';
        for (const suggestion of value.suggestions) {
          if (!allowed.includes(suggestion.type as ColumnType)) return 'Forbidden type';
          if (
            full.columns.some(
              (column) => column.title.toLowerCase() === suggestion.title.toLowerCase(),
            )
          ) {
            return 'Title already exists';
          }
        }
        return null;
      },
    });
    return { suggestions: draft.suggestions };
  });
}
