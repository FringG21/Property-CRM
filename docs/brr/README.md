# BRR Analysis Tab — Master Plan & Execution Guide

Plan for adding a **BRR Analysis** (Buy, Refurbish, Refinance, Rent) tab to the per-property
canvas in this CRM. Written 2026-07-14. Planning only — no code exists yet.

**Hard scope guards (repeated in every phase file — never violate):**
- Do NOT touch the existing flip Deal Analysis: neither the per-property `financials` canvas
  tab (`src/App.jsx:5188`) nor the portfolio "Deal Analysis & Scenario Matrix" top tab (`src/App.jsx:9018`).
- Do NOT add any key to `analytics` or to the `reportFields` whitelist (`src/App.jsx:993`) —
  those are report-parser-owned contracts (see CLAUDE.md).
- No flip-vs-BRR comparison feature.
- No bridging/acquisition-finance modelling: no bridging interest, arrangement/exit fees,
  rolled-up or retained interest, investor loans, broker fees, mortgage product/legal fees,
  refinance valuation/arrangement fees, ERCs, or sources-and-uses. **Net cash returned at
  refinance = gross refinance mortgage.** Mortgage LTV/rate/type/term ARE modelled (they
  drive cash flow); mortgage *costs* are not.
- Follow CLAUDE.md change discipline: read functions in full before editing, never remove or
  rename existing fields, inline styles + `isMobile`/`isTablet` ternaries only.

## How to execute this plan with Sonnet (credit-efficient)

1. **One phase per session.** Open a fresh session and prompt:
   `Read docs/brr/phases/phase-N.md and execute it exactly. Read ONLY the files and line
   ranges it lists — do not read all of src/App.jsx.`
2. Each phase file is self-contained: goal, files/line-ranges to read, files to create/edit,
   acceptance criteria, verification, commit message. Phases build strictly in order; do not
   start phase N+1 until phase N is committed and deployed.
3. `src/App.jsx` is ~13,200 lines. Phase files give exact anchor ranges — reading only those
   keeps context (and cost) small. If an anchor has drifted, Grep for the quoted code instead
   of reading the whole file.
4. Per-phase discipline (from CLAUDE.md): `npm test` → `npm run build` →
   `npx wrangler deploy --dry-run --outdir .wrangler-dryrun` (only if wrangler.jsonc changed;
   it never should for BRR) → `npx wrangler deploy` → browser-verify at
   https://property-crm.aa-investment-partners.workers.dev → commit on `main`.
5. After finishing a phase, tick the status table below (edit this file) and append a short
   "what shipped / gotchas" note to the bottom of that phase file — same convention as
   `docs/market-intel/phase-*.md`.

### Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Core BRR calculator + tab (`worker/brrCalc.js`, `src/views/BrrAnalysis.jsx`) | shipped 2026-07-14 |
| 2 | Flexible scenarios (create/duplicate/lock/compare) | shipped 2026-07-14 |
| 3 | Rental-comparables module | not started |
| 4 | Sensitivity + stress testing | not started |
| 5 | Investment rules + maximum-bid solver | not started |
| 6 | Bid ladder + Live Auction mode | not started |
| 7 | Actual purchase tracking (confirmed hammer, forecast-vs-actual) | not started |

### Reference docs (read only what the phase file lists)

| Doc | Contents |
|---|---|
| [01-data-model.md](01-data-model.md) | `property.brr` shape, scenario object, inheritance map, snapshots, versioning, audit |
| [02-calculations.md](02-calculations.md) | Every formula in calculation order; mortgage maths; rental/opex; metrics; edge rules |
| [03-ux-screens.md](03-ux-screens.md) | Tab layout, summary dashboard, 15 sections, comparison table, sensitivity UX, mobile |
| [04-rules-solver-ladder.md](04-rules-solver-ladder.md) | Investment-rule framework, max-bid solver algorithm, bid-ladder design |
| [05-rental-comps.md](05-rental-comps.md) | Rental comparable records, evidence types, weighting, confidence, overrides |
| [06-live-auction-and-confirmed.md](06-live-auction-and-confirmed.md) | Live Auction mode, confirmed-hammer workflow, forecast-vs-actual |
| [07-warnings-verdict.md](07-warnings-verdict.md) | Warning catalogue with severities; verdict ladder and explanation rules |
| [08-testing.md](08-testing.md) | Full named test list for `worker/brrCalc.test.mjs` |

### Spec coverage map (the 30 required response items → where they live)

