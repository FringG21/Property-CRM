# Market Intel — Phase 3: National backfill + cron (DONE 2026-07-11)

## What shipped
- 4th cron `7-57/10 * * * *` in wrangler.jsonc (fires :07/:17/…/:57 — never collides with the 22:00 heavy slot). `scheduled()` branch in worker/index.js runs `runMarketIntelTick`, with a courtesy skip Wed/Sat 21:55–22:30 UTC. Existing three crons untouched and verified still deployed.
- Full national backfill executed via 26 manual ticks (~6 min wall): all 23 branch jobs `done`, zero errors, zero retries. Empty branches (hertfordshireandwestessex, northwales) finished clean with totalPages 0.

## Dataset now in mi_lots (verified in D1)
- **5,029 lots · 1,530 auction events · 1,038 outcodes · date range 2018-03-02 → 2026-07-21** (site history goes far deeper than the 24-month requirement — aggregation windows will slice; a few near-future end dates exist from just-closed/scheduled online auctions).
- **3,772 price-confirmed sales; 2,991 confirmed ≤£100k** (raw, before house/bedroom eligibility). 923 address-level exclusions. **0 unknown statuses nationally** — parser covered every result format.
- Per-branch sub-£100k confirmed (top): southyorkshire 1,238 · lincolnshire 713 · northeast 244 · london 185 (mostly garages/land — Pass B will filter) · northwest 151 · wales 128 · westyorkshire 69 · staffordshire 56 · southwest 52 · manchester 36. Bottom: scotland 0, chesterfield 0 (tiny online presence).

## Steady state
Cron now ticks every 10 min; with all jobs `done` it's a no-op (single D1 SELECT). Weekly refresh seeding is Phase 7 — until then, re-run `POST /api/market/jobs/seed {force:true}` manually to re-scrape, or seed specific branches.

## Next: Phase 4 — aggregation + scoring v1 (NEEDS APPROVAL)
- `aggregate` job type: SQL GROUP BY pass → JS medians/quartiles per (area_type, area_id, window: 24m + monthly buckets) → upsert `mi_area_metrics`; then `computeAreaScore` with `default-v1` weights + Bayesian shrinkage (k≈8), confidence stored.
- Calibration gate: SY outcodes must rank plausibly vs the user's lived knowledge before trusting national output.
