# 01 — Data model

Everything BRR-specific lives under **one new top-level key `property.brr`**. It is written via
`updateFieldInView('brr', next)` (`src/App.jsx:1136-1145`) and persists through the existing
autosave with no migration. Never store BRR data in `property.analytics` or add keys to
`reportFields`. All shapes below are the contract for `worker/brrCalc.js` JSDoc `@typedef`s.

## Top-level shape

```js
property.brr = {
  shapeVersion: 1,              // data-shape version (bump only on breaking shape change)
  activeScenarioId: string,     // which scenario drives the summary dashboard
  defaults: BrrDefaults,        // BRR-level assumptions shared by all scenarios
  scenarios: BrrScenario[],     // seeded with 4 on first open (see below)
  rentalComps: RentalComp[],    // see 05-rental-comps.md
  rentRecommendation: RentRecommendation | null,   // last computed weighted rent (stored so overrides can diff against it)
  rules: InvestmentRule[],      // seeded from DEFAULT_BRR_RULES on first open
  bidLadder: { startBid: number|null, endBid: number|null, increment: 250|500|1000|2500|number },
  stress: StressConfig,         // editable combined-downside deltas
  confirmed: null | {           // set once the lot is won (phase 7)
    hammerPrice: number, confirmedAt: iso, actualScenarioId: string,
    preAuctionMaxBid: number|null, preAuctionSnapshotId: string|null,
  },
  snapshots: BrrSnapshot[],     // immutable once written
  audit: BrrAuditEntry[],       // newest first, cap at 200 entries
}
```

## BrrDefaults — shared BRR assumptions (scenario-overridable)

Grouped exactly as the UI sections. Every field nullable; `null` = "inherit / not set".

```js
BrrDefaults = {
  endValue: {
    conservative: number|null,   // inherit analytics.gdvConservative
    expected:     number|null,   // inherit analytics.gdvBase
    optimistic:   number|null,   // inherit analytics.gdvOptimistic
    custom:       number|null,
    selected: 'conservative'|'expected'|'optimistic'|'custom',   // default 'expected'
    confidence: 'low'|'medium'|'high'|null,
    overrideReason: string|null, notes: string|null,
  },
  mortgage: {
    ltvPct: number,              // default 75
    ratePct: number,             // default 5.5
    type: 'io'|'repayment',      // default 'io'
    termYears: number,           // default 25
    maxMortgageOverride: number|null,
    minEquityRetainPct: number|null,
    stressRatePct: number,       // default ratePct + 2
    refinanceDate: iso|null,
  },
  rent: {
    conservative: number|null, expected: number|null, optimistic: number|null,
    custom: number|null,
    selected: 'conservative'|'expected'|'optimistic'|'custom',   // default 'expected'
    confidence: 'low'|'medium'|'high'|null,
    overrideReason: string|null, notes: string|null,             // monthly £ figures
  },
  opex: {                        // each cost entered as pct-of-rent OR fixed — see OpexItem
    voidPct: number,             // default 8 (% of gross rent, annualised)
    managementPct: number,       // default 10
    maintenance: OpexItem,       // default { mode:'pct', value:8 }
    insurance: OpexItem,         // default { mode:'annual', value:250 }
    serviceCharge: OpexItem,     // inherit property.serviceCharge if present (annual)
    groundRent: OpexItem,        // inherit property.groundRent if present (annual)
    licensing: OpexItem, compliance: OpexItem,
    utilities: OpexItem, councilTax: OpexItem,   // landlord-paid; default 0
    cleaning: OpexItem, gardening: OpexItem,
    otherMonthly: number, otherAnnual: number,
  },
}
OpexItem = { mode: 'pct'|'monthly'|'annual', value: number }   // pct = % of gross rent
```

## BrrScenario

