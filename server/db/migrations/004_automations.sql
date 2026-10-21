CREATE TABLE automations (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  trigger TEXT NOT NULL,
  conditions TEXT NOT NULL DEFAULT '[]',
  actions TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT
);
CREATE INDEX automations_board ON automations(board_id, enabled);
CREATE TABLE automation_runs (
  id INTEGER PRIMARY KEY,
  automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('success','failed','skipped')),
  error TEXT,
  dedupe_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX automation_runs_auto ON automation_runs(automation_id, id);
