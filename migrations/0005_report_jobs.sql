-- Report generation queue — jobs the analyser app polls and fulfils.
-- The CRM never calls the analyser (localhost is unreachable from Cloudflare);
-- the analyser polls GET /api/reports/jobs/next, runs its 3-stage pipeline
-- locally, and pushes the finished HTML back via /complete. Unlike the per-user
-- blob entities this is a real queue: rows are listed, atomically claimed, and
-- transitioned through statuses, so it lives in its own D1 table rather than KV.

CREATE TABLE report_jobs (
  id TEXT PRIMARY KEY,             -- uuid
  user_id TEXT NOT NULL,           -- requester; report docs are stored under this user
  property_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | claimed | generating | done | failed
  payload TEXT NOT NULL,           -- JSON snapshot of property data (see worker route)
  message TEXT,                    -- transient progress message for the UI badge
  result_doc_key TEXT,             -- R2 key of the finished report doc
  error TEXT,
  created_at TEXT NOT NULL,
  claimed_at TEXT,
  completed_at TEXT
);
CREATE INDEX idx_report_jobs_status ON report_jobs(status);
CREATE INDEX idx_report_jobs_property ON report_jobs(property_id);