```js
BrrScenario = {
  id: 'bsc_' + crypto.randomUUID(),
  name: string,                      // 'Conservative', 'Expected', … user-renameable
  type: 'conservative'|'expected'|'optimistic'|'custom'|'actual',
  priceBasis: 'guide'|'currentBid'|'target'|'stretch'|'maxBrrBid'|'assumed'|'confirmed',
  assumedHammerPrice: number|null,   // explicit £; null → resolve from priceBasis (see resolver)
  locked: boolean,                   // locked scenarios reject edits (confirm dialog to unlock)
  archived: boolean,
  includeInComparison: boolean,      // default true
  createdAt: iso, updatedAt: iso,
  overrides: {                       // SPARSE — only keys the user changed in THIS scenario.
    // Purchase-cost overrides (else inherited — see inheritance map):
    buyersPremiumPct?, adminFee?, legalFees?, surveyCost?, otherBuyingCosts?,
    refurbBudget?, contingencyPct?, holdingCost?,       // holdingCost = total £ (inherits dealCalc months×monthly)
    // Deep-partial overrides of defaults (merged key-by-key over BrrDefaults):
    endValue?: Partial<BrrDefaults.endValue>,
    mortgage?: Partial<BrrDefaults.mortgage>,
    rent?:     Partial<BrrDefaults.rent>,
    opex?:     Partial<BrrDefaults.opex>,
  },
}
```

**Seeded scenarios on first open** (all fully editable, per spec §8 — never hard-code
uneditable assumptions): Conservative (`selected` end value + rent = 'conservative',
ltv −5pts vs default, rate +1pt, voidPct +4), Expected (all defaults), Optimistic
(end value + rent = 'optimistic', rate −0.5pt, voidPct −3), Custom (clone of Expected,
type 'custom'). Seeding writes the *offsets as concrete override values*, not formulas.

## Purchase-price fields & status (spec §5)

| Field | Lives at | Notes |
|---|---|---|
| Auction guide price | `property.guidePrice` (existing) | inherited, source badge Listing/Manual |
| Current auction bid | `property.brr.currentAuctionBid` (new, number|null) | quick-updated in Live Auction mode; also appended to `bidLog` via `addBid()` when the user logs it |
| Intended next bid | `property.brr.nextBid` (new) | live-auction working value, never used in calcs directly |
| Target purchase price | `analytics.targetBid` (existing, read-only inherit) | |
| Stretch purchase price | `analytics.stretchBid` (existing, read-only inherit) | |
| Assumed hammer price | `scenario.assumedHammerPrice` | per-scenario |
| Calculated max BRR bid | derived (never stored except in snapshots) | |
| Confirmed hammer price | `property.hammerPrice` (existing, shared with flip actuals) + `brr.confirmed` | blank until won |
| Purchase-price status | `scenario.priceBasis` | drives the always-visible basis chip |

**Resolution rule:** effective hammer = `scenario.assumedHammerPrice` if set, else the value of
the field named by `priceBasis`, else `guidePrice`, else 0 (calc-blocked warning). Before
purchase every calculation uses this effective assumed hammer; after `brr.confirmed` is set,
the *actual* scenario uses `priceBasis:'confirmed'` and other scenarios keep their assumptions.

## Inheritance map (spec §§2, 9)

`resolveScenario(property, brr, scenario)` in `brrCalc.js` produces `{ inputs, sources }` where
`sources[field]` ∈ `'scenario' | 'brrDefault' | 'manual' | 'report' | 'listing' | 'external'`.
Precedence per field: **scenario override → brr default → property manual value → report
(`analytics`) → listing → external** — matching the app-wide priority order (manual > report >
listing > external, cf. `computeActuals` `src/App.jsx:2290`). Lower priority never overwrites
higher; inheritance is resolved at read time, nothing is copied.

| BRR input | Inherits from (in precedence order) |
|---|---|
| Guide price | `property.guidePrice` |
| Buyer's premium % | `dealCalc.buyersPremium` → company auction-house fee → `analytics.buyersPremium` (as £, converted) |
| Admin fee | `dealCalc.adminFee` |
| Legal fees / survey | `dealCalc.legalFees` / `dealCalc.surveyCost` |
| SDLT | always computed by `brrSdlt(effectiveHammer, true)` — never inherited as a number |
| Refurb budget | `dealCalc.refurbCost` → `analytics.refurb{Light|Medium|Heavy}` per `property.refurbLevel` → `analytics.worksTotal` |
| Contingency % | `dealCalc.contingencyPct` (app default 10) |
| Holding cost £ | `dealCalc.holdingMonths × dealCalc.holdingMonthlyCost` → `analytics.holdingTotal` |
| End values C/E/O | `analytics.gdvConservative` / `gdvBase` / `gdvOptimistic` |
| Current value | `property.currentValue` → `analytics` if present (else warning) |
| Floor area / beds / type / tenure | `property` fields / `analytics.floorArea` / EPC connector |
| Service charge / ground rent | `property.serviceCharge` / `property.groundRent` (leasehold warning if missing) |
| Sales comps | existing merged comp sources (report `compsList`, manual `comparables`, Land Registry connector) — read-only in BRR |

