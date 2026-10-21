CREATE TABLE dashboards (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  board_ids TEXT NOT NULL DEFAULT '[]',
  widgets TEXT NOT NULL DEFAULT '[]',
  insight_cache TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  archived_by INTEGER REFERENCES users(id)
);
