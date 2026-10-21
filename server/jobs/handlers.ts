import type { FastifyInstance } from 'fastify';
import type { Action, Automation, Condition } from '../../shared/automations';
import { matchFilter } from '../../shared/filters';
import { getAutomationForRun, recordRun } from '../services/automations';
import { executeActions } from '../automations/actions';
import { getBoardFull, getBoardRow } from '../services/boards';
import { getItemDto } from '../services/items';
import { assertBoardAccess } from '../services/permissions';
import { getUserById, listUsers } from '../services/users';
import { logActivity } from '../services/activity';
import { bus } from '../realtime/bus';
import { AI_COLUMN_HANDLERS } from './ai-column';
import { deliverWebhook } from '../services/webhooks';
import type { JobHandler } from './worker';
import { enqueue } from './queue';
import { getNotificationPrefs } from '../services/notify-prefs';
import { queueEmail } from '../services/email';
import { notificationEmail } from '../email/templates';
import { buildUnsubscribeUrl } from '../services/unsubscribe';
import { sendDigest } from '../services/digest';
import { sendPush } from '../services/push';
import { metrics } from '../services/metrics';
import { indexSource, embedPending, runBackfill } from '../knowledge/indexer';
import { runWorkflowJob } from '../workflows/runner';

export interface AutomationJobPayload {
  automationId: number;
  itemId: number | null;
  actorId: number | null;
  depth: number;
  activityId?: number;
  dedupeKey?: string;
}

