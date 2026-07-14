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
