import type { FastifyInstance } from 'fastify';
import { chunkDoc, chunkItem, chunkUpdate, type Chunk } from './chunker';
import { listUsers } from '../services/users';
import { enqueue } from '../jobs/queue';
import { getSetting, setSetting } from '../services/settings';
import { bus } from '../realtime/bus';

export type KnowledgeKind = 'item' | 'update' | 'doc';

export function queueIndex(db: FastifyInstance['db'], kind: KnowledgeKind, id: number): void {
  const delay = Number(process.env.KNOWLEDGE_INDEX_DELAY_MS ?? 30000);
  enqueue(db, 'knowledge_index', { kind, id }, { dedupeKey: `ki:${kind}:${id}`, delayMs: delay });
}

interface Source {
  workspaceId: number;
  boardId: number | null;
  docId: number | null;
  itemId: number | null;
  chunks: Chunk[];
}

function sourceFor(app: FastifyInstance, kind: KnowledgeKind, id: number): Source | null {
  if (kind === 'item') {
    const row = app.db
      .prepare(
        `SELECT i.*, b.name AS board_name, b.workspace_id, g.title AS group_title
         FROM items i JOIN boards b ON b.id = i.board_id JOIN item_groups g ON g.id = i.group_id
         WHERE i.id = ? AND i.archived_at IS NULL AND b.archived_at IS NULL`,
      )
      .get(id) as
      | {
          id: number;
          board_id: number;
          group_id: number;
          name: string;
          values?: unknown;
          board_name: string;
          workspace_id: number;
          group_title: string;
        }
      | undefined;
    if (!row) return null;
    const columns = app.db
      .prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position')
      .all(row.board_id) as {
      id: number;
      board_id: number;
      title: string;
      type: string;
      settings: string;
      position: number;
      width: number;
    }[];
    const values = app.db
      .prepare('SELECT column_id, value FROM item_values WHERE item_id = ?')
      .all(id) as { column_id: number; value: string }[];
    const item = {
      id: row.id,
      boardId: row.board_id,
      groupId: row.group_id,
      parentId: null,
      name: row.name,
      position: 0,
      createdBy: null,
      createdAt: '',
      updatedAt: '',
      values: Object.fromEntries(
        values.map((value) => [String(value.column_id), JSON.parse(value.value)]),
      ),
      updateCount: 0,
    } as never;
    const users = listUsers(app.db);
    return {
      workspaceId: row.workspace_id,
      boardId: row.board_id,
      docId: null,
      itemId: id,
      chunks: chunkItem({
        item,
        boardName: row.board_name,
        groupName: row.group_title,
        columns: columns.map((column) => ({
          id: column.id,
          boardId: column.board_id,
          title: column.title,
          type: column.type as never,
          settings: JSON.parse(column.settings),
          position: column.position,
          width: column.width,
        })),
        userNames: new Map(users.map((user) => [user.id, user.name])),
      }),
    };
  }
  if (kind === 'update') {
    const row = app.db
      .prepare(
        `SELECT u.*, i.name AS item_name, i.board_id, i.archived_at, b.name AS board_name, b.workspace_id,
                b.archived_at AS board_archived, us.name AS author_name
         FROM updates u JOIN items i ON i.id = u.item_id JOIN boards b ON b.id = i.board_id
         LEFT JOIN users us ON us.id = u.author_id WHERE u.id = ?`,
      )
      .get(id) as
      | {
          item_id: number;
          board_id: number;
          body: string;
          created_at: string;
          item_name: string;
          archived_at: string | null;
          board_name: string;
          workspace_id: number;
          board_archived: string | null;
          author_name: string | null;
        }
      | undefined;
    if (!row || row.archived_at || row.board_archived) return null;
    return {
      workspaceId: row.workspace_id,
      boardId: row.board_id,
      docId: null,
      itemId: row.item_id,
      chunks: chunkUpdate({
        itemName: row.item_name,
        boardName: row.board_name,
        authorName: row.author_name ?? 'Someone',
        body: row.body,
        createdAt: row.created_at,
      }),
    };
  }
  const doc = app.db.prepare('SELECT * FROM docs WHERE id = ? AND archived_at IS NULL').get(id) as
    { id: number; title: string; content: string; workspace_id: number } | undefined;
  if (!doc) return null;
  return {
    workspaceId: doc.workspace_id,
    boardId: null,
    docId: doc.id,
    itemId: null,
    chunks: chunkDoc({ title: doc.title, content: doc.content }),
  };
}

