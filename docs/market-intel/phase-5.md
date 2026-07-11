# Market Intel — Phase 5: Frontend core (DONE 2026-07-11)

## What shipped
- **`src/views/MarketIntel.jsx`** (new file, approved) — self-contained tab component, props `{ isMobile }`. Three rail-tab screens, all inline styles + `isMobile` ternaries, tables in `crm-table-wrap`:
  - **Overview** — 4 KPI cards (lots analysed, confirmed sales, confirmed ≤£100k, areas scored), branch Pass-A ranking table (SY row pinned + `BENCHMARK` tag), data-window card, data-quality card (scrape-job errors + unknown-status count, plus the standing "Pass A only" disclaimer). → `GET /api/market/overview`.
  - **National Ranking** — area-type switch (outcode/town/branch), prefix filter, min-confirmed, sort (score / ≤£100k volume); SY benchmark strip; table with score chip, confidence %, ≤£100k, confirmed, % under budget, median, P25–P75, sell-through, guide→sold ratio. Footnote states 24m window / confirmed = printed price / k=8 shrinkage / Pass A only. → `GET /api/market/areas`.
  - **Results Explorer** — filters: branch, outcode, result-status, "Confirmed ≤ £100k" toggle, debounced address search; server-side pagination (50/page); CSV export (respects active filters, capped 1000 rows); evidence links to `online.auctionhouse.co.uk/lot/<id>`. Excluded lots shown dimmed with inline reason (audit, not hidden). → `GET /api/market/lots`.
- **`worker/marketIntel.js`** — two new read routes behind the existing session-checked entry:
  - `GET /api/market/overview` — 5 parallel aggregate queries (totals, areas scored vs default model, job-status histogram, active branch count, last-aggregated timestamp).
  - `GET /api/market/lots?branch=&outcode=&status=&confirmedOnly=1&maxPrice=&excluded=0&q=&sort=&limit=&offset=` — parameterised WHERE (bind-indexed), `COUNT(*)` + page in parallel, `limit` capped at 1000.
- **`src/App.jsx`** (~13 lines) — import `MarketIntel`; `marketintel` in `NAV_TABS` after `auctionintel`; nav button (Globe icon, `can('marketintel')` gated); header title `🌍 Market Intelligence — Auction Area Rankings`; render block `{activeTab === 'marketintel' && <MarketIntel isMobile={isMobile} />}`; **relabelled `auctionintel` → "Bidding Intel"** (label + header only, tab key unchanged so permissions/deep-links keep working).

## Verification (deployed to production 2026-07-11, version 36fe56bb)
- `npm test` → 21/21 green (parser fixtures unchanged).
- `wrangler deploy --dry-run` clean; deployed; all 4 crons intact.
- Live smoke test via temp KV Admin session (minted `--remote`, deleted after):
  - Overview + National Ranking + Results Explorer all render live data.
  - Explorer: 50-row page, correct status badges + inline exclusion flags; `/api/market/lots` → 200.
  - "Confirmed ≤ £100k" toggle → request carries `confirmedOnly=1&maxPrice=100000` (server-side); rows collapse to Sold-for ≤£100k only. Total 2,991 lots · 60 pages — matches the known confirmed-≤£100k count.
  - Pagination: Next → `offset=50`, page 2 of 60, filters preserved (server-side).
  - CSV: fires `limit=1000&offset=0` with active filters preserved, 200.
  - Responsive: 0 page horizontal overflow across **375 / 768 / 1280** on all three screens (wide tables scroll inside `crm-table-wrap` as designed). No console errors.
  - (Browser-pane screenshots timed out repeatedly — verified via network/DOM/JS instead.)

## Notes / carry-forward
- `can('marketintel')`: Admins see it unconditionally (`isAdmin || allowed.includes(tab)`); non-admins need `marketintel` added to their `allowedTabs`. The default admin seed list in `worker/index.js` (~line 2587) does **not** include `marketintel` — harmless for the Admin user, but add it there if a restricted user should get the tab.
- Explorer does not filter out excluded lots by design — exclusions are eligibility flags surfaced for audit; scoring/aggregation already ignores them.
- Screens are Pass-A only end-to-end. Area Detail (screen 3) and Comparison (screen 5) from the master plan are **deferred to Phase 6** (they need Pass B enrichment data). Data Health + Settings (screen 6/8) also pending.

## Next: Phase 6 — Pass B deep enrichment (NEEDS APPROVAL)
- Lot-detail job (beds/tenure/exclusions via adapted `enrichLotFromDetailPage`), context job (LR via `mi_lr_cache`, EPC, HPI growth w/ COVID split, same-road ceilings), Area Detail + Comparison screens, flip calculator. Gate on the SY calibration sign-off still open from Phase 4.
