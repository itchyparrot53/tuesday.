import type { Db } from '../db/db';

export interface VectorRow {
  id: number;
  boardId: number | null;
  docId: number | null;
  embedding: Float32Array;
}

export class VectorCache {
  private rows: VectorRow[] | null = null;

  constructor(
    private db: Db,
    private model: string,
  ) {}

  load(): VectorRow[] {
    if (this.rows) return this.rows;
    const rows = this.db
      .prepare(
        'SELECT id, board_id, doc_id, embedding FROM knowledge_chunks WHERE model = ? AND embedding IS NOT NULL',
      )
      .all(this.model) as {
      id: number;
      board_id: number | null;
      doc_id: number | null;
      embedding: Buffer;
    }[];
    this.rows = rows.map((row) => {
      const buffer = row.embedding;
      const copy = Buffer.from(buffer);
      const array = new Float32Array(copy.buffer, copy.byteOffset, Math.floor(copy.byteLength / 4));
      return {
        id: row.id,
        boardId: row.board_id,
        docId: row.doc_id,
        embedding: array,
      };
    });
    return this.rows;
  }

  upsert(): void {
    this.rows = null;
  }

  remove(): void {
    this.rows = null;
  }

  topK(
    query: Float32Array,
    allowed: (row: VectorRow) => boolean,
    k: number,
  ): { id: number; score: number }[] {
    const scored: { id: number; score: number }[] = [];
    for (const row of this.load()) {
      if (!allowed(row)) continue;
      let dot = 0;
      const length = Math.min(query.length, row.embedding.length);
      for (let index = 0; index < length; index++) dot += query[index] * row.embedding[index];
      scored.push({ id: row.id, score: dot });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
