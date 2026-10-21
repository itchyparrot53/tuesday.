import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseBody, parseId } from '../lib/validate';
import { badRequest, notFound } from '../lib/errors';
import {
  addManualEntry,
  getRunningTimer,
  listEntries,
  startTimer,
  stopTimer,
} from '../services/timetracking';
import { getColumnRow } from '../services/columns';
import { getItemRow, setValue } from '../services/items';
import { parseHumanValue } from '../ai/human-values';
import { listUsers } from '../services/users';
import {
  assertBoardAccess,
  assertItemAccess,
  boardAccessMap,
  boardIdForItem,
} from '../services/permissions';
import { getBoardRow } from '../services/boards';
import { parseJson } from '../lib/json';

const manualSchema = z.object({
  seconds: z.number().int().min(60).max(86400),
  note: z.string().max(500).optional(),
});
const textSchema = z.object({ text: z.string().max(20000) });

export async function columnsExtraRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/items/:id/time/:columnId/start', async (req) => {
    const itemId = parseId((req.params as { id: string }).id);
    const columnId = parseId((req.params as { columnId: string }).columnId);
    return { item: startTimer(app.db, req.user!, itemId, columnId) };
  });

  app.post('/api/items/:id/time/:columnId/stop', async (req) => {
    const itemId = parseId((req.params as { id: string }).id);
    const columnId = parseId((req.params as { columnId: string }).columnId);
    return { item: stopTimer(app.db, req.user!, itemId, columnId) };
  });

  app.post('/api/items/:id/time/:columnId/entries', async (req, reply) => {
    const itemId = parseId((req.params as { id: string }).id);
    const columnId = parseId((req.params as { columnId: string }).columnId);
    const body = parseBody(manualSchema, req.body);
    const item = addManualEntry(app.db, req.user!, itemId, columnId, body.seconds, body.note);
    reply.code(201);
    return { item };
  });

  app.get('/api/items/:id/time/:columnId/entries', async (req) => {
    const itemId = parseId((req.params as { id: string }).id);
    const columnId = parseId((req.params as { columnId: string }).columnId);
    return { entries: listEntries(app.db, req.user!, itemId, columnId) };
  });

  app.get('/api/me/timer', async (req) => getRunningTimer(app.db, req.user!.id));

  app.put('/api/items/:id/values/:columnId/text', async (req) => {
    const itemId = parseId((req.params as { id: string }).id);
    const columnId = parseId((req.params as { columnId: string }).columnId);
    const body = parseBody(textSchema, req.body);
    const column = getColumnRow(app.db, columnId);
    const item = getItemRow(app.db, itemId);
    if (column.board_id !== item.board_id) throw badRequest('Column is on another board');
    const settings = parseJson<{ targetBoardId?: number }>(column.settings, {});
    const choices =
      column.type === 'dependency'
        ? (app.db
            .prepare('SELECT id, name FROM items WHERE board_id = ? AND archived_at IS NULL')
            .all(column.board_id) as { id: number; name: string }[])
        : column.type === 'connect' && settings.targetBoardId
          ? (app.db
              .prepare('SELECT id, name FROM items WHERE board_id = ? AND archived_at IS NULL')
              .all(settings.targetBoardId) as { id: number; name: string }[])
          : undefined;
    const parsed = parseHumanValue(
      {
        id: column.id,
        boardId: column.board_id,
        title: column.title,
        type: column.type as never,
        settings,
        position: column.position,
        width: column.width,
      },
      body.text,
      listUsers(app.db),
      choices,
    );
    return { item: setValue(app.db, req.user!, itemId, columnId, parsed) };
  });

  app.get('/api/items/:id/links', async (req) => {
    const itemId = parseId((req.params as { id: string }).id);
    const boardId = assertItemAccess(app.db, req.user!, itemId, 'view');
    const access = boardAccessMap(app.db, req.user!);
    const columns = app.db.prepare("SELECT * FROM columns WHERE type = 'connect'").all() as {
      id: number;
      board_id: number;
      title: string;
      settings: string;
    }[];
    const linkedFrom: {
      itemId: number;
      name: string;
      boardId: number;
      boardName: string;
      columnTitle: string;
    }[] = [];
    for (const column of columns) {
      const settings = parseJson<{ targetBoardId?: number }>(column.settings, {});
      if (settings.targetBoardId !== boardId) continue;
      const boardRow = getBoardRow(app.db, column.board_id);
      if (!access.has(boardRow.id)) continue;
      const rows = app.db
        .prepare('SELECT item_id, value FROM item_values WHERE column_id = ?')
        .all(column.id) as { item_id: number; value: string }[];
      for (const row of rows) {
        const ids = parseJson<{ itemIds?: number[] }>(row.value, {}).itemIds ?? [];
        if (!ids.includes(itemId)) continue;
        const linkedItem = getItemRow(app.db, row.item_id);
        linkedFrom.push({
          itemId: linkedItem.id,
          name: linkedItem.name,
          boardId: column.board_id,
          boardName: boardRow.name,
          columnTitle: column.title,
        });
      }
    }
    return { linkedFrom };
  });
}
