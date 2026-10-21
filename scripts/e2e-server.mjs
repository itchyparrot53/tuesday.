import { mkdirSync, rmSync } from 'node:fs';

mkdirSync('data', { recursive: true });
for (const f of ['data/e2e.db', 'data/e2e.db-wal', 'data/e2e.db-shm']) rmSync(f, { force: true });
rmSync('data/e2e-uploads', { recursive: true, force: true });
rmSync('data/e2e-backups', { recursive: true, force: true });
rmSync('e2e/.auth', { recursive: true, force: true });
Object.assign(process.env, {
  TUESDAY_NO_DOTENV: '1',
  NODE_ENV: 'production',
  PORT: '3200',
  DATABASE_PATH: './data/e2e.db',
  AI_FAKE: 'true',
  MAIL_FAKE: 'true',
  KNOWLEDGE_INDEX_DELAY_MS: '500',
  PUSH_FAKE: 'true',
  BACKUP_S3_FAKE: 'true',
  BACKUP_ENCRYPTION_KEY: 'e2e-test-key-e2e-test-key-e2e-test-key',
  APP_URL: 'http://localhost:3200',
  LOG_LEVEL: 'warn',
  UPLOADS_DIR: './data/e2e-uploads',
  BACKUP_DIR: './data/e2e-backups',
});
await import('../dist/server/index.js');
