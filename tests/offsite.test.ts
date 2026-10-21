import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { decryptFile, encryptFile } from '../server/services/crypto-backup';
import { createTestApp } from './helpers';
import { createBackup } from '../server/services/backups';
import { listRemote, restoreRemote, uploadBackup } from '../server/services/offsite';

const key = 'test-key-test-key-test-key-test-key';

describe('encrypted backups', () => {
  test('encrypts and decrypts a 5 MB file; wrong key and tampering fail', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tuesday-enc-'));
    const source = path.join(dir, 'backup.tar.gz');
    const encrypted = path.join(dir, 'backup.tar.gz.enc');
    const restored = path.join(dir, 'restored.tar.gz');
    const data = Buffer.from(Array.from({ length: 5 * 1024 * 1024 }, (_, index) => index % 256));
    writeFileSync(source, data);
    await encryptFile(source, encrypted, key);
    expect(readFileSync(encrypted).subarray(0, 5).toString()).toBe('TUEB1');
    await decryptFile(encrypted, restored, key);
    expect(readFileSync(restored).equals(data)).toBe(true);
    await expect(
      decryptFile(encrypted, restored, 'wrong-key-wrong-key-wrong-key-wrong-key'),
    ).rejects.toMatchObject({ code: 'backup_key_mismatch' });
    const bytes = readFileSync(encrypted);
    bytes[bytes.length - 20] ^= 1;
    writeFileSync(encrypted, bytes);
    await expect(decryptFile(encrypted, restored, key)).rejects.toMatchObject({
      code: 'backup_key_mismatch',
    });
    rmSync(dir, { recursive: true, force: true });
  });

  test('uploads to fake S3 with encryption, lists and stages a restore', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tuesday-offsite-'));
    const app = await createTestApp({
      config: {
        backupDir: path.join(dir, 'backups'),
        uploadsDir: path.join(dir, 'uploads'),
        offsiteFake: true,
        offsite: {
          endpoint: 'fake://local',
          region: 'auto',
          bucket: 'fake',
          accessKeyId: 'fake',
          secretAccessKey: 'fake',
          prefix: 'tuesday/',
          keep: 2,
        },
        backupEncryptionKey: key,
      },
    });
    const backup = await createBackup(app, false);
    await uploadBackup(app, backup.name);
    const rows = listRemote(app);
    expect(rows[0]).toMatchObject({
      name: `${backup.name}.enc`,
      encrypted: true,
      status: 'uploaded',
    });
    expect(existsSync(path.join('data', 'fake-s3', 'tuesday', `${backup.name}.enc`))).toBe(true);
    await restoreRemote(app, `${backup.name}.enc`);
    expect(existsSync(path.join(app.config.backupDir, 'RESTORE_PENDING'))).toBe(true);
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
