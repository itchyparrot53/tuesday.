import type { FastifyInstance } from 'fastify';
import { audit } from '../services/audit';
import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { forbidden } from '../lib/errors';
import { isAdmin } from '../services/permissions';
import { createBackup, backupPath, listBackups, stageRestore } from '../services/backups';
import { listRemote, restoreRemote, uploadBackup } from '../services/offsite';
import { getOrg } from '../services/settings';
import { badRequest } from '../lib/errors';
import { z } from 'zod';

export async function adminDataRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/backups', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    return { backups: listBackups(app.config) };
  });

  app.post('/api/admin/backups', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const backup = await createBackup(app, false);
    audit(app.db, req, {
      action: 'backup.created',
      targetKind: 'backup',
      targetLabel: backup.name,
    });
    reply.code(201);
    return { backup };
  });

  app.get('/api/admin/backups/offsite', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    return {
      configured: Boolean(app.config.offsite),
      encrypted: Boolean(app.config.backupEncryptionKey),
      keep: app.config.offsite?.keep ?? 0,
      backups: listRemote(app),
    };
  });

  app.post('/api/admin/backups/offsite', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    if (!app.config.offsite) throw badRequest('Off-site backups are not configured');
    const body = z.object({ name: z.string().max(300).optional() }).parse(req.body ?? {});
    const name = body.name ?? listBackups(app.config)[0]?.name;
    if (!name) throw badRequest('There is no local backup to upload yet');
    await uploadBackup(app, name);
    reply.code(202);
    return { ok: true, name };
  });

  app.post('/api/admin/backups/offsite/:name/restore', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const name = String((req.params as { name: string }).name);
    const body = z.object({ confirm: z.string() }).parse(req.body);
    if (body.confirm !== getOrg(app.db).name)
      throw badRequest('Type the organisation name to confirm');
    await restoreRemote(app, name);
    reply.code(202);
    return { restart: true };
  });

  app.get('/api/admin/backups/:name', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const name = String((req.params as { name: string }).name);
    const file = backupPath(app.config, name);
    audit(app.db, req, { action: 'backup.downloaded', targetKind: 'backup', targetLabel: name });
    reply.header('Content-Type', 'application/gzip');
    reply.header('Content-Disposition', `attachment; filename="${name}"`);
    return reply.send(createReadStream(file));
  });

  app.post('/api/admin/restore', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    mkdirSync(app.config.backupDir, { recursive: true });
    const part = await req.file({ limits: { fileSize: 2 * 1024 ** 3 } });
    if (!part) throw forbidden('No backup uploaded');
    const temp = path.join(app.config.backupDir, 'restore-upload-source.tar.gz');
    await pipeline(part.file, createWriteStream(temp));
    if (part.file.truncated) throw forbidden('Backup file is too large');
    await stageRestore(app.config, temp);
    audit(app.db, req, { action: 'backup.restored', targetKind: 'backup' });
    reply.code(202);
    setTimeout(() => process.exit(0), 1000);
    return { ok: true, message: 'Restore staged. The server is restarting.' };
  });
}
