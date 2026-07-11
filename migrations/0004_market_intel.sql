-- Market Intelligence — Auction Area Intelligence.
-- Single-copy analytical tables (no user_id): unlike the per-user blob
-- entities, these exist to be aggregated with GROUP BY, so they use real
-- typed columns; per-row provenance lives in a small `raw` JSON column.
-- All tables prefixed mi_ so the module can be extracted to its own
-- database later by binding swap + export/import.

-- Auction House UK regional branches, discovered from the sitemap at seed
-- time (23 as of 2026-07-11) rather than hardcoded.
CREATE TABLE mi_branches (
  id TEXT PRIMARY KEY,            -- region slug, e.g. 'southyorkshire'
  name TEXT NOT NULL,
  results_url TEXT NOT NULL,      -- /{region}/auction/past-auctions
  page_count_estimate INTEGER,    -- observed max pagination page
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);

-- One row per (branch, auction end date): groups lots into events for
-- repeat-lot detection and event-level sell-through stats.
CREATE TABLE mi_auctions (
  id TEXT PRIMARY KEY,            -- '{branch_id}:{YYYY-MM-DD}'
  branch_id TEXT NOT NULL,
  auction_date TEXT NOT NULL,
  lot_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX idx_mi_auctions_branch ON mi_auctions(branch_id, auction_date);

-- Current state of each lot listing (latest observation wins; history is
-- append-only in mi_lot_results and never overwritten).
CREATE TABLE mi_lots (
  id TEXT PRIMARY KEY,            -- 'mi-{branch}-{platformLotId}'
  platform_lot_id TEXT,           -- numeric id from /lot/redirect/<id>
  branch_id TEXT NOT NULL,
  auction_id TEXT,                -- most recent auction seen in
  address TEXT,
  postcode TEXT,
  outcode TEXT,
  town TEXT,
  guide_min INTEGER,
  guide_max INTEGER,
  result_status TEXT NOT NULL,    -- normalised enum, see normalizeResultStatus
  sold_price INTEGER,             -- only set when printed on the page
  price_confirmed INTEGER NOT NULL DEFAULT 0,
  property_type TEXT,
  bedrooms INTEGER,
  tenure TEXT,                    -- 'freehold' | 'leasehold' | NULL (Pass B)
  excluded INTEGER NOT NULL DEFAULT 0,
  exclusion_reasons TEXT,         -- JSON array e.g. ["flat","tenanted"]
  leasehold_flag INTEGER NOT NULL DEFAULT 0,
  enrichment_level INTEGER NOT NULL DEFAULT 0,  -- 0 = Pass A, 1 = Pass B done
  epc_rating TEXT,
  epc_floor_area INTEGER,
  auction_end_at TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT,
  raw TEXT NOT NULL               -- provenance JSON: sourceUrl, matched text, parserVersion
);
CREATE INDEX idx_mi_lots_outcode ON mi_lots(outcode);
CREATE INDEX idx_mi_lots_branch ON mi_lots(branch_id, result_status);
CREATE INDEX idx_mi_lots_platform ON mi_lots(platform_lot_id);

-- Append-only observation history: a lot reappearing at a later auction or
-- changing status inserts a new row; UNIQUE makes re-scrapes idempotent.
CREATE TABLE mi_lot_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_id TEXT NOT NULL,
  auction_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  result_status TEXT NOT NULL,
  sold_price INTEGER,
  guide_min INTEGER,
  guide_max INTEGER,
  source_url TEXT,
  UNIQUE(lot_id, auction_id, result_status)
);
CREATE INDEX idx_mi_results_lot ON mi_lot_results(lot_id);

-- Pass A aggregates, recomputed wholesale by the aggregate job.
CREATE TABLE mi_area_metrics (
  area_type TEXT NOT NULL,        -- 'outcode' | 'town' | 'branch'
  area_id TEXT NOT NULL,
  window TEXT NOT NULL,           -- '24m' or 'YYYY-MM' monthly trend buckets
  lots_total INTEGER,
  lots_eligible INTEGER,
  sold_confirmed INTEGER,
  sold_unconfirmed INTEGER,
  sub100k_confirmed INTEGER,
  sell_through_pct REAL,
  price_median INTEGER,
  price_p25 INTEGER,
  price_p75 INTEGER,
  guide_to_sold_ratio REAL,
  sample_size INTEGER,
  detail TEXT,                    -- JSON: status histogram, repeat lots, etc.
  computed_at TEXT,
  PRIMARY KEY (area_type, area_id, window)
);

CREATE TABLE mi_area_scores (
  area_type TEXT NOT NULL,
  area_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  score REAL,
  confidence REAL,                -- n/(n+k) shrinkage confidence
  components TEXT,                -- JSON per-factor sub-scores + penalties
  computed_at TEXT,
  PRIMARY KEY (area_type, area_id, model_id)
);

-- Job queue for the cron tick: one job per branch/area task, resumable via
-- the JSON cursor which is checkpointed after every page.
CREATE TABLE mi_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,             -- passA_index|passA_refresh|passB_lots|passB_context|aggregate
  target TEXT,                    -- branch_id or area_id
  status TEXT NOT NULL DEFAULT 'queued',  -- queued|running|paused|done|error
  cursor TEXT,                    -- JSON checkpoint, e.g. {"nextPage":4}
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at TEXT,
  last_error TEXT,
  stats TEXT,                     -- JSON: pagesFetched, lotsUpserted, zeroParse...
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX idx_mi_jobs_runnable ON mi_jobs(status, next_run_at);

-- Land Registry PPD cache for Pass B comps, reusable across areas.
CREATE TABLE mi_lr_cache (
  cache_key TEXT PRIMARY KEY,     -- 'ppd:{outcode}:{from}:{to}'
  fetched_at TEXT,
  expires_at TEXT,
  data TEXT NOT NULL
);

-- Pass B persisted area-level connector output (per-property connector
-- results are never persisted; area-level ones must be).
CREATE TABLE mi_area_context (
  area_type TEXT NOT NULL,
  area_id TEXT NOT NULL,
  kind TEXT NOT NULL,             -- geo|hpi|imd|census|epc_stock|comps_summary|growth|ceiling
  data TEXT NOT NULL,
  fetched_at TEXT,
  PRIMARY KEY (area_type, area_id, kind)
);

-- Editable, versioned scoring weight models; scores reference model_id so
-- past rankings stay reproducible after weight edits (copy-on-edit).
CREATE TABLE mi_scoring_models (
  id TEXT PRIMARY KEY,
  name TEXT,
  weights TEXT NOT NULL,          -- JSON factor->weight
  is_default INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

INSERT INTO mi_scoring_models (id, name, weights, is_default, updated_at) VALUES (
  'default-v1',
  'Default weights (2026-07 brief)',
  '{"demandLiquidity":0.25,"flipSpread":0.20,"sub100kSupply":0.20,"compQuality":0.15,"growthResilience":0.15,"risk":0.05}',
  1,
  datetime('now')
);
