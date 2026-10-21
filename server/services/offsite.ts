import type { FastifyInstance } from 'fastify';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { decryptFile, encryptFile } from './crypto-backup';
import { audit } from './audit';
import { bus } from '../realtime/bus';
import { listUsers } from './users';
import { AppError } from '../lib/errors';

function client(app: FastifyInstance): S3Client | null {
  if (!app.config.offsite || app.config.offsiteFake) return null;
  return new S3Client({
    endpoint: app.config.offsite.endpoint,
    region: app.config.offsite.region,
    credentials: {
      accessKeyId: app.config.offsite.accessKeyId,
      secretAccessKey: app.config.offsite.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

function fakePath(app: FastifyInstance, name: string): string {
  return path.join('data', 'fake-s3', app.config.offsite?.prefix ?? 'tuesday/', name);
}

function localBackupPath(app: FastifyInstance, name: string): string {
  return path.join(app.config.backupDir, name);
}

export async function uploadBackup(app: FastifyInstance, name: string): Promise<void> {
  if (!app.config.offsite) return;
  const source = localBackupPath(app, name);
  if (!existsSync(source)) throw new AppError(404, 'not_found', 'Backup not found');
  const encrypted = Boolean(app.config.backupEncryptionKey);
  const remoteName = encrypted ? `${name}.enc` : name;
  let upload = source;
  if (encrypted) {
    upload = path.join(app.config.backupDir, `remote-${remoteName}`);
    await encryptFile(source, upload, app.config.backupEncryptionKey!);
  }
  try {
    if (app.config.offsiteFake) {
      mkdirSync(path.dirname(fakePath(app, remoteName)), { recursive: true });
      copyFileSync(upload, fakePath(app, remoteName));
    } else {
      const s3 = client(app)!;
      await s3.send(
        new PutObjectCommand({
          Bucket: app.config.offsite.bucket,
          Key: `${app.config.offsite.prefix}${remoteName}`,
          Body: createReadStream(upload),
          ContentLength: statSync(upload).size,
        }),
      );
    }
    const size = statSync(upload).size;
    app.db
      .prepare(
        `INSERT INTO offsite_backups (name, size_bytes, encrypted, status, created_at, uploaded_at)
         VALUES (?, ?, ?, 'uploaded', ?, ?)
         ON CONFLICT(name) DO UPDATE SET size_bytes = excluded.size_bytes,
           encrypted = excluded.encrypted, status = 'uploaded', error = NULL,
           uploaded_at = excluded.uploaded_at`,
      )
      .run(remoteName, size, encrypted ? 1 : 0, new Date().toISOString(), new Date().toISOString());
    await pruneRemote(app);
    audit(app.db, null, {
      action: 'backup.created',
      targetKind: 'backup',
      targetLabel: remoteName,
      data: { offsite: true },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    app.db
      .prepare(
        `INSERT INTO offsite_backups (name, size_bytes, encrypted, status, error, created_at)
         VALUES (?, 0, ?, 'failed', ?, ?)
         ON CONFLICT(name) DO UPDATE SET status = 'failed', error = excluded.error`,
      )
      .run(remoteName, encrypted ? 1 : 0, message, new Date().toISOString());
    for (const admin of listUsers(app.db).filter(
      (user) => user.isActive && (user.role === 'owner' || user.role === 'admin'),
    )) {
      const info = app.db
        .prepare(
          `INSERT INTO notifications (user_id, kind, title, body, link, created_at)
           VALUES (?, 'automation', 'Off-site backup failed', ?, '/admin?tab=data', ?)`,
        )
        .run(admin.id, message, new Date().toISOString());
      bus.publish({
        event: {
          type: 'notification',
          notification: {
            id: Number(info.lastInsertRowid),
            kind: 'automation',
            title: 'Off-site backup failed',
            body: message,
            link: '/admin?tab=data',
            actorId: null,
            readAt: null,
            createdAt: new Date().toISOString(),
          },
        },
        userId: admin.id,
      });
    }
  } finally {
    if (encrypted && upload !== source) rmSync(upload, { force: true });
  }
}

async function pruneRemote(app: FastifyInstance): Promise<void> {
  const keep = app.config.offsite?.keep ?? 30;
  const rows = app.db
    .prepare("SELECT * FROM offsite_backups WHERE status = 'uploaded' ORDER BY uploaded_at DESC")
    .all() as { name: string }[];
  for (const row of rows.slice(keep)) {
    if (app.config.offsiteFake) {
      rmSync(fakePath(app, row.name), { force: true });
    } else if (app.config.offsite) {
      const s3 = client(app);
      if (s3) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: app.config.offsite.bucket,
            Key: `${app.config.offsite.prefix}${row.name}`,
          }),
        );
      }
    }
    app.db.prepare("UPDATE offsite_backups SET status = 'deleted' WHERE name = ?").run(row.name);
  }
}

export function listRemote(app: FastifyInstance) {
  const rows = app.db
    .prepare('SELECT * FROM offsite_backups ORDER BY created_at DESC LIMIT 100')
    .all() as {
    name: string;
    size_bytes: number;
    encrypted: number;
    status: string;
    error: string | null;
    uploaded_at: string | null;
  }[];
  return rows.map((row) => ({
    name: row.name,
    sizeBytes: row.size_bytes,
    encrypted: row.encrypted === 1,
    status: row.status,
    error: row.error,
    uploadedAt: row.uploaded_at,
  }));
}

export async function restoreRemote(app: FastifyInstance, name: string): Promise<void> {
  if (!app.config.offsite)
    throw new AppError(400, 'validation_error', 'Off-site backups are not configured');
  const target = path.join(app.config.backupDir, `remote-${name}`);
  if (app.config.offsiteFake) {
    const source = fakePath(app, name);
    if (!existsSync(source)) throw new AppError(404, 'not_found', 'Remote backup not found');
    copyFileSync(source, target);
  } else {
    const s3 = client(app)!;
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: app.config.offsite.bucket,
        Key: `${app.config.offsite.prefix}${name}`,
      }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new AppError(404, 'not_found', 'Remote backup not found');
    writeFileSync(target, Buffer.from(bytes));
  }
  let restorePath = target;
  if (name.endsWith('.enc')) {
    if (!app.config.backupEncryptionKey) {
      throw new AppError(
        400,
        'backup_key_mismatch',
        'This backup was encrypted with a different key.',
      );
    }
    restorePath = target.replace(/\.enc$/, '');
    await decryptFile(target, restorePath, app.config.backupEncryptionKey);
  }
  const { stageRestore } = await import('./backups');
  await stageRestore(app.config, restorePath);
  audit(app.db, null, {
    action: 'backup.restored',
    targetKind: 'backup',
    targetLabel: name,
    data: { offsite: true },
  });
}
