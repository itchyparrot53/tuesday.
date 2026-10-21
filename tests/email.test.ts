import { describe, expect, test } from 'vitest';
import { createMailer } from '../server/email/mailer';
import { createTestApp, setupOwner } from './helpers';
import { queueEmail } from '../server/services/email';
import { runOnce } from '../server/jobs/worker';
import { JOB_HANDLERS } from '../server/jobs/handlers';
import type { Config } from '../server/config';

function config(patch: Partial<Config> = {}): Config {
  return {
    port: 0,
    databasePath: ':memory:',
    appUrl: 'http://localhost:3000',
    cookieSecure: false,
    logLevel: 'error',
    isProduction: false,
    openrouterApiKey: undefined,
    defaultModel: 'test/model',
    fastModel: 'test/model',
    aiFake: true,
    uploadsDir: './data/uploads',
    maxUploadMb: 25,
    backupDir: './data/backups',
    backupKeep: 0,
    backupHour: 3,
    webhooksAllowPrivate: false,
    smtp: null,
    mailFrom: '',
    mailFake: true,
    vapidSubject: null,
    oidc: null,
    trustProxy: false,
    push: null,
    pushFake: false,
    offsite: null,
    offsiteFake: false,
    backupEncryptionKey: null,
    healthToken: null,
    ...patch,
  };
}

describe('mailer', () => {
  test('fake mode captures the message', async () => {
    const mailer = createMailer(config());
    expect(mailer.mode).toBe('fake');
    const result = await mailer.send({
      to: 'person@example.com',
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
    });
    expect(result.messageId).toBeTruthy();
    expect(mailer.outbox).toHaveLength(1);
    expect(mailer.outbox[0]).toMatchObject({ to: 'person@example.com', subject: 'Hello' });
  });

  test('off mode refuses to send', async () => {
    const mailer = createMailer(config({ mailFake: false }));
    expect(mailer.mode).toBe('off');
    await expect(
      mailer.send({ to: 'a@b.test', subject: 'x', html: 'x', text: 'x' }),
    ).rejects.toMatchObject({ code: 'mail_unavailable' });
  });

  test('connection errors fall back once to STARTTLS on 587', async () => {
    const calls: Record<string, unknown>[] = [];
    const mailer = createMailer(
      config({
        mailFake: false,
        smtp: {
          host: 'smtp.test',
          port: 465,
          secure: true,
          fallbackPort: 587,
          user: 'user@test',
          pass: 'test-key',
        },
      }),
      (options) => {
        calls.push(options);
        return {
          sendMail: async () => {
            if (options.port === 465)
              throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
            return { messageId: 'fallback-ok' };
          },
          verify: async () => undefined,
        } as never;
      },
    );
    const result = await mailer.send({ to: 'a@b.test', subject: 'x', html: 'x', text: 'x' });
    expect(result.messageId).toBe('fallback-ok');
    expect(calls.map((call) => call.port)).toEqual([465, 587]);
    expect(calls[1]).toMatchObject({ secure: false, requireTLS: true });
  });

  test('auth errors never fall back', async () => {
    const calls: Record<string, unknown>[] = [];
    const mailer = createMailer(
      config({
        mailFake: false,
        smtp: {
          host: 'smtp.test',
          port: 465,
          secure: true,
          fallbackPort: 587,
          user: 'user@test',
          pass: 'test-key',
        },
      }),
      (options) => {
        calls.push(options);
        return {
          sendMail: async () => {
            throw Object.assign(new Error('bad auth'), { code: 'EAUTH' });
          },
          verify: async () => undefined,
        } as never;
      },
    );
    await expect(
      mailer.send({ to: 'a@b.test', subject: 'x', html: 'x', text: 'x' }),
    ).rejects.toThrow('bad auth');
    expect(calls).toHaveLength(1);
  });
});

describe('email queue', () => {
  test('fake mode logs sent after the job runs', async () => {
    const app = await createTestApp({ config: { mailFake: true } });
    await setupOwner(app);
    const logId = queueEmail(app.db, {
      to: 'capture@example.com',
      kind: 'test',
      subject: 'Captured',
      html: '<p>x</p>',
      text: 'x',
      mode: 'fake',
    });
    await runOnce(app, JOB_HANDLERS);
    const row = app.db.prepare('SELECT * FROM email_log WHERE id = ?').get(logId) as {
      status: string;
      message_id: string;
    };
    expect(row.status).toBe('sent');
    expect(row.message_id).toBeTruthy();
    expect(app.mailer.outbox.at(-1)?.subject).toBe('Captured');
    const status = await app.inject({ method: 'GET', url: '/api/admin/email', headers: {} });
    expect([403, 401]).toContain(status.statusCode);
    await app.close();
  });

  test('off mode logs skipped and queues nothing', async () => {
    const app = await createTestApp({ config: { mailFake: false } });
    await setupOwner(app);
    const logId = queueEmail(app.db, {
      to: 'capture@example.com',
      kind: 'test',
      subject: 'Captured',
      html: '<p>x</p>',
      text: 'x',
      mode: 'off',
    });
    const row = app.db.prepare('SELECT * FROM email_log WHERE id = ?').get(logId) as {
      status: string;
      error: string;
    };
    expect(row.status).toBe('skipped');
    expect(row.error).toBe('mail not configured');
    expect(
      (
        app.db.prepare("SELECT count(*) AS n FROM jobs WHERE kind = 'email_send'").get() as {
          n: number;
        }
      ).n,
    ).toBe(0);
    await app.close();
  });
});

describe('invite email', () => {
  test('invite with an email sends the branded link and escapes the org name', async () => {
    const app = await createTestApp({ config: { mailFake: true } });
    await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      headers: { 'x-requested-with': 'tuesday' },
      payload: {
        orgName: '<script>Acme</script>',
        name: 'Olivia Owner',
        email: 'owner@acme.test',
        password: 'password123',
      },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'tuesday' },
      payload: { email: 'owner@acme.test', password: 'password123' },
    });
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const invite = await app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { 'x-requested-with': 'tuesday', cookie },
      payload: { email: 'new@acme.test', role: 'member' },
    });
    expect(invite.statusCode).toBe(201);
    expect(invite.json().invite.emailedAt).toBeTruthy();
    await runOnce(app, JOB_HANDLERS);
    const mail = app.mailer.outbox.at(-1)!;
    expect(mail.subject).toContain('invited you to');
    expect(mail.html).toContain('/invite/');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    await app.close();
  });

  test('resend without an email is a 400 and mail off keeps a link-only invite', async () => {
    const app = await createTestApp({ config: { mailFake: false } });
    const { cookie } = await setupOwner(app);
    const linkOnly = await app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { 'x-requested-with': 'tuesday', cookie },
      payload: { email: 'off@acme.test', role: 'member' },
    });
    expect(linkOnly.statusCode).toBe(201);
    expect(linkOnly.json().invite.emailedAt).toBeNull();
    const resend = await app.inject({
      method: 'POST',
      url: `/api/invites/${linkOnly.json().invite.id}/resend`,
      headers: { 'x-requested-with': 'tuesday', cookie },
    });
    expect(resend.statusCode).toBe(503);
    const emailLess = await app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: { 'x-requested-with': 'tuesday', cookie },
      payload: { role: 'member' },
    });
    const noEmail = await app.inject({
      method: 'POST',
      url: `/api/invites/${emailLess.json().invite.id}/resend`,
      headers: { 'x-requested-with': 'tuesday', cookie },
    });
    expect(noEmail.statusCode).toBe(400);
    await app.close();
  });
});
