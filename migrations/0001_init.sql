-- Phase 1: D1 schema for CRM entities.
-- Every table stores the full record as JSON in `data` (no field is ever dropped);
-- the extracted columns exist for relational queries and future FK enforcement.
-- PRIMARY KEY (user_id, id) mirrors the KV blob-per-user model: each user's copy
-- of a record is its own row, and reads merge newest-updated_at-first per id,
-- exactly like the legacy mergeUserData().

CREATE TABLE properties (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  postcode TEXT,
  auction_date TEXT,
  source_lot_id TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_properties_status ON properties(status);
CREATE INDEX idx_properties_source_lot ON properties(source_lot_id);

CREATE TABLE companies (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  type TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE contacts (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  role TEXT,
  company_id TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_contacts_company ON contacts(company_id);

CREATE TABLE surveyors (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE watchlist_items (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE scraped_auctions (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE global_notes (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  target_type TEXT,
  target_id TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_notes_target ON global_notes(target_type, target_id);

CREATE TABLE tasks (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  due_date TEXT,
  linked_type TEXT,
  linked_id TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_tasks_linked ON tasks(linked_type, linked_id);
CREATE INDEX idx_tasks_due ON tasks(due_date);

CREATE TABLE refurb_quotes (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  property_id TEXT,
  company_id TEXT,
  trade_category TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_quotes_property ON refurb_quotes(property_id);
CREATE INDEX idx_quotes_company ON refurb_quotes(company_id);

CREATE TABLE spec_items (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  property_id TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_spec_items_property ON spec_items(property_id);

CREATE TABLE spec_templates (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE spec_allowances (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  property_id TEXT,
  category TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE task_templates (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Phase 3 catalog entities (empty until the catalog UI ships; created now so the
-- storage layer is uniform from day one).
CREATE TABLE catalog_trades (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  trade TEXT,
  job_type TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE catalog_products (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  supplier TEXT,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE catalog_room_templates (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Auction Control Centre datasets (single-copy, not per-user).
CREATE TABLE auction_dates (
  id TEXT PRIMARY KEY,
  auction_date TEXT,
  created_at TEXT,
  updated_at TEXT,
  data TEXT NOT NULL
);

CREATE TABLE auction_lots (
  id TEXT PRIMARY KEY,
  date_id TEXT,
  status TEXT,
  is_withdrawn INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  data TEXT NOT NULL
);
CREATE INDEX idx_lots_date ON auction_lots(date_id);
CREATE INDEX idx_lots_status ON auction_lots(status);
