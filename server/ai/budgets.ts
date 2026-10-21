import type { Db } from '../db/db';
import type { AiBudget, AiFeature, AiSettings, AiTier } from '../../shared/ai';
import { FEATURE_LABELS } from '../../shared/ai';
import { AppError } from '../lib/errors';
import { listUsers } from '../services/users';
import { bus } from '../realtime/bus';
import { toNotification } from '../services/notifications';
import { queueEmail } from '../services/email';
import { mailModeFromEnv } from '../services/email';

export function monthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function orgSpend(db: Db): number {
  const row = db
    .prepare(
      "SELECT coalesce(sum(cost_usd),0) AS cost FROM ai_usage WHERE status = 'ok' AND created_at >= ?",
    )
    .get(monthStartIso()) as { cost: number };
  return row.cost;
}

export function featureSpend(db: Db, feature: AiFeature): number {
  const row = db
    .prepare(
      "SELECT coalesce(sum(cost_usd),0) AS cost FROM ai_usage WHERE status = 'ok' AND feature = ? AND created_at >= ?",
    )
    .get(feature, monthStartIso()) as { cost: number };
  return row.cost;
}

export function userSpend(db: Db, userId: number): number {
  const row = db
    .prepare(
      "SELECT coalesce(sum(cost_usd),0) AS cost FROM ai_usage WHERE status = 'ok' AND user_id = ? AND created_at >= ?",
    )
    .get(userId, monthStartIso()) as { cost: number };
  return row.cost;
}

export function getBudgets(db: Db): AiBudget[] {
  const rows = db.prepare('SELECT * FROM ai_budgets ORDER BY scope, key').all() as {
    scope: 'user' | 'feature';
    key: string;
    monthly_usd: number;
  }[];
  return rows.map((row) => ({ scope: row.scope, key: row.key, monthlyUsd: row.monthly_usd }));
}

export function budgetLimit(db: Db, scope: 'user' | 'feature', key: string): number | null {
  const row = db
    .prepare('SELECT monthly_usd FROM ai_budgets WHERE scope = ? AND key = ?')
    .get(scope, key) as { monthly_usd: number } | undefined;
  return row ? row.monthly_usd : null;
}

export function setBudget(
  db: Db,
  actorId: number,
  scope: 'user' | 'feature',
  key: string,
  monthlyUsd: number,
): AiBudget[] {
  db.prepare(
    `INSERT INTO ai_budgets (scope, key, monthly_usd, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(scope, key) DO UPDATE SET monthly_usd = excluded.monthly_usd,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).run(scope, key, monthlyUsd, actorId, new Date().toISOString());
  return getBudgets(db);
}

export function removeBudget(db: Db, scope: 'user' | 'feature', key: string): AiBudget[] {
  db.prepare('DELETE FROM ai_budgets WHERE scope = ? AND key = ?').run(scope, key);
  return getBudgets(db);
}

export function personLimit(db: Db, settings: AiSettings, userId: number): number | null {
  const override = budgetLimit(db, 'user', String(userId));
  if (override !== null) return override;
  return settings.defaultUserMonthlyUsd > 0 ? settings.defaultUserMonthlyUsd : null;
}

export function assertBudget(
  db: Db,
  settings: AiSettings,
  userId: number | null,
  feature: AiFeature,
): void {
  if (settings.monthlyBudgetUsd > 0 && orgSpend(db) >= settings.monthlyBudgetUsd) {
    throw new AppError(
      402,
      'ai_budget_exceeded',
      "The organisation's monthly AI budget has been reached.",
    );
  }
  const cap = budgetLimit(db, 'feature', feature);
  if (cap !== null && cap > 0 && featureSpend(db, feature) >= cap) {
    throw new AppError(
      402,
      'ai_budget_exceeded',
      `The monthly AI budget for ${FEATURE_LABELS[feature] ?? feature} has been reached.`,
    );
  }
  if (userId !== null) {
    const limit = personLimit(db, settings, userId);
    if (limit !== null && limit > 0 && userSpend(db, userId) >= limit) {
      throw new AppError(
        402,
        'ai_budget_exceeded',
        `You've reached your AI limit for this month ($${limit.toFixed(2)}). Ask an admin to raise it.`,
      );
    }
  }
}

function notifyBudget(db: Db, userId: number, title: string, body: string, email: boolean): void {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO notifications (user_id, kind, title, body, link, actor_id, created_at)
       VALUES (?, 'ai_budget', ?, ?, '/admin?tab=ai', NULL, ?)`,
    )
    .run(userId, title, body, now);
  const row = db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as {
    id: number;
    user_id: number;
    kind: 'ai_budget';
    title: string;
    body: string;
    link: string;
    actor_id: number | null;
    read_at: string | null;
    created_at: string;
  };
  bus.publish({ event: { type: 'notification', notification: toNotification(row) }, userId });
  if (email && mailModeFromEnv() !== 'off') {
    const user = listUsers(db).find((entry) => entry.id === userId);
    if (user) {
      queueEmail(db, {
        to: user.email,
        userId,
        kind: 'ai_budget',
        subject: title,
        html: `<p>${body}</p><p><a href="/admin?tab=ai">Open AI settings</a></p>`,
        text: `${body}\n\n/admin?tab=ai`,
        mode: mailModeFromEnv(),
      });
    }
  }
}

function maybeAlert(
  db: Db,
  settings: AiSettings,
  scope: 'org' | 'user' | 'feature',
  key: string,
  spend: number,
  limit: number,
): void {
  if (limit <= 0) return;
  const percent = (spend / limit) * 100;
  const level: 80 | 100 | null = percent >= 100 ? 100 : percent >= 80 ? 80 : null;
  if (!level) return;
  const month = monthKey();
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO ai_budget_alerts (scope, key, month, level, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(scope, key, month, level, new Date().toISOString());
  if (info.changes === 0) return;
  const label =
    scope === 'org'
      ? 'the organisation'
      : scope === 'feature'
        ? (FEATURE_LABELS[key as AiFeature] ?? key)
        : 'this person';
  const title = `AI spend reached ${level}% of ${label}`;
  const body = `Month-to-date spend is $${spend.toFixed(2)} of $${limit.toFixed(2)}.`;
  const admins = listUsers(db).filter(
    (user) => user.isActive && (user.role === 'owner' || user.role === 'admin'),
  );
  for (const admin of admins) notifyBudget(db, admin.id, title, body, settings.budgetAlerts);
  if (scope === 'user') {
    const userId = Number(key);
    if (!admins.some((admin) => admin.id === userId)) {
      notifyBudget(db, userId, title, body, settings.budgetAlerts);
    }
  }
}

export function checkAlerts(
  db: Db,
  settings: AiSettings,
  feature: AiFeature,
  userId: number | null,
): void {
  maybeAlert(db, settings, 'org', 'org', orgSpend(db), settings.monthlyBudgetUsd);
  const cap = budgetLimit(db, 'feature', feature);
  if (cap !== null) maybeAlert(db, settings, 'feature', feature, featureSpend(db, feature), cap);
  if (userId !== null) {
    const limit = personLimit(db, settings, userId);
    if (limit !== null) {
      maybeAlert(db, settings, 'user', String(userId), userSpend(db, userId), limit);
    }
  }
}
