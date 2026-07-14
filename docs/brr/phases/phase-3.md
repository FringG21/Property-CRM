# Phase 3 — Rental-comparables module

Prerequisite: phase 2 committed (scenario engine live).

## Goal

Rental evidence: comparable records with evidence types, duplicate/staleness detection,
quality weighting, weighted recommended rent → conservative/expected/optimistic, rental
confidence scoring, and audited manual rent overrides.

## Read ONLY these

- `docs/brr/05-rental-comps.md` (the whole spec for this phase),
  `docs/brr/01-data-model.md` (§RentalComp pointer, `rentRecommendation`),
  `docs/brr/03-ux-screens.md` (§section 6), `docs/brr/08-testing.md` (suite 10)
- `CLAUDE.md`
- Your files: `worker/brrCalc.js`, `worker/brrCalc.test.mjs`, `src/views/BrrAnalysis.jsx`
- `src/App.jsx` ranges: 4114–4150 (sales-comp merge `normKey`/upsert pattern to mirror for
  address normalisation), 5650–5665 (`staleChip` visual convention)

## Guardrails

Same as phase 1 (`docs/brr/phases/phase-1.md` §Guardrails). Additionally: sales comparables
stay read-only — this phase adds RENTAL comps only, stored at `property.brr.rentalComps`.

## Build

1. **brrCalc.js**: `recommendRent(comps, subject)` implementing 05 in full — evidence-type
   base weights, asking −3% haircut, similarity scoring (beds/type/area/condition/distance/
   amenity), staleness factors (>90d ×0.7, >180d ×0.4), duplicate grouping (normalised
   address; probable-dup postcode+beds+rent±£25 across sources), percentile-based C/E/O
   (≥4 comps) with the <4 fallback, confidence high/medium/low/insufficient. Also
   `normaliseAddress`, `compQuality(comp, subject)` (exported for UI chips).
2. **BrrAnalysis.jsx section 6**: comp list (cards on mobile, table on desktop in
   `crm-table-wrap`) with add/edit form covering every RentalComp field (evidence-type
   select, dates, attributes, adjustment + required reason, weight slider, include toggle,
   evidence URL, notes); duplicate groups render stacked with the "possible duplicate" chip;
   stale chips per 05; derived rent/bed and rent/sqft columns. Recommendation card:
   recommended + C/E/O + confidence, "Use recommended" buttons that copy into
   `defaults.rent.*` (audited); computing stores `brr.rentRecommendation` with `compIdsUsed`.
   Manual rent edits when a recommendation exists REQUIRE `overrideReason` (block save
   without it) and append audit entries; the stored recommendation is never overwritten.
3. **Warnings (local to this section for now — full engine is phase 5):** no comps /
   asking-only / all-stale / selected rent > optimistic+5% render as inline caution chips on
   the rent section per 05.
4. **Tests**: suite 10 complete.

## Acceptance criteria

- Add 4+ comps of mixed evidence types → recommendation + C/E/O + confidence appear and
  respond to include/exclude, weights, adjustments; duplicates grouped; stale chips correct.
- "Use recommended" fills scenario rents; manual override without a reason is blocked;
  original recommendation still visible after override.
- Excluding a comp changes numbers but the record persists (reload check, wait for Saved).
- `npm test` green; comp form usable at 375px (single column, 44px targets).

## Verify & ship

`npm test` → `npm run build` → `npx wrangler deploy` → live walk-through → commit
`BRR Analysis phase 3: rental comparables + recommended rent` → update README status + notes.

---
_Post-phase notes:_
