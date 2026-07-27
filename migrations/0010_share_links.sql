-- Phase 7, Step 7.4 (property-view-v2 plan): revocable partner share links.
--
-- A row here makes a fixed set of properties readable at /share/:token with NO
-- session. Tokens are 32 CSPRNG bytes (generateToken), links carry a hard expiry
-- and a revoke flag, and property_ids is fixed at creation — a link never widens
-- to cover deals added later.
CREATE TABLE IF NOT EXISTS share_links (
  token          TEXT PRIMARY KEY,
  label          TEXT,
  property_ids   TEXT NOT NULL,
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  revoked        INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT,
  view_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_share_links_creator ON share_links(created_by);
