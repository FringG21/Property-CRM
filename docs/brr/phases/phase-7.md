# Phase 7 — Actual purchase tracking

Prerequisite: phase 6 committed. Final phase.

## Goal

Confirmed hammer price workflow: preserve every pre-auction scenario, snapshot and the
recommended max bid; create a locked-in actual-purchase scenario; recompute all
price-dependent values from the confirmed price; forecast-vs-actual variance reporting; and
post-completion actuals (rent achieved, refinance valuation, actual mortgage → actual cash
returned / left in).

## Read ONLY these

- `docs/brr/06-live-auction-and-confirmed.md` (§confirmed hammer — the whole second half),
  `docs/brr/01-data-model.md` (§confirmed, §BrrSnapshot), `docs/brr/07-warnings-verdict.md`
  (W-OVERMAX), `docs/brr/08-testing.md` (suite 12 confirm-hammer lines)
- `CLAUDE.md`
- Your files: `worker/brrCalc.js`, `worker/brrCalc.test.mjs`, `src/views/BrrAnalysis.jsx`
- `src/App.jsx` ranges: 1149–1162 (`setPropertyOutcome` — won/lost flow), 4695–4750
  (existing hammer-price / actual inputs on Overview — shared `hammerPrice` field, do NOT
  modify), 2285–2316 (`computeActuals` — the flip analogue, for consistency of precedence)

## Guardrails

Same as phase 1 (`docs/brr/phases/phase-1.md` §Guardrails). Plus: never modify or delete
pre-auction scenarios/snapshots or the preserved max bid; never overwrite an existing
`property.hammerPrice` that differs from the confirmed value — surface the mismatch instead.

## Build

1. **brrCalc.js**: pure `confirmHammer(brr, { hammerPrice, activeScenario, solverResult,
   user, at }) → nextBrr` implementing 06 steps 1–3 (write `brr.confirmed`, append
   `kind:'confirmed'` snapshot of the active scenario, create the `type:'actual'` scenario
   with `priceBasis:'confirmed'` and set it active). Resolver: `priceBasis:'confirmed'`
   reads `property.hammerPrice`. `varianceReport(preSnapshot, actualOutputs)` → the
   two-column diff rows (total cash in, mortgage, cash returned, cash left in, recycled %,
   equity, monthly cash flow, verdict) with Δ£/Δ%.
2. **BrrAnalysis.jsx**: "Property won — confirm hammer price" action in the dashboard,
   auto-offered when `property.bidOutcome?.result === 'won'` or `property.hammerPrice` is
   set but `brr.confirmed` is not; on confirm, run `confirmHammer`, write
   `property.hammerPrice` via `updateFieldInView` only if empty (mismatch → warning banner,
   no overwrite), audit + timeline entries. Once confirmed: price-basis chip renders green
   Confirmed with lock icon; section 12 (max-bid calculator) is replaced by the
   **Forecast vs actual** panel per 06 — hammer vs target bid, hammer vs preserved max bid
   (W-OVERMAX red when over), and the variance table.
3. **Post-completion actuals** on the actual scenario (plain audited overrides, per 06):
   actual rent achieved (→ rent custom + selected), actual refinance valuation (→ endValue
   custom + selected), actual mortgage advance (→ maxMortgageOverride). The variance table
   updates as these land. Pre-auction scenarios remain visible (read-only browse; editing
   prompts that they're historical — suggest duplicating instead; allow anyway if confirmed).
4. **Tests**: suite 12 confirm-hammer lines — preservation of scenarios/snapshots/max bid,
   actual scenario creation + activation, price-dependent recomputation at the confirmed
   price, mismatch guard, variance maths, W-OVERMAX trigger.

## Acceptance criteria

- Confirming at a price above the preserved max bid shows W-OVERMAX and the correct
  over-amount; confirming below shows the favourable variance.
- All pre-auction scenarios and snapshots byte-identical after confirmation (compare a
  snapshot's outputs before/after); the preserved max bid displayed matches the last saved
  solver result.
- Entering actual rent / valuation / mortgage moves actual cash returned / left in and the
  variance table; every entry is in the audit history with prev/next.
- The flip tab's post-auction actuals still work untouched (regression check on Overview).
- `npm test` green (full suite — all phases); 375/768/1280 pass.

## Verify & ship

`npm test` → `npm run build` → `npx wrangler deploy` → live walk-through incl. the flip-tab
regression check → commit `BRR Analysis phase 7: confirmed hammer + forecast vs actual` →
mark the README status table complete + notes below. The BRR feature is now
feature-complete; append a summary line to the project memory doc if asked.

---
_Post-phase notes:_
