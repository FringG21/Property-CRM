# Phase 1 — Core BRR calculator + tab

Execution prompt for a fresh session. Repo: property-crm (React single-file `src/App.jsx`,
Cloudflare Worker). Deployed at https://property-crm.aa-investment-partners.workers.dev.

## Goal

Ship a working BRR Analysis canvas tab for the **Expected** case: inherited property values,
assumed hammer price, manual end value + rent, mortgage (LTV/rate/io-or-repayment/term),
total cash invested, cash returned, cash left in, capital recycled, equity retained, monthly
cash flow, and a basic verdict — all derived live, persisted under `property.brr`.

## Read ONLY these (do not read all of src/App.jsx — it is ~13,200 lines)

- `docs/brr/README.md` (guards + architecture), `docs/brr/01-data-model.md`,
  `docs/brr/02-calculations.md`, `docs/brr/03-ux-screens.md` (dashboard + sections 1–5, 7 only),
  `docs/brr/08-testing.md` (suites 1–6)
- `CLAUDE.md` (change discipline, responsive rules, build/deploy)
- `src/App.jsx` ranges: 380–390 (isMobile/isTablet), 1127–1171 (withActivity,
  updateFieldInView, addBid), 2270–2320 (calcSDLT, computeActuals), 2530–2535 and 2745–2760
  (dealCalcStrategy stub, autosave effect), 3510–3560 (bid-day + dealCalc derivations —
  the scope your panel renders inside), 3721–3800 (KPI strip src-badges + tab array),
  5188–5222 (financials panel — insert your panel AFTER this block)
- `src/views/MarketIntel.jsx` lines 1–60 only (view-component prop pattern)
- `worker/marketIntel.test.mjs` lines 1–60 only (test conventions)

## Guardrails (repeated every phase — never violate)

- Don't touch the flip Deal Analysis (`financials` panel at 5188, portfolio tab at 9018),
  `analytics`, or the `reportFields` whitelist (~line 993). Never remove/rename existing fields.
- No bridging/finance-fee modelling. Net cash returned = gross refinance mortgage.
- Inline styles + `isMobile`/`isTablet` ternaries only; no CSS classes/media queries.
- Persist ONLY via `updateFieldInView('brr', nextBrr)` — build the complete next `brr` object
  and write once per user action (the function replaces the whole field; never call it twice
  in one handler for the same field). Solver/derived results stay in local component state.
- QA gotcha: autosave fires 2s after the last state change — wait for the "Saved" indicator
  before judging persistence in the browser.

## Build

1. **`worker/brrCalc.js`** (new): JSDoc typedefs from 01-data-model.md; exports
   `BRR_CALC_VERSION = 1`, `brrSdlt`, `OpexItem` normaliser, `mortgagePayment`,
   `resolveScenario(property, brr, scenario)` (inheritance map in 01 — phase 1 needs the
   purchase-cost, end-value, rent, mortgage, opex paths), `computeBrr(resolved)` implementing
   02-calculations.md §§1–13 (skip sensitivity/stress/rules — later phases),
   `seedBrr(property)` → initial `property.brr` with defaults + ONE scenario
   (`type:'expected'`, `priceBasis:'guide'`) — phases 2+ add the rest, so keep the shape
   exactly per 01 (scenarios array, empty rentalComps/rules/snapshots/audit).
2. **`worker/brrCalc.test.mjs`** (new): suites 1–6 from 08-testing.md, table-driven with a
   `makeInputs(overrides)` helper. All existing tests must stay green.
3. **`src/views/BrrAnalysis.jsx`** (new): props `{ property, updateFieldInView, addBid,
   isMobile, isTablet, userName }`. Renders per 03-ux-screens.md: sticky summary dashboard
   (single scenario for now — no picker yet; price-basis chip; KPI grid) + collapsible
   sections 1 (price fields), 2 (inherited costs w/ source badges + override/reset),
   3 (end values C/E/O/custom + selected), 4 (mortgage), 5 (rent manual), 7 (operating
   costs with pct/monthly/annual mode per item). Seed `brr` via `seedBrr` on first render if
   `property.brr` is undefined (write once through `updateFieldInView`). Blocked states
   (no hammer, bad LTV/term) show "—" KPIs + the blocked message, never NaN.
4. **`src/App.jsx`** (3 small edits only): import `BrrAnalysis`; add
   `{ k: 'brr', l: 'BRR Analysis' }` after the `financials` entry in the tab array
   (~line 3785); add `{propCanvasTab === 'brr' && <BrrAnalysis property={currentViewProperty}
   updateFieldInView={updateFieldInView} addBid={addBid} isMobile={isMobile}
   isTablet={isTablet} userName={user.name || 'You'} />}` after the financials panel block.
5. Basic verdict for this phase only (replaced in phase 5): green "Cash-flowing BRR" when
   monthly cash flow > 0 and recycled ≥ 50%; amber "Marginal" when cash flow ≥ 0; red
   "Negative cash flow" otherwise — with the one-line numeric explanation.

## Acceptance criteria

- New tab appears between Deal Analysis and Documents; flip tab unchanged.
- Inherited values show correct source badges and live under override/reset.
- Changing the assumed hammer updates SDLT, premium, totals, cash left in, recycled %, yields
  instantly; io↔repayment and rate/term changes move the payment + cash flow correctly.
- Cash left in £0 / negative render the "all recycled" / "surplus extracted" copy (never a
  raw negative).
- Values persist after reload (wait for Saved). `npm test` green including new suites.
- No layout break at 375 / 768 / 1280px (resize and check the dashboard grid + sections).

## Verify & ship

`npm test` → `npm run build` → `npx wrangler deploy` → on the live URL: open a property with
a parsed report, walk the acceptance list, screenshot the tab → `git add` the three new files
+ App.jsx → commit `BRR Analysis phase 1: core calculator + tab` → update the status table in
`docs/brr/README.md` and append a short "shipped/gotchas" note below.

---
_Post-phase notes: (fill in after completion)_
