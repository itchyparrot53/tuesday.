import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, test } from 'vitest';
import { migrate } from '../server/db/migrate';
import { hashPassword } from '../server/lib/password';
import { buildApp } from '../server/app';
import { loadConfig } from '../server/config';

describe('upgrade from Part 3B schema', () => {
  test('010 data survives all later migrations', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tuesday-upgrade-'));
    const file = path.join(dir, 'tuesday.db');
    // Start from a raw connection so openDb() cannot migrate to latest before we stop at 010.
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db, { upTo: '010_review_design.sql' });
    expect((db.prepare('SELECT count(*) AS n FROM _migrations').get() as { n: number }).n).toBe(10);
    const hash = await hashPassword('password123');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (email, name, password_hash, role, title, color, is_active, created_at)
       VALUES ('owner@upgrade.test', 'Upgrade Owner', ?, 'owner', '', '#2BB673', 1, ?)`,
    ).run(hash, now);
    db.prepare(
      `INSERT INTO workspaces (name, description, color, is_private, position, created_by, created_at)
       VALUES ('Legacy', '', '#3E8EF7', 0, 1, 1, ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO boards (workspace_id, name, description, position, created_by, created_at, updated_at)
       VALUES (1, 'Legacy board', '', 1, 1, ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO columns (board_id, title, type, settings, position, width)
       VALUES (1, 'Status', 'status', '{"labels":[{"id":"todo","name":"To do","color":"#9CA3AF"},{"id":"done","name":"Done","color":"#2BB673"}]}', 1, 160)`,
    ).run();
    db.prepare(
      `INSERT INTO item_groups (board_id, title, color, position) VALUES (1, 'Group', '#3E8EF7', 1)`,
    ).run();
    for (let index = 1; index <= 3; index++) {
      db.prepare(
        `INSERT INTO items (board_id, group_id, name, position, created_by, created_at, updated_at)
         VALUES (1, 1, ?, ?, 1, ?, ?)`,
      ).run(`Legacy item ${index}`, index, now, now);
      db.prepare(
        `INSERT INTO item_values (item_id, column_id, value, updated_at) VALUES (?, 1, '{"labelId":"todo"}', ?)`,
      ).run(index, now);
    }
    db.prepare(
      `INSERT INTO updates (item_id, author_id, body, created_at) VALUES (1, 1, 'Legacy update', ?)`,
    ).run(now);
    db.prepare(
      `INSERT INTO ai_conversations (user_id, title, created_at, updated_at) VALUES (1, 'Legacy chat', ?, ?)`,
    ).run(now, now);
    db.close();

    const reopened = new Database(file);
    reopened.pragma('journal_mode = WAL');
    reopened.pragma('foreign_keys = ON');
    expect(migrate(reopened)).toContain('011_ai_page_home.sql');
    reopened.close();

    const app = await buildApp({ config: { ...loadConfig(), databasePath: file } });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'tuesday' },
      payload: { email: 'owner@upgrade.test', password: 'password123' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    expect(
      (await app.inject({ method: 'GET', url: '/api/home', headers: { cookie } })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/boards/1', headers: { cookie } })).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/knowledge/search?q=legacy',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(200);
    const counts = app.db.prepare('SELECT count(*) AS n FROM items').get() as { n: number };
    expect(counts.n).toBe(3);
    const defaults = app.db.prepare('SELECT is_private FROM boards WHERE id = 1').get() as {
      is_private: number;
    };
    expect(defaults.is_private).toBe(0);
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
