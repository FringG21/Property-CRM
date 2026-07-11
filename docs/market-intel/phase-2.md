# Market Intel — Phase 2: Sample + storage gate (DONE 2026-07-11)

## Gate result: GO — projection 5.6 MB (1.1% of free D1 limit)

Measured from a 270-lot live sample (9 SY pages): **531 B/lot row, 214 B/history row**. All 23 branches probed for real pagination depth → **183 total pages ≈ ~5,300 lots nationally** (×1.35 index factor, ×1.2 relist history factor) = **5.6 MB**. The original 13–15k-lot / 25MB estimate was 3× too high — Auction House online results are much shallower outside SY.

## Real per-branch page counts (30 lots/page, recorded in mi_branches.page_count_estimate)
southyorkshire 56 · lincolnshire 33 · northeast 15 · wales 13 · northwest 12 · london 11 · southwest 7 · eastanglia 5 · staffordshire 5 · birmingham 4 · westyorkshire 4 · hullandeastyorkshire 3 · manchester 3 · leicestershire 2 · sussexandhampshire 2 · bedsandbucks 1 (25 lots) · cumbria 1 (15) · essex 1 (7) · northamptonshire 1 (7) · scotland 1 (4) · chesterfieldandnorthderbyshire 1 (1) · **hertfordshireandwestessex 0 lots · northwales 0 lots** (no online results at all — page renders without a results table).

Implication for Phase 3: full national backfill ≈ 183 fetches ≈ **10 cron ticks ≈ 100 minutes**, or a handful of manual ticks.

## What shipped
- `POST /api/market/branches/probe` — fetch page 1 per active branch, record page_count_estimate (no ingestion).
- `GET /api/market/storage-estimate` — measured SUM(LENGTH(...)) averages × real page counts × factors; returns per-branch pages + MB + % of free limit.
- Zero-parse tripwire refined: page-1 zero lots errors **only if the branch previously had lots** (regression signal); never-populated branches finish `done` with totalPages 0. Verified live on northwales. (Heading-based shell detection didn't work — empty branches render no results section at all.)
- `npm test` glob fixed: `node --test "worker/**/*.test.mjs"` (bare directory arg didn't discover the file). 18 tests.

## Current DB state
270 SY lots (pages 1–9), 270 history rows, 3+ auctions, 9+ confirmed sales, 0 unknown statuses. Re-ingestion proven idempotent.

## Next: Phase 3 — national backfill + cron (NEEDS APPROVAL)
- Add 4th cron `7-57/10 * * * *` to wrangler.jsonc (infra change — dry-run first), scheduled() branch calling `runMarketIntelTick`.
- Seed all 23 branches (`POST /api/market/jobs/seed {force:true}` — SY will resume/redo from page 1; idempotent).
- Courtesy skip 21:55–22:30 Wed/Sat around the existing heavy scrape slot.
- Acceptance: all jobs `done` within ~1 day, ~5.3k lots, hertsandwestessex/northwales done-empty, no impact on existing Wed/Sat jobs.
