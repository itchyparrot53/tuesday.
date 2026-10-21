import { expect, test } from 'vitest';
import { buildApp } from '../server/app';
import { loadConfig } from '../server/config';
import { openDb } from '../server/db/db';
import { migrate } from '../server/db/migrate';

test('health endpoint reports ok', async () => {
  const app = await buildApp({ config: loadConfig(), dbPath: ':memory:' });
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json().ok).toBe(true);
  await app.close();
});

test('migrations apply once on a fresh database', () => {
  const db = openDb(':memory:');
  const count = db.prepare('SELECT count(*) AS n FROM _migrations').get() as { n: number };
  expect(count.n).toBeGreaterThan(1);
  expect(migrate(db)).toEqual([]);
  db.close();
});

test('deep health and metrics authenticate, report problems and count requests', async () => {
  const { createTestApp, inviteAndJoin, setupOwner } = await import('./helpers');
  const app = await createTestApp({ config: { healthToken: 'smoke-token' } });
  const owner = await setupOwner(app);
  const ok = await app.inject({
    method: 'GET',
    url: '/api/health/deep',
    headers: { authorization: 'Bearer smoke-token' },
  });
  expect([200, 503]).toContain(ok.statusCode);
  expect(ok.json().checks.db.ok).toBe(true);
  const wrong = await app.inject({
    method: 'GET',
    url: '/api/metrics',
    headers: { authorization: 'Bearer nope' },
  });
  expect(wrong.statusCode).toBe(401);
  const member = await inviteAndJoin(app, owner.cookie, 'member', 'health-member@acme.test');
  const denied = await app.inject({
    method: 'GET',
    url: '/api/health/deep',
    headers: { cookie: member.cookie },
  });
  expect(denied.statusCode).toBe(403);
  await app.inject({ method: 'GET', url: '/api/health', headers: { cookie: owner.cookie } });
  const metrics = await app.inject({
    method: 'GET',
    url: '/api/metrics',
    headers: { cookie: owner.cookie },
  });
  expect(metrics.body).toContain('tuesday_up 1');
  expect(metrics.body).toMatch(/tuesday_http_requests_total\{status_class="2xx"\} [1-9]/);

  const { deepHealth } = await import('../server/services/health');
  const lowDisk = await deepHealth(app, (async () => ({
    bavail: 1,
    bsize: 1,
    blocks: 1,
    bfree: 1,
    ffree: 1,
    files: 1,
    type: 1,
  })) as never);
  expect(lowDisk.ok).toBe(false);
  expect(lowDisk.problems.join(' ')).toContain('disk');

  app.db
    .prepare(
      "INSERT INTO jobs (kind, payload, status, attempts, run_after, created_at, updated_at) VALUES ('noop','{}','queued',0,?,?,?)",
    )
    .run('2000-01-01T00:00:00.000Z', new Date().toISOString(), new Date().toISOString());
  const oldQueue = await deepHealth(app, (async () => ({
    bavail: 1024 * 1024 * 8,
    bsize: 1024,
    blocks: 1,
    bfree: 1,
    ffree: 1,
    files: 1,
    type: 1,
  })) as never);
  expect(oldQueue.checks.queue.ok).toBe(false);
  await app.close();
});

test('graceful shutdown checkpoints the WAL and closes the app', async () => {
  const { createTestApp } = await import('./helpers');
  const { gracefulShutdown } = await import('../server/shutdown');
  const app = await createTestApp();
  const ended: string[] = [];
  app.sseClients.add({ end: () => ended.push('sse') });
  let code = -1;
  await gracefulShutdown(app, (value) => {
    code = value;
  });
  expect(code).toBe(0);
  expect(ended).toEqual(['sse']);
  expect(app.sseConnections).toBe(0);
});