export function indexSource(app: FastifyInstance, kind: KnowledgeKind, id: number): void {
  const source = sourceFor(app, kind, id);
  const existing = app.db
    .prepare(
      'SELECT chunk_index, content_hash, model, embedding FROM knowledge_chunks WHERE source_kind = ? AND source_id = ?',
    )
    .all(kind, id) as {
    chunk_index: number;
    content_hash: string;
    model: string | null;
    embedding: Buffer | null;
  }[];
  const settings = app.ai.settings();
  app.db.transaction(() => {
    app.db
      .prepare('DELETE FROM knowledge_chunks WHERE source_kind = ? AND source_id = ?')
      .run(kind, id);
    if (!source) return;
    const previous = new Map(existing.map((row) => [row.chunk_index, row]));
    const insert = app.db.prepare(
      `INSERT INTO knowledge_chunks
        (source_kind, source_id, board_id, doc_id, workspace_id, item_id, chunk_index, title, text, content_hash, model, dims, embedding, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const chunk of source.chunks) {
      const before = previous.get(chunk.index);
      const reusable =
        before && before.content_hash === chunk.hash && before.model === settings.embeddingModel;
      insert.run(
        kind,
        id,
        source.boardId,
        source.docId,
        source.workspaceId,
        source.itemId,
        chunk.index,
        chunk.title,
        chunk.text,
        chunk.hash,
        reusable ? before!.model : null,
        reusable ? 512 : null,
        reusable ? before!.embedding : null,
        new Date().toISOString(),
      );
    }
  })();
  bus.publish({ event: { type: 'knowledge.changed' } });
  if (settings.memoryEnabled && app.ai.status().usable && source) {
    enqueue(app.db, 'knowledge_embed', {}, { dedupeKey: 'ke' });
  }
}

export function runBackfill(app: FastifyInstance, limit = 200): number {
  const cursor = getSetting<{ kind: KnowledgeKind; id: number } | null>(
    app.db,
    'knowledge:backfill',
    null,
  );
  const order: KnowledgeKind[] = ['item', 'update', 'doc'];
  let processed = 0;
  let kindIndex = cursor ? order.indexOf(cursor.kind) : 0;
  let afterId = cursor?.id ?? 0;
  while (processed < limit && kindIndex < order.length) {
    const kind = order[kindIndex];
    const table = kind === 'item' ? 'items' : kind === 'update' ? 'updates' : 'docs';
    const rows = app.db
      .prepare(`SELECT id FROM ${table} WHERE id > ? ORDER BY id LIMIT ?`)
      .all(afterId, limit - processed) as { id: number }[];
    for (const row of rows) {
      indexSource(app, kind, row.id);
      afterId = row.id;
      processed++;
    }
    if (!rows.length || processed >= limit) {
      if (rows.length && processed >= limit) break;
      kindIndex++;
      afterId = 0;
    }
  }
  if (kindIndex >= order.length) {
    setSetting(app.db, 'knowledge:backfill', null);
  } else {
    setSetting(app.db, 'knowledge:backfill', { kind: order[kindIndex], id: afterId });
    enqueue(app.db, 'knowledge_backfill', {}, { dedupeKey: 'kb' });
  }
  return processed;
}

export function embedPending(app: FastifyInstance, limit = 64): number {
  const settings = app.ai.settings();
  if (!settings.memoryEnabled) return 0;
  const rows = app.db
    .prepare(
      `SELECT id, title, text FROM knowledge_chunks
       WHERE embedding IS NULL OR model IS DISTINCT FROM ? ORDER BY id LIMIT ?`,
    )
    .all(settings.embeddingModel, limit) as { id: number; title: string; text: string }[];
  if (!rows.length) return 0;
  void (async () => {
    try {
      const vectors = await app.ai.embed(
        null,
        rows.map((row) => `${row.title}\n${row.text}`),
      );
      const update = app.db.prepare(
        'UPDATE knowledge_chunks SET model = ?, dims = ?, embedding = ? WHERE id = ?',
      );
      for (let index = 0; index < rows.length; index++) {
        const vector = (vectors[index] ?? []).slice(0, 512);
        const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
        const normalized = vector.map((value) => value / length);
        update.run(
          settings.embeddingModel,
          Math.min(512, vector.length),
          Buffer.from(Float32Array.from(normalized).buffer),
          rows[index].id,
        );
      }
      enqueue(app.db, 'knowledge_embed', {}, { dedupeKey: 'ke', delayMs: 2000 });
    } catch (error) {
      console.warn(`knowledge embedding stopped: ${(error as Error).message}`);
    }
  })();
  return rows.length;
}

export function knowledgeStatus(app: FastifyInstance) {
  const settings = app.ai.settings();
  const row = app.db
    .prepare(
      `SELECT count(*) AS chunks,
              sum(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) AS embedded,
              max(updated_at) AS last
       FROM knowledge_chunks`,
    )
    .get() as { chunks: number; embedded: number | null; last: string | null };
  return {
    enabled: settings.memoryEnabled,
    model: settings.embeddingModel,
    chunks: row.chunks,
    embedded: row.embedded ?? 0,
    pending: row.chunks - (row.embedded ?? 0),
    lastIndexedAt: row.last,
  };
}
