import type { FastifyInstance } from 'fastify';
import {
  aiConversationCreateSchema,
  aiConversationPatchSchema,
  aiCreateBoardSchema,
  aiCreateActionsSchema,
  aiDecisionSchema,
  aiExtractActionsSchema,
  aiGenerateAutomationSchema,
  aiGenerateBoardSchema,
  aiMessageSchema,
  aiRunColumnSchema,
  aiBudgetSchema,
  aiSettingsSchema,
  aiSummarizeSchema,
  aiWriteSchema,
} from '../../shared/schemas';
import {
  DEFAULT_ROUTING,
  type AiContext,
  type AiSettings,
  type AiToolCallView,
} from '../../shared/ai';
import type { User } from '../../shared/types';
import { AppError, forbidden, notFound } from '../lib/errors';
import { parseBody, parseId } from '../lib/validate';
import { parseJson } from '../lib/json';
import { isAdmin } from '../services/permissions';
import { createBoardFromDraft, getBoardFull } from '../services/boards';
import { getItem } from '../services/items';
import { getDoc } from '../services/docs';
import {
  assertBoardAccess,
  assertItemAccess,
  assertWriteWorkspace,
  boardIdForItem,
  workspaceIdForBoard,
} from '../services/permissions';
import { getColumnRow } from '../services/columns';
import { getBoardRow } from '../services/boards';
import { enqueueAiForColumn } from '../jobs/ai-enqueue';
import { bus } from '../realtime/bus';
import { badRequest, conflict } from '../lib/errors';
import { listUsers } from '../services/users';
import { audit } from '../services/audit';
import {
  getBudgets,
  monthStartIso,
  personLimit,
  removeBudget,
  setBudget,
  userSpend,
  featureSpend,
  orgSpend,
} from './budgets';
import { FEATURE_LABELS } from '../../shared/ai';
import {
  declinePending,
  decide,
  getConversation,
  loadMessages,
  previewFor,
  runAssistant,
  toConversation,
} from './assistant';
import { TOOLS } from './tools';
import {
  generateAutomation,
  generateBoard,
  summarize,
  write,
  extractActions,
  createActions,
} from './features';
import { startNdjson } from './ndjson';
import type { ToolCall } from './openrouter';

