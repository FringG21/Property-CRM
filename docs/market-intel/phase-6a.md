# Market Intel — Phase 6a: Lot-detail enrichment job (DONE 2026-07-11)

Pass B, step 1 of 3. Fills property type / bedrooms / tenure and refines exclusions
for a **user-selected outcode** by fetching each lot's detail page. Verified on **S63
(Dearne Valley, SY)** — the calibration area. 6b (LR/EPC/HPI/comps) and 6c (Area Detail
+ Comparison UI + flip calc) remain.

## What shipped (`worker/marketIntel.js` only)
- **`parseLotDetail(html)`** — pure parser off the stripped description text; returns
  `{propertyType, isFlat, bedrooms, tenure, leaseholdFlag, epcRating, councilTaxBand, signals, evidence}`.
  Absent fields return null, never guessed; every value carries an evidence snippet (`method:'text'`).
  Bedroom count from the `'<n> Bedroom(s)'` summary chip (**same-line match**, see bug below),
  else the `Bedroom 1/2/3` enumeration count. Type = first type keyword, guarding `'flat roof'`.
- **`classifyLotPassB(passA, detail)`** — refines Pass A conservatively: detail-derived flat →
  exclude; beds known `<2` → `under_2_beds` (unknown never excludes); tight condition/occupancy
  signals (`tenanted`/`fire_damaged`/`non_standard_construction`/`no_internal_access`); **leasehold
  houses flagged, not excluded** (only leasehold *flats* excluded, via type).
- **`runPassBLotsJob`** — targets one outcode; each tick takes the next 15 (`detailFetchesPerTick`)
  lots with `excluded=0 AND enrichment_level=0`, fetches `…/lot/redirect/<id>`, updates typed columns
  + appends a `passB` provenance block to `raw`. **Always sets `enrichment_level=1`** (even on
  404/error) so the job terminates; per-lot `try/catch`; 1.1s spacing; honest UA. Job `done` when 0
  unenriched non-excluded lots remain — idempotent + resumable.
- **Seed**: `POST /api/market/jobs/seed {type:'passB_lots', outcode:'S63'[, force:true]}` → one
  `passB_lots:<OUTCODE>` job. **Dispatch**: `passB_lots` case wired into `runMarketIntelTick`.
- Tests: 2 real fixtures (freehold 2-bed house `342457`, leasehold apartment `344222`) + synthetic
  edge cases → **30 tests green**.

## S63 result (measured, 2026-07-11)
- **Hit-rate 184/186 = 98.9%** via `/lot/redirect/<id>` (only 2 expired → `http_404`). No errors.
  → historical lot pages are highly available; **6b does not need EPC/LR as a fallback house-type source.**
- Captured: bedrooms 162/186, property_type 171/186, tenure 125/186.
- **31 new Pass B exclusions**: tenanted 22, flat 4, fire_damaged 4, under_2_beds 2, no_internal_access 1.
  Spot-checked a `tenanted` lot live → *"offered for sale as a buy-to-let investment and currently let
  at £700 pcm"* — genuine, not boilerplate.
- Leasehold: 2 leasehold **houses** flagged & kept eligible; 2 leasehold **flats** excluded — brief-correct.
- **Final S63 eligibility: 155 eligible houses, 148 at 2+ beds, 129 eligible confirmed sub-£100k.**
- Idempotency confirmed: force re-queue → next tick `done, processed=0`.

## Bug caught during verification (fixed + regression-tested)
The bedroom regex used `\s*` (matches newlines), so a room dimension bleeding into the next line —
`"... x 3.1\nBedroom 1 -"` — was read as **"1 Bedrooms"**, and `"... x 3.10\nBedroom 1"` as **"10"**.
This wrongly flagged **~19 eligible 2–3 bed houses as `under_2_beds`** in the first run (21 → 2 after
fix). Fix: same-line match `/(\d+)[ \t]*Bedrooms?\b/i`. S63 was reset and fully re-enriched with the fix;
bedroom distribution now all plausible (2×101, 3×71, 4×3, 1×2, unknown×9).

## Deploy gotcha (cost two dead deploys — record for next time)
This project's worker is **vite-built into `dist/`**; `wrangler deploy` ships that pre-built bundle.
`npx wrangler deploy` **alone deploys stale worker code** — you must `npm run build` first (or use
`npm run deploy`, which chains `build && deploy`). Confirm a worker change is live by grepping the
`--dry-run --outdir` bundle for a new string, or via a behavioural probe (here: no-outcode seed → 400).

## Next: Phase 6b — area context + comparables (NEEDS APPROVAL)
Land Registry PPD (via `mi_lr_cache`) house-type + comps, EPC register match, HPI growth (COVID split),
same-road / postcode ceilings, conservative/expected/optimistic GDV with provenance. Then 6c UI.
Latent bug to fix in 6c: the Explorer evidence link uses bare `/lot/<id>` (404s) — should be `/lot/redirect/<id>`.
