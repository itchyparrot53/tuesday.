CREATE TABLE IF NOT EXISTS workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  trigger_board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  conditions TEXT NOT NULL DEFAULT '[]',
  steps TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT
);

CREATE INDEX IF NOT EXISTS workflows_board ON workflows(trigger_board_id);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  source_item_id INTEGER,
  created_item_id INTEGER,
  status TEXT NOT NULL,
  error TEXT,
  dedupe_key TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS workflow_runs_workflow ON workflow_runs(workflow_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_runs_dedupe
  ON workflow_runs(dedupe_key) WHERE dedupe_key IS NOT NULL;