UI: every inherited value shows the source badge style used by the KPI strip
(`src/App.jsx:3725-3752`); tapping "override" writes a scenario override and flips the badge
to `BRR`.

## InvestmentRule (spec §19)

```js
InvestmentRule = {
  id, key: RuleKey, enabled: boolean, mandatory: boolean,  // mandatory=false → advisory
  target: number,       // £, %, ratio or × depending on key
}
RuleKey ∈ [ 'maxCashLeftIn', 'minCapitalRecycledPct', 'minMonthlyCashflow',
  'minAnnualCashflow', 'minEquityRetained', 'minEquityRetainedPct', 'minRefinanceBuffer',
  'minGrossYieldPct', 'minNetYieldPct', 'minICR', 'minDSCR', 'maxTotalCashInvested',
  'maxProjectCostPctOfValue', 'minRentalConfidence', 'minValuationConfidence' ]
```
`DEFAULT_BRR_RULES` exported from `brrCalc.js`: maxCashLeftIn £20,000 (mandatory),
minCapitalRecycledPct 75 (advisory), minMonthlyCashflow £150 (mandatory), minDSCR 1.25
(advisory), rest disabled with sensible targets pre-filled.

## BrrSnapshot (spec §§28–29)

Immutable once appended. Written only at: "Save pre-auction snapshot" (user action), each
max-bid solver run the user chooses to save, and hammer-price confirmation (automatic).

```js
BrrSnapshot = {
  id, kind: 'review'|'maxBid'|'confirmed',
  calcVersion: BRR_CALC_VERSION,     // exported const from brrCalc.js, e.g. 1 — bump on any formula change
  scenarioId, scenarioName, at: iso, user: string,
  inputs: ResolvedInputs,            // the FULL resolved input set incl. inherited shared values used
  outputs: BrrOutputs,               // full computed result (02-calculations.md)
  maxBid: null | { maxBid, limitingRuleKey, firstFailingBid, failReason, increment },
  warnings: Warning[], verdict: Verdict,
}
```
Versioning rules: old snapshots are never recomputed or edited; UI labels each snapshot with
its `calcVersion` and flags "computed with an older calculation version" when it differs from
current. New calculations always use the current version.

## BrrAuditEntry (spec §30)

```js
BrrAuditEntry = { id, at: iso, user, scenarioId: string|null, field: string,
                  prev: any, next: any, reason: string|null }
```
Logged for: price/bid changes, scenario create/duplicate/delete/lock/archive, valuation and
rent overrides (reason REQUIRED — block save without it), refurb changes, mortgage rate/LTV
changes, rule changes, max-bid saves, hammer confirmation, verdict changes (old→new label).
Additionally call the existing `withActivity(prop, 'brr', detail)` for coarse events
(scenario created, snapshot saved, hammer confirmed) so they surface in the Timeline tab —
add `'brr'` to the `AICONS` map (`src/App.jsx:3548`) with a suitable icon.

## What is stored vs derived (spec §28 summary)

- **Shared across property:** everything already on `property`/`dealCalc`/`analytics` — BRR
  reads, never duplicates. Explicit "push to property" action (e.g. updating `guidePrice`)
  goes through `updateFieldInView` on that field, with a confirm.
- **BRR-analysis-level:** `defaults`, `rules`, `rentalComps`, `rentRecommendation`,
  `bidLadder`, `stress`, `confirmed`.
- **Scenario-level:** `assumedHammerPrice`, `priceBasis`, sparse `overrides`, lock/archive.
- **Derived (never persisted):** all outputs in 02-calculations.md, warnings, verdict,
  sensitivity grids, ladder rows, solver results — recomputed on render from pure functions.
- **Snapshotted:** `snapshots[]` at the three defined moments only.
- **Versioned:** snapshots via `calcVersion`; the shape via `shapeVersion` (a
  `migrateBrrShape(brr)` function in `brrCalc.js` upgrades old shapes on load, identity for v1).
