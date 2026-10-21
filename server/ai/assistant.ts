import type { FastifyInstance } from 'fastify';
import type { AiContext, AiConversation, AiStreamEvent, AiToolCallView } from '../../shared/ai';
import type { BoardFull, User } from '../../shared/types';
import { conflict, notFound } from '../lib/errors';
import { parseJson } from '../lib/json';
import { getOrg } from '../services/settings';
import { listUsers } from '../services/users';
import { getBoardFull } from '../services/boards';
import { assistantSystemPrompt } from './prompts';
import { buildAttachedContext } from './context';
import { enqueue } from '../jobs/queue';
import { dashboardDraft } from '../services/ai-builders';
import { createDashboard, updateDashboard } from '../services/dashboards';
import { TOOLS, runTool, toToolDefs, toolsFor, type ToolContext } from './tools';
import type { ChatMessage, ChatResult, ToolCall } from './openrouter';

export interface ConversationRow {
  id: number;
  user_id: number;
  title: string;
  board_id: number | null;
  pinned: number;
  context: string;
  title_source: 'auto' | 'user' | 'ai';
  created_at: string;
  updated_at: string;
  preview?: string | null;
}

export interface MessageRow {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  tool_name: string | null;
  status: 'complete' | 'pending_approval' | 'declined';
  created_at: string;
}

const toolMap = new Map(TOOLS.map((tool) => [tool.name, tool]));

