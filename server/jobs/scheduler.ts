import type { FastifyInstance } from 'fastify';
import type { Automation } from '../../shared/automations';
import { parseJson } from '../lib/json';
import { zonedParts, addDays } from '../lib/timezone';
import { getOrg, getSetting, setSetting } from '../services/settings';
import { purgeOldTrash } from '../services/trash';
import { createBackup, pruneAutomatic } from '../services/backups';
import { uploadBackup } from '../services/offsite';
import { enqueue } from './queue';
import { toAutomation } from '../services/automations';
import { digestTick } from '../services/digest';

interface AutomationRow {
  id: number;
  board_id: number;
  name: string;
  enabled: number;
  trigger: string;
  conditions: string;
  actions: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  run_count: number;
  last_run_at: string | null;
}

function alreadyRan(app: FastifyInstance, dedupeKey: string): boolean {
  return Boolean(
    app.db.prepare('SELECT 1 FROM automation_runs WHERE dedupe_key = ?').get(dedupeKey),
  );
}

function recurringMatches(automation: Automation, parts: ReturnType<typeof zonedParts>): boolean {
  const trigger = automation.trigger;
  if (trigger.type !== 'recurring' || trigger.hour !== parts.hour) return false;
  if (trigger.every === 'day') return true;
  if (trigger.every === 'weekday') return parts.weekday >= 1 && parts.weekday <= 5;
  if (trigger.every === 'week') return parts.weekday === (trigger.weekday ?? 1);
  return parts.dayOfMonth === (trigger.dayOfMonth ?? 1);
}

export function tickOnce(app: FastifyInstance, now: Date): void {
  const org = getOrg(app.db);
  const parts = zonedParts(now, org.timezone);
  const rows = app.db
    .prepare('SELECT * FROM automations WHERE enabled = 1')
    .all() as AutomationRow[];
  const automations = rows.map(toAutomation);

  const lastPurge = getSetting<string>(app.db, 'scheduler:last:purge', '');
  if (parts.hour === 2 && lastPurge !== parts.date) {
    try {
      purgeOldTrash(app.db, 30);
      const auditCutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const emailCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      app.db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(auditCutoff);
      app.db.prepare('DELETE FROM email_log WHERE created_at < ?').run(emailCutoff);
      app.db.pragma('optimize');
    } catch {}
    setSetting(app.db, 'scheduler:last:purge', parts.date);
  }

  try {
    digestTick(app, now);
  } catch {}

  if (parts.hour === app.config.backupHour && app.config.backupKeep > 0) {
    const last = getSetting<string>(app.db, 'scheduler:last:backup', '');
    if (last !== parts.date) {
      setSetting(app.db, 'scheduler:last:backup', parts.date);
      void createBackup(app, true)
        .then(async (backup) => {
          await pruneAutomatic(app.config);
          if (app.config.offsite && backup?.name) await uploadBackup(app, backup.name);
        })
        .catch(() => {});
    }
  }

  for (const automation of automations) {
    const trigger = automation.trigger;

    if (trigger.type === 'recurring') {
      if (!recurringMatches(automation, parts)) continue;
      const dedupeKey = `rec:${automation.id}:${parts.date}`;
      if (alreadyRan(app, dedupeKey)) continue;
      enqueue(
        app.db,
        'automation_run',
        {
          automationId: automation.id,
          itemId: null,
          actorId: null,
          depth: 1,
          dedupeKey,
        },
        { dedupeKey },
      );
      continue;
    }

    if (trigger.type === 'date_passed') {
      if (trigger.hour !== parts.hour) continue;
      const column = app.db
        .prepare('SELECT id, type FROM columns WHERE id = ? AND board_id = ?')
        .get(trigger.columnId, automation.boardId) as { id: number; type: string } | undefined;
      if (!column) continue;
      const items = app.db
        .prepare('SELECT id FROM items WHERE board_id = ? AND archived_at IS NULL')
        .all(automation.boardId) as { id: number }[];
      for (const item of items) {
        const value = app.db
          .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
          .get(item.id, column.id) as { value: string } | undefined;
        if (!value) continue;
        const parsed = parseJson<{ date?: string; from?: string }>(value.value, {});
        const date = column.type === 'date' ? parsed.date : parsed.from;
        if (!date || date >= parts.date) continue;
        const dedupeKey = `passed:${automation.id}:${item.id}:${date}`;
        if (alreadyRan(app, dedupeKey)) continue;
        enqueue(
          app.db,
          'automation_run',
          {
            automationId: automation.id,
            itemId: item.id,
            actorId: null,
            depth: 1,
            dedupeKey,
          },
          { dedupeKey },
        );
      }
      continue;
    }

    if (trigger.type !== 'date_arrives' || trigger.hour !== parts.hour) continue;
    const target = addDays(parts.date, -trigger.offsetDays);
    const column = app.db
      .prepare('SELECT id, type FROM columns WHERE id = ? AND board_id = ?')
      .get(trigger.columnId, automation.boardId) as { id: number; type: string } | undefined;
    if (!column) continue;
    const items = app.db
      .prepare('SELECT id FROM items WHERE board_id = ? AND archived_at IS NULL')
      .all(automation.boardId) as { id: number }[];
    for (const item of items) {
      const value = app.db
        .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
        .get(item.id, column.id) as { value: string } | undefined;
      if (!value) continue;
      const parsed = parseJson<{ date?: string; from?: string }>(value.value, {});
      const date = column.type === 'date' ? parsed.date : parsed.from;
      if (date !== target) continue;
      const dedupeKey = `date:${automation.id}:${item.id}:${parts.date}`;
      if (alreadyRan(app, dedupeKey)) continue;
      enqueue(
        app.db,
        'automation_run',
        {
          automationId: automation.id,
          itemId: item.id,
          actorId: null,
          depth: 1,
          dedupeKey,
        },
        { dedupeKey },
      );
    }
  }
}

export function startScheduler(
  app: FastifyInstance,
  options: { intervalMs?: number } = {},
): () => void {
  const timer = setInterval(() => {
    try {
      tickOnce(app, new Date());
    } catch {}
  }, options.intervalMs ?? 60_000);
  return () => clearInterval(timer);
}
