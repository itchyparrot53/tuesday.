import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { AppError } from '../lib/errors';

const MAGIC = Buffer.from('TUEB1');
const AAD = Buffer.from('tuesday-backup-v1');

function keyFor(passphrase: string): Buffer {
  return scryptSync(passphrase, 'tuesday-backup-v1', 32);
}

export async function encryptFile(src: string, dest: string, key: string): Promise<void> {
  const data = readFileSync(src);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(key), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  writeFileSync(dest, Buffer.concat([MAGIC, iv, ciphertext, cipher.getAuthTag()]));
}

export async function decryptFile(src: string, dest: string, key: string): Promise<void> {
  const data = readFileSync(src);
  if (data.byteLength < MAGIC.length + 12 + 16 || !data.subarray(0, 5).equals(MAGIC)) {
    throw new AppError(400, 'backup_key_mismatch', 'This backup is not a Tuesday encrypted backup');
  }
  const iv = data.subarray(5, 17);
  const tag = data.subarray(data.byteLength - 16);
  const ciphertext = data.subarray(17, data.byteLength - 16);
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFor(key), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    writeFileSync(dest, Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  } catch {
    throw new AppError(
      400,
      'backup_key_mismatch',
      'This backup was encrypted with a different key.',
    );
  }
}
