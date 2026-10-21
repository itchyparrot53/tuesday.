import type { FastifyInstance } from 'fastify';
import type { KnowledgeHit } from '../../shared/ai';
import type { User } from '../../shared/types';
import { boardAccessMap, canReadWorkspace } from '../services/permissions';
import { VectorCache } from './vectors';

interface ChunkRow {
  id: number;
  source_kind: 'item' | 'update' | 'doc';
  source_id: number;
  board_id: number | null;
  doc_id: number | null;
  item_id: number | null;
  workspace_id: number;
  title: string;
  text: string;
}

const cache = new Map<string, VectorCache>();
const queryCache = new Map<string, { at: number; vector: number[] }>();

function tokens(query: string): string[] {
  return query
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
}

function snippet(text: string, query: string): string {
  const lower = text.toLowerCase();
  const first = tokens(query)[0]?.toLowerCase();
  const index = first ? lower.indexOf(first) : -1;
  const start = index > 120 ? index - 120 : 0;
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 300).trim()}${start + 300 < text.length ? '…' : ''}`;
}

export async function searchKnowledge(
  app: FastifyInstance,
  user: User,
  query: string,
  opts: { limit?: number; boardIds?: number[]; kinds?: ('item' | 'update' | 'doc')[] } = {},
): Promise<KnowledgeHit[]> {
  const limit = Math.min(20, Math.max(1, opts.limit ?? 8));
  const access = boardAccessMap(app.db, user);
  const allowedBoards = new Set(
    opts.boardIds ? opts.boardIds.filter((id) => access.has(id)) : [...access.keys()],
  );
  const readableDocs = new Set<number>();
  if (!user.isGuest) {
    const docs = app.db
      .prepare('SELECT id, workspace_id FROM docs WHERE archived_at IS NULL')
      .all() as { id: number; workspace_id: number }[];
    for (const doc of docs) {
      if (canReadWorkspace(app.db, user, doc.workspace_id)) readableDocs.add(doc.id);
    }
  }
  const scope = (row: ChunkRow) =>
    (opts.kinds ? opts.kinds.includes(row.source_kind) : true) &&
    (row.source_kind === 'doc'
      ? row.doc_id !== null && readableDocs.has(row.doc_id)
      : row.board_id !== null && allowedBoards.has(row.board_id));

  const ids = tokens(query);
  const keywordIds: number[] = [];
  if (ids.length) {
    try {
      const match = ids.map((token) => `"${token}"*`).join(' ');
      const rows = app.db
        .prepare(
          `SELECT c.* FROM knowledge_fts f JOIN knowledge_chunks c ON c.id = f.rowid
           WHERE knowledge_fts MATCH ? ORDER BY bm25(knowledge_fts) LIMIT 200`,
        )
        .all(match) as ChunkRow[];
      for (const row of rows) {
        if (!scope(row)) continue;
        keywordIds.push(row.id);
        if (keywordIds.length >= 50) break;
      }
    } catch {}
  }

  const vectorIds: number[] = [];
  const settings = app.ai.settings();
  if (settings.memoryEnabled && app.ai.status().usable) {
    try {
      let cached = queryCache.get(query);
      if (!cached || Date.now() - cached.at > 10 * 60 * 1000) {
        const [vector] = await app.ai.embed(user.id, [query]);
        if (vector) {
          cached = { at: Date.now(), vector };
          queryCache.set(query, cached);
          if (queryCache.size > 100) queryCache.delete(queryCache.keys().next().value as string);
        }
      }
      if (cached) {
        let vectors = cache.get(settings.embeddingModel);
        if (!vectors) {
          vectors = new VectorCache(app.db, settings.embeddingModel);
          cache.set(settings.embeddingModel, vectors);
        }
        const scoped = app.db
          .prepare('SELECT id, source_kind, board_id, doc_id FROM knowledge_chunks')
          .all() as {
          id: number;
          source_kind: ChunkRow['source_kind'];
          board_id: number | null;
          doc_id: number | null;
        }[];
        const allowedIds = new Set(
          scoped
            .filter((row) =>
              scope({
                id: row.id,
                source_kind: row.source_kind,
                board_id: row.board_id,
                doc_id: row.doc_id,
              } as ChunkRow),
            )
            .map((row) => row.id),
        );
        const allowed = (row: { id: number }) => allowedIds.has(row.id);
        for (const hit of vectors.topK(Float32Array.from(cached.vector), allowed, 50)) {
          vectorIds.push(hit.id);
        }
      }
    } catch {
      // Memory unavailable or budget refused: keyword results still work.
    }
  }

  const scores = new Map<number, number>();
  keywordIds.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + rank + 1)));
  vectorIds.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + rank + 1)));
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const best = new Map<string, { id: number; score: number }>();
  for (const [id, score] of ranked) {
    const row = app.db.prepare('SELECT * FROM knowledge_chunks WHERE id = ?').get(id) as
      ChunkRow | undefined;
    if (!row) continue;
    const key = `${row.source_kind}:${row.source_id}`;
    if (!best.has(key)) best.set(key, { id, score });
    if (best.size >= limit * 3) break;
  }
  const hits: KnowledgeHit[] = [];
  for (const { id, score } of best.values()) {
    const row = app.db.prepare('SELECT * FROM knowledge_chunks WHERE id = ?').get(id) as ChunkRow;
    if (!row) continue;
    hits.push({
      chunkId: row.id,
      sourceKind: row.source_kind,
      sourceId: row.source_id,
      itemId: row.item_id,
      boardId: row.board_id,
      docId: row.doc_id,
      title: row.title,
      snippet: snippet(row.text, query),
      score,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

export function searchKnowledgeKeyword(
  app: FastifyInstance,
  user: User,
  query: string,
  limit = 8,
): KnowledgeHit[] {
  const access = boardAccessMap(app.db, user);
  const readableDocs = new Set<number>();
  if (!user.isGuest) {
    const docs = app.db
      .prepare('SELECT id, workspace_id FROM docs WHERE archived_at IS NULL')
      .all() as { id: number; workspace_id: number }[];
    for (const doc of docs) {
      if (canReadWorkspace(app.db, user, doc.workspace_id)) readableDocs.add(doc.id);
    }
  }
  const words = tokens(query);
  if (!words.length) return [];
  const match = words.map((token) => `"${token}"*`).join(' ');
  const rows = app.db
    .prepare(
      `SELECT c.* FROM knowledge_fts f JOIN knowledge_chunks c ON c.id = f.rowid
       WHERE knowledge_fts MATCH ? ORDER BY bm25(knowledge_fts) LIMIT 200`,
    )
    .all(match) as ChunkRow[];
  const hits: KnowledgeHit[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const readable =
      row.source_kind === 'doc'
        ? row.doc_id !== null && readableDocs.has(row.doc_id)
        : row.board_id !== null && access.has(row.board_id);
    if (!readable) continue;
    const key = `${row.source_kind}:${row.source_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      chunkId: row.id,
      sourceKind: row.source_kind,
      sourceId: row.source_id,
      itemId: row.item_id,
      boardId: row.board_id,
      docId: row.doc_id,
      title: row.title,
      snippet: snippet(row.text, query),
      score: 1,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
