import type { FastifyInstance } from 'fastify';
import type { EmailLogEntry, EmailStatus } from '../../shared/types';
import { AppError, notFound } from '../lib/errors';
import { isAdmin } from '../services/permissions';
import { queueEmail } from '../services/email';
import { testEmail } from '../email/templates';
import { forbidden } from '../lib/errors';
import { getOrg } from '../services/settings';
import { audit } from '../services/audit';
import { runOnce } from '../jobs/worker';
import { JOB_HANDLERS } from '../jobs/handlers';
import { checkEmailDns } from '../services/email-dns';

export async function emailRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/email', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const lastSent = app.db
      .prepare("SELECT max(sent_at) AS at FROM email_log WHERE status = 'sent'")
      .get() as { at: string | null };
    const lastError = app.db
      .prepare("SELECT error FROM email_log WHERE status = 'failed' ORDER BY id DESC LIMIT 1")
      .get() as { error: string | null } | undefined;
    const status: EmailStatus = {
      mode: app.mailer.mode,
      host: app.config.smtp?.host ?? null,
      port: app.config.smtp?.port ?? null,
      from: app.config.mailFrom || null,
      lastSentAt: lastSent.at,
      lastError: lastError?.error ?? null,
    };
    return status;
  });

  app.post('/api/admin/email/test', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    if (app.mailer.mode === 'off') {
      throw new AppError(503, 'mail_unavailable', 'Email is not configured');
    }
    const org = getOrg(app.db);
    const mail = testEmail({
      appUrl: app.config.appUrl,
      name: req.user!.name,
      host: app.config.smtp?.host ?? 'the fake mailer',
    });
    const logId = queueEmail(app.db, {
      to: req.user!.email,
      userId: req.user!.id,
      kind: 'test',
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      mode: app.mailer.mode,
    });
    void org;
    audit(app.db, req, { action: 'settings.email_test', targetKind: 'email' });
    reply.code(202);
    return { logId };
  });

  app.get('/api/admin/email/log', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const limit = Math.min(200, Math.max(1, Number((req.query as { limit?: string }).limit ?? 50)));
    const rows = app.db.prepare('SELECT * FROM email_log ORDER BY id DESC LIMIT ?').all(limit) as {
      id: number;
      to_address: string;
      kind: string;
      subject: string;
      status: EmailLogEntry['status'];
      error: string | null;
      created_at: string;
      sent_at: string | null;
    }[];
    const entries: EmailLogEntry[] = rows.map((row) => ({
      id: row.id,
      to: row.to_address,
      kind: row.kind,
      subject: row.subject,
      status: row.status,
      error: row.error,
      createdAt: row.created_at,
      sentAt: row.sent_at,
    }));
    return { entries };
  });

  app.post('/api/admin/jobs/run-due', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    if (!app.config.mailFake) throw notFound('Not found');
    const processed = await runOnce(app, JOB_HANDLERS);
    reply.code(202);
    return { processed };
  });

  app.get('/api/admin/email/dns', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const domain = app.config.mailFrom.match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? null;
    return checkEmailDns(domain);
  });

  app.get('/api/admin/email/outbox', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    if (!app.config.mailFake) throw notFound('Not found');
    return { messages: app.mailer.outbox };
  });
}

// Kept at the end so the admin email surface stays grouped.
