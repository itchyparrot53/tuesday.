import { describe, expect, test } from 'vitest';
import { chunkDoc, chunkUpdate, splitText } from '../server/knowledge/chunker';
import { fakeEmbedding } from '../server/ai/fake';
import { H, createBoard, createSpace, createTestApp, setupOwner } from './helpers';
import { indexSource } from '../server/knowledge/indexer';

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index++) dot += a[index] * b[index];
  return dot;
}

describe('chunker', () => {
  test('splits long text with overlap and stable hashes', () => {
    const text = `${'launch plan '.repeat(300)}`;
    const parts = splitText(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].length).toBeLessThanOrEqual(1500);
    // 200-character overlap: the next chunk starts with the tail of the previous one.
    expect(parts[1].startsWith(parts[0].slice(-200).trimEnd())).toBe(true);
    expect(chunkDoc({ title: 'Brief', content: '# Plan\nlaunch' })[0].hash).toBe(
      chunkDoc({ title: 'Brief', content: '# Plan\nlaunch' })[0].hash,
    );
  });

  test('doc chunks use headings and updates keep author and date', () => {
    const chunks = chunkDoc({
      title: 'Strategy',
      content: '# Goals\nShip it\n## Risks\nHiring\n## Empty\n',
    });
    expect(chunks.map((chunk) => chunk.title)).toEqual(['Strategy › Goals', 'Strategy › Risks']);
    const update = chunkUpdate({
      itemName: 'Launch',
      boardName: 'Website',
      authorName: 'Erin',
      body: 'We decided to move the launch to March',
      createdAt: '2026-10-19T10:00:00.000Z',
    });
    expect(update[0].title).toBe('Update on Launch — Website');
    expect(update[0].text).toContain('Erin, 2026-10-19');
  });
});

describe('fake embeddings', () => {
  test('are deterministic, 512-dimensional and similar for related words', () => {
    const a = fakeEmbedding('launch plan');
    const b = fakeEmbedding('plan the launch');
    const c = fakeEmbedding('invoice');
    expect(a).toHaveLength(512);
    expect(a).toEqual(fakeEmbedding('launch plan'));
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  });
});

describe('knowledge index', () => {
  test('indexes items, clears embeddings only when text changes, and deletes on archive', async () => {
    const app = await createTestApp({ config: { mailFake: true } });
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const board = await createBoard(app, owner.cookie, space.id as number, 'Memory board');
    const item = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.board.id}/items`,
      headers: { ...H, cookie: owner.cookie },
      payload: { groupId: board.groups[0].id, name: 'Launch plan' },
    });
    const itemId = item.json().item.id as number;
    indexSource(app, 'item', itemId);
    expect(
      (
        app.db
          .prepare("SELECT count(*) AS n FROM knowledge_chunks WHERE source_kind = 'item'")
          .get() as { n: number }
      ).n,
    ).toBeGreaterThan(0);
    app.db
      .prepare('UPDATE knowledge_chunks SET model = ?, embedding = ? WHERE source_kind = ?')
      .run('openai/text-embedding-3-small', Buffer.alloc(512 * 4), 'item');
    indexSource(app, 'item', itemId);
    expect(
      (
        app.db
          .prepare('SELECT count(*) AS n FROM knowledge_chunks WHERE embedding IS NOT NULL')
          .get() as { n: number }
      ).n,
    ).toBeGreaterThan(0);
    await app.inject({
      method: 'PATCH',
      url: `/api/items/${itemId}`,
      headers: { ...H, cookie: owner.cookie },
      payload: { name: 'Launch plan revised' },
    });
    indexSource(app, 'item', itemId);
    expect(
      (
        app.db
          .prepare('SELECT count(*) AS n FROM knowledge_chunks WHERE embedding IS NOT NULL')
          .get() as { n: number }
      ).n,
    ).toBe(0);
    await app.inject({
      method: 'DELETE',
      url: `/api/items/${itemId}`,
      headers: { ...H, cookie: owner.cookie },
    });
    indexSource(app, 'item', itemId);
    expect(
      (
        app.db
          .prepare("SELECT count(*) AS n FROM knowledge_chunks WHERE source_kind = 'item'")
          .get() as { n: number }
      ).n,
    ).toBe(0);
    await app.close();
  });

  test('backfill processes sources in batches', async () => {
    const { createTestApp } = await import('./helpers');
    const { runBackfill } = await import('../server/knowledge/indexer');
    const app = await createTestApp();
    expect(runBackfill(app, 200)).toBe(0);
    await app.close();
  });
});

describe('hybrid search', () => {
  test('keyword search is permission-scoped for members and guests', async () => {
    const { H, createBoard, createSpace, createTestApp, inviteAndJoin, setupOwner } =
      await import('./helpers');
    const { searchKnowledge } = await import('../server/knowledge/search');
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie);
    const a = await createBoard(app, owner.cookie, space.id as number, 'Public memory');
    const b = await createBoard(app, owner.cookie, space.id as number, 'Private memory');
    app.db.prepare('UPDATE boards SET is_private = 1 WHERE id = ?').run(b.board.id);
    const insert = app.db.prepare(
      `INSERT INTO knowledge_chunks (source_kind, source_id, board_id, workspace_id, chunk_index, title, text, content_hash, updated_at)
       VALUES ('item', ?, ?, ?, 0, ?, ?, ?, ?)`,
    );
    insert.run(
      1,
      a.board.id,
      space.id,
      'Public launch plan',
      'launch plan details',
      'h1',
      new Date().toISOString(),
    );
    insert.run(
      2,
      b.board.id,
      space.id,
      'Secret launch plan',
      'launch plan secrets',
      'h2',
      new Date().toISOString(),
    );
    const ownerHits = await searchKnowledge(app, owner.user, 'launch');
    expect(ownerHits.length).toBe(2);
    const member = await inviteAndJoin(app, owner.cookie, 'member', 'memory-member@acme.test');
    const memberHits = await searchKnowledge(app, member.user, 'launch');
    expect(memberHits).toHaveLength(1);
    expect(memberHits[0].boardId).toBe(a.board.id);
    await app.close();
  });

  test('20,000 normalised vectors answer inside the budget', async () => {
    const { createSpace, createTestApp, setupOwner } = await import('./helpers');
    const { searchKnowledge } = await import('../server/knowledge/search');
    const app = await createTestApp();
    const owner = await setupOwner(app);
    const space = await createSpace(app, owner.cookie, 'Big space');
    const board = app.db
      .prepare(
        `INSERT INTO boards (workspace_id, name, position, created_by, created_at, updated_at)
         VALUES (?, 'Big', 1, ?, ?, ?)`,
      )
      .run(space.id, owner.user.id, new Date().toISOString(), new Date().toISOString());
    const boardId = Number(board.lastInsertRowid);
    const insert = app.db.prepare(
      `INSERT INTO knowledge_chunks (source_kind, source_id, board_id, workspace_id, chunk_index, title, text, content_hash, updated_at)
       VALUES ('item', ?, ?, ?, 0, 'Launch plan', 'launch plan text', ?, ?)`,
    );
    app.db.transaction(() => {
      for (let index = 0; index < 20000; index++) {
        insert.run(index + 1, boardId, space.id, `h${index}`, new Date().toISOString());
      }
    })();
    const started = performance.now();
    const hits = await searchKnowledge(app, owner.user, 'launch plan');
    const elapsed = performance.now() - started;
    expect(hits.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1500);
    await app.close();
  });
});