function cleanPreview(text: string): string {
  return text
    .replace(/[#*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function previewFor(app: FastifyInstance, conversationId: number): string {
  const row = app.db
    .prepare(
      `SELECT content FROM ai_messages
       WHERE conversation_id = ? AND role IN ('user','assistant') AND content <> ''
       ORDER BY id DESC LIMIT 1`,
    )
    .get(conversationId) as { content: string } | undefined;
  return row ? cleanPreview(row.content) : '';
}

export function parseContext(raw: string | null | undefined): AiContext {
  const parsed = parseJson<Partial<AiContext>>(raw, {});
  return {
    boardIds: Array.isArray(parsed.boardIds) ? parsed.boardIds : [],
    itemIds: Array.isArray(parsed.itemIds) ? parsed.itemIds : [],
    docIds: Array.isArray(parsed.docIds) ? parsed.docIds : [],
  };
}

export function toConversation(row: ConversationRow): AiConversation {
  return {
    id: row.id,
    title: row.title,
    boardId: row.board_id,
    pinned: row.pinned === 1,
    context: parseContext(row.context),
    titleSource: row.title_source ?? 'auto',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preview: cleanPreview(row.preview ?? ''),
  };
}

export function getConversation(
  app: FastifyInstance,
  user: User,
  conversationId: number,
): ConversationRow {
  const row = app.db.prepare('SELECT * FROM ai_conversations WHERE id = ?').get(conversationId) as
    ConversationRow | undefined;
  if (!row || row.user_id !== user.id) throw notFound('Conversation not found');
  return row;
}

export function loadMessages(app: FastifyInstance, conversationId: number): MessageRow[] {
  return app.db
    .prepare('SELECT * FROM ai_messages WHERE conversation_id = ? ORDER BY id')
    .all(conversationId) as MessageRow[];
}

function toChatMessage(row: MessageRow): ChatMessage | null {
  if (row.role === 'user') return { role: 'user', content: row.content };
  if (row.role === 'assistant') {
    const toolCalls = parseJson<ToolCall[]>(row.tool_calls, []);
    return {
      role: 'assistant',
      content: row.content || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
    };
  }
  if (row.role === 'tool' && row.tool_call_id) {
    return { role: 'tool', tool_call_id: row.tool_call_id, content: row.content };
  }
  return null;
}

function insertMessage(
  app: FastifyInstance,
  conversationId: number,
  message: {
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolCalls?: ToolCall[];
    toolCallId?: string;
    toolName?: string;
    status?: 'complete' | 'pending_approval' | 'declined';
  },
): number {
  const info = app.db
    .prepare(
      `INSERT INTO ai_messages
        (conversation_id, role, content, tool_calls, tool_call_id, tool_name, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      conversationId,
      message.role,
      message.content,
      message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      message.toolCallId ?? null,
      message.toolName ?? null,
      message.status ?? 'complete',
      new Date().toISOString(),
    );
  return Number(info.lastInsertRowid);
}

function touchConversation(app: FastifyInstance, conversationId: number): void {
  app.db
    .prepare('UPDATE ai_conversations SET updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), conversationId);
}

function viewCalls(calls: ToolCall[], ctx: ToolContext): AiToolCallView[] {
  return calls.map((call) => {
    const tool = toolMap.get(call.function.name);
    let description = call.function.name;
    try {
      const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      description = tool?.describe(args, ctx) ?? call.function.name;
    } catch {}
    return {
      id: call.id,
      name: call.function.name,
      description,
      mutates: Boolean(tool?.mutates),
    };
  });
}

async function executeCalls(
  app: FastifyInstance,
  user: User,
  conversationId: number,
  calls: ToolCall[],
  emit: (event: AiStreamEvent) => void,
): Promise<{ call: ToolCall; result: unknown }[]> {
  const ctx: ToolContext = {
    db: app.db,
    user,
    users: listUsers(app.db),
  };
  const results: { call: ToolCall; result: unknown }[] = [];
  for (const call of calls) {
    const tool = toolMap.get(call.function.name);
    let description = call.function.name;
    try {
      const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      description = tool?.describe(args, ctx) ?? call.function.name;
    } catch {}
    emit({
      type: 'tool_start',
      id: call.id,
      name: call.function.name,
      description,
    });
    let result: { ok: boolean; result: unknown; summary: string };
    if (call.function.name === 'create_dashboard') {
      try {
        const args = JSON.parse(call.function.arguments || '{}') as {
          workspaceId: number;
          prompt: string;
        };
        const draft = await dashboardDraft(app, user, args.workspaceId, args.prompt);
        const created = createDashboard(app.db, user, args.workspaceId, draft.name, draft.boardIds);
        updateDashboard(app.db, user, created.id, { widgets: draft.widgets });
        result = {
          ok: true,
          result: {
            id: created.id,
            name: draft.name,
            link: `/dashboards/${created.id}`,
          },
          summary: `Create dashboard "${draft.name}"`,
        };
      } catch (error) {
        result = {
          ok: false,
          result: { error: (error as Error).message },
          summary: (error as Error).message,
        };
      }
    } else {
      result = runTool(call.function.name, call.function.arguments, ctx);
    }
    emit({
      type: 'tool_result',
      id: call.id,
      name: call.function.name,
      ok: result.ok,
      summary: result.summary,
    });
    insertMessage(app, conversationId, {
      role: 'tool',
      content: JSON.stringify(result).slice(0, 12000),
      toolCallId: call.id,
      toolName: call.function.name,
    });
    results.push({ call, result });
  }
  return results;
}

function maybeEnqueueTitle(
  app: FastifyInstance,
  conversationId: number,
  conversation: ConversationRow,
): void {
  if (conversation.title_source !== 'auto') return;
  const assistants = (
    app.db
      .prepare(
        "SELECT count(*) AS n FROM ai_messages WHERE conversation_id = ? AND role = 'assistant'",
      )
      .get(conversationId) as { n: number }
  ).n;
  if (assistants !== 1) return;
  enqueue(app.db, 'ai_title', { conversationId }, { dedupeKey: `ai_title:${conversationId}` });
}

export async function runAssistant(opts: {
  app: FastifyInstance;
  user: User;
  conversationId: number;
  boardId?: number | null;
  emit: (event: AiStreamEvent) => void;
}): Promise<void> {
  const { app, user, conversationId, boardId, emit } = opts;
  const conversation = getConversation(app, user, conversationId);
  const settings = app.ai.settings();
  const rows = loadMessages(app, conversationId);

  let board: BoardFull | null = null;
  const viewing = boardId ?? conversation.board_id;
  if (viewing) {
    try {
      board = getBoardFull(app.db, user, viewing);
    } catch {
      board = null;
    }
  }

  const org = getOrg(app.db);
  const attachedContext = buildAttachedContext(app, user, parseContext(conversation.context));
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: assistantSystemPrompt({ orgName: org.name, user, settings, board, attachedContext }),
    },
  ];
  for (const row of rows) {
    const message = toChatMessage(row);
    if (message) messages.push(message);
  }

  const tools = toToolDefs(toolsFor(user));

  for (let step = 0; step < 8; step++) {
    let final: ChatResult | null = null;
    for await (const chunk of app.ai.stream(user.id, 'assistant', {
      model: app.ai.modelFor('assistant').model,
      messages,
      tools,
      temperature: 0.3,
    })) {
      if (chunk.type === 'text') emit({ type: 'text', delta: chunk.delta });
      else final = chunk.result;
    }
    if (!final) break;

    if (!final.toolCalls.length) {
      const id = insertMessage(app, conversationId, {
        role: 'assistant',
        content: final.content,
        status: 'complete',
      });
      touchConversation(app, conversationId);
      maybeEnqueueTitle(app, conversationId, conversation);
      emit({ type: 'done', messageId: id });
      return;
    }

    const needsApproval =
      settings.requireConfirmation &&
      final.toolCalls.some((call) => toolMap.get(call.function.name)?.mutates);

    const id = insertMessage(app, conversationId, {
      role: 'assistant',
      content: final.content,
      toolCalls: final.toolCalls,
      status: needsApproval ? 'pending_approval' : 'complete',
    });

    if (needsApproval) {
      const ctx: ToolContext = { db: app.db, user, users: listUsers(app.db) };
      maybeEnqueueTitle(app, conversationId, conversation);
      emit({ type: 'approval_required', calls: viewCalls(final.toolCalls, ctx) });
      touchConversation(app, conversationId);
      emit({ type: 'done', messageId: id });
      return;
    }

    messages.push({
      role: 'assistant',
      content: final.content || null,
      tool_calls: final.toolCalls,
    });
    const results = await executeCalls(app, user, conversationId, final.toolCalls, emit);
    for (const entry of results) {
      messages.push({
        role: 'tool',
        tool_call_id: entry.call.id,
        content: JSON.stringify(entry.result).slice(0, 12000),
      });
    }
  }

  const id = insertMessage(app, conversationId, {
    role: 'assistant',
    content: "I stopped after 8 steps. Tell me how you'd like to continue.",
    status: 'complete',
  });
  touchConversation(app, conversationId);
  emit({ type: 'done', messageId: id });
}

export function declinePending(app: FastifyInstance, conversationId: number): void {
  const rows = app.db
    .prepare("SELECT * FROM ai_messages WHERE conversation_id = ? AND status = 'pending_approval'")
    .all(conversationId) as MessageRow[];
  for (const row of rows) {
    app.db.prepare("UPDATE ai_messages SET status = 'declined' WHERE id = ?").run(row.id);
    const calls = parseJson<ToolCall[]>(row.tool_calls, []);
    for (const call of calls) {
      insertMessage(app, conversationId, {
        role: 'tool',
        content: JSON.stringify({
          error: 'The user declined this action. Do not retry it unless they ask.',
        }),
        toolCallId: call.id,
        toolName: call.function.name,
      });
    }
  }
}

export async function decide(opts: {
  app: FastifyInstance;
  user: User;
  conversationId: number;
  approve: boolean;
  emit: (event: AiStreamEvent) => void;
}): Promise<void> {
  const { app, user, conversationId, approve, emit } = opts;
  const conversation = getConversation(app, user, conversationId);
  const row = app.db
    .prepare(
      `SELECT * FROM ai_messages WHERE conversation_id = ? AND status = 'pending_approval'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(conversationId) as MessageRow | undefined;
  if (!row) throw conflict('There is no change waiting for approval');
  const calls = parseJson<ToolCall[]>(row.tool_calls, []);

  if (approve) {
    app.db.prepare("UPDATE ai_messages SET status = 'complete' WHERE id = ?").run(row.id);
    await executeCalls(app, user, conversationId, calls, emit);
  } else {
    app.db.prepare("UPDATE ai_messages SET status = 'declined' WHERE id = ?").run(row.id);
    for (const call of calls) {
      insertMessage(app, conversationId, {
        role: 'tool',
        content: JSON.stringify({
          error: 'The user declined this action. Do not retry it unless they ask.',
        }),
        toolCallId: call.id,
        toolName: call.function.name,
      });
    }
  }

  await runAssistant({
    app,
    user,
    conversationId,
    boardId: conversation.board_id,
    emit,
  });
}
