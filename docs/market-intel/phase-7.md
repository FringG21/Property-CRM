# Market Intel — Phase 7: steady state (DONE 2026-07-12)

Keeps the dataset fresh without manual intervention, and finishes the "rest of Phase 6"
(Data Health + Settings screen + SY-benchmark-everywhere) in the same effort.

## Rest of Phase 6 (commit 53fba9d)
- **6th UI sub-tab "Data Health & Settings"** (`src/views/MarketIntel.jsx`): jobs dashboard
  (status/attempts/stats, per-job Pause/Resume), storage + data-quality KPIs, UI-driven
  actions (Run tick, Recompute scores, Refresh recent national results, **deep-enrich an
  outcode** — seeds passB_lots + passB_context), an **editable + versioned scoring-weights
  editor**, and an **editable flip cost model** + refresh cadence.
- **Backend** (`worker/marketIntel.js`): `GET/POST /api/market/scoring-model` (copy-on-edit —
  `normalizeWeights`, reject all-zero, insert new default `mi_scoring_models` row, then
  `runAggregation`); `GET/POST /api/market/settings` (KV `market:settings` over
  `DEFAULT_MARKET_SETTINGS`); `aggregate` job type added to the tick dispatcher;
  `runPassBContextJob` now reads the editable cost model via `getMarketSettings`.
- **SY benchmark strip** (`SyStrip`) now on Area Detail + Compare (was Overview/Ranking only).
- Verified live: weights Save → new versioned model, 1,454 areas re-scored, S63 69.7→34.6 under
  heavy flipSpread then restored; all-zero rejected (400); screen renders live jobs/storage;
  0 horizontal overflow at 375/1280.

## Phase 7 (this commit)
- **`maybeSeedWeeklyRefresh(env)`** (`worker/marketIntel.js`, called from the `7-57/10` cron in
  index.js and the new `POST /api/market/refresh-check` route): once per
  `settings.refreshDays` (default 7) **and only when the queue is idle**, seeds `passA_refresh`
  (maxPages 2) for every active branch + a trailing `aggregate:weekly` job; updates the KV
  marker `market:last-refresh`. The existing tick drains them. Pages 1–2 catch finalised
  prices/status = the **recent-auction re-reconciliation**. Piggybacks the 10-min cron (no new
  slot); reuses the Wed/Sat courtesy-window guard.
- Verified live via `refresh-check`: `not-due` (fresh marker) → skip; `force` (idle) → seeded 23
  + aggregate; `force` (queued) → `busy` (active 24); a tick drained a `passA_refresh` (re-scrape
  capped at 2 pages) and the `aggregate:weekly` job re-scored all 1,454 areas.

## Deferred (out of scope, noted)
- Followed-area alerts (needs a follow model — no such concept yet).
- R2 90-day sweep — **moot**: Market Intel stores nothing in R2 (all in D1).
- PDF/Excel export, area review-status workflow, drive-time-from-London.

## Market Intel is now feature-complete against the plan
All 6 screens live (Overview, National Ranking, Results Explorer, Area Detail, Compare Areas,
Data Health & Settings); Pass A national + Pass B deep-enrichment (comps/growth/GDV/flip);
editable+versioned scoring; self-refreshing. Latent follow-up from earlier: `index.js`
`connectorHPI` still uses the broken `hpi/averagePrice.json?regionCode=<GSS>` form (Market Intel's
own HPI uses the correct `ukhpi/region/<slug>` form).
