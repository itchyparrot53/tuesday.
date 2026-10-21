ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN notification_prefs TEXT NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN sso_subject TEXT;
CREATE UNIQUE INDEX users_sso_subject ON users(sso_subject) WHERE sso_subject IS NOT NULL;
ALTER TABLE invites ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invites ADD COLUMN board_access TEXT NOT NULL DEFAULT '[]';
ALTER TABLE invites ADD COLUMN emailed_at TEXT;
ALTER TABLE boards ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN emailed_at TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN ip TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
CREATE TABLE board_members (
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access TEXT NOT NULL CHECK (access IN ('view','comment','edit','manage')),
  added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (board_id, user_id)
);
CREATE INDEX board_members_user ON board_members(user_id);
CREATE TABLE email_log (
  id INTEGER PRIMARY KEY,
  to_address TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','sent','failed','skipped')),
  error TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX email_log_created ON email_log(created_at);
CREATE TABLE password_resets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  action TEXT NOT NULL,
  target_kind TEXT,
  target_id INTEGER,
  target_label TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX audit_log_created ON audit_log(created_at);
CREATE INDEX audit_log_action ON audit_log(action, created_at);