function toolViews(app: FastifyInstance, calls: ToolCall[]): AiToolCallView[] {
  const users = listUsers(app.db);
  return calls.map((call) => {
    const tool = TOOLS.find((candidate) => candidate.name === call.function.name);
    let description = call.function.name;
    try {
      const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      description = tool?.describe(args, { db: app.db, user: users[0], users }) ?? description;
    } catch {}
    return {
      id: call.id,
      name: call.function.name,
      description,
      mutates: Boolean(tool?.mutates),
    };
  });
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function contextFor(
  app: FastifyInstance,
  user: User,
  input?: Partial<AiContext> | null,
): AiContext {
  const boardIds = [...new Set(input?.boardIds ?? [])];
  const itemIds = [...new Set(input?.itemIds ?? [])];
  const docIds = [...new Set(input?.docIds ?? [])];
  for (const id of boardIds) {
    try {
      assertBoardAccess(app.db, user, id, 'view');
    } catch {
      throw badRequest(`Board ${id} is not readable`);
    }
  }
  for (const id of itemIds) {
    try {
      assertItemAccess(app.db, user, id, 'view');
    } catch {
      throw badRequest(`Item ${id} is not readable`);
    }
  }
  for (const id of docIds) {
    try {
      getDoc(app.db, user, id);
    } catch {
      throw badRequest(`Doc ${id} is not readable`);
    }
  }
  return { boardIds, itemIds, docIds };
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/ai/status', async () => app.ai.status());

  app.get('/api/ai/settings', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    return app.ai.settings();
  });

  app.put('/api/ai/settings', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const body = parseBody(aiSettingsSchema, req.body);
    const settings = app.ai.saveSettings({
      ...body,
      routing: { ...DEFAULT_ROUTING, ...body.routing },
    } as AiSettings);
    audit(app.db, req, { action: 'settings.ai_changed', targetKind: 'ai' });
    return settings;
  });

  app.get('/api/ai/models', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    return { models: await app.ai.models() };
  });

  app.post('/api/ai/test', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const settings = app.ai.settings();
    app.ai.assertUsable();
    const result = await app.ai.chat(req.user!.id, 'test', {
      model: app.ai.modelFor('test').model,
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      max_tokens: 10,
    });
    return { ok: true, model: result.model, reply: result.content };
  });

  app.get('/api/ai/usage', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    return app.ai.usageReport();
  });

  app.get('/api/ai/usage/daily', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const days: { date: string; costUsd: number; calls: number }[] = [];
    for (let index = 29; index >= 0; index--) {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() - index);
      const date = day.toISOString().slice(0, 10);
      const row = app.db
        .prepare(
          `SELECT coalesce(sum(cost_usd),0) AS cost, count(*) AS calls FROM ai_usage
           WHERE status = 'ok' AND substr(created_at, 1, 10) = ?`,
        )
        .get(date) as { cost: number; calls: number };
      days.push({ date, costUsd: row.cost, calls: row.calls });
    }
    return { days };
  });

  app.get('/api/ai/usage.csv', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const query = req.query as { month?: string };
    const month =
      query.month && /^\d{4}-\d{2}$/.test(query.month)
        ? query.month
        : new Date().toISOString().slice(0, 7);
    const rows = app.db
      .prepare(
        `SELECT a.created_at, coalesce(u.name,'System') AS user, a.feature, a.tier, a.model,
                a.prompt_tokens, a.completion_tokens, a.cost_usd, a.status
         FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id
         WHERE substr(a.created_at,1,7) = ? ORDER BY a.id`,
      )
      .all(month) as {
      created_at: string;
      user: string;
      feature: string;
      tier: string;
      model: string;
      prompt_tokens: number;
      completion_tokens: number;
      cost_usd: number;
      status: string;
    }[];
    const csv = (value: unknown) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const lines = ['time,user,feature,tier,model,prompt_tokens,completion_tokens,cost_usd,status'];
    for (const row of rows) {
      lines.push(
        [
          row.created_at,
          row.user,
          row.feature,
          row.tier,
          row.model,
          row.prompt_tokens,
          row.completion_tokens,
          row.cost_usd,
          row.status,
        ]
          .map(csv)
          .join(','),
      );
    }
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="ai-usage-${month}.csv"`);
    return lines.join('\n');
  });

  app.get('/api/ai/budgets', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    return { budgets: getBudgets(app.db) };
  });

  app.put('/api/ai/budgets/:scope/:key', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const { scope, key } = req.params as { scope: string; key: string };
    if (scope !== 'user' && scope !== 'feature') throw badRequest('Unknown budget scope');
    if (scope === 'feature' && !FEATURE_LABELS[key as keyof typeof FEATURE_LABELS]) {
      throw badRequest('Unknown feature');
    }
    const body = parseBody(aiBudgetSchema, req.body);
    const budgets = setBudget(app.db, req.user!.id, scope, key, body.monthlyUsd);
    audit(app.db, req, {
      action: 'settings.ai_changed',
      targetKind: 'budget',
      targetLabel: `${scope}:${key}`,
    });
    return { budgets };
  });

  app.delete('/api/ai/budgets/:scope/:key', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const { scope, key } = req.params as { scope: string; key: string };
    if (scope !== 'user' && scope !== 'feature') throw badRequest('Unknown budget scope');
    return { budgets: removeBudget(app.db, scope, key) };
  });

  app.get('/api/me/ai-usage', async (req) => {
    const settings = app.ai.settings();
    const row = app.db
      .prepare(
        "SELECT count(*) AS calls FROM ai_usage WHERE user_id = ? AND status = 'ok' AND created_at >= ?",
      )
      .get(req.user!.id, monthStartIso()) as { calls: number };
    return {
      monthCostUsd: userSpend(app.db, req.user!.id),
      limitUsd: personLimit(app.db, settings, req.user!.id),
      calls: row.calls,
    };
  });

  app.get('/api/ai/conversations', async (req) => {
    const q = String((req.query as { q?: string }).q ?? '').trim();
    const pattern = `%${escapeLike(q)}%`;
    const rows = app.db
      .prepare(
        `SELECT c.*,
           (SELECT m.content FROM ai_messages m
            WHERE m.conversation_id = c.id AND m.role IN ('user','assistant') AND m.content <> ''
            ORDER BY m.id DESC LIMIT 1) AS preview
         FROM ai_conversations c
         WHERE c.user_id = ?
           AND (? = '' OR lower(c.title) LIKE lower(?) ESCAPE '\\'
             OR lower(coalesce((SELECT m.content FROM ai_messages m
                WHERE m.conversation_id = c.id AND m.role IN ('user','assistant') AND m.content <> ''
                ORDER BY m.id DESC LIMIT 1), '')) LIKE lower(?) ESCAPE '\\')
         ORDER BY c.pinned DESC, c.updated_at DESC
         LIMIT 100`,
      )
      .all(req.user!.id, q, pattern, pattern) as Parameters<typeof toConversation>[0][];
    return { conversations: rows.map(toConversation) };
  });

  app.post('/api/ai/conversations', async (req, reply) => {
    const body = parseBody(aiConversationCreateSchema, req.body);
    if (body.boardId) getBoardFull(app.db, req.user!, body.boardId);
    const context = contextFor(app, req.user!, body.context);
    const now = new Date().toISOString();
    const info = app.db
      .prepare(
        `INSERT INTO ai_conversations (user_id, title, board_id, context, created_at, updated_at)
         VALUES (?, 'New chat', ?, ?, ?, ?)`,
      )
      .run(req.user!.id, body.boardId ?? null, JSON.stringify(context), now, now);
    const row = app.db
      .prepare('SELECT * FROM ai_conversations WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as Parameters<typeof toConversation>[0];
    bus.publish({ event: { type: 'ai.conversations.changed' }, userId: req.user!.id });
    reply.code(201);
    return { conversation: toConversation(row) };
  });

  app.patch('/api/ai/conversations/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const user = req.user!;
    const conversation = getConversation(app, user, id);
    const body = parseBody(aiConversationPatchSchema, req.body);
    const sets: string[] = [];
    const values: unknown[] = [];
    if (body.title !== undefined) {
      sets.push('title = ?', "title_source = 'user'");
      values.push(body.title);
    }
    if (body.pinned !== undefined) {
      sets.push('pinned = ?');
      values.push(body.pinned ? 1 : 0);
    }
    if (body.context !== undefined) {
      sets.push('context = ?');
      values.push(JSON.stringify(contextFor(app, user, body.context)));
    }
    if (!sets.length) throw badRequest('Nothing to update');
    if (body.title !== undefined || body.context !== undefined) {
      sets.push('updated_at = ?');
      values.push(new Date().toISOString());
    }
    app.db
      .prepare(`UPDATE ai_conversations SET ${sets.join(', ')} WHERE id = ?`)
      .run(...values, id);
    const row = app.db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(id) as Parameters<
      typeof toConversation
    >[0];
    bus.publish({ event: { type: 'ai.conversations.changed' }, userId: user.id });
    return { conversation: { ...toConversation(row), preview: previewFor(app, id) } };
  });

  app.get('/api/ai/conversations/:id', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const conversation = getConversation(app, req.user!, id);
    const messages = loadMessages(app, id).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      toolCalls: toolViews(app, parseJson<ToolCall[]>(row.tool_calls, [])),
      status: row.status,
      createdAt: row.created_at,
    }));
    return {
      conversation: { ...toConversation(conversation), preview: previewFor(app, id) },
      messages,
    };
  });

  app.delete('/api/ai/conversations/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    const user = req.user!;
    getConversation(app, user, id);
    app.db.prepare('DELETE FROM ai_conversations WHERE id = ?').run(id);
    bus.publish({ event: { type: 'ai.conversations.changed' }, userId: user.id });
    reply.code(204);
    return null;
  });

  app.post('/api/ai/conversations/:id/regenerate', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    const user = req.user!;
    const conversation = getConversation(app, user, id);
    const pending = app.db
      .prepare(
        "SELECT id FROM ai_messages WHERE conversation_id = ? AND status = 'pending_approval' LIMIT 1",
      )
      .get(id);
    if (pending) throw conflict('Resolve the pending change before regenerating');
    const lastUser = app.db
      .prepare("SELECT max(id) AS id FROM ai_messages WHERE conversation_id = ? AND role = 'user'")
      .get(id) as { id: number | null };
    if (!lastUser.id) throw badRequest('There is nothing to regenerate yet');
    app.db
      .prepare(
        "DELETE FROM ai_messages WHERE conversation_id = ? AND id > ? AND role IN ('assistant','tool')",
      )
      .run(id, lastUser.id);
    app.ai.assertUsable(user.id, 'assistant');
    const { emit, end } = startNdjson(reply);
    try {
      await runAssistant({
        app,
        user,
        conversationId: id,
        boardId: conversation.board_id,
        emit,
      });
    } catch (err) {
      emit({
        type: 'error',
        code: err instanceof AppError ? err.code : 'internal',
        message: err instanceof Error ? err.message : 'Something went wrong',
      });
    } finally {
      end();
    }
    return reply;
  });

  app.post('/api/ai/conversations/:id/messages', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    const user = req.user!;
    const conversation = getConversation(app, user, id);
    const body = parseBody(aiMessageSchema, req.body);
    if (body.boardId) getBoardFull(app.db, user, body.boardId);
    app.ai.assertUsable(user.id, 'assistant');

    declinePending(app, id);

    const now = new Date().toISOString();
    app.db
      .prepare(
        `INSERT INTO ai_messages (conversation_id, role, content, status, created_at)
         VALUES (?, 'user', ?, 'complete', ?)`,
      )
      .run(id, body.content, now);
    const userMessages = (
      app.db
        .prepare(
          "SELECT count(*) AS n FROM ai_messages WHERE conversation_id = ? AND role = 'user'",
        )
        .get(id) as { n: number }
    ).n;
    if (userMessages === 1) {
      app.db
        .prepare('UPDATE ai_conversations SET title = ? WHERE id = ?')
        .run(body.content.slice(0, 60), id);
    }
    app.db.prepare('UPDATE ai_conversations SET updated_at = ? WHERE id = ?').run(now, id);

    const { emit, end } = startNdjson(reply);
    try {
      await runAssistant({
        app,
        user,
        conversationId: id,
        boardId: body.boardId ?? conversation.board_id,
        emit,
      });
    } catch (err) {
      emit({
        type: 'error',
        code: err instanceof AppError ? err.code : 'internal',
        message: err instanceof Error ? err.message : 'Something went wrong',
      });
    } finally {
      end();
    }
    return reply;
  });

  app.post('/api/ai/conversations/:id/decision', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    const user = req.user!;
    getConversation(app, user, id);
    const body = parseBody(aiDecisionSchema, req.body);
    app.ai.assertUsable(user.id, 'assistant');
    const { emit, end } = startNdjson(reply);
    try {
      await decide({ app, user, conversationId: id, approve: body.approve, emit });
    } catch (err) {
      emit({
        type: 'error',
        code: err instanceof AppError ? err.code : 'internal',
        message: err instanceof Error ? err.message : 'Something went wrong',
      });
    } finally {
      end();
    }
    return reply;
  });

  app.post('/api/ai/summarize', async (req, reply) => {
    const body = parseBody(aiSummarizeSchema, req.body);
    if (body.kind === 'item') getItem(app.db, req.user!, body.id);
    else if (body.kind === 'doc') getDoc(app.db, req.user!, body.id);
    else getBoardFull(app.db, req.user!, body.id);
    app.ai.assertUsable(req.user!.id, 'summarize');
    const { emit, end } = startNdjson(reply);
    try {
      await summarize(app, req.user!, body.kind, body.id, emit);
    } catch (err) {
      emit({
        type: 'error',
        code: err instanceof AppError ? err.code : 'internal',
        message: err instanceof Error ? err.message : 'Something went wrong',
      });
    } finally {
      end();
    }
    return reply;
  });

  app.post('/api/ai/write', async (req) => {
    const body = parseBody(aiWriteSchema, req.body);
    return { text: await write(app, req.user!, body.text, body.mode) };
  });

  app.post('/api/ai/generate-board', async (req) => {
    const body = parseBody(aiGenerateBoardSchema, req.body);
    assertWriteWorkspace(app.db, req.user!, body.workspaceId);
    return { draft: await generateBoard(app, req.user!, body.workspaceId, body.prompt) };
  });

  app.post('/api/ai/create-board', async (req, reply) => {
    const body = parseBody(aiCreateBoardSchema, req.body);
    assertWriteWorkspace(app.db, req.user!, body.workspaceId);
    const full = createBoardFromDraft(app.db, req.user!, body.workspaceId, body.draft);
    reply.code(201);
    return full;
  });

  app.post('/api/columns/:id/ai-run', async (req) => {
    const id = parseId((req.params as { id: string }).id);
    const column = getColumnRow(app.db, id);
    if (column.type !== 'ai') throw badRequest('Not an AI column');
    const board = getBoardRow(app.db, column.board_id);
    assertBoardAccess(app.db, req.user!, board.id, 'manage');
    const body = parseBody(aiRunColumnSchema, req.body ?? {});
    app.ai.assertUsable();
    const queued = enqueueAiForColumn(app.db, id, req.user!.id, body.itemIds);
    bus.publish({
      event: { type: 'board.changed', boardId: column.board_id },
      boardId: column.board_id,
    });
    return { queued };
  });

  app.post('/api/ai/generate-automation', async (req) => {
    const body = parseBody(aiGenerateAutomationSchema, req.body);
    const board = getBoardRow(app.db, body.boardId);
    assertBoardAccess(app.db, req.user!, board.id, 'manage');
    return await generateAutomation(app, req.user!, body.boardId, body.prompt);
  });

  app.post('/api/ai/extract-actions', async (req) => {
    const body = parseBody(aiExtractActionsSchema, req.body);
    assertBoardAccess(app.db, req.user!, body.boardId, 'manage');
    return { actions: await extractActions(app, req.user!, body.text, body.boardId) };
  });

  app.post('/api/ai/create-actions', async (req, reply) => {
    const body = parseBody(aiCreateActionsSchema, req.body);
    assertBoardAccess(app.db, req.user!, body.boardId, 'manage');
    const result = await createActions(app, req.user!, body);
    reply.code(201);
    return result;
  });
}
