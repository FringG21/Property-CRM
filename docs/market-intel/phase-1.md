# Market Intel — Phase 1: Pass A parser + tests (DONE 2026-07-11)

## What shipped
- Pure parser functions in `worker/marketIntel.js`: `parsePastAuctionPage` (table rows `<tr class="fw-normal">`, 6 cells: image+lot link | address | auctioneer | ended dd/mm/yyyy hh:mm | guide | result), `normalizeResultStatus`, `parseGuide` (single/`a - b`/`a+` formats), `extractPostcodeParts`, `extractTown`, `classifyLotPassA` (address-only, conservative: flat/land/garage/parking/commercial), `parseAuctionEnd`.
- Ingestion `ingestParsedPage`: batched upserts; `mi_lots` conflict-update guarded on `auction_end_at >=` so an older observation never overwrites a newer relist; `mi_lot_results` INSERT-OR-IGNORE (append-only).
- Job runner `runMarketIntelTick`: optimistic lock, per-page cursor checkpoint, 1.1s fetch spacing, page-1 zero-parse tripwire → job `error`; retry backoff 10min·2^attempts, 5 max. `POST /api/market/jobs/tick {maxPages}` for manual capped runs.
- `test/fixtures/`: sy-page1.html, sy-page2.html, manchester-page1.html (real pages saved 2026-07-11). `worker/marketIntel.test.mjs`, `npm test` = `node --test worker/` — 17 tests.

## Verified live
- Tick on `passA_index:southyorkshire` capped at 1 page: 30 lots, cursor recorded totalPages=56, job → done at cap.
- Re-seed + re-tick of the same page: counts unchanged (30 lots / 30 results) — idempotent.
- 9 price-confirmed sales (matches fixture hand-count), 0 unknown statuses, 6 address-level exclusions.

## Live-format facts (baked into fixtures/tests)
- 30 rows/page. Statuses seen: Sold, Sold Prior, Sold After, Sold for: £X, Last Bid: £X, No Bids, Withdrawn, Postponed. Price entities `&pound;`/`&#163;`.
- `sold_after_for` (price printed) also counts confirmed, same principle as sold_for/sold_prior_for.
- Pagination depth varies wildly: SY 56 pages, Manchester 3 → national volume estimate revised down from "avg 40 pages/branch".
- Branches list lots OUTSIDE their region (SY page had an Oswestry SY11 lot) — analyse by outcode, not by branch geography.

## Next: Phase 2 — 250-lot sample + storage go/no-go
- `GET /api/market/storage-estimate` (measured SUM(LENGTH(...)) × real page counts × 1.35 index factor).
- Run SY job to ~9 pages (270 lots), check histogram vs live site, record per-branch page counts (needs page-1 fetch per branch or wait for Phase 3).
- Gate: projection <50MB before national backfill approval.
