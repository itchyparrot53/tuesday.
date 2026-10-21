CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  title TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE invites (
  id INTEGER PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','member','viewer')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE workspaces (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  is_private INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE workspace_members (
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE boards (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position REAL NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX boards_workspace ON boards(workspace_id);

CREATE TABLE columns (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  position REAL NOT NULL,
  width INTEGER NOT NULL DEFAULT 160,
  created_by INTEGER REFERENCES users(id)
);
CREATE INDEX columns_board ON columns(board_id);

CREATE TABLE item_groups (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  color TEXT NOT NULL,
  position REAL NOT NULL,
  collapsed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX item_groups_board ON item_groups(board_id);

CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES item_groups(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position REAL NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX items_board ON items(board_id, archived_at);
CREATE INDEX items_parent ON items(parent_id);

CREATE TABLE item_values (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  PRIMARY KEY (item_id, column_id)
);

CREATE TABLE updates (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id),
  author_kind TEXT NOT NULL DEFAULT 'user' CHECK (author_kind IN ('user','ai')),
  parent_id INTEGER REFERENCES updates(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  edited_at TEXT
);
CREATE INDEX updates_item ON updates(item_id);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  actor_kind TEXT NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user','ai','system')),
  action TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX activity_board ON activity(board_id, id);
CREATE INDEX activity_item ON activity(item_id, id);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX notifications_user ON notifications(user_id, read_at);

CREATE TABLE views (
  id INTEGER PRIMARY KEY,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('table','kanban','calendar','timeline')),
  settings TEXT NOT NULL DEFAULT '{}',
  position REAL NOT NULL
);

CREATE VIRTUAL TABLE items_fts USING fts5(name, content, tokenize = 'unicode61');
