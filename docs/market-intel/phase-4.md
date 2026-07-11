# Market Intel — Phase 4: Aggregation + scoring v1 (DONE 2026-07-11)

## What shipped
- `runAggregation` (worker/marketIntel.js): free-plan-shaped — 3 GROUP BY queries (outcode/town/branch) + 1 bulk confirmed-price fetch + 1 repeat-lot query + ~90-stmt batches ≈ 35 subrequests total. Writes `mi_area_metrics` (24m window; monthly confirmed counts + repeat-lot counts live in `detail` JSON rather than separate monthly rows — fewer rows, same data) and `mi_area_scores`.
- Scoring: `computeAreaScore` renormalises `default-v1` weights over the factors Pass A can actually compute (`sub100kSupply` saturating at 100·v/(v+20), `demandLiquidity` = sell-through with Bayesian shrinkage k=8 toward national, `risk` = confidence n/(n+k)); `flipSpread`/`compQuality`/`growthResilience` recorded as **missing** in components JSON — never padded. Sell-through denominator excludes withdrawn/postponed; `last_bid`/`no_bids`/`unsold` count as failed-to-sell.
- Routes: `POST /api/market/aggregate`, `GET /api/market/areas?type=outcode|town|branch&minConfirmed=&prefix=&sort=score|sub100k&limit=&offset=` (LEFT JOIN scores pinned to the default model).
- Tests: quantile/shrinkage/renormalisation — 21 total.

## Live results (24m window 2024-07-11 → 2026-07-11)
- **1,454 areas scored.** National baselines: sell-through 87.7%, 74.7% of confirmed sales ≤£100k.
- Branch top 5: southyorkshire 94.8 (590 sub-100k) · lincolnshire 92.0 (367) · northeast 89.9 (141) · wales 87.6 (74) · northwest 80.9 (53).
- National outcode top: SR8 Peterlee (76/76 confirmed sub-100k, median £28k) · S63 Dearne Valley · DN32 Grimsby · DL14 Bishop Auckland · DN21 Gainsborough · DH9 Stanley · TS26 Hartlepool — the classic cheap-terrace auction belt. Plausible.
- SY calibration list (S*/DN*): S63, DN32, DN21, DN31, S64 Mexborough, DN35 Cleethorpes, DN12 Conisbrough, DN4 Doncaster, S73 Wombwell, S70/S71 Barnsley — **awaiting user lived-knowledge sign-off (the calibration gate)**.

## Caveats to carry forward
- Score = Pass A only (supply/sell-through/confidence, 50% of model weight) — no demand, comps or growth yet. Very low medians (SR8 £28k) signal condition/void risk that Pass B must surface.
- DN32/DN31/DN35 (Grimsby/Cleethorpes) arrive via the *Lincolnshire* branch — outcode-level analysis correctly transcends branch geography.

## Next: Phase 5 — frontend core (NEEDS APPROVAL)
- `src/views/MarketIntel.jsx`: Overview / National Ranking / Results Explorer screens; `marketintel` tab; relabel existing tab "Bidding Intel". Needs a lots listing endpoint (`GET /api/market/lots` with server-side pagination) added alongside.
