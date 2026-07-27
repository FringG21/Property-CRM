-- Phase 7, Step 7.3 (property-view-v2 plan): per-user read state for the
-- property canvas ("updated since you last opened").
--
-- Deliberately NOT stored on the property JSON blob: readCrmFromD1 merges one
-- row per user per property and newest-updated wins, so read state kept on the
-- property would clobber between users — and merely opening a deal would bump
-- updated_at and mark it changed for everyone else.
CREATE TABLE IF NOT EXISTS property_reads (
  user_id      TEXT NOT NULL,
  property_id  TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_property_reads_user ON property_reads(user_id);
