# Phase 5 — Investment rules + maximum-bid solver + full verdict & warnings

Prerequisite: phase 4 committed.

## Goal

Configurable mandatory/advisory investment rules, the iterative maximum-BRR-bid solver with
limiting-rule explanation and per-scenario max bids, the full warnings engine, and the final
six-level verdict — replacing the phase-1 basic verdict.

## Read ONLY these

- `docs/brr/04-rules-solver-ladder.md` (§rules, §solver — ladder is phase 6),
  `docs/brr/07-warnings-verdict.md` (whole doc), `docs/brr/01-data-model.md`
  (§InvestmentRule, §BrrSnapshot), `docs/brr/03-ux-screens.md` (§sections 11–12, §verdict
  card), `docs/brr/08-testing.md` (suites 7, 8, 11)
- `CLAUDE.md`
- Your files: `worker/brrCalc.js`, `worker/brrCalc.test.mjs`, `src/views/BrrAnalysis.jsx`

## Guardrails

Same as phase 1 (`docs/brr/phases/phase-1.md` §Guardrails). Solver runs and results live in
local component state; only explicit "Save result" writes a snapshot. The max bid must be a
pure function of assumptions + rules — nothing about bidding activity may feed it.

## Build

1. **brrCalc.js**: `DEFAULT_BRR_RULES` (01-data-model.md defaults), `evaluateRules(outputs,
   rules, confidences)` with the per-key table from 04 (null-metric handling, disabled
   skipped, advisory never fails); `solveMaxBid({...})` exactly per 04's 6-step algorithm
   (walk from minPrice by increment, rebuild price-dependent costs each step, stop at first
   mandatory failure, return last passing + limitingRuleKey + firstFailingBid + failReason
   sentence with both £ figures; null when nothing passes; ceiling note when everything
   passes); `computeWarnings(...)` — the full 07 catalogue with codes/severities;
   `computeVerdict(...)` — the 6-label ladder + templated explanation (uses other scenarios'
   rule results for cross-checks). Wire warnings/verdict/rules into `sensitivityGrid`
   pass/fail (replacing the phase-4 basic condition) and into `applyStress`'s four checks
   (targets now come from the enabled rules).
2. **BrrAnalysis.jsx section 11 (Investment rules)**: rule list — enable toggle,
   mandatory/advisory switch, target input (unit-aware: £ / % / ratio), reset-to-default;
   every change audited. Section 12 (Max-bid calculator, expanded by default): min price +
   increment inputs; per-scenario result tiles (Conservative / Expected / Optimistic /
   Custom max bids); the active scenario's full output panel per 04 (cash at bid, mortgage,
   returned, left in, recycled, equity, expected + stressed cash flow, limiting rule, first
   failing bid, reason sentence); "Save result" → `kind:'maxBid'` snapshot + audit.
   "Save pre-auction snapshot" button in the dashboard → `kind:'review'` snapshot.
3. **Dashboard**: verdict pill now uses `computeVerdict` (explanation always rendered);
   "max BRR bid" + "headroom" + "limiting rule" KPIs go live; `priceBasis:'maxBrrBid'`
   resolves to the active scenario's solver result. Section 14 (Risks & warnings) renders
   the engine's output grouped by severity, with the caution+ banner strip under the
   dashboard per 03.
4. **Tests**: suites 7, 8, 11 complete (including no-passing-bids, every-bid-passes,
   simultaneous failures, SDLT-band flip inside the walk, increment granularity, verdict
   per label, explanation content).

## Acceptance criteria

- Solver reproduces the spec-shaped example: with maxCashLeftIn as the binding rule the
  output names it, shows the first failing bid and the reason with both £ figures.
- Tightening a rule lowers the max bid immediately; disabling all mandatory rules yields the
  ceiling note; four scenario max-bid tiles differ per their assumptions.
- Warnings panel shows correct codes for: no comps (on a bare property), negative stressed
  cash flow, short lease (if data available), W-NEARMAX when currentAuctionBid > 90% of max.
- Verdict label + explanation change correctly when you flip a scenario from passing to
  failing; snapshots list shows saved review/maxBid entries with calcVersion.
- `npm test` green; solver UI responsive at 375px.

