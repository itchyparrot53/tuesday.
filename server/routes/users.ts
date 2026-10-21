import type { FastifyInstance } from 'fastify';
import type { Invite } from '../../shared/types';
import {
  inviteBatchSchema,
  inviteCreateSchema,
  orgSchema,
  profileSchema,
  updateUserSchema,
  notificationPrefsSchema,
} from '../../shared/schemas';
import { badRequest, forbidden, notFound, AppError } from '../lib/errors';
import { newToken } from '../lib/tokens';
import { parseBody, parseId } from '../lib/validate';
import { hashPassword, verifyPassword } from '../lib/password';
import { isAdmin } from '../services/permissions';
import { getUserById, listUsers, updateUser } from '../services/users';
import { getOrg, setOrg } from '../services/settings';
import { DEFAULT_PREFERENCES } from '../../shared/types';
import { isValidTimezone } from '../lib/timezone';
import { deleteOtherSessions, deleteUserSessions, listSessions } from '../auth/sessions';
import { bus } from '../realtime/bus';
import { queueEmail } from '../services/email';
import { inviteEmail } from '../email/templates';
import { createPasswordReset } from '../services/passwords';
import { audit } from '../services/audit';
import { getNotificationPrefs, setNotificationPrefs } from '../services/notify-prefs';

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
  emailed_at: string | null;
}

