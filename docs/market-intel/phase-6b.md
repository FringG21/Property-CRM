# Market Intel — Phase 6b: comps + growth + GDV engine (DONE 2026-07-11)

Pass B step 2 of 3. Adds Land Registry comparables, same-street/postcode ceilings, HPI growth
(COVID-split), and per-lot conservative/expected/optimistic GDV for a selected outcode — then
**completes the area score** (flipSpread/compQuality/growthResilience were previously `missing`).
Verified on **S63 (Dearne Valley)**. User decisions: area-level + same-street comps (no per-lot
radius); quantitative only (regeneration/crime/planning context deferred). 6c = UI.

## What shipped (`worker/marketIntel.js` only)
- **Pure helpers (exported, unit-tested):** `parseLrPpd` (LR Price Paid → price/date/street/type),
  `buildComps` (per LR class {Detached/Semi/Terraced} median/p25/p75/ceiling, same-street map,
  outcode P95 ceiling, new-builds & stale sales excluded, thin samples flagged), `lotTypeToLrClass`
  (parsed type → LR class; ambiguous → all-house fallback), `computeGdv` (bands + flip economics
  against a labelled default cost model — auction premium, SDLT+surcharge, legal, holding ×7mo,
  agent, refurb £20–35k — band ∈ below_breakeven/entry_opportunity/target), `sdlt` (banded +
  additional-dwelling surcharge), `hpiGrowth` (raw 1/3/5yr + **COVID-adjusted** post-2021 annualised
  trend + volatility), and score factors `flipSpreadScore`/`compQualityScore`/`growthResilienceScore`.
- **`runPassBContextJob`** — outcode-targeted, two-stage checkpointed cursor. *fetch:* LR PPD per
  postcode (≤12/tick, 1.1s spacing), cached in `mi_lr_cache` (`ppd:<pc>`, 90-day expiry, warm cache
  skipped). *compute:* build comps → postcodes.io geo → UK HPI → per-lot GDV into `raw.passBContext`
  → write `mi_area_context` (geo/comps_summary/ceiling/growth/hpi/score_factors) → merge factors into
  the area score. Idempotent (rebuilds from cache; `force` re-runs).
- **Seed/dispatch** for `passB_context` (generalised the outcode-seed block with `passB_lots`).
- **`runAggregation`** now LEFT JOINs `mi_area_context kind='score_factors'` and injects
  flipSpread/compQuality/growthResilience — so a wholesale recompute never clobbers an enriched
  area's fuller score (Pass-A-only for the rest).
- **Route** `GET /api/market/context?type=outcode&id=S63` → context rows + eligible lots' GDV bands.
- Tests: 7 new (parseLrPpd, buildComps, lotTypeToLrClass, sdlt, computeGdv, hpiGrowth, score factors) → **37 green**.

## S63 result (measured, 2026-07-11)
- **LR comps: 2,408 house sales / 2,518 total** across 70 postcodes (24m). Per class: Terraced n=1972
  (median £45k, p25 £28k, p75 £62k, ceiling £90k) · Semi n=379 (£61k / £38.5k / £85k) · Detached n=57
  (£120k). Outcode ceiling £110k. LR hit-rate ~100% (public API, no thin-sample postcodes blocked).
- **Growth (Barnsley):** 5yr +27.4%, 3yr +11.9%, 1yr +5.6%, **COVID-adjusted +4.6%/yr**, volatility 3.6%.
- **Score now complete:** S63 = 70.2 (job) / 69.7 (re-aggregation), `missing: []` — demandLiquidity 96.6,
  sub100kSupply 75.9, compQuality 99, growthResilience 77, risk 89.5, **flipSpread 0**.
- **Per-lot GDV:** all 155 eligible lots banded — 153 below_breakeven, 2 entry_opportunity, 0 target.
- **Headline calibration insight (honest, not padded):** median auction **purchase £48k ≥ median comp
  £45k**, so the median flip spread is **zero** — Dearne Valley's ultra-cheap terraces have compressed
  margins; the upside lives only in the optimistic (P75 £62k / refurbished) band, not the median. The
  tool correctly declines to oversell S63.
- Aggregate-preservation and idempotency both verified.

## Limitations / carry-forward
- **LR has no bedroom count** → GDV matched on property *type* only (Terraced/Semi/Detached).
- **Condition is invisible in LR** → "expected GDV = median comp" mixes refurbished + distressed stock,
  so it is *conservative* for a refurbished flip. All three bands (P25/median/P75-capped-at-street-
  ceiling) are stored so the user sees the full range; the score's flipSpread deliberately uses the
  median (safe per the brief's "never present a low return as a strong flip").
- **Cost model** = labelled default assumptions in `MI_FLIP_COSTS`; to be surfaced/editable in 6c settings.
- **UK HPI query bug found & fixed here:** the `hpi/averagePrice.json?regionCode=<GSS>` form returns
  **400** for GSS codes (E08000038). Correct form is `ukhpi/region/<la-slug>/month.json?_sort=-refMonth`
  with `refPeriodStart` parsed from a human date. **`worker/index.js` `connectorHPI` (:1891) still has the
  broken form** — its property-intelligence HPI likely fails silently; fix in a later pass (out of 6b scope).
- **EPC £/m² deferred** — GDV is £/property; per-class £/m² needs the EPC↔LR address merge (later).

## Next: Phase 6c — Area Detail + Comparison UI + flip calculator (NEEDS APPROVAL)
Surface `GET /api/market/context` in an Area Detail screen (score breakdown, comps, growth chart,
ceilings, per-lot GDV table) + a Comparison screen vs SY; expose the cost model in Settings. Also fix
the Explorer evidence link (bare `/lot/<id>` → `/lot/redirect/<id>`).
