import { statfs as defaultStatfs } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AiStatus } from '../../shared/ai';
import { getSetting, getOrg } from './settings';

export interface DeepHealth {
  ok: boolean;
  version: string;
  uptimeSec: number;
  problems: string[];
  checks: {
    db: { ok: boolean; quickCheck: string; sizeBytes: number; walBytes: number };
    disk: { ok: boolean; freeBytes: number; minFreeBytes: number };
    queue: {
      ok: boolean;
      queued: number;
      running: number;
      failedLast24h: number;
      oldestQueuedSec: number;
    };
    backups: {
      ok: boolean;
      lastLocalAt: string | null;
      lastOffsiteAt: string | null;
      offsiteConfigured: boolean;
    };
    mail: { mode: 'smtp' | 'fake' | 'off'; lastError: string | null };
    ai: { usable: boolean };
    push: { configured: boolean; subscriptions: number };
  };
}

let quickCache: { at: number; value: string } | null = null;

export async function deepHealth(
  app: FastifyInstance,
  statfs: typeof defaultStatfs = defaultStatfs,
): Promise<DeepHealth> {
  const problems: string[] = [];
  if (!quickCache || Date.now() - quickCache.at > 10 * 60 * 1000) {
    const row = app.db.prepare('PRAGMA quick_check').get() as { quick_check: string };
    quickCache = { at: Date.now(), value: row.quick_check };
  }
  const quickCheck = quickCache.value;
  const dbOk = quickCheck === 'ok';
  if (!dbOk) problems.push('The database quick check failed.');
  const page = app.db.prepare('PRAGMA page_count').get() as { page_count: number };
  const size = app.db.prepare('PRAGMA page_size').get() as { page_size: number };
  let walBytes = 0;
  try {
    walBytes = (await import('node:fs')).statSync(`${app.config.databasePath}-wal`).size;
  } catch {}

  const stats = await statfs(path.dirname(app.config.databasePath)).catch(() => null);
  const freeBytes = stats ? Number(stats.bavail) * Number(stats.bsize) : 0;
  const minFreeBytes = 1024 * 1024 * 1024;
  const diskOk = freeBytes >= minFreeBytes;
  if (!diskOk) problems.push('Less than 1 GiB of disk space is free.');

  const queued = app.db.prepare("SELECT count(*) AS n FROM jobs WHERE status = 'queued'").get() as {
    n: number;
  };
  const running = app.db
    .prepare("SELECT count(*) AS n FROM jobs WHERE status = 'running'")
    .get() as {
    n: number;
  };
  const failed = app.db
    .prepare("SELECT count(*) AS n FROM jobs WHERE status = 'failed' AND updated_at >= ?")
    .get(new Date(Date.now() - 86400000).toISOString()) as { n: number };
  const oldest = app.db
    .prepare("SELECT min(run_after) AS at FROM jobs WHERE status = 'queued'")
    .get() as { at: string | null };
  const oldestQueuedSec = oldest.at
    ? Math.max(0, Math.round((Date.now() - new Date(oldest.at).getTime()) / 1000))
    : 0;
  const queueOk = oldestQueuedSec <= 900;
  if (!queueOk) problems.push('A queued job has been waiting for more than 15 minutes.');

  const lastLocalAt = getSetting<string>(app.db, 'scheduler:last:backup', '') || null;
  const lastOffsite = app.db
    .prepare("SELECT max(uploaded_at) AS at FROM offsite_backups WHERE status = 'uploaded'")
    .get() as { at: string | null };
  const offsiteConfigured = Boolean(app.config.offsite);
  const backupsOk =
    (app.config.backupKeep <= 0 ||
      !lastLocalAt ||
      Date.now() - new Date(lastLocalAt).getTime() <= 36 * 3600_000) &&
    (!offsiteConfigured ||
      !lastOffsite.at ||
      Date.now() - new Date(lastOffsite.at).getTime() <= 36 * 3600_000);
  if (!backupsOk) problems.push('The last backup is more than 36 hours old.');

  const lastError = app.db
    .prepare("SELECT error FROM email_log WHERE status = 'failed' ORDER BY id DESC LIMIT 1")
    .get() as { error: string | null } | undefined;
  const ai = app.ai.status() as AiStatus;
  const pushConfigured =
    Boolean(app.config.push) || Boolean(getSetting(app.db, 'push:vapid', null));
  const subscriptions = app.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get() as {
    n: number;
  };
  if (problems.length === 0) {
    // org lookup is intentionally unused; keeps the check tied to the configured org.
    void getOrg(app.db);
  }
  return {
    ok: problems.length === 0,
    version: '0.1.0',
    uptimeSec: Math.round(process.uptime()),
    problems,
    checks: {
      db: { ok: dbOk, quickCheck, sizeBytes: page.page_count * size.page_size, walBytes },
      disk: { ok: diskOk, freeBytes, minFreeBytes },
      queue: {
        ok: queueOk,
        queued: queued.n,
        running: running.n,
        failedLast24h: failed.n,
        oldestQueuedSec,
      },
      backups: {
        ok: backupsOk,
        lastLocalAt,
        lastOffsiteAt: lastOffsite.at,
        offsiteConfigured,
      },
      mail: {
        mode: app.mailer.mode,
        lastError: lastError?.error ?? null,
      },
      ai: { usable: ai.usable },
      push: { configured: pushConfigured, subscriptions: subscriptions.n },
    },
  };
}
