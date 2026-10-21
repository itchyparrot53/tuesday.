import type { FastifyInstance } from 'fastify';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AppError, conflict, notFound } from '../lib/errors';
import { parseBody } from '../lib/validate';
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  setupSchema,
} from '../../shared/schemas';
import { hashPassword, verifyPassword } from '../lib/password';
import {
  createUser,
  getUserRowByEmail,
  listUsers,
  toUser,
  updateUser,
  type UserRow,
} from '../services/users';
import { getOrg, getSetting, setOrg, setSetting } from '../services/settings';
import { DEFAULT_PREFERENCES } from '../../shared/types';
import { isValidTimezone } from '../lib/timezone';
import { getUserById } from '../services/users';
import type { InviteInfo } from '../../shared/types';
import { createPasswordReset, getPasswordReset, maskEmail } from '../services/passwords';
import { queueEmail } from '../services/email';
import { resetEmail } from '../email/templates';
import { audit } from '../services/audit';
import { createOidcProvider, oidcChallenge, oidcPkce } from './oidc';
import {
  createUser as makeUser,
  getUserById as findUser,
  getUserRowByEmail as findUserByEmail,
  toUser as userFromRow,
} from '../services/users';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  deleteUserSessions,
  setSessionCookie,
} from './sessions';

const DUMMY_HASH = hashPassword('tuesday-dummy-password');

interface InviteRow {
  id: number;
  token: string;
  email: string | null;
  role: 'admin' | 'member' | 'viewer';
  created_by: number;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  is_guest: number;
  board_access: string;
}

