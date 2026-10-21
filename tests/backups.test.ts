import { afterAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { create } from 'tar';
import { H, createSpace, createTestApp, setupOwner } from './helpers';
import { applyPendingRestore, backupPath, stageRestore } from '../server/services/backups';
import type { Config } from '../server/config';

const dir = mkdtempSync(path.join(tmpdir(), 'tuesday-backup-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function dirs() {
  return {
    backupDir: path.join(dir, 'backups'),
    uploadsDir: path.join(dir, 'uploads'),
    databasePath: path.join(dir, `db-${Math.random().toString(36).slice(2)}.db`),
  };
}

describe('backups', () => {
  test('creates, lists and downloads a backup', async () => {
    const config = dirs();
    const app = await createTestApp({
      config,
      dbPath: config.databasePath,
    });
    const { cookie } = await setupOwner(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/backups',
      headers: { ...H, cookie },
    });
    expect(created.statusCode).toBe(201);
    const name = created.json().backup.name as string;
    expect(name).toMatch(/^tuesday-\d{8}-\d{6}\.tar\.gz$/);
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/backups',
      headers: { cookie },
    });
    expect(list.json().backups[0].name).toBe(name);
    const download = await app.inject({
      method: 'GET',
      url: `/api/admin/backups/${name}`,
      headers: { cookie },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toContain('gzip');
    const bad = await app.inject({
      method: 'GET',
      url: '/api/admin/backups/../../etc/passwd',
      headers: { cookie },
    });
    expect(bad.statusCode).toBe(404);
    await app.close();
  });

  test('stages and applies a restore atomically', async () => {
    const config = dirs();
    const app = await createTestApp({ config, dbPath: config.databasePath });
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie, 'Original space');
    const backup = await app.inject({
      method: 'POST',
      url: '/api/admin/backups',
      headers: { ...H, cookie },
    });
    const name = backup.json().backup.name as string;
    await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: { ...H, cookie },
      payload: { name: 'After backup' },
    });
    await app.close();

    await stageRestore(config as Config, backupPath(config as Config, name));
    applyPendingRestore(config as Config);
    const db = new Database(config.databasePath, { readonly: true });
    const names = (db.prepare('SELECT name FROM workspaces').all() as { name: string }[]).map(
      (row) => row.name,
    );
    db.close();
    expect(names).toContain('Original space');
    expect(names).not.toContain('After backup');
    expect(existsSync(path.join(config.backupDir, 'RESTORE_PENDING'))).toBe(false);
    expect(space.id).toBeTruthy();
  });

  test('rejects a tar without a database', async () => {
    const config = dirs();
    const tmp = mkdtempSync(path.join(dir, 'bad-'));
    writeFileSync(path.join(tmp, 'hello.txt'), 'not a database');
    const tarPath = path.join(dir, 'bad.tar.gz');
    await create({ gzip: true, file: tarPath, cwd: tmp }, ['hello.txt']);
    await expect(stageRestore(config as Config, tarPath)).rejects.toThrow(/database/i);
  });
});
