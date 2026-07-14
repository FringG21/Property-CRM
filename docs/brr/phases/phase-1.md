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
_Post-phase notes (shipped 2026-07-14):_

- Built `worker/brrCalc.js` (pure calc module, `BRR_CALC_VERSION = 1`), `worker/brrCalc.test.mjs`
  (38 new tests, suites 1–6 + seed/version sanity — 77 total across `npm test`, all green),
  `src/views/BrrAnalysis.jsx`, and the 3 `src/App.jsx` edits (import, tab entry, panel block).
- `breakEvenMonthlyRent` is solved by **bisection**, not the closed-form in 02-calculations.md
  §13 — the doc's algebra only holds when the opex composition matches one specific pct/fixed
  split. Bisection is correct for any opex mix and still satisfies the ±£1 test invariant.
  Worth updating 02-calculations.md if a future phase relies on the closed form directly.
- A few of the doc's pinned example numbers in 08-testing.md don't match the actual bands/rates
  in `calcSDLT`/App.jsx (e.g. the SDLT £1m and standard-rate £300k examples, repayment-mortgage
  figure) — tests pin numbers independently re-derived from the real formula instead of the
  doc's literal figures, since the doc explicitly requires numeric identity with `calcSDLT`.
- Browser-verified live on the deployed Worker (`wrangler dev --local` can't exercise this —
  no AI/Vectorize dependency here, but kept the deployed-URL verification habit): BRR Analysis
  tab renders between Deal Analysis and Documents; scenario seeds on first open; editing rent
  and assumed hammer recomputes every KPI (cash invested, mortgage, cash left in, recycled %,
  yields, verdict) instantly; reset-to-inherited restores the guide price; values persisted
  through a full page reload; no horizontal overflow at 375/768/1280px.
- Browser-tool gotcha: `read_page`/`find` intermittently failed to surface inputs inside the
  collapsible sections (possibly a depth/virtualisation quirk in the Browser pane's a11y-tree
  walker, not an app bug — verified via `document.querySelectorAll` that the real DOM was
  correct); drove verification via `javascript_tool` dispatching native `input` events instead.