function findInvite(app: FastifyInstance, token: string): InviteRow {
  const row = app.db.prepare('SELECT * FROM invites WHERE token = ?').get(token) as
    InviteRow | undefined;
  if (!row) throw notFound('Invite not found');
  if (row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
    throw new AppError(410, 'gone', 'This invite has expired or was already used');
  }
  return row;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const config = app.config;
  const oidcProvider = config.oidc ? createOidcProvider(config.oidc) : null;

  function cookieSecret(): string {
    let secret = getSetting<string>(app.db, 'oidc:cookie-secret', '');
    if (!secret) {
      secret = randomBytes(32).toString('hex');
      setSetting(app.db, 'oidc:cookie-secret', secret);
    }
    return secret;
  }

  function sign(value: string): string {
    return createHmac('sha256', cookieSecret()).update(value).digest('base64url');
  }

  function readOidcCookie(raw: string | undefined): {
    state: string;
    nonce: string;
    verifier: string;
    invite: string | null;
    next: string;
  } | null {
    if (!raw) return null;
    const [body, signature] = raw.split('.');
    if (!body || !signature) return null;
    const expected = sign(body);
    if (
      expected.length !== signature.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    ) {
      return null;
    }
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  function deny(reason: string, req: Parameters<typeof audit>[1]): never {
    audit(app.db, req, { action: 'auth.sso_denied', targetKind: 'sso', targetLabel: reason });
    throw Object.assign(new Error(reason), {
      redirect: `/login?error=${encodeURIComponent(reason)}`,
    });
  }

  app.get('/api/auth/oidc/start', async (req, reply) => {
    if (!config.oidc || !oidcProvider) throw notFound('Single sign-on is not configured');
    const query = req.query as { invite?: string; next?: string };
    const { verifier, state, nonce } = oidcPkce();
    const challenge = await oidcChallenge(verifier);
    const next =
      query.next && query.next.startsWith('/') && !query.next.startsWith('//') ? query.next : '/';
    const payload = Buffer.from(
      JSON.stringify({ state, nonce, verifier, invite: query.invite ?? null, next }),
    ).toString('base64url');
    reply.setCookie('tue_oidc', `${payload}.${sign(payload)}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      maxAge: 600,
    });
    const url = await oidcProvider.authUrl({
      state,
      nonce,
      codeChallenge: challenge,
      redirectUri: `${config.appUrl}/api/auth/oidc/callback`,
    });
    return reply.redirect(url);
  });

  app.get('/api/auth/oidc/callback', async (req, reply) => {
    if (!config.oidc || !oidcProvider) throw notFound('Single sign-on is not configured');
    const stored = readOidcCookie(req.cookies.tue_oidc);
    reply.clearCookie('tue_oidc', { path: '/' });
    if (!stored) return reply.redirect('/login?error=sso_failed');
    const query = req.query as { state?: string; code?: string; error?: string };
    if (query.error || !query.code || query.state !== stored.state) {
      return reply.redirect('/login?error=sso_failed');
    }
    let identity;
    try {
      identity = await oidcProvider.callback({
        currentUrl: new URL(req.url, config.appUrl),
        state: stored.state,
        nonce: stored.nonce,
        codeVerifier: stored.verifier,
      });
    } catch {
      audit(app.db, req, { action: 'auth.sso_denied', targetLabel: 'callback_failed' });
      return reply.redirect('/login?error=sso_failed');
    }
    if (!identity.emailVerified || !identity.email) {
      audit(app.db, req, { action: 'auth.sso_denied', targetLabel: 'sso_email_unverified' });
      return reply.redirect('/login?error=sso_email_unverified');
    }

    const bySubject = app.db
      .prepare('SELECT * FROM users WHERE sso_subject = ?')
      .get(identity.sub) as UserRow | undefined;
    let row: UserRow | undefined = bySubject;
    if (row && row.is_active !== 1) {
      return reply.redirect('/login?error=sso_account_inactive');
    }
    if (!row) {
      const byEmail = findUserByEmail(app.db, identity.email);
      if (byEmail && byEmail.is_active === 1) {
        app.db
          .prepare('UPDATE users SET sso_subject = ? WHERE id = ?')
          .run(identity.sub, byEmail.id);
        row = app.db.prepare('SELECT * FROM users WHERE id = ?').get(byEmail.id) as UserRow;
      }
    }
    if (!row) {
      const invite = stored.invite
        ? (app.db.prepare('SELECT * FROM invites WHERE token = ?').get(stored.invite) as
            InviteRow | undefined)
        : undefined;
      const validInvite =
        invite &&
        !invite.used_at &&
        new Date(invite.expires_at).getTime() > Date.now() &&
        (!invite.email || invite.email.toLowerCase() === identity.email.toLowerCase());
      if (validInvite && invite) {
        const created = app.db.transaction(() => {
          const user = makeUser(app.db, {
            email: identity.email,
            name: identity.name || identity.email,
            password_hash: '!sso',
            role: invite.role,
          });
          app.db
            .prepare('UPDATE users SET sso_subject = ? WHERE id = ?')
            .run(identity.sub, user.id);
          app.db
            .prepare('UPDATE invites SET used_at = ? WHERE id = ?')
            .run(new Date().toISOString(), invite.id);
          if (invite.is_guest === 1) {
            app.db.prepare('UPDATE users SET is_guest = 1 WHERE id = ?').run(user.id);
            const access = JSON.parse(invite.board_access || '[]') as {
              boardId: number;
              access: 'view' | 'comment' | 'edit';
            }[];
            for (const entry of access) {
              app.db
                .prepare(
                  'INSERT INTO board_members (board_id, user_id, access, added_by, created_at) VALUES (?, ?, ?, ?, ?)',
                )
                .run(
                  entry.boardId,
                  user.id,
                  entry.access,
                  invite.created_by,
                  new Date().toISOString(),
                );
            }
          }
          return app.db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow;
        })();
        row = created;
        audit(app.db, req, {
          action: 'user.joined',
          actor: userFromRow(created),
          targetKind: 'user',
          targetId: created.id,
        });
      } else {
        const domain = identity.email.split('@').pop()?.toLowerCase() ?? '';
        if (config.oidc.allowedDomains.includes(domain)) {
          const created = makeUser(app.db, {
            email: identity.email,
            name: identity.name || identity.email,
            password_hash: '!sso',
            role: config.oidc.defaultRole,
          });
          app.db
            .prepare('UPDATE users SET sso_subject = ? WHERE id = ?')
            .run(identity.sub, created.id);
          row = app.db.prepare('SELECT * FROM users WHERE id = ?').get(created.id) as UserRow;
          audit(app.db, req, { action: 'user.joined', actor: created, targetId: created.id });
        } else {
          audit(app.db, req, { action: 'auth.sso_denied', targetLabel: 'sso_not_invited' });
          return reply.redirect('/login?error=sso_not_invited');
        }
      }
    }
    if (!row || row.is_active !== 1) return reply.redirect('/login?error=sso_account_inactive');
    const { token } = createSession(app.db, row.id, {
      userAgent: String(req.headers['user-agent'] ?? ''),
      ip: req.ip,
    });
    setSessionCookie(reply, token, config);
    const user = findUser(app.db, row.id)!;
    audit(app.db, req, { action: 'auth.sso_login', actor: user, targetId: user.id });
    return reply.redirect(stored.next || '/');
  });

  app.get('/api/auth/state', async () => {
    const count = (app.db.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n;
    const org = getOrg(app.db);
    return {
      needsSetup: count === 0,
      orgName: count === 0 ? null : org.name,
      sso: {
        enabled: Boolean(config.oidc),
        label: config.oidc?.buttonLabel ?? 'Sign in with SSO',
        only: config.oidc?.only ?? false,
      },
      mail: app.mailer.mode !== 'off',
    };
  });

  app.post(
    '/api/auth/setup',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = parseBody(setupSchema, req.body);
      if (body.timezone && !isValidTimezone(body.timezone)) {
        throw new AppError(400, 'validation_error', 'Unknown timezone');
      }
      const password_hash = await hashPassword(body.password);
      const user = app.db.transaction(() => {
        const exists = (app.db.prepare('SELECT count(*) AS n FROM users').get() as { n: number }).n;
        if (exists > 0) throw conflict('An organisation already exists');
        const created = createUser(app.db, {
          email: body.email,
          name: body.name,
          password_hash,
          role: 'owner',
        });
        setOrg(app.db, { name: body.orgName, timezone: body.timezone ?? 'UTC' });
        return updateUser(app.db, created.id, {
          preferences: {
            ...DEFAULT_PREFERENCES,
            colorTheme: body.colorTheme ?? DEFAULT_PREFERENCES.colorTheme,
            theme: body.theme ?? DEFAULT_PREFERENCES.theme,
          },
        });
      })();
      const { token } = createSession(app.db, user.id, {
        userAgent: String(req.headers['user-agent'] ?? ''),
        ip: req.ip,
      });
      setSessionCookie(reply, token, config);
      audit(app.db, req, {
        action: 'user.joined',
        actor: user,
        targetKind: 'user',
        targetId: user.id,
      });
      reply.code(201);
      return { user };
    },
  );

  app.post(
    '/api/auth/forgot',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const body = parseBody(forgotPasswordSchema, req.body);
      const row = app.db
        .prepare('SELECT * FROM users WHERE lower(email) = lower(?) AND is_active = 1')
        .get(body.email) as UserRow | undefined;
      audit(app.db, req, {
        action: 'auth.password_reset_requested',
        targetKind: 'email',
        targetLabel: body.email,
      });
      if (row && row.password_hash !== '!sso' && app.mailer.mode !== 'off') {
        const reset = createPasswordReset(app.db, {
          userId: row.id,
          appUrl: config.appUrl,
        });
        const mail = resetEmail({
          appUrl: config.appUrl,
          name: row.name,
          link: reset.link,
        });
        queueEmail(app.db, {
          to: row.email,
          userId: row.id,
          kind: 'password_reset',
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          mode: app.mailer.mode,
        });
      }
      reply.code(202);
      return { ok: true };
    },
  );

  app.get('/api/auth/reset/:token', async (req) => {
    const { token } = req.params as { token: string };
    const row = getPasswordReset(app.db, token);
    if (!row) throw new AppError(410, 'gone', 'This link has expired or was already used');
    return { email: maskEmail(row.email) };
  });

  app.post(
    '/api/auth/reset',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const body = parseBody(resetPasswordSchema, req.body);
      const row = getPasswordReset(app.db, body.token);
      if (!row) throw new AppError(410, 'gone', 'This link has expired or was already used');
      const password_hash = await hashPassword(body.password);
      const now = new Date().toISOString();
      const user = app.db.transaction(() => {
        const fresh = getPasswordReset(app.db, body.token);
        if (!fresh) throw new AppError(410, 'gone', 'This link has expired or was already used');
        app.db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(now, fresh.id);
        app.db
          .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
          .run(password_hash, fresh.user_id);
        deleteUserSessions(app.db, fresh.user_id);
        return getUserById(app.db, fresh.user_id);
      })();
      if (!user) throw new AppError(410, 'gone', 'This link has expired or was already used');
      const { token } = createSession(app.db, user.id, {
        userAgent: String(req.headers['user-agent'] ?? ''),
        ip: req.ip,
      });
      setSessionCookie(reply, token, config);
      audit(app.db, req, {
        action: 'auth.password_reset',
        actor: user,
        targetKind: 'user',
        targetId: user.id,
      });
      return { user };
    },
  );

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = parseBody(loginSchema, req.body);
      const row = getUserRowByEmail(app.db, body.email);
      if (!row) {
        await verifyPassword(body.password, await DUMMY_HASH);
        audit(app.db, req, {
          action: 'auth.login_failed',
          targetKind: 'email',
          targetLabel: body.email,
        });
        throw new AppError(401, 'invalid_credentials', 'Incorrect email or password');
      }
      const ok = await verifyPassword(body.password, row.password_hash);
      if (!ok || row.is_active !== 1) {
        audit(app.db, req, {
          action: 'auth.login_failed',
          targetKind: 'email',
          targetLabel: body.email,
        });
        throw new AppError(401, 'invalid_credentials', 'Incorrect email or password');
      }
      if (config.oidc?.only && row.role !== 'owner') {
        throw new AppError(403, 'sso_required', 'Use single sign-on to sign in');
      }
      const { token } = createSession(app.db, row.id, {
        userAgent: String(req.headers['user-agent'] ?? ''),
        ip: req.ip,
      });
      setSessionCookie(reply, token, config);
      const signedIn = toUser(row);
      audit(app.db, req, {
        action: 'auth.login',
        actor: signedIn,
        targetKind: 'user',
        targetId: row.id,
      });
      let signedInUser = signedIn;
      return { user: signedInUser };
    },
  );

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.user) audit(app.db, req, { action: 'auth.logout', actor: req.user });
    const token = req.cookies.tue_session;
    if (token) deleteSession(app.db, token);
    clearSessionCookie(reply);
    reply.code(204);
    return null;
  });

  app.get('/api/auth/me', async (req) => {
    return { user: req.user!, org: getOrg(app.db) };
  });

  app.get('/api/invites/:token', async (req) => {
    const { token } = req.params as { token: string };
    const row = findInvite(app, token);
    const org = getOrg(app.db);
    const inviter = getUserById(app.db, row.created_by);
    const members = app.db
      .prepare(
        'SELECT name, color FROM users WHERE is_active = 1 ORDER BY created_at DESC, id DESC LIMIT 5',
      )
      .all() as { name: string; color: string }[];
    const memberCount = (
      app.db.prepare('SELECT count(*) AS n FROM users WHERE is_active = 1').get() as { n: number }
    ).n;
    const boardAccess = JSON.parse(row.board_access || '[]') as {
      boardId: number;
      access: 'view' | 'comment' | 'edit';
    }[];
    const boardNames = boardAccess.map((entry) => {
      const board = app.db.prepare('SELECT name FROM boards WHERE id = ?').get(entry.boardId) as
        { name: string } | undefined;
      return board?.name ?? 'a board';
    });
    const info: InviteInfo = {
      email: row.email,
      role: row.role,
      orgName: org.name,
      boardNames,
      invitedBy: inviter ? { name: inviter.name, color: inviter.color } : null,
      memberCount,
      members,
    };
    return info;
  });

  app.post(
    '/api/auth/accept-invite',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = parseBody(acceptInviteSchema, req.body);
      const invite = findInvite(app, body.token);
      if (invite.email && invite.email.toLowerCase() !== body.email.toLowerCase()) {
        throw new AppError(400, 'validation_error', 'This invite was issued to a different email');
      }
      const password_hash = await hashPassword(body.password);
      const user = app.db.transaction(() => {
        const fresh = app.db.prepare('SELECT * FROM invites WHERE id = ?').get(invite.id) as
          InviteRow | undefined;
        if (!fresh || fresh.used_at || new Date(fresh.expires_at).getTime() <= Date.now()) {
          throw new AppError(410, 'gone', 'This invite has expired or was already used');
        }
        const existing = app.db.prepare('SELECT id FROM users WHERE email = ?').get(body.email) as
          { id: number } | undefined;
        if (existing) throw conflict('That email is already registered');
        const created = createUser(app.db, {
          email: body.email,
          name: body.name,
          password_hash,
          role: fresh.role,
        });
        app.db
          .prepare('UPDATE invites SET used_at = ? WHERE id = ?')
          .run(new Date().toISOString(), invite.id);
        if (fresh.is_guest === 1) {
          app.db.prepare('UPDATE users SET is_guest = 1 WHERE id = ?').run(created.id);
          const access = JSON.parse(fresh.board_access || '[]') as {
            boardId: number;
            access: 'view' | 'comment' | 'edit';
          }[];
          for (const entry of access) {
            app.db
              .prepare(
                'INSERT INTO board_members (board_id, user_id, access, added_by, created_at) VALUES (?, ?, ?, ?, ?)',
              )
              .run(
                entry.boardId,
                created.id,
                entry.access,
                invite.created_by,
                new Date().toISOString(),
              );
          }
        }
        return updateUser(app.db, created.id, {
          preferences: {
            ...DEFAULT_PREFERENCES,
            colorTheme: body.colorTheme ?? DEFAULT_PREFERENCES.colorTheme,
            theme: body.theme ?? DEFAULT_PREFERENCES.theme,
          },
        });
      })();
      const { token } = createSession(app.db, user.id, {
        userAgent: String(req.headers['user-agent'] ?? ''),
        ip: req.ip,
      });
      setSessionCookie(reply, token, config);
      audit(app.db, req, {
        action: 'user.joined',
        actor: user,
        targetKind: 'user',
        targetId: user.id,
      });
      reply.code(201);
      return { user };
    },
  );
}

export function userRowToUser(row: UserRow) {
  return toUser(row);
}

export function allUsers(app: FastifyInstance) {
  return listUsers(app.db);
}
