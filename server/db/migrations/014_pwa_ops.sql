CREATE TABLE push_subscriptions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_success_at TEXT,
  failures INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);
CREATE TABLE offsite_backups (
  name TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  encrypted INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('uploaded','failed','deleted')),
  error TEXT,
  created_at TEXT NOT NULL,
  uploaded_at TEXT
);
ALTER TABLE notifications ADD COLUMN pushed_at TEXT;
