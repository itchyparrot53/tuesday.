CREATE TABLE inbound_webhook_deliveries (
  id INTEGER PRIMARY KEY,
  webhook_id INTEGER NOT NULL REFERENCES inbound_webhooks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  item_id INTEGER,
  ignored TEXT NOT NULL DEFAULT '[]',
  errors TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  ip TEXT
);

CREATE INDEX inbound_webhook_deliveries_webhook
  ON inbound_webhook_deliveries (webhook_id, id DESC);
