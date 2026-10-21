import { afterAll, describe, expect, test, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { create } from 'tar';
import * as password from '../server/lib/password';
import { resolvePublic } from '../server/lib/ssrf';
import { isInlineMime } from '../server/services/files';
import { createBackup, stageRestore } from '../server/services/backups';
import { deliverWebhook } from '../server/services/webhooks';
import { TOOLS } from '../server/ai/tools';
import { listUsers } from '../server/services/users';
import { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } from './helpers';

const dir = mkdtempSync(path.join(tmpdir(), 'tuesday-review-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let server: Server | null = null;
let port = 0;
let hits: string[] = [];

async function httpServer(handler: (url: string, res: import('node:http').ServerResponse) => void) {
  hits = [];
  server = createServer((req, res) => {
    hits.push(req.url ?? '');
    handler(req.url ?? '', res);
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  port = (server!.address() as { port: number }).port;
}

afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
});

function multipart(file: { name: string; mime: string; data: Buffer }) {
  const boundary = '----reviewtest';
  const parts = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.mime}\r\n\r\n`,
    ),
    file.data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function uploadItem(
  app: any,
  cookie: string,
  itemId: number,
  file: { name: string; mime: string; data: Buffer },
) {
  const { body, contentType } = multipart(file);
  return app.inject({
    method: 'POST',
    url: `/api/items/${itemId}/files`,
    headers: { ...H, cookie, 'content-type': contentType },
    payload: body,
  });
}

async function itemFixture() {
  const app = await createTestApp({ config: { uploadsDir: dir, maxUploadMb: 25 } });
  const { cookie, user } = await setupOwner(app);
  const space = await createSpace(app, cookie);
  const board = await createBoard(app, cookie, space.id as number);
  const item = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.board.id}/items`,
    headers: { ...H, cookie },
    payload: { groupId: board.groups[0].id, name: 'File item' },
  });
  return { app, cookie, user, space, board, itemId: item.json().item.id as number };
}