function disable(app: FastifyInstance, id: number): void {
  app.db
    .prepare('UPDATE automations SET enabled = 0, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
}

export async function runAutomationJob(
  app: FastifyInstance,
  payload: AutomationJobPayload,
): Promise<void> {
  const automation = getAutomationForRun(app.db, payload.automationId);
  if (!automation || !automation.enabled) return;

  if (payload.itemId) {
    const item = app.db
      .prepare('SELECT id, archived_at FROM items WHERE id = ?')
      .get(payload.itemId) as { id: number; archived_at: string | null } | undefined;
    if (!item || item.archived_at) {
      recordRun(app.db, {
        automationId: automation.id,
        itemId: payload.itemId,
        status: 'skipped',
        error: 'Item archived',
        dedupeKey: payload.dedupeKey,
        count: false,
      });
      return;
    }
  }

  const creator = getUserById(app.db, automation.createdBy);
  if (!creator || !creator.isActive) {
    recordRun(app.db, {
      automationId: automation.id,
      itemId: payload.itemId,
      status: 'failed',
      error: 'Automation owner can no longer edit this board',
      dedupeKey: payload.dedupeKey,
    });
    disable(app, automation.id);
    return;
  }

  const board = getBoardRow(app.db, automation.boardId);
  try {
    assertBoardAccess(app.db, creator, board.id, 'manage');
  } catch {
    recordRun(app.db, {
      automationId: automation.id,
      itemId: payload.itemId,
      status: 'failed',
      error: 'Automation owner can no longer edit this board',
      dedupeKey: payload.dedupeKey,
    });
    disable(app, automation.id);
    return;
  }

  if (payload.itemId && automation.conditions.length) {
    const item = getItemDto(app.db, payload.itemId);
    const full = getBoardFull(app.db, creator, automation.boardId);
    const users = listUsers(app.db);
    const names = new Map(users.map((user) => [user.id, user.name]));
    const passed = automation.conditions.every((condition: Condition) => {
      const column = full.columns.find((entry) => entry.id === condition.columnId);
      if (!column) return false;
      return matchFilter(item, column, condition, {
        userName: (id) => names.get(id) ?? '',
        itemName: (id) =>
          (
            app.db.prepare('SELECT name FROM items WHERE id = ?').get(id) as
              { name: string } | undefined
          )?.name ?? `#${id}`,
      });
    });
    if (!passed) {
      const recent = app.db
        .prepare(
          `SELECT count(*) AS n FROM automation_runs
           WHERE automation_id = ? AND item_id = ? AND status = 'skipped'
             AND error = 'Conditions not met' AND created_at >= ?`,
        )
        .get(
          automation.id,
          payload.itemId,
          new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        ) as { n: number };
      if (recent.n === 0) {
        recordRun(app.db, {
          automationId: automation.id,
          itemId: payload.itemId,
          status: 'skipped',
          error: 'Conditions not met',
          dedupeKey: payload.dedupeKey,
          count: false,
        });
      }
      return;
    }
  }

  try {
    await executeActions(
      {
        app,
        automation,
        creator,
        actorId: payload.actorId,
        itemId: payload.itemId,
        depth: payload.depth,
      },
      automation.actions as Action[],
    );
    recordRun(app.db, {
      automationId: automation.id,
      itemId: payload.itemId,
      status: 'success',
      dedupeKey: payload.dedupeKey,
    });
    logActivity(app.db, {
      boardId: automation.boardId,
      itemId: payload.itemId,
      actorId: creator.id,
      actorKind: 'system',
      action: 'automation_ran',
      depth: payload.depth,
      data: { automationId: automation.id, name: automation.name },
    });
    bus.publish({
      event: { type: 'board.changed', boardId: automation.boardId },
      boardId: automation.boardId,
    });
  } catch (err) {
    recordRun(app.db, {
      automationId: automation.id,
      itemId: payload.itemId,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      dedupeKey: payload.dedupeKey,
    });
  }
}

export const JOB_HANDLERS: Record<string, JobHandler> = {
  ...AI_COLUMN_HANDLERS,
  workflow_run: runWorkflowJob as JobHandler,
  email_notification: async (app, payload) => {
    const { userId } = payload as { userId: number };
    const user = getUserById(app.db, userId);
    if (!user || !user.isActive) return;
    const prefs = getNotificationPrefs(app.db, userId);
    const instantKinds = Object.entries(prefs.email)
      .filter(([, pref]) => pref === 'instant')
      .map(([kind]) => kind);
    if (!instantKinds.length) return;
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const rows = app.db
      .prepare(
        `SELECT id, kind, title, body, link, actor_id FROM notifications
         WHERE user_id = ? AND read_at IS NULL AND emailed_at IS NULL AND created_at >= ?
         ORDER BY id`,
      )
      .all(userId, since) as {
      id: number;
      kind: string;
      title: string;
      body: string;
      link: string;
      actor_id: number | null;
    }[];
    const included = rows.filter((row) => instantKinds.includes(row.kind));
    if (!included.length) return;
    const mail = notificationEmail({
      appUrl: app.config.appUrl,
      unsubscribeUrl: buildUnsubscribeUrl(app.db, app.config.appUrl, user.id),
      name: user.name,
      items: included.map((row) => ({
        title: row.title,
        body: row.body,
        link: row.link,
        actorName: row.actor_id ? (getUserById(app.db, row.actor_id)?.name ?? null) : null,
      })),
    });
    queueEmail(app.db, {
      to: user.email,
      userId: user.id,
      kind: 'notification',
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      mode: app.mailer.mode,
    });
    const mark = app.db.prepare('UPDATE notifications SET emailed_at = ? WHERE id = ?');
    const now = new Date().toISOString();
    for (const row of included) mark.run(now, row.id);
  },
  knowledge_index: async (app, payload) => {
    const { kind, id } = payload as { kind: 'item' | 'update' | 'doc'; id: number };
    indexSource(app, kind, id);
  },
  knowledge_embed: async (app) => {
    embedPending(app, 64);
  },
  knowledge_backfill: async (app) => {
    runBackfill(app, 200);
  },
  email_digest: async (app, payload) => {
    const { userId, date } = payload as { userId: number; date: string };
    await sendDigest(app, userId, date);
  },
  push_send: async (app, payload) => {
    const { notificationId } = payload as { notificationId: number };
    const row = app.db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId) as
      | {
          id: number;
          user_id: number;
          kind: string;
          title: string;
          body: string;
          link: string;
          pushed_at: string | null;
        }
      | undefined;
    if (!row || row.pushed_at) return;
    const unread = (
      app.db
        .prepare('SELECT count(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL')
        .get(row.user_id) as { n: number }
    ).n;
    const payloadData = {
      title: row.title,
      body: row.body.slice(0, 140),
      url: row.link,
      tag: `n-${row.id}`,
      unread,
    };
    const urgency = row.kind === 'mention' || row.kind === 'assigned' ? 'high' : 'normal';
    const subscriptions = app.db
      .prepare('SELECT * FROM push_subscriptions WHERE user_id = ?')
      .all(row.user_id) as {
      id: number;
      endpoint: string;
      p256dh: string;
      auth: string;
      failures: number;
      user_id: number;
    }[];
    for (const subscription of subscriptions) {
      const result = await sendPush(app, subscription, payloadData, urgency);
      metrics.push(result);
      if (result === 'gone') {
        app.db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(subscription.id);
      } else if (result === 'failed') {
        if (subscription.failures + 1 >= 5) {
          app.db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(subscription.id);
        } else {
          app.db
            .prepare('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?')
            .run(subscription.id);
        }
      } else {
        app.db
          .prepare('UPDATE push_subscriptions SET failures = 0, last_success_at = ? WHERE id = ?')
          .run(new Date().toISOString(), subscription.id);
      }
    }
    app.db
      .prepare('UPDATE notifications SET pushed_at = ? WHERE id = ?')
      .run(new Date().toISOString(), row.id);
  },
  email_send: async (app, payload) => {
    const data = payload as {
      logId: number;
      to: string;
      subject: string;
      html: string;
      text: string;
      attempt?: number;
    };
    const row = app.db.prepare('SELECT id, status FROM email_log WHERE id = ?').get(data.logId) as
      { id: number; status: string } | undefined;
    if (!row || row.status === 'sent' || row.status === 'skipped') return;
    try {
      const result = await app.mailer.send({
        to: data.to,
        subject: data.subject,
        html: data.html,
        text: data.text,
      });
      app.db
        .prepare(
          "UPDATE email_log SET status = 'sent', message_id = ?, sent_at = ?, error = NULL WHERE id = ?",
        )
        .run(result.messageId, new Date().toISOString(), data.logId);
      metrics.email('sent');
    } catch (error) {
      const attempt = data.attempt ?? 0;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < 2) {
        app.db
          .prepare("UPDATE email_log SET status = 'queued', error = ? WHERE id = ?")
          .run(message, data.logId);
        enqueue(
          app.db,
          'email_send',
          { ...data, attempt: attempt + 1 },
          { delayMs: attempt === 0 ? 60_000 : 300_000 },
        );
        return;
      }
      app.db
        .prepare("UPDATE email_log SET status = 'failed', error = ? WHERE id = ?")
        .run(message, data.logId);
      metrics.email('failed');
    }
  },

  ai_title: async (app, payload) => {
    const { conversationId } = payload as { conversationId: number };
    const conversation = app.db
      .prepare('SELECT id, user_id, title_source FROM ai_conversations WHERE id = ?')
      .get(conversationId) as
      { id: number; user_id: number; title_source: 'auto' | 'user' | 'ai' } | undefined;
    if (!conversation || conversation.title_source !== 'auto') return;
    const firstUser = app.db
      .prepare(
        "SELECT content FROM ai_messages WHERE conversation_id = ? AND role = 'user' ORDER BY id LIMIT 1",
      )
      .get(conversationId) as { content: string } | undefined;
    const firstReply = app.db
      .prepare(
        "SELECT content FROM ai_messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY id LIMIT 1",
      )
      .get(conversationId) as { content: string } | undefined;
    if (!firstUser) return;
    const settings = app.ai.settings();
    const result = await app.ai.chat(conversation.user_id, 'ai_title', {
      model: app.ai.modelFor('ai_title').model,
      messages: [
        {
          role: 'system',
          content:
            'You write a short title (max 6 words, no quotes) for a conversation. Reply with only the title.',
        },
        {
          role: 'user',
          content: `${firstUser.content}\n\n${(firstReply?.content ?? '').slice(0, 500)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 40,
    });
    const title = result.content
      .trim()
      .replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 60);
    if (!title) return;
    const updated = app.db
      .prepare(
        "UPDATE ai_conversations SET title = ?, title_source = 'ai' WHERE id = ? AND title_source = 'auto'",
      )
      .run(title, conversationId);
    if (updated.changes > 0) {
      bus.publish({
        event: { type: 'ai.conversations.changed' },
        userId: conversation.user_id,
      });
    }
  },
  automation_run: async (app, payload) => {
    await runAutomationJob(app, payload as AutomationJobPayload);
  },
  webhook_deliver: async (app, payload) => {
    const data = payload as {
      webhookId: number | null;
      url?: string;
      secret?: string;
      event: string;
      payload: unknown;
    };
    let url = data.url;
    let secret = data.secret;
    if (data.webhookId && !url) {
      const row = app.db
        .prepare('SELECT url, secret, enabled FROM webhooks WHERE id = ?')
        .get(data.webhookId) as { url: string; secret: string; enabled: number } | undefined;
      if (!row || row.enabled !== 1) return;
      url = row.url;
      secret = row.secret;
    }
    if (!url || !secret) return;
    await deliverWebhook(app, {
      webhookId: data.webhookId,
      url,
      secret,
      event: data.event,
      payload: data.payload,
    });
  },
};

export type { Automation };
