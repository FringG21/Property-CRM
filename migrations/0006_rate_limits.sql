-- Rate-limit counters, moved off KV. checkRateLimit() used to do a KV put() on
-- every single allowed call — fine at low volume, but the report-poller's 30s
-- background loop alone generates ~2,880 calls/day against KV's 1,000
-- writes/day free-tier quota, and once that's exhausted every other KV-backed
-- route (sessions, autosave, AI routes) starts failing too. D1's free tier is
-- 100,000 rows written/day — 100x the headroom for the same write pattern.

CREATE TABLE rate_limits (
  rl_key TEXT PRIMARY KEY,   -- `${key}:${bucket}`, same composition as the old KV key
  count INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
