import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody, parseId } from '../lib/validate';
import { assertBoardAccess } from '../services/permissions';
import {
  addGuestToBoard,
  listBoardMembers,
  removeBoardMember,
  setBoardMember,
  setBoardPrivacy,
} from '../services/board-members';
import { getBoardRow } from '../services/boards';
import { audit } from '../services/audit';
import { getOrg } from '../services/settings';
import { inviteEmail } from '../email/templates';
import { queueEmail } from '../services/email';
import { newToken } from '../lib/tokens';

const accessSchema = z.object({ access: z.enum(['view', 'comment', 'edit', 'manage']) });
const guestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  access: z.enum(['view', 'comment', 'edit']),
});
const privacySchema = z.object({ isPrivate: z.boolean() });

export async function sharingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/boards/:id/members', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    assertBoardAccess(app.db, req.user!, boardId, 'view');
    const board = getBoardRow(app.db, boardId);
    return { isPrivate: board.is_private === 1, members: listBoardMembers(app.db, boardId) };
  });

  app.put('/api/boards/:id/members/:userId', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    const userId = parseId((req.params as { userId: string }).userId);
    assertBoardAccess(app.db, req.user!, boardId, 'manage');
    const body = parseBody(accessSchema, req.body);
    const existing = app.db
      .prepare('SELECT 1 AS ok FROM board_members WHERE board_id = ? AND user_id = ?')
      .get(boardId, userId);
    const result = setBoardMember(app.db, req.user!, boardId, userId, body.access);
    audit(app.db, req, {
      action: existing ? 'board.member_changed' : 'board.member_added',
      targetKind: 'board',
      targetId: boardId,
      data: { userId, access: body.access },
    });
    return result;
  });

  app.delete('/api/boards/:id/members/:userId', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    const userId = parseId((req.params as { userId: string }).userId);
    assertBoardAccess(app.db, req.user!, boardId, 'manage');
    const result = removeBoardMember(app.db, req.user!, boardId, userId);
    audit(app.db, req, {
      action: 'board.member_removed',
      targetKind: 'board',
      targetId: boardId,
      data: { userId },
    });
    return result;
  });

  app.patch('/api/boards/:id/privacy', async (req) => {
    const boardId = parseId((req.params as { id: string }).id);
    assertBoardAccess(app.db, req.user!, boardId, 'manage');
    const body = parseBody(privacySchema, req.body);
    const result = setBoardPrivacy(app.db, req.user!, boardId, body.isPrivate);
    audit(app.db, req, {
      action: 'board.privacy_changed',
      targetKind: 'board',
      targetId: boardId,
      data: { isPrivate: body.isPrivate },
    });
    return result;
  });

  app.post('/api/boards/:id/guests', async (req, reply) => {
    const boardId = parseId((req.params as { id: string }).id);
    assertBoardAccess(app.db, req.user!, boardId, 'manage');
    const body = parseBody(guestSchema, req.body);
    const result = addGuestToBoard(app.db, req.user!, boardId, body.email, body.access);
    if (result.existing) {
      reply.code(201);
      return { members: result.members };
    }
    const board = getBoardRow(app.db, boardId);
    const token = newToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const info = app.db
      .prepare(
        `INSERT INTO invites (token, email, role, created_by, expires_at, created_at, is_guest, board_access)
         VALUES (?, ?, 'member', ?, ?, ?, 1, ?)`,
      )
      .run(
        token,
        body.email,
        req.user!.id,
        expiresAt,
        now.toISOString(),
        JSON.stringify([{ boardId, access: body.access }]),
      );
    const mail = inviteEmail({
      appUrl: app.config.appUrl,
      orgName: getOrg(app.db).name,
      inviterName: req.user!.name,
      role: 'member',
      link: `${app.config.appUrl}/invite/${token}`,
      isGuest: true,
      boardNames: [board.name],
    });
    if (app.mailer.mode !== 'off') {
      queueEmail(app.db, {
        to: body.email,
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
    reply.code(201);
    return {
      invite: {
        id: Number(info.lastInsertRowid),
        email: body.email,
        url: `${app.config.appUrl}/invite/${token}`,
        role: 'member',
        isGuest: true,
        boardAccess: [{ boardId, access: body.access }],
        emailedAt: app.mailer.mode === 'off' ? null : now.toISOString(),
        expiresAt,
        usedAt: null,
        createdAt: now.toISOString(),
        token,
      },
      members: listBoardMembers(app.db, boardId),
    };
  });
}