| # | Item | Doc / section |
|---|---|---|
| 1 | Executive recommendation | README §1 |
| 2 | Placement in existing interface | README §2 |
| 3 | BRR user journey | README §3 |
| 4 | Pre-auction & live-auction journeys | README §4 |
| 5 | Screen-by-screen UX plan | 03-ux-screens.md |
| 6 | Shared property fields | 01-data-model.md §Inheritance map |
| 7 | BRR-specific fields | 01-data-model.md §§BrrDefaults, BrrScenario, purchase-price table |
| 8 | Unknown hammer price & scenario design | 01-data-model.md §§Purchase-price fields, BrrScenario; README §4 |
| 9 | Calculation definitions & formulas | 02-calculations.md §§1–9, 13 |
| 10 | Mortgage calculation methodology | 02-calculations.md §10 |
| 11 | Rental operating-cost methodology | 02-calculations.md §11 |
| 12 | Rental-comparable methodology | 05-rental-comps.md |
| 13 | Scenario engine | 01-data-model.md §BrrScenario; phases/phase-2.md |
| 14 | Sensitivity-analysis design | 02-calculations.md §14; 03-ux-screens.md §Sensitivity UX |
| 15 | Stress-testing design | 02-calculations.md §15; 03-ux-screens.md §Stress UX |
| 16 | Investment-rule framework | 04-rules-solver-ladder.md §Rules |
| 17 | Maximum BRR bid solver | 04-rules-solver-ladder.md §Solver |
| 18 | Bid-ladder design | 04-rules-solver-ladder.md §Bid ladder |
| 19 | Live Auction mode | 06-live-auction-and-confirmed.md §Live Auction |
| 20 | Confirmed hammer-price workflow | 06-live-auction-and-confirmed.md §Confirmed |
| 21 | BRR verdict methodology | 07-warnings-verdict.md §Verdict |
| 22 | Warnings and validation | 07-warnings-verdict.md §Catalogue |
| 23 | Data model | 01-data-model.md |
| 24 | Calculation versioning | 01-data-model.md §BrrSnapshot |
| 25 | Audit-history design | 01-data-model.md §BrrAuditEntry |
| 26 | Mobile behaviour | 03-ux-screens.md §Mobile |
| 27 | Calculation testing strategy | 08-testing.md |
| 28 | Phased implementation plan | phases/phase-1..7.md + status table above |
| 29 | Risks, assumptions, dependencies | README §29 |
| 30 | Decisions requiring confirmation | README §30 |

Scenario comparison table (spec §16) → 03-ux-screens.md §Comparison table. Default scenario
types (spec §8) → 01-data-model.md §Seeded scenarios.

---

## 1. Executive recommendation

Build BRR as a **new, self-contained canvas tab** backed by:

- **One nested object `property.brr`** holding assumptions, scenarios, rental comps, rules,
  snapshots and a BRR-scoped audit trail. It persists through the existing 2s-debounced
  full-blob autosave (`src/App.jsx:2745-2760` → `POST /api/crm-data`, `worker/index.js:5445`)
  with **zero database migration** — the D1 `properties.data` column stores full record JSON.
- **One pure calculation module `worker/brrCalc.js`** (no bindings, no DOM) exporting every
  formula, the scenario resolver, rule evaluator, max-bid solver, bid-ladder builder,
  warning/verdict engines and a `BRR_CALC_VERSION` constant. It is unit-tested by
  `worker/brrCalc.test.mjs` under the existing `npm test` glob (`node --test "worker/**/*.test.mjs"`)
  and imported by the frontend as `../worker/brrCalc.js` (Vite root = repo root; precedent:
  `worker/marketIntel.js` + `src/views/MarketIntel.jsx`).
- **One view component `src/views/BrrAnalysis.jsx`** rendered from a new
  `{ k: 'brr', l: 'BRR Analysis' }` entry in the canvas tab array (`src/App.jsx:3781-3797`),
  receiving `currentViewProperty`, `updateFieldInView`, `withActivity`-style helpers,
  `isMobile`/`isTablet` as props. Keeps App.jsx growth to ~30 lines.

Everything else (all metrics, warnings, verdicts, sensitivity grids, ladders) is **derived at
render time** from `property.brr` + inherited property data — never stored — except explicit
**snapshots** taken at defined moments (max-bid run, pre-auction review, confirmed hammer).

## 2. Placement in the existing property interface

Current tab array (`src/App.jsx:3781-3790`): Overview, Comparables, Intelligence,
Deal Analysis (`k:'financials'`), Documents, Tasks, Notes, Timeline, Bid Log.

Insert **BRR Analysis** (`k:'brr'`) immediately after `financials` so flip and BRR analyses sit
side by side. The panel is a sibling conditional block `{propCanvasTab === 'brr' && (...)}`
near the financials panel (`src/App.jsx:5188`), rendering `<BrrAnalysis …/>`. Optional tab
badge: count of non-archived scenarios. The same property can be assessed as flip (existing)
and BRR (new) with no interaction between the two tabs.

## 3. BRR user journey

1. **Inherit** — open BRR tab on a property; guide price, current bid, costs, refurb budget,
   end values and comps are pre-filled from the property record with source badges
   (Manual / Report / Listing / External / BRR). Nothing re-entered.
2. **Assume** — set/confirm the assumed hammer price (defaults from guide), end value, rent,
   mortgage (LTV, rate, type, term). Four seeded scenarios: Conservative / Expected /
   Optimistic / Custom, all editable.
