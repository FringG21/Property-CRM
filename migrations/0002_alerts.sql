-- Phase 4: persisted alert feed.
-- Alerts are team-wide (small team, shared feed); user_id exists for future
-- per-user scoping without another migration. Deterministic ids let generators
-- INSERT OR IGNORE so the same event never produces duplicate alerts.
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  target_type TEXT,
  target_id TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_alerts_read_created ON alerts(read, created_at);