function toInvite(row: InviteRow, appUrl: string): Invite {
  return {
    id: row.id,
    token: row.token,
    url: `${appUrl}/invite/${row.token}`,
    email: row.email,
    role: row.role,
    isGuest: row.is_guest === 1,
    boardAccess: JSON.parse(row.board_access || '[]') as Invite['boardAccess'],
    emailedAt: row.emailed_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

function createInvite(
  app: FastifyInstance,
  actorId: number,
  email: string | null,
  role: 'admin' | 'member' | 'viewer',
  options: {
    send?: boolean;
    isGuest?: boolean;
    boardAccess?: { boardId: number; access: 'view' | 'comment' | 'edit' }[];
  } = {},
): Invite {
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const boardAccess = options.boardAccess ?? [];
  if (options.isGuest && boardAccess.length === 0) {
    throw badRequest('Guest invites need at least one board');
  }
  const info = app.db
    .prepare(
      `INSERT INTO invites (token, email, role, created_by, expires_at, created_at, is_guest, board_access)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      token,
      email,
      role,
      actorId,
      expiresAt,
      now.toISOString(),
      options.isGuest ? 1 : 0,
      JSON.stringify(boardAccess),
    );
  if (email && (options.send ?? true) && app.mailer.mode !== 'off') {
    const actor = getUserById(app.db, actorId);
    const org = getOrg(app.db);
    const boardNames = boardAccess.map((entry) => {
      const board = app.db.prepare('SELECT name FROM boards WHERE id = ?').get(entry.boardId) as
        { name: string } | undefined;
      return board?.name ?? 'a board';
    });
    const mail = inviteEmail({
      appUrl: app.config.appUrl,
      orgName: org.name,
      inviterName: actor?.name ?? 'A teammate',
      role,
      link: `${app.config.appUrl}/invite/${token}`,
      isGuest: Boolean(options.isGuest),
      boardNames,
    });
    queueEmail(app.db, {
      to: email,
      kind: 'invite',
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      mode: app.mailer.mode,
    });
    app.db
      .prepare('UPDATE invites SET emailed_at = ? WHERE id = ?')
      .run(now.toISOString(), Number(info.lastInsertRowid));
  }
  const row = app.db
    .prepare('SELECT * FROM invites WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as InviteRow;
  return toInvite(row, app.config.appUrl);
}

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/users', async (req) => {
    const user = req.user!;
    if (!user.isGuest) return { users: listUsers(app.db) };
    const boardRows = app.db
      .prepare('SELECT board_id FROM board_members WHERE user_id = ?')
      .all(user.id) as { board_id: number }[];
    const visible = new Set<number>([user.id]);
    for (const row of boardRows) {
      const board = app.db
        .prepare('SELECT created_by FROM boards WHERE id = ?')
        .get(row.board_id) as { created_by: number } | undefined;
      if (board) visible.add(board.created_by);
      const members = app.db
        .prepare('SELECT user_id FROM board_members WHERE board_id = ?')
        .all(row.board_id) as { user_id: number }[];
      for (const member of members) visible.add(member.user_id);
    }
    const admins = app.db
      .prepare("SELECT id FROM users WHERE role IN ('owner','admin') AND is_active = 1")
      .all() as { id: number }[];
    for (const admin of admins) visible.add(admin.id);
    return {
      users: listUsers(app.db)
        .filter((entry) => visible.has(entry.id) && entry.isActive)
        .map((entry) => ({ ...entry, email: '' })),
    };
  });

  app.patch('/api/users/:id', async (req) => {
    const actor = req.user!;
    if (!isAdmin(actor)) throw forbidden();
    const id = parseId((req.params as { id: string }).id);
    const target = getUserById(app.db, id);
    if (!target) throw notFound('User not found');
    if (target.role === 'owner') throw forbidden('The owner cannot be changed');
    const body = parseBody(updateUserSchema, req.body);
    if (body.role === undefined && body.isActive === undefined) {
      throw badRequest('Nothing to update');
    }
    const user = app.db.transaction(() => {
      const updated = updateUser(app.db, id, {
        role: body.role,
        isActive: body.isActive,
      });
      if (body.isActive === false) deleteUserSessions(app.db, id);
      return updated;
    })();
    bus.publish({ event: { type: 'users.changed' } });
    if (body.role !== undefined && body.role !== target.role) {
      audit(app.db, req, {
        action: 'user.role_changed',
        targetKind: 'user',
        targetId: id,
        targetLabel: target.name,
        data: { from: target.role, to: body.role },
      });
    }
    if (body.isActive !== undefined) {
      audit(app.db, req, {
        action: body.isActive ? 'user.reactivated' : 'user.deactivated',
        targetKind: 'user',
        targetId: id,
        targetLabel: target.name,
      });
    }
    return { user };
  });

  app.post('/api/users/:id/reset-link', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const id = parseId((req.params as { id: string }).id);
    const target = getUserById(app.db, id);
    if (!target) throw notFound('User not found');
    const reset = createPasswordReset(app.db, {
      userId: target.id,
      createdBy: req.user!.id,
      appUrl: app.config.appUrl,
    });
    audit(app.db, req, {
      action: 'auth.password_reset_link_created',
      targetKind: 'user',
      targetId: target.id,
      targetLabel: target.name,
    });
    reply.code(201);
    return { link: reset.link };
  });

  app.get('/api/me/notification-prefs', async (req) => getNotificationPrefs(app.db, req.user!.id));

  app.put('/api/me/notification-prefs', async (req) => {
    const body = parseBody(notificationPrefsSchema, req.body);
    return setNotificationPrefs(app.db, req.user!.id, body);
  });

  app.get('/api/invites', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const rows = app.db
      .prepare('SELECT * FROM invites WHERE used_at IS NULL AND expires_at > ? ORDER BY id DESC')
      .all(new Date().toISOString()) as InviteRow[];
    return { invites: rows.map((r) => toInvite(r, app.config.appUrl)) };
  });

  app.post('/api/invites', async (req, reply) => {
    const actor = req.user!;
    if (!isAdmin(actor)) throw forbidden();
    const body = parseBody(inviteCreateSchema, req.body);
    const invite = createInvite(app, actor.id, body.email ?? null, body.role, {
      send: body.send,
      isGuest: body.isGuest,
      boardAccess: body.boardAccess,
    });
    audit(app.db, req, {
      action: 'user.invited',
      targetKind: 'invite',
      targetId: invite.id,
      targetLabel: invite.email ?? 'link invite',
      data: { role: invite.role, isGuest: invite.isGuest },
    });
    reply.code(201);
    return { invite };
  });

  app.post('/api/invites/:id/resend', async (req, reply) => {
    const actor = req.user!;
    if (!isAdmin(actor)) throw forbidden();
    const id = parseId((req.params as { id: string }).id);
    const row = app.db.prepare('SELECT * FROM invites WHERE id = ?').get(id) as
      InviteRow | undefined;
    if (!row) throw notFound('Invite not found');
    if (!row.email) throw badRequest('This invite has no email address');
    if (app.mailer.mode === 'off') {
      throw new AppError(503, 'mail_unavailable', 'Email is not configured');
    }
    const org = getOrg(app.db);
    const actorUser = getUserById(app.db, actor.id);
    const boardAccess = JSON.parse(row.board_access || '[]') as Invite['boardAccess'];
    const boardNames = boardAccess.map((entry) => {
      const board = app.db.prepare('SELECT name FROM boards WHERE id = ?').get(entry.boardId) as
        { name: string } | undefined;
      return board?.name ?? 'a board';
    });
    const mail = inviteEmail({
      appUrl: app.config.appUrl,
      orgName: org.name,
      inviterName: actorUser?.name ?? 'A teammate',
      role: row.role,
      link: `${app.config.appUrl}/invite/${row.token}`,
      isGuest: row.is_guest === 1,
      boardNames,
    });
    queueEmail(app.db, {
      to: row.email,
      kind: 'invite',
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      mode: app.mailer.mode,
    });
    app.db
      .prepare('UPDATE invites SET emailed_at = ? WHERE id = ?')
      .run(new Date().toISOString(), id);
    reply.code(202);
    return { ok: true };
  });

  app.post('/api/invites/batch', async (req, reply) => {
    const actor = req.user!;
    if (!isAdmin(actor)) throw forbidden();
    const body = parseBody(inviteBatchSchema, req.body);
    const seen = new Set<string>();
    const bad = new Set<string>();
    for (const invite of body.invites) {
      if (seen.has(invite.email)) bad.add(invite.email);
      seen.add(invite.email);
      const existing = app.db
        .prepare('SELECT id FROM users WHERE lower(email) = lower(?)')
        .get(invite.email);
      if (existing) bad.add(invite.email);
    }
    if (bad.size > 0) {
      const emails = [...bad];
      throw badRequest(`These emails can't be invited: ${emails.join(', ')}`, { emails });
    }
    const invites = app.db.transaction(() =>
      body.invites.map((invite) =>
        createInvite(app, actor.id, invite.email, invite.role, {
          send: invite.send,
          isGuest: invite.isGuest,
          boardAccess: invite.boardAccess,
        }),
      ),
    )();
    reply.code(201);
    return { invites };
  });

  app.delete('/api/invites/:id', async (req, reply) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const id = parseId((req.params as { id: string }).id);
    const result = app.db.prepare('DELETE FROM invites WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Invite not found');
    audit(app.db, req, { action: 'user.invite_revoked', targetKind: 'invite', targetId: id });
    reply.code(204);
    return null;
  });

  app.get('/api/me/sessions', async (req) => ({
    sessions: listSessions(app.db, req.user!.id, req.cookies.tue_session),
  }));

  app.delete('/api/me/sessions/others', async (req, reply) => {
    const token = req.cookies.tue_session;
    if (!token) throw new AppError(401, 'unauthenticated', 'Sign in to continue');
    deleteOtherSessions(app.db, req.user!.id, token);
    audit(app.db, req, { action: 'sessions.revoked' });
    reply.code(204);
    return null;
  });

  app.patch('/api/me', async (req) => {
    const actor = req.user!;
    const body = parseBody(profileSchema, req.body);
    if (body.newPassword !== undefined) {
      if (!body.currentPassword) throw badRequest('Current password is required');
      const row = app.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(actor.id) as {
        password_hash: string;
      };
      const ok = await verifyPassword(body.currentPassword, row.password_hash);
      if (!ok) throw new AppError(401, 'invalid_credentials', 'Current password is incorrect');
    }
    const password_hash = body.newPassword ? await hashPassword(body.newPassword) : undefined;
    const preferences = body.preferences
      ? { ...actor.preferences, ...body.preferences }
      : undefined;
    if (preferences) {
      // Guarantee a complete, validated object even for legacy empty settings.
      Object.assign(preferences, {
        theme: preferences.theme ?? DEFAULT_PREFERENCES.theme,
        density: preferences.density ?? DEFAULT_PREFERENCES.density,
        sidebarCollapsed: preferences.sidebarCollapsed ?? DEFAULT_PREFERENCES.sidebarCollapsed,
        collapsedWorkspaceIds:
          preferences.collapsedWorkspaceIds ?? DEFAULT_PREFERENCES.collapsedWorkspaceIds,
        homeBoardFilter: preferences.homeBoardFilter ?? DEFAULT_PREFERENCES.homeBoardFilter,
        homeDateFilter: preferences.homeDateFilter ?? DEFAULT_PREFERENCES.homeDateFilter,
        homeFavoritesOnly: preferences.homeFavoritesOnly ?? DEFAULT_PREFERENCES.homeFavoritesOnly,
        savedQueueViews: preferences.savedQueueViews ?? DEFAULT_PREFERENCES.savedQueueViews,
        myWorkQueueViews: preferences.myWorkQueueViews ?? DEFAULT_PREFERENCES.myWorkQueueViews,
      });
    }
    const user = updateUser(app.db, actor.id, {
      name: body.name,
      title: body.title,
      password_hash,
      preferences,
    });
    if (password_hash) audit(app.db, req, { action: 'auth.password_changed', actor });
    bus.publish({ event: { type: 'users.changed' } });
    return { user };
  });

  app.patch('/api/org', async (req) => {
    if (!isAdmin(req.user!)) throw forbidden();
    const body = parseBody(orgSchema, req.body);
    if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
      throw badRequest('Unknown timezone');
    }
    const org = setOrg(app.db, body);
    audit(app.db, req, { action: 'settings.org_changed', targetKind: 'org', data: body });
    return { org };
  });
}
