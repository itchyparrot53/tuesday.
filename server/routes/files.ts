import type { FastifyInstance } from 'fastify';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getItemDto } from '../services/items';
import { assertBoardAccess, boardIdForItem } from '../services/permissions';
import { getBoardRow } from '../services/boards';
import {
  addFile,
  getFileRow,
  isInlineMime,
  listFiles,
  normalizeMime,
  removeFileRow,
  sanitizeFilename,
} from '../services/files';
import { isAdmin } from '../services/permissions';
import { AppError, badRequest, forbidden, notFound } from '../lib/errors';
import { parseId } from '../lib/validate';
import { getColumnRow } from '../services/columns';

function storagePath(uploadsDir: string, key: string): string {
  return path.join(uploadsDir, key.slice(0, 2), key);
}

export async function filesRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/items/:id/files', async (req, reply) => {
    const user = req.user!;
    const itemId = parseId((req.params as { id: string }).id);
    const boardId = boardIdForItem(app.db, itemId);
    const board = getBoardRow(app.db, boardId);
    assertBoardAccess(app.db, user, board.id, 'edit');
    const part = await req.file();
    if (!part) throw badRequest('No file uploaded');
    const fields = part.fields as Record<string, { value?: unknown } | undefined>;
    const rawColumnId = fields.columnId?.value;
    const columnId = rawColumnId ? Number(rawColumnId) : null;
    const rawUpdateId = fields.updateId?.value;
    const updateId = rawUpdateId ? Number(rawUpdateId) : null;
    if (columnId) {
      const column = getColumnRow(app.db, columnId);
      if (column.board_id !== boardId || column.type !== 'file') {
        throw badRequest('Not a file column on this board');
      }
    }
    if (updateId) {
      const update = app.db.prepare('SELECT item_id FROM updates WHERE id = ?').get(updateId) as
        { item_id: number } | undefined;
      if (!update || update.item_id !== itemId) throw badRequest('Unknown update');
    }
    const buffer = await part.toBuffer();
    if (buffer.length > app.config.maxUploadMb * 1024 * 1024) {
      throw new AppError(413, 'too_large', 'File is too large');
    }
    if ((part.file as { truncated?: boolean }).truncated) {
      throw new AppError(413, 'too_large', 'File is too large');
    }
    const key = randomUUID();
    const filename = sanitizeFilename(part.filename || 'file');
    const target = storagePath(app.config.uploadsDir, key);
    mkdirSync(path.dirname(target), { recursive: true });
    await writeFile(target, buffer);
    const file = addFile(app.db, user, {
      itemId,
      boardId,
      columnId,
      updateId,
      filename,
      mime: part.mimetype || 'application/octet-stream',
      size: buffer.length,
      storageKey: key,
    });
    reply.code(201);
    return { file };
  });

  app.get('/api/items/:id/files', async (req) => {
    const itemId = parseId((req.params as { id: string }).id);
    const boardId = boardIdForItem(app.db, itemId);
    const board = getBoardRow(app.db, boardId);
    assertBoardAccess(app.db, req.user!, board.id, 'view');
    return { files: listFiles(app.db, itemId) };
  });

  app.get('/api/files/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    const row = getFileRow(app.db, id);
    const boardId = boardIdForItem(app.db, row.item_id);
    const board = getBoardRow(app.db, boardId);
    assertBoardAccess(app.db, req.user!, board.id, 'view');
    const filePath = storagePath(app.config.uploadsDir, row.storage_key);
    if (!existsSync(filePath)) throw notFound('File missing');
    const query = req.query as { download?: string };
    const inline = !query.download && isInlineMime(row.mime);
    const contentType = inline ? normalizeMime(row.mime) : 'application/octet-stream';
    const ascii = row.filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    reply.header('Content-Type', contentType);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    );
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    );
    return reply.send(createReadStream(filePath));
  });

  app.delete('/api/files/:id', async (req, reply) => {
    const id = parseId((req.params as { id: string }).id);
    const row = getFileRow(app.db, id);
    const boardId = boardIdForItem(app.db, row.item_id);
    const board = getBoardRow(app.db, boardId);
    if (row.uploaded_by !== req.user!.id && !isAdmin(req.user!)) {
      assertBoardAccess(app.db, req.user!, board.id, 'edit');
    }
    if (!isAdmin(req.user!) && req.user!.role === 'viewer') throw forbidden();
    removeFileRow(app.db, req.user!, id, boardId);
    const filePath = storagePath(app.config.uploadsDir, row.storage_key);
    try {
      await unlink(filePath);
    } catch {}
    reply.code(204);
    return null;
  });
}

export { getItemDto };