describe('review-p2 fixes', () => {
  test('R1: MIME allowlist and CSP prevent inline SVG XSS', async () => {
    const f = await itemFixture();
    const svg = await uploadItem(f.app, f.cookie, f.itemId, {
      name: 'x.svg',
      mime: 'image/svg+xml; charset=utf-8',
      data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });
    expect(svg.statusCode).toBe(201);
    expect(svg.json().file.mime).toBe('image/svg+xml');
    const res = await f.app.inject({
      method: 'GET',
      url: `/api/files/${svg.json().file.id}`,
      headers: { cookie: f.cookie },
    });
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(String(res.headers['content-disposition'])).toMatch(/^attachment/);
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');

    const png = await uploadItem(f.app, f.cookie, f.itemId, {
      name: 'x.png',
      mime: 'image/png',
      data: Buffer.from('89504e470d0a1a0a', 'hex'),
    });
    const image = await f.app.inject({
      method: 'GET',
      url: `/api/files/${png.json().file.id}`,
      headers: { cookie: f.cookie },
    });
    expect(image.headers['content-type']).toBe('image/png');
    expect(String(image.headers['content-disposition'])).toMatch(/^inline/);
    await f.app.close();
  });

  test('R2: resolvePublic returns the vetted public address', async () => {
    const resolved = await resolvePublic('http://example.com/hook', false, async () => [
      { address: '93.184.216.34', family: 4 },
    ]);
    expect(resolved.address).toBe('93.184.216.34');
    expect(resolved.family).toBe(4);
    for (const target of [
      'http://[::7f00:1]/hook',
      'http://[::ffff:0:127.0.0.1]/hook',
      'http://[64:ff9b::7f00:1]/hook',
      'http://[2002:7f00:1::]/hook',
    ]) {
      await expect(resolvePublic(target, false)).rejects.toThrow(/Private/);
    }
    await expect(
      resolvePublic('http://translated.example/hook', false, async () => [
        { address: '::ffff:0:a00:1', family: 6 },
      ]),
    ).rejects.toThrow(/Private/);
  });

  test('R2: resolvePublic rejects private DNS and delivery refuses redirects', async () => {
    await expect(
      resolvePublic('http://evil.example/hook', false, async () => [
        { address: '10.0.0.5', family: 4 },
      ]),
    ).rejects.toThrow(/Private/);

    await httpServer((url, res) => {
      if (url === '/redirect') {
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/target` });
        res.end();
      } else {
        res.writeHead(200);
        res.end('should not be called');
      }
    });
    const app = await createTestApp({ config: { webhooksAllowPrivate: true } });
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const created = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: { ...H, cookie },
      payload: {
        url: `http://127.0.0.1:${port}/redirect`,
        events: ['item.created'],
        workspaceId: space.id,
      },
    });
    const webhookId = created.json().webhook.id as number;
    await expect(
      deliverWebhook(app, {
        webhookId,
        url: `http://127.0.0.1:${port}/redirect`,
        secret: created.json().secret,
        event: 'test',
        payload: { ok: true },
      }),
    ).rejects.toThrow('Redirects are not followed');
    expect(hits).not.toContain('/target');
    const delivery = app.db
      .prepare(
        'SELECT ok, error FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT 1',
      )
      .get(webhookId) as { ok: number; error: string };
    expect(delivery).toEqual({ ok: 0, error: 'Redirects are not followed' });
    await app.close();
  });

  test('R2: hostname delivery uses the pinned lookup', async () => {
    await httpServer((_url, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    const app = await createTestApp({ config: { webhooksAllowPrivate: true } });
    const result = await deliverWebhook(app, {
      webhookId: null,
      url: `http://localhost:${port}/ok`,
      secret: 'review-secret',
      event: 'test',
      payload: { hostname: true },
    });
    expect(result.ok).toBe(true);
    expect(hits).toContain('/ok');
    await app.close();
  });

  test('R3: webhook auto-disables after 20 failures and notifies the creator', async () => {
    await httpServer((_url, res) => {
      res.writeHead(500);
      res.end('nope');
    });
    const app = await createTestApp({ config: { webhooksAllowPrivate: true } });
    const { cookie, user } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const created = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: { ...H, cookie },
      payload: {
        url: `http://127.0.0.1:${port}/fail`,
        events: ['item.created'],
        workspaceId: space.id,
      },
    });
    const id = created.json().webhook.id as number;
    for (let i = 0; i < 20; i++) {
      await deliverWebhook(app, {
        webhookId: id,
        url: `http://127.0.0.1:${port}/fail`,
        secret: created.json().secret,
        event: 'item.created',
        payload: { i },
      }).catch(() => {});
    }
    const row = app.db
      .prepare('SELECT enabled, failure_count FROM webhooks WHERE id = ?')
      .get(id) as {
      enabled: number;
      failure_count: number;
    };
    expect(row).toEqual({ enabled: 0, failure_count: 20 });
    const notes = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie },
    });
    expect(
      notes
        .json()
        .notifications.some((note: { title: string }) =>
          note.title.includes('Webhook paused after 20 failed deliveries'),
        ),
    ).toBe(true);
    expect(user.id).toBeTruthy();
    await app.close();
  });

  test('R3: a successful delivery resets the failure count', async () => {
    let shouldFail = true;
    await httpServer((_url, res) => {
      res.writeHead(shouldFail ? 500 : 200);
      res.end(shouldFail ? 'nope' : 'ok');
    });
    const app = await createTestApp({ config: { webhooksAllowPrivate: true } });
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const created = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: { ...H, cookie },
      payload: {
        url: `http://127.0.0.1:${port}/flaky`,
        events: ['item.created'],
        workspaceId: space.id,
      },
    });
    const id = created.json().webhook.id as number;
    const send = () =>
      deliverWebhook(app, {
        webhookId: id,
        url: `http://127.0.0.1:${port}/flaky`,
        secret: created.json().secret,
        event: 'item.created',
        payload: {},
      }).catch(() => {});
    await send();
    await send();
    shouldFail = false;
    await send();
    let row = app.db
      .prepare('SELECT enabled, failure_count FROM webhooks WHERE id = ?')
      .get(id) as {
      enabled: number;
      failure_count: number;
    };
    expect(row).toEqual({ enabled: 1, failure_count: 0 });
    shouldFail = true;
    for (let i = 0; i < 18; i++) await send();
    row = app.db.prepare('SELECT enabled, failure_count FROM webhooks WHERE id = ?').get(id) as {
      enabled: number;
      failure_count: number;
    };
    expect(row).toEqual({ enabled: 1, failure_count: 18 });
    await send();
    await send();
    row = app.db.prepare('SELECT enabled, failure_count FROM webhooks WHERE id = ?').get(id) as {
      enabled: number;
      failure_count: number;
    };
    expect(row).toEqual({ enabled: 0, failure_count: 20 });
    await app.close();
  });

  test('R4: item templates are private; structure templates are shared', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const privateSpace = await createSpace(app, cookie, 'Private templates', { isPrivate: true });
    const board = await createBoard(app, cookie, privateSpace.id as number);
    await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId: board.groups[0].id, name: 'Secret item' },
    });
    const withItems = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: { ...H, cookie },
      payload: {
        boardId: board.board.id,
        name: 'With secrets',
        includeItems: true,
      },
    });
    const structure = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: { ...H, cookie },
      payload: {
        boardId: board.board.id,
        name: 'Structure only',
        includeItems: false,
      },
    });
    expect(withItems.statusCode).toBe(201);
    const member = await inviteAndJoin(app, cookie, 'member', 'review-templates@acme.test');
    const publicSpace = await createSpace(app, cookie, 'Public templates');
    const listed = await app.inject({
      method: 'GET',
      url: '/api/templates',
      headers: { cookie: member.cookie },
    });
    const names = listed.json().templates.map((entry: { name: string }) => entry.name);
    expect(names).not.toContain('With secrets');
    expect(names).toContain('Structure only');
    const denied = await app.inject({
      method: 'POST',
      url: '/api/boards/from-template',
      headers: { ...H, cookie: member.cookie },
      payload: {
        templateId: withItems.json().template.id,
        workspaceId: publicSpace.id,
        name: 'Stolen',
      },
    });
    expect(denied.statusCode).toBe(404);
    expect(structure.statusCode).toBe(201);
    await app.close();
  });

  test('R5: mentions outside a private workspace create no notification', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const privateSpace = await createSpace(app, cookie, 'Private notify', { isPrivate: true });
    const board = await createBoard(app, cookie, privateSpace.id as number);
    const item = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId: board.groups[0].id, name: 'Private item' },
    });
    const member = await inviteAndJoin(app, cookie, 'member', 'review-notify@acme.test');
    await app.inject({
      method: 'POST',
      url: `/api/items/${item.json().item.id}/updates`,
      headers: { ...H, cookie },
      payload: { body: `Secret @[Member](user:${member.user.id})` },
    });
    const notes = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie: member.cookie },
    });
    expect(notes.json().notifications).toHaveLength(0);
    await app.close();
  });

  test('R6: AI tool descriptions redact unreadable names', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const privateSpace = await createSpace(app, cookie, 'AI private', { isPrivate: true });
    const board = await createBoard(app, cookie, privateSpace.id as number, 'Secret board');
    const item = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId: board.groups[0].id, name: 'Secret item' },
    });
    const member = await inviteAndJoin(app, cookie, 'member', 'review-ai@acme.test');
    const ctx = { db: app.db, user: member.user, users: listUsers(app.db) };
    const getItem = TOOLS.find((tool) => tool.name === 'get_item')!;
    const description = getItem.describe({ itemId: item.json().item.id }, ctx as never);
    expect(description).toBe(`Read "item #${item.json().item.id}"`);
    await app.close();
  });

  test('R7: a 30 MB backup restores and symlink entries are skipped', async () => {
    const config = {
      uploadsDir: path.join(dir, 'r7-uploads'),
      backupDir: path.join(dir, 'r7-backups'),
      databasePath: path.join(dir, 'r7.db'),
      backupKeep: 7,
      backupHour: 3,
    };
    const app = await createTestApp({ config, dbPath: config.databasePath });
    const { cookie } = await setupOwner(app);
    const big = randomBytes(30 * 1024 * 1024);
    const { mkdirSync } = await import('node:fs');
    mkdirSync(config.uploadsDir, { recursive: true });
    writeFileSync(path.join(config.uploadsDir, 'big.bin'), big);
    const backup = await createBackup(app, false);
    await app.close();
    await stageRestore(config as never, path.join(config.backupDir, backup.name));
    expect(existsSync(path.join(config.backupDir, 'restore-staging', 'uploads', 'big.bin'))).toBe(
      true,
    );
    expect(
      readFileSync(path.join(config.backupDir, 'restore-staging', 'uploads', 'big.bin')).length,
    ).toBe(big.length);

    const linkDir = mkdtempSync(path.join(dir, 'link-'));
    const { writeFileSync: write } = await import('node:fs');
    write(path.join(linkDir, 'tuesday.db'), readFileSync(config.databasePath));
    symlinkSync('/etc/passwd', path.join(linkDir, 'escape'));
    const linkTar = path.join(dir, 'link.tar.gz');
    await create({ gzip: true, file: linkTar, cwd: linkDir }, ['tuesday.db', 'escape']);
    await stageRestore(config as never, linkTar);
    expect(existsSync(path.join(config.backupDir, 'restore-staging', 'escape'))).toBe(false);

    const travDir = path.join(dir, 'trav');
    mkdirSync(travDir, { recursive: true });
    writeFileSync(path.join(travDir, 'tuesday.db'), readFileSync(config.databasePath));
    writeFileSync(path.join(dir, 'trav-x'), 'must not escape');
    const traversalTar = path.join(dir, 'traversal.tar.gz');
    await create({ gzip: true, file: traversalTar, cwd: travDir }, ['tuesday.db', '../trav-x']);
    await stageRestore(config as never, traversalTar);
    expect(existsSync(path.join(config.backupDir, 'trav-x'))).toBe(false);
    expect(existsSync(path.join(config.backupDir, 'restore-staging', 'trav-x'))).toBe(false);
    expect(readFileSync(path.join(dir, 'trav-x'), 'utf8')).toBe('must not escape');
    expect(cookie).toBeTruthy();

    const app2 = await createTestApp({
      config: { ...config, maxUploadMb: 25 },
      dbPath: config.databasePath,
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const archive = readFileSync(path.join(config.backupDir, backup.name));
    const upload = multipart({ name: 'backup.tar.gz', mime: 'application/gzip', data: archive });
    const restored = await app2.inject({
      method: 'POST',
      url: '/api/admin/restore',
      headers: { ...H, cookie, 'content-type': upload.contentType },
      payload: upload.body,
    });
    expect(restored.statusCode).toBe(202);
    expect(existsSync(path.join(config.backupDir, 'RESTORE_PENDING'))).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    exitSpy.mockRestore();
    await app2.close();
  }, 20000);

  test('R9: unknown-email login still verifies against a dummy hash', async () => {
    const app = await createTestApp();
    await setupOwner(app);
    const spy = vi.spyOn(password, 'verifyPassword');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: H,
      payload: { email: 'nobody@example.test', password: 'password123' },
    });
    expect(res.statusCode).toBe(401);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    await app.close();
  });

  test('R4: legacy templates that secretly contain items stay private', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const privateSpace = await createSpace(app, cookie, 'Legacy private', { isPrivate: true });
    const board = await createBoard(app, cookie, privateSpace.id as number);
    await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId: board.groups[0].id, name: 'Legacy secret' },
    });
    const saved = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: { ...H, cookie },
      payload: { boardId: board.board.id, name: 'Legacy item template', includeItems: true },
    });
    app.db
      .prepare('UPDATE templates SET include_items = 0 WHERE id = ?')
      .run(Number(saved.json().template.id.slice(5)));
    const member = await inviteAndJoin(app, cookie, 'member', 'review-legacy@acme.test');
    const listed = await app.inject({
      method: 'GET',
      url: '/api/templates',
      headers: { cookie: member.cookie },
    });
    expect(
      listed
        .json()
        .templates.some((entry: { name: string }) => entry.name === 'Legacy item template'),
    ).toBe(false);
    const publicSpace = await createSpace(app, cookie, 'Legacy public');
    const denied = await app.inject({
      method: 'POST',
      url: '/api/boards/from-template',
      headers: { ...H, cookie: member.cookie },
      payload: {
        templateId: saved.json().template.id,
        workspaceId: publicSpace.id,
        name: 'Stolen legacy',
      },
    });
    expect(denied.statusCode).toBe(404);
    await app.close();
  });

  test('R3: DNS failures count toward auto-disable', async () => {
    const app = await createTestApp({ config: { webhooksAllowPrivate: true } });
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const created = await app.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: { ...H, cookie },
      payload: {
        url: 'http://127.0.0.1:65534/ok',
        events: ['item.created'],
        workspaceId: space.id,
      },
    });
    const id = created.json().webhook.id as number;
    app.db
      .prepare('UPDATE webhooks SET url = ? WHERE id = ?')
      .run('http://no-such-host.invalid/hook', id);
    for (let i = 0; i < 20; i++) {
      await deliverWebhook(app, {
        webhookId: id,
        url: 'http://no-such-host.invalid/hook',
        secret: created.json().secret,
        event: 'item.created',
        payload: {},
      }).catch(() => {});
    }
    const row = app.db
      .prepare('SELECT enabled, failure_count FROM webhooks WHERE id = ?')
      .get(id) as { enabled: number; failure_count: number };
    expect(row).toEqual({ enabled: 0, failure_count: 20 });
    const deliveries = app.db
      .prepare('SELECT count(*) AS n FROM webhook_deliveries WHERE webhook_id = ?')
      .get(id) as { n: number };
    expect(deliveries.n).toBe(20);
    await app.close();
  });

  test('R10: deactivated form creators make the form unavailable', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const board = await createBoard(app, cookie, space.id as number);
    const form = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/forms`,
      headers: { ...H, cookie },
      payload: { title: 'Owner form' },
    });
    const member = await inviteAndJoin(app, cookie, 'member', 'review-form@acme.test');
    const memberBoard = await createBoard(app, member.cookie, space.id as number, 'Member board');
    const memberForm = await app.inject({
      method: 'POST',
      url: `/api/boards/${memberBoard.board.id}/forms`,
      headers: { ...H, cookie: member.cookie },
      payload: { title: 'Member form' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/users/${member.user.id}`,
      headers: { ...H, cookie },
      payload: { isActive: false },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/public/forms/${memberForm.json().form.token}`,
    });
    expect(res.statusCode).toBe(410);
    expect(form.statusCode).toBe(201);
    await app.close();
  });

  test('R1: inline MIME allowlist is exact and case-insensitive', () => {
    expect(isInlineMime('image/png')).toBe(true);
    expect(isInlineMime('IMAGE/PNG; charset=utf-8')).toBe(true);
    expect(isInlineMime('application/pdf')).toBe(true);
    expect(isInlineMime('image/svg+xml; charset=utf-8')).toBe(false);
    expect(isInlineMime('text/html')).toBe(false);
  });

  test('R2: URL validation rejects credentials and non-http schemes', async () => {
    await expect(resolvePublic('http://user:pass@example.com')).rejects.toThrow(/credentials/i);
    await expect(resolvePublic('file:///etc/passwd')).rejects.toThrow(/http/i);
    await expect(
      resolvePublic('http://evil.example', false, async () => [
        { address: '::ffff:7f00:1', family: 6 },
      ]),
    ).rejects.toThrow(/Private/);
    await expect(
      resolvePublic('http://evil.example', false, async () => [
        { address: '::ffff:a9fe:a9fe', family: 6 },
      ]),
    ).rejects.toThrow(/Private/);
    for (const address of [
      '0:0:0:0:0:ffff:7f00:1',
      '::FFFF:7F00:1',
      '0:0:0:0:0:0:0:1',
      'ff02::1',
    ]) {
      await expect(
        resolvePublic('http://evil.example', false, async () => [{ address, family: 6 }]),
      ).rejects.toThrow(/Private/);
    }
  });

  test('R5: assigning a user outside a private workspace creates no notification', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const privateSpace = await createSpace(app, cookie, 'Private assign', { isPrivate: true });
    const board = await createBoard(app, cookie, privateSpace.id as number);
    const item = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie },
      payload: { groupId: board.groups[0].id, name: 'Private assign item' },
    });
    const member = await inviteAndJoin(app, cookie, 'member', 'review-assign@acme.test');
    const people = (board.columns as { id: number; type: string }[]).find(
      (column) => column.type === 'people',
    )!;
    await app.inject({
      method: 'PUT',
      url: `/api/items/${item.json().item.id}/values/${people.id}`,
      headers: { ...H, cookie },
      payload: { value: { userIds: [member.user.id] } },
    });
    const notes = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { cookie: member.cookie },
    });
    expect(notes.json().notifications).toHaveLength(0);
    await app.close();
  });

  test('R10: submitting to a deactivated creator form returns 410', async () => {
    const app = await createTestApp();
    const { cookie } = await setupOwner(app);
    const space = await createSpace(app, cookie);
    const member = await inviteAndJoin(app, cookie, 'member', 'review-form-post@acme.test');
    const board = await createBoard(app, member.cookie, space.id as number, 'Member form board');
    const form = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/forms`,
      headers: { ...H, cookie: member.cookie },
      payload: { title: 'Member form post' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/api/users/${member.user.id}`,
      headers: { ...H, cookie },
      payload: { isActive: false },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/public/forms/${form.json().form.token}`,
      headers: H,
      payload: { values: { name: 'Nope' } },
    });
    expect(res.statusCode).toBe(410);
    await app.close();
  });
});
