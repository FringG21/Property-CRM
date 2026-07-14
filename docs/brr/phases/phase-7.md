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

Shipped 2026-07-14. **BRR Analysis is now feature-complete (phases 1-7).** `worker/brrCalc.js`:
`confirmHammer(brr, {hammerPrice, activeScenario, snapshot, solverResult, user, at})` (pure —
has no `property` in scope, so the caller supplies the fully-computed snapshot payload;
preserves every existing scenario/snapshot untouched, appends a `kind:'confirmed'` snapshot,
creates+activates a locked-in `type:'actual'` scenario cloning the active scenario's
overrides) and `varianceReport(preSnapshot, actualOutputs, actualVerdict)` (two-column Δ£/Δ%
diff + a text-only verdict row). 8 new tests (171 total), including byte-identical
preservation of pre-existing scenarios/snapshots and price-dependent recomputation at the
confirmed price (`priceBasis:'confirmed'` already read `property.hammerPrice` since phase 1/2
— no resolver change needed).

`BrrAnalysis.jsx`: a "🏆 Property won — confirm hammer price" card auto-offered when
`property.bidOutcome?.result === 'won'` or `property.hammerPrice` is already set but
`brr.confirmed` isn't; Section 12 is replaced by a Forecast-vs-actual panel once confirmed
(hammer vs target bid, hammer vs preserved max bid with W-OVERMAX, the variance table, and a
"Post-completion actuals" quick-entry block that reuses the EXISTING rent/endValue/mortgage
override inputs — no new field types, exactly as 06 specifies). Editing a historical
(non-'actual') scenario after confirmation now prompts a confirm dialog first.

**Two real engineering constraints worth flagging:**
1. **Stale-closure limit on `property.hammerPrice` + `brr` writes.** `updateFieldInView` and
   `logTimeline` (props from App.jsx) both spread over the same `currentViewProperty` closure
   independently — calling both in one synchronous handler means the second call silently
   drops the first's change (this is the same class of bug flagged in the phase-2 memory note
   about `logBrrTimeline`, just hitting two DIFFERENT top-level fields instead of the same
   one). Rather than touch App.jsx (out of this phase's file scope) to make it accept a
   multi-field atomic update, "Confirm hammer price" is a two-click flow when
   `property.hammerPrice` isn't set yet: click 1 sets `hammerPrice` alone and asks the user to
   click again; click 2 (now that `property.hammerPrice` is populated) runs `confirmHammer` via
   a single `logTimeline` call. When `property.hammerPrice` is already set, it's one click. If
   this two-click UX is unwanted, the real fix is extending `updateFieldInView`/
   `logBrrTimeline` in App.jsx to accept a multi-field patch — flag if that's wanted.
2. **`confirmHammer` needs a fully pre-computed snapshot** (`{inputs, outputs, warnings,
   verdict}`) passed in by the caller rather than deriving it from `property`, since the
   documented signature `confirmHammer(brr, {...})` has no `property` param to run
   `resolveScenario` with. The UI already has all four pieces computed for the dashboard, so
   this costs nothing extra — noted here only because it's a deviation from a strictly
   self-contained pure function.

Regression check: **no changes were made to `src/App.jsx`** this phase (only read the three
listed ranges) — the flip tab's `computeActuals`/Overview auction-result card are provably
untouched by construction, not just by inspection.

`npm test` (171/171) and `npm run build` verified; deployed live. Live browser walkthrough not
done this session — same auth-wall reason as phases 3-6; this is the final phase, so a full
end-to-end browser pass (all three widths, the flip-tab regression check, and the actual
confirm-hammer flow) is still worth doing once you're logged in.