3. **Evidence** — add rental comparables; the tab recommends conservative/expected/optimistic
   rents with a confidence score; user may override with a reason.
4. **Judge** — summary dashboard shows total cash in, refinance mortgage, cash returned, cash
   left in, capital recycled %, equity retained, monthly + stressed cash flow, yields, verdict.
5. **Bound** — configure investment rules; run the max-bid solver; read the bid ladder to see
   exactly where each rule breaks.
6. **Bid** — on auction day, Live Auction mode: current bid vs max BRR bid, headroom,
   Safe/Caution/Limit/Do-not-bid states.
7. **Confirm** — if won, enter the confirmed hammer price; an actual-purchase scenario is
   created; pre-auction forecasts are preserved and compared against actuals.

## 4. Pre-auction vs live-auction journeys

- **Pre-auction (days before):** full tab, all sections; hammer price is explicitly an
  *assumption* — the price-basis chip (Guide / Current bid / Target / Stretch / Max BRR bid /
  Assumed / Confirmed) is always visible in the dashboard. Snapshot the review when analysis
  is settled ("Save pre-auction snapshot").
- **Live auction (bid day):** the existing bid-day detection (`src/App.jsx:3517`) also arms a
  "Live Auction" toggle at the top of the BRR tab. That view strips to: current bid input,
  next-bid input, increment, scenario picker, max BRR bid, headroom, cash-left-in, monthly +
  stressed cash flow, state banner. Bids logged through the existing `addBid()`/`bidLog`
  (`src/App.jsx:1164`). The max bid NEVER moves because bidding got competitive — it only
  changes if the user edits assumptions or rules (and that requires leaving live mode).

## 29. Risks, assumptions and dependencies

- **Full-blob autosave** means every keystroke-level state change re-POSTs the whole dataset
  after 2s. BRR inputs must therefore debounce locally like existing inputs do (they already
  ride the same 2s timer) — but avoid updating `properties` state on every solver iteration:
  solver/ladder/sensitivity results are computed into **local component state**, only
  snapshots and user inputs go through `updateFieldInView`.
- **App.jsx size**: the view lives in `src/views/BrrAnalysis.jsx`; only the tab entry, panel
  block and prop-plumbing touch App.jsx.
- **SDLT correctness** depends on current bands (Oct-2024 rules, +5% additional-dwelling
  surcharge, thresholds 250k/925k/1.5m — `src/App.jsx:2270-2283`). `brrCalc.js` re-implements
  identically; if HMRC bands change, both must change (test pins the bands).
- **No rental data exists anywhere in the app today** — rent evidence is manual entry in v1.
  A future connector (e.g. scraped lettings listings) can feed `brr.rentalComps` later; the
  record shape (05-rental-comps.md) already carries `source`/`evidenceUrl`.
- **Solver cost**: pure JS loop over ~hundreds of increments × ~15 rules — microseconds;
  safe to run on every assumption change, but still keep results out of persisted state.
- Single-let modelling only in v1; the data shape leaves room for HMO/multi-unit (see
  05-rental-comps.md §future-proofing) — do not build those.

## 30. Decisions taken (deviations from the original spec — flag to the user if they object)

1. **No TypeScript** — codebase is plain JS/JSX. JSDoc `@typedef` blocks in `worker/brrCalc.js`
   stand in for "TypeScript types"; guard functions in the same module stand in for
   "validation schemas".
2. **No database migrations** — properties persist as whole-record JSON (KV blob + D1 `data`
   column, `worker/index.js:587-657`). `property.brr` needs no schema. Only if BRR data ever
   needs *querying across properties* would a migration (`migrations/0005_*.sql`) be needed —
   out of scope.
3. **Calc module lives in `worker/`** (not `src/`) so `npm test`'s existing glob covers it and
   it mirrors `worker/marketIntel.js`. It contains zero worker-runtime code and is safe to
   bundle into the frontend.
4. **Audit** is two-layer: fine-grained BRR entries in `property.brr.audit` (capped, newest
   first) + coarse events via the existing `withActivity()` timeline (`src/App.jsx:1127`) so
   BRR actions appear in the property Timeline tab. "User" fields reuse the current session
   user name exactly as `withActivity` does.
5. **Rounding**: all £ outputs rounded to whole pounds at display and comparison time
   (matching `calcSDLT`/`computeActuals`); percentages to 1 dp; mortgage payment to the penny
   internally, whole £ for display. Documented per-formula in 02-calculations.md.
6. **Scenario price bases** map onto existing fields where they exist: guide → `guidePrice`,
   current bid → `currentBid` (new BRR-maintained field mirrored from the latest `bidLog`
   entry when in live mode), target/stretch → `analytics.targetBid`/`analytics.stretchBid`
   (read-only inheritance), confirmed → `hammerPrice` (existing field, shared with flip
   post-auction actuals — intentionally the same source of truth).
