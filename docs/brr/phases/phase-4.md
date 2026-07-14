# Phase 4 — Sensitivity analysis & stress testing

Prerequisite: phase 3 committed.

## Goal

Two-axis sensitivity tables (13 presets + generic axis picker) and editable individual +
combined stress tests, including stressed monthly cash flow surfaced on the dashboard and in
the comparison table.

## Read ONLY these

- `docs/brr/02-calculations.md` (§14 sensitivityGrid, §15 applyStress, §10 stress payment),
  `docs/brr/03-ux-screens.md` (§sensitivity UX, §stress UX), `docs/brr/01-data-model.md`
  (§StressConfig in top-level shape), `docs/brr/08-testing.md` (suite 12 stress/sensitivity
  lines, suite 4 stress-payment lines)
- `CLAUDE.md`
- Your files: `worker/brrCalc.js`, `worker/brrCalc.test.mjs`, `src/views/BrrAnalysis.jsx`

## Guardrails

Same as phase 1 (`docs/brr/phases/phase-1.md` §Guardrails). Grids are derived — compute in
local component state on demand (memoised on inputs), never persisted; only the editable
`brr.stress` config is stored.

## Build

1. **brrCalc.js**: `sensitivityGrid({ inputs, rowAxis, colAxis, metric, rules })` per 02 §14
   (axes over hammer / endValue / rent / ratePct / ltvPct / refurbBudget / opexScale; default
   ranges ±10% in 5 steps, rate ±2pts/0.5, LTV 60–80/5) and `applyStress(inputs, stress)`
   per 02 §15 with the four named checks. Export `SENSITIVITY_PRESETS` — the 13 tables from
   the spec (hammer×cashLeftIn, hammer×recycledPct, hammer×totalCash, endValue×LTV,
   endValue×cashLeftIn, endValue×equity, rent×rate, rent×cashflow, rent×opexScale,
   refurb×cashLeftIn, rate×cashflow, LTV×cashReturned, LTV×equity).
   If phase 5 hasn't landed, grid pass/fail uses the basic phase-1 verdict condition;
   structure the call so rules plug in later without signature change.
2. **BrrAnalysis.jsx section 9 (Sensitivity)**: preset picker + generic axis/metric
   dropdowns; colour states per 03 (pass `#052e1b`, advisory `#3a2a06`, fail `#3f0d0d`,
   current cell `#7C3AED` outline); cell tap → detail popover with substituted inputs + mini
   KPI set; "Ranges" expander for axis controls; mobile ≤5 columns + horizontal scroll +
   sticky row header.
3. **Section 10 (Stress testing)**: editable StressConfig inputs (defaults +5% hammer,
   +15% refurb, −10% value, −10% rent, +2pts rate, −5pts LTV, +25% service charge, +10%
   opex, +4pts void); individual-stress list (each delta alone → stressed KPI + tick/cross);
   combined-downside card with the four checks (positive cash flow / recycled ≥ target /
   equity ≥ target / cash-left-in ≤ max) showing stressed values.
4. **Dashboard + comparison table**: `stressMonthlyCashflow` KPI added (it exists from
   phase 1's stress payment — now driven by the full combined config, not just the stress
   rate).
5. **Tests**: sensitivityGrid identity cell, each individual delta, the spec's combined
   example, stress-payment reuse.

## Acceptance criteria

- All 13 presets render sane grids; the identity cell equals the dashboard numbers; cell
  popover matches a manual recalculation for one spot-checked cell.
- Editing stress deltas persists and moves the combined checks; each individual stress shows
  its own stressed number.
- Dashboard + comparison show stressed cash flow consistent with the combined config.
- `npm test` green; grid scrolls without page overflow at 375px.

## Verify & ship

`npm test` → `npm run build` → `npx wrangler deploy` → live walk-through → commit
`BRR Analysis phase 4: sensitivity + stress testing` → update README status + notes.

---
_Post-phase notes:_
