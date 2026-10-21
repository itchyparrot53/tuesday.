import type { FastifyInstance } from 'fastify';
import type { Config } from '../config';
import type { BackupInfo } from '../../shared/types';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { create, extract } from 'tar';
import Database from 'better-sqlite3';
import { badRequest } from '../lib/errors';

const NAME_RE = /^tuesday-(auto-)?\d{8}-\d{6}\.tar\.gz$/;

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export async function createBackup(app: FastifyInstance, automatic = false): Promise<BackupInfo> {
  const dir = app.config.backupDir;
  mkdirSync(dir, { recursive: true });
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'tuesday-backup-'));
  const name = `tuesday-${automatic ? 'auto-' : ''}${stamp()}.tar.gz`;
  const file = path.join(dir, name);
  try {
    await app.db.backup(path.join(tmp, 'tuesday.db'));
    if (existsSync(app.config.uploadsDir)) {
      cpSync(app.config.uploadsDir, path.join(tmp, 'uploads'), { recursive: true });
    }
    await create(
      { gzip: true, file, cwd: tmp },
      existsSync(path.join(tmp, 'uploads')) ? ['tuesday.db', 'uploads'] : ['tuesday.db'],
    );
    const stat = statSync(file);
    return { name, size: stat.size, createdAt: stat.birthtime.toISOString() };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function listBackups(config: Config): BackupInfo[] {
  if (!existsSync(config.backupDir)) return [];
  return readdirSync(config.backupDir)
    .filter((name) => NAME_RE.test(name))
    .map((name) => {
      const stat = statSync(path.join(config.backupDir, name));
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function backupPath(config: Config, name: string): string {
  if (!NAME_RE.test(name)) throw badRequest('Invalid backup name');
  const file = path.join(config.backupDir, name);
  if (!existsSync(file)) throw badRequest('Backup not found');
  return file;
}

export function pruneAutomatic(config: Config): void {
  if (config.backupKeep <= 0) return;
  const automatic = listBackups(config).filter((entry) => entry.name.startsWith('tuesday-auto-'));
  for (const entry of automatic.slice(config.backupKeep)) {
    try {
      rmSync(path.join(config.backupDir, entry.name), { force: true });
    } catch {}
  }
}

export async function stageRestore(config: Config, tarPath: string): Promise<void> {
  mkdirSync(config.backupDir, { recursive: true });
  const upload = path.join(config.backupDir, 'restore-upload.tar.gz');
  cpSync(tarPath, upload);
  const staging = path.join(config.backupDir, 'restore-staging');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  await extract({
    file: upload,
    cwd: staging,
    strict: true,
    filter: (entryPath, entry) => {
      const type = (entry as { type?: string }).type;
      return (
        (type === 'File' || type === 'Directory') &&
        (entryPath === 'tuesday.db' || entryPath === 'uploads' || entryPath.startsWith('uploads/'))
      );
    },
  });
  const dbPath = path.join(staging, 'tuesday.db');
  if (!existsSync(dbPath)) throw badRequest('Backup has no database');
  try {
    const check = new Database(dbPath, { readonly: true });
    check.prepare('SELECT name FROM _migrations LIMIT 1').get();
    check.close();
  } catch {
    throw badRequest('Backup database is invalid');
  }
  writeFileSync(path.join(config.backupDir, 'RESTORE_PENDING'), staging);
}

export function applyPendingRestore(config: Config): void {
  const marker = path.join(config.backupDir, 'RESTORE_PENDING');
  if (!existsSync(marker)) return;
  const staging = readFileSync(marker, 'utf8').trim();
  const stampDir = path.join(config.backupDir, `pre-restore-${stamp()}`);
  mkdirSync(stampDir, { recursive: true });
  for (const suffix of ['', '-wal', '-shm']) {
    const current = `${config.databasePath}${suffix}`;
    if (existsSync(current)) renameSync(current, path.join(stampDir, `tuesday.db${suffix}`));
  }
  if (existsSync(config.uploadsDir)) {
    renameSync(config.uploadsDir, path.join(stampDir, 'uploads'));
  }
  mkdirSync(path.dirname(config.databasePath), { recursive: true });
  renameSync(path.join(staging, 'tuesday.db'), config.databasePath);
  if (existsSync(path.join(staging, 'uploads'))) {
    mkdirSync(config.uploadsDir, { recursive: true });
    renameSync(path.join(staging, 'uploads'), config.uploadsDir);
  }
  rmSync(marker, { force: true });
  rmSync(staging, { recursive: true, force: true });
}
