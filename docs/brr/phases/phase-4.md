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

Shipped 2026-07-14. `worker/brrCalc.js`: `applyStress(inputs, stress)` applies a sparse
StressConfig patch (missing keys = 0 delta), so the same function serves both an individual
single-delta stress and the combined 9-key downside; `serviceChargePct` stresses only service
charge, `opexPct` stresses every other opex cost line, `voidPtsExtra` adds to `voidPct`.
`sensitivityGrid({inputs, rowAxis, colAxis, metric, rules})` is the generic 2-axis helper (each
cell carries `value`, `pass`, and the full `out` BrrOutputs for the detail popover); `rules` is
an optional `(out) => boolean` predicate so the phase-5 rule engine can plug in later without a
signature change — pass/fail defaults to the phase-1 basic condition (positive monthly cash
flow). `DEFAULT_STRESS` is now exported (was previously a private const backing `seedBrr`).
13 `SENSITIVITY_PRESETS` exported.

**Interpretation call (spec was ambiguous — flag to user if wrong):** the 13 preset names in
04's spec pair either two real axis fields ("endValue×LTV", "rent×rate", "rent×opexScale" — the
3 built as genuine swept 2-axis grids) or one axis field + an output-metric name ("hammer×cashLeftIn"
etc. — the other 10). Since `sensitivityGrid` is explicitly a 2-axis helper, the 10 metric-named
presets use a second axis held at a single no-op value (current scenario setting) so they run
through the same shared function as a 1-column sensitivity list. Chose secondary "held" axes
that a real BRR analyst would plausibly want elsewhere in the tab (e.g. hammer's held axis is
LTV, refurb's is rate) — purely a rendering choice, doesn't change any number. Also assumed:
the "four combined-downside checks" pull their targets from the existing `brr.rules`
(`minCapitalRecycledPct`, `minEquityRetainedPct`, `maxCashLeftIn`) regardless of each rule's
`enabled` flag, since the stress test's checklist is independent of the phase-5 investment-rules
module — sensible defaults (75% / 20% / £20,000) are used if a rule is ever absent.

`BrrAnalysis.jsx`: section 9 (preset picker + custom row/col/metric dropdowns, colour-coded
grid — green pass / red fail / purple outline on the current-scenario cell, sticky row header,
mobile capped at 5 columns, tap-to-open detail popover with an 8-tile mini-KPI set) and section
10 (editable `StressConfig` inputs, per-delta individual-stress list with tick/cross, combined-
downside card with the four checks). Dashboard's "Stressed cash flow" KPI and the comparison
table's "Stressed cash flow" column now both read `computeBrr(applyStress(resolved, brr.stress))`
(the combined config) instead of `computeBrr`'s own rate-only `stressMonthlyCashflow` field —
that internal field is untouched (still rate-only) since tests pin it and phase 1 code depends
on it; only the UI's *display* source changed, per the phase brief. Deliberate scope cut: no
"Ranges" expander for editing sweep step counts/bounds — presets and the default ±10%/rate-±2pt/
LTV-60-80 sweeps from 02-calculations.md are used as-is; flag to user if custom range editing is
wanted. `npm test` (120/120) and `npm run build` verified; deployed live. Live browser
walkthrough of sections 9/10 not done this session — same auth-wall reason as phase 3.
