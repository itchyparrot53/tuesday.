ALTER TABLE ai_usage ADD COLUMN tier TEXT NOT NULL DEFAULT 'default';
ALTER TABLE ai_usage ADD COLUMN status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','blocked','error'));
CREATE INDEX ai_usage_user ON ai_usage(user_id, created_at);
CREATE INDEX ai_usage_feature ON ai_usage(feature, created_at);
CREATE TABLE ai_budgets (
  scope TEXT NOT NULL CHECK (scope IN ('user','feature')),
  key TEXT NOT NULL,
  monthly_usd REAL NOT NULL CHECK (monthly_usd >= 0),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);
CREATE TABLE ai_budget_alerts (
  scope TEXT NOT NULL CHECK (scope IN ('org','user','feature')),
  key TEXT NOT NULL,
  month TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level IN (80, 100)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, key, month, level)
);
CREATE TABLE knowledge_chunks (
  id INTEGER PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('item','update','doc')),
  source_id INTEGER NOT NULL,
  board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE,
  doc_id INTEGER REFERENCES docs(id) ON DELETE CASCADE,
  workspace_id INTEGER NOT NULL,
  item_id INTEGER,
  chunk_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  model TEXT,
  dims INTEGER,
  embedding BLOB,
  updated_at TEXT NOT NULL,
  UNIQUE (source_kind, source_id, chunk_index)
);
CREATE INDEX knowledge_chunks_board ON knowledge_chunks(board_id);
CREATE INDEX knowledge_chunks_doc ON knowledge_chunks(doc_id);
CREATE INDEX knowledge_chunks_pending ON knowledge_chunks(model) WHERE embedding IS NULL;
CREATE VIRTUAL TABLE knowledge_fts USING fts5(title, text, content='knowledge_chunks', content_rowid='id', tokenize='unicode61');
CREATE TRIGGER knowledge_chunks_ai AFTER INSERT ON knowledge_chunks BEGIN
  INSERT INTO knowledge_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
END;
CREATE TRIGGER knowledge_chunks_ad AFTER DELETE ON knowledge_chunks BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
END;
CREATE TRIGGER knowledge_chunks_au AFTER UPDATE OF title, text ON knowledge_chunks BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, text) VALUES ('delete', old.id, old.title, old.text);
  INSERT INTO knowledge_fts(rowid, title, text) VALUES (new.id, new.title, new.text);
END;
