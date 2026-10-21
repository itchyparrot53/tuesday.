import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';
import { applyPendingRestore, createBackup, stageRestore } from '../server/services/backups';
import { buildApp } from '../server/app';
import { loadConfig } from '../server/config';

describe('backup and restore', () => {
  test('local backup restores row counts and file bytes', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tuesday-restore-'));
    const dbPath = path.join(dir, 'tuesday.db');
    const app = await createTestApp({
      dbPath,
      config: {
        databasePath: dbPath,
        backupDir: path.join(dir, 'backups'),
        uploadsDir: path.join(dir, 'uploads'),
        backupKeep: 3,
      },
    });
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number, 'Restore board');
    await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie: owner.cookie },
      payload: { groupId: board.groups[0].id, name: 'Restore item' },
    });
    mkdirSync(path.join(app.config.uploadsDir, 'aa'), { recursive: true });
    const upload = path.join(app.config.uploadsDir, 'aa', 'file.bin');
    writeFileSync(upload, Buffer.from('restore-me'));
    const before = app.db.prepare('SELECT count(*) AS n FROM items').get() as { n: number };
    const backup = await createBackup(app, false);
    await stageRestore(
      { ...app.config, databasePath: dbPath },
      path.join(app.config.backupDir, backup.name),
    );
    expect(existsSync(path.join(app.config.backupDir, 'RESTORE_PENDING'))).toBe(true);
    await app.close();
    applyPendingRestore({ ...app.config, databasePath: dbPath });

    const reopened = await buildApp({
      config: {
        ...loadConfig(),
        databasePath: dbPath,
        backupDir: path.join(dir, 'backups'),
        uploadsDir: path.join(dir, 'uploads'),
      },
    });
    const after = reopened.db.prepare('SELECT count(*) AS n FROM items').get() as { n: number };
    expect(after.n).toBe(before.n);
    expect(readFileSync(path.join(dir, 'uploads', 'aa', 'file.bin')).toString()).toBe('restore-me');
    await reopened.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
