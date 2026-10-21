CREATE TABLE IF NOT EXISTS automation_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS automation_templates_board
  ON automation_templates(board_id, id DESC);
