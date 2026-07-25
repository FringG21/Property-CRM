-- Phase 2 (property-view-v2 plan): structured per-property tables, written
-- through alongside the KV blob on every property mutation. The blob remains
-- the source of truth for render; these tables let Phase 5+ (insights,
-- portfolio analytics, AI orchestration) query relationally without a
-- risky cut-over. Follows the mi_* typed-column + JSON blob pattern from
-- migration 0004; keyed by user_id first, mirroring the per-user blob
-- storage model in 0001_init.sql.

CREATE TABLE property_comps (
  user_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  comp_id TEXT NOT NULL,
  address TEXT,
  postcode TEXT,
  beds INTEGER,
  prop_type TEXT,
  tenure TEXT,
  floor_area INTEGER,
  price INTEGER,
  price_type TEXT,            -- 'sold' | 'asking'
  price_date TEXT,
  distance_m INTEGER,
  source TEXT,
  source_priority INTEGER,
  field_sources TEXT,         -- JSON: per-field provenance
  confidence REAL,
  excluded INTEGER NOT NULL DEFAULT 0,
  exclude_reason TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, property_id, comp_id)
);
CREATE INDEX idx_property_comps_property ON property_comps(user_id, property_id);

CREATE TABLE property_bids (
  user_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  bid_id TEXT NOT NULL,
  amount INTEGER,
  at TEXT,
  note TEXT,
  kind TEXT,                  -- 'bid' | 'walk' | 'outbid' | 'hammer'
  over_max INTEGER NOT NULL DEFAULT 0,
  override_reason TEXT,
  actor TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, property_id, bid_id)
);
CREATE INDEX idx_property_bids_property ON property_bids(user_id, property_id);

-- Append-only history (not a de-duplicated entity list): every report parse,
-- AI review and market comparison appends a row before overwriting
-- `analytics`, so "how the numbers moved" can be reconstructed.
CREATE TABLE property_valuations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  at TEXT NOT NULL,
  source TEXT,                -- 'report' | 'ai' | 'market' | 'manual'
  gdv_conservative INTEGER,
  gdv_base INTEGER,
  gdv_optimistic INTEGER,
  max_bid INTEGER,
  total_investment INTEGER,
  net_profit INTEGER,
  margin REAL,
  roi REAL,
  verdict TEXT,
  run_id TEXT,
  data TEXT NOT NULL
);
CREATE INDEX idx_property_valuations_property ON property_valuations(user_id, property_id, at);

CREATE TABLE property_scenarios (
  user_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  strategy TEXT,               -- 'flip' | 'brr' | 'hmo'
  name TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, property_id, scenario_id)
);
CREATE INDEX idx_property_scenarios_property ON property_scenarios(user_id, property_id);

-- Append-only pipeline-run log. input_hash lets the Phase 5 orchestrator skip
-- a step when its inputs are unchanged since the last successful run.
CREATE TABLE property_ai_runs (
  user_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  kind TEXT,                   -- 'review' | 'market' | 'report' | 'legal'
  provider TEXT,
  started_at TEXT,
  finished_at TEXT,
  status TEXT,
  input_hash TEXT,
  output TEXT,                 -- JSON
  cost_tokens INTEGER,
  PRIMARY KEY (user_id, run_id)
);
CREATE INDEX idx_property_ai_runs_property ON property_ai_runs(user_id, property_id);
CREATE INDEX idx_property_ai_runs_hash ON property_ai_runs(property_id, input_hash);

CREATE TABLE property_legal_facts (
  user_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_value TEXT,
  confidence REAL,
  source_doc_key TEXT,
  source_page INTEGER,
  extracted_at TEXT,
  confirmed_by TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, property_id, fact_key)
);
CREATE INDEX idx_property_legal_facts_property ON property_legal_facts(user_id, property_id);