## Verify & ship

`npm test` → `npm run build` → `npx wrangler deploy` → live walk-through → commit
`BRR Analysis phase 5: rules, max-bid solver, verdict` → update README status + notes.

---
_Post-phase notes:_

Shipped 2026-07-14. `worker/brrCalc.js`: `evaluateRules` (all 15 RuleKeys incl. the two
confidence-rank rules), `deriveConfidences(brr)` (prefers a fresh `rentRecommendation` over the
possibly-stale `defaults.rent.confidence`), `solveMaxBid` (iterative walk per 04's 6-step
algorithm — feeds each candidate hammer straight into `computeBrr`, which already recomputes
SDLT/%-fees internally, so no static subtraction), `computeWarnings` (full 07 catalogue except
the deliberate cuts below), `computeVerdict` (6-label ladder). 39 new tests (156 total).

**Signature deviations from the docs (needed real data the documented signatures didn't carry;
same pattern as phase 4's documented calls) — flag to the user if undesired:**
- `computeWarnings(resolved, outputs, brr, rules, property)` — added optional `property` (5th
  arg) for the sales-comps/tenure/lease-length checks; omitting it just leaves those specific
  codes dormant.
- `computeVerdict(outputs, ruleResults, warnings, confidences, scenarios, stressFailCount,
  scenarioName)` — added two optional trailing args: `stressFailCount` (0-4, the ladder needs
  it and no other param carried it) and `scenarioName` (spec's explanation examples name the
  scenario). Both default to safe values if omitted.
- `resolveScenario`'s `priceBasis:'maxBrrBid'` branch now calls `solveMaxBid` internally
  (previously a phase-4 placeholder that always fell back to guide price). Recursion is broken
  by cloning the scenario to `priceBasis:'guide'` before the nested `resolveScenario` call
  `solveMaxBid` makes for every candidate hammer. The one existing test asserting the old
  guide-price fallback still passes unchanged — the fixture has no rent/end-value set, so the
  solver correctly finds no passing bid and falls back to guide price exactly as before; added
  a second test proving the new solved-value path with a fixture that does have rent/end-value.

**Deliberate scope cuts in the warnings catalogue (flag to user if wanted):**
- W-NOREASON (belt-and-braces echo of a check the UI already blocks at input) — skipped.
- W-NEARMAX / W-NEXTOVER — these need the solver's live max-bid result, which is UI-computed
  (see below), not something `computeWarnings` has; left for the UI/Live-Auction-mode phase (6)
  to add as an overlay rather than baking a `maxBidResult` param into this signature too.
- W-UNMORTGAGEABLE fires off a new `brr.manualUnmortgageableFlag` boolean — no UI toggle for it
  yet (no input surface was in scope this phase); the codepath is ready, wire a checkbox
  wherever makes sense later.
- W-SHORTLEASE / W-NOSC / W-NOGR read `property.tenure`/`leaseYears`/`serviceCharge`/
  `groundRent` — none of these exist as real property fields anywhere in the app yet, so these
  three codes are dormant until a future phase adds that data (matches "when known"/"if
  present" in the spec).

**Performance:** `solveMaxBid` runs on every render now (dashboard KPIs — max bid, headroom,
limiting rule — are always visible, not gated behind section 12 being expanded). Its own
default ceiling is £2,000,000, which at a £500 increment is ~4,000 `computeBrr`+`evaluateRules`
calls per keystroke — capped that to `effectiveMinPrice + 200 × increment` for every UI call
site (dashboard, the 4 scenario tiles, comparison table). `resolveScenario`'s internal
`maxBrrBid` resolution still uses the uncapped default since it's an opt-in price basis, not a
default — flag if that needs the same cap.

Section 12's per-scenario max-bid tiles and the comparison table's `maxBidResult` column both
solve for every non-archived scenario — the comparison table additionally gates on
`expanded.comparison` so it doesn't run when collapsed (that column was a cheap `null`
placeholder pre-phase-5; now it's real but deliberately lazy).

`npm test` (156/156) and `npm run build` verified; deployed live. Live browser walkthrough not
done this session — same auth-wall reason as phases 3 and 4 (user login required).
