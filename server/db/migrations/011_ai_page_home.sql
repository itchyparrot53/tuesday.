ALTER TABLE ai_conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_conversations ADD COLUMN context TEXT NOT NULL DEFAULT '{"boardIds":[],"itemIds":[],"docIds":[]}';
ALTER TABLE ai_conversations ADD COLUMN title_source TEXT NOT NULL DEFAULT 'auto' CHECK (title_source IN ('auto','user','ai'));
CREATE INDEX ai_conversations_user ON ai_conversations(user_id, pinned, updated_at);
CREATE TABLE user_favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('board','doc','dashboard')),
  target_id INTEGER NOT NULL,
  position REAL NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, target_id)
);
