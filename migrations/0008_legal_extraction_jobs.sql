-- Phase 4, Step 4.1 (property-view-v2 plan): legal-pack extraction job log.
-- Same status-lifecycle shape as report_jobs (migration 0005) per the plan's
-- explicit instruction to reuse that pattern, but processing happens inline
-- in the Worker via ctx.waitUntil() at upload time rather than external
-- polling — env.AI.toMarkdown() + the existing multi-provider generateInsight()
-- chain both run natively in the Worker, unlike report generation (which needs
-- the analyser's local Puppeteer pipeline on AJ's PC). This table exists so a
-- future UI badge can show progress the same way the report-job badge does.
CREATE TABLE legal_extraction_jobs (
  id TEXT PRIMARY KEY,             -- uuid
  user_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  doc_key TEXT NOT NULL,           -- R2 key of the legal-pack file being extracted
  doc_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | done | failed
  facts_extracted INTEGER,
  message TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_legal_jobs_property ON legal_extraction_jobs(property_id);
CREATE INDEX idx_legal_jobs_status ON legal_extraction_jobs(status);
