-- Custom card type definitions for company/contact record views.
-- Same shape as the other blob-entity tables: the full record lives in
-- `data`, PRIMARY KEY (user_id, id) mirrors the KV blob-per-user model.

CREATE TABLE custom_card_types (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  updated_at TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
