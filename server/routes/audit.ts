import type { FastifyInstance } from 'fastify';
import { toAuditEntry, audit } from '../services/audit';
import { forbidden } from '../lib/errors';
import { isAdmin } from '../services/permissions';

function filters(query: Record<string, string | undefined>) {
  const where: string[] = [];
  const values: unknown[] = [];
  if (query.action) {
    where.push('action LIKE ?');
    values.push(`${query.action}%`);
  }
  if (query.actorId) {
    where.push('actor_id = ?');
    values.push(Number(query.actorId));
  }
  if (query.from) {
    where.push('created_at >= ?');
    values.push(`${query.from}T00:00:00.000Z`);
  }
  if (query.to) {
    where.push('created_at <= ?');
    values.push(`${query.to}T23:59:59.999Z`);
  }
  if (query.before) {
    where.push('id < ?');
    values.push(Number(query.before));
  }
  return { where, values };
}

function csv(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/audit', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const query = req.query as Record<string, string | undefined>;
    const limit = Math.min(200, Math.max(1, Number(query.limit ?? 100)));
    const { where, values } = filters(query);
    const rows = app.db
      .prepare(
        `SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY id DESC LIMIT ?`,
      )
      .all(...values, limit) as Parameters<typeof toAuditEntry>[0][];
    const entries = rows.map(toAuditEntry);
    return {
      entries,
      nextBefore: rows.length === limit ? (rows.at(-1)?.id ?? null) : null,
    };
  });

  app.get('/api/admin/audit.csv', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const query = req.query as Record<string, string | undefined>;
    const { where, values } = filters(query);
    const rows = app.db
      .prepare(
        `SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY id DESC LIMIT 10000`,
      )
      .all(...values) as Parameters<typeof toAuditEntry>[0][];
    const lines = ['time,actor,action,target,ip,user_agent,data'];
    for (const row of rows) {
      const entry = toAuditEntry(row);
      lines.push(
        [
          entry.createdAt,
          entry.actorLabel,
          entry.action,
          `${entry.targetKind ?? ''}${entry.targetId ? `:${entry.targetId}` : ''} ${entry.targetLabel}`.trim(),
          entry.ip,
          entry.userAgent,
          JSON.stringify(entry.data),
        ]
          .map(csv)
          .join(','),
      );
    }
    audit(app.db, req, {
      action: 'data.exported',
      targetKind: 'audit',
      data: { rows: rows.length },
    });
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="tuesday-audit.csv"');
    return lines.join('\n');
  });
}
