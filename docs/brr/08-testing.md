# 08 — Automated testing plan (worker/brrCalc.test.mjs)

Runner: existing `npm test` = `node --test "worker/**/*.test.mjs"` with `node:assert/strict`
(precedent: `worker/marketIntel.test.mjs`). All tests import pure functions from
`worker/brrCalc.js`. No fixtures needed (no parsing) — build inputs with a
`makeInputs(overrides)` helper so each test states only what it varies. Keep the existing 39
market-intel tests green.

Baseline worked example used across suites (assert exact rounded numbers once, reuse):
hammer £90,000 · premium 2.4% · admin £1,200 · legal £1,500 · survey £600 · refurb £25,000 ·
contingency 10% · holding £2,400 · end value £150,000 · LTV 75% · rate 5.5% io · term 25 ·
rent £850 · void 8% · mgmt 10% · maintenance 8% · insurance £250/yr.

## Suite 1 — SDLT (`brrSdlt`)
- Matches known values: £90k→£4,500; £250k→£12,500; £300k→£17,500; £1m→£72,500 (additional rates).
- Threshold boundaries: 249,999/250,000/250,001; 925k±1; 1.5m±1 (marginal banding, no cliff).
- price 0 / negative → 0. Standard-rate variant spot-check (£300k→£5,000).
- Pin: bands [250k, 925k, 1.5m], additional rates [5,10,15,17]% — test fails loudly if edited.

## Suite 2 — Buying costs & total cash invested
- Percentage premium + fixed fees + SDLT sum; each component recomputes when hammer changes.
- Fixed-fee-only case (premium 0%). Missing costs default 0 (no NaN).
- totalCashInvested = hammer + buying + refurb + contingency + holding (baseline exact number).
- Zero hammer → blocked path (outputs flag, no NaN anywhere in BrrOutputs).

## Suite 3 — Refinance, cash returned, recycling, equity
- grossMortgage = endValue × LTV; maxMortgageOverride caps (override below AND above gross).
- netCashReturned === finalMortgage (no fee deduction — pins the scope contract).
- cashLeftIn positive / exactly zero / negative → surplusExtracted = |neg|, display fields set.
- capitalRecycledAmount = min(returned, invested); pct >100% path keeps raw pct + surplus.
- equityRetained/pct, equityCreated, loanToCost. Zero end value → nulls + notes, no throw.
- LTV 0, LTV > 100 → W-BADLTV blocked.

## Suite 4 — Mortgage payments
- io: 112,500 @5.5% → £515.63/mo (penny precision), annual ×12.
- repayment: 112,500 @5.5%/25y → £690.87/mo (standard amortisation, assert to ±1p).
- zero rate: io → 0 + W-ZERORATE; repayment → principal/n.
- term 0 / negative / 12.5 → null + W-BADTERM (repayment blocked, io unaffected).
- stress payment uses stressRatePct; stressed cash flow re-runs full pipeline (assert differs
  from expected only via the rate).

## Suite 5 — Rent, opex, NOI, cash flow
- void-adjusted rent = gross × (1−void%); void 0 and 100% edges.
- OpexItem normalisation: pct / monthly / annual all → same annual £ for equivalent values.
- management on void-adjusted (not gross) rent — explicit assertion.
- NOI = voidAdjusted − opex; monthly/annual cash flow subtract mortgage; NOT rent − mortgage
  (assert a case where the naive number differs).
- negative opex value → clamped 0 + W-NEGOPEX. Zero rent → cash-flow metrics blocked,
  recycling metrics still computed.

## Suite 6 — Metrics
- three gross yields (hammer / cash invested / end value) on baseline.
- netYield respects basis parameter and records it.
- cashOnCash normal; cashLeftIn = 0 → null + 'All capital recycled'; negative → null +
  'Surplus cash extracted' (never Infinity — assert not Number.POSITIVE_INFINITY).
- ICR (io vs repayment interest), DSCR; zero mortgage → null + 'No mortgage debt'.
- breakEvenRent: computeBrr at returned rent gives |monthlyCashflow| ≤ £1.
- breakEvenOccupancy ≤/> 100 both sides; refinanceBuffer with and without override cap.
- refurbPctOfValue, projectCostPctOfValue.

## Suite 7 — Rules (`evaluateRules`)
- each of the 15 RuleKeys: satisfied and violated case (table-driven).
- disabled rule ignored; advisory failure → pass=true + advisoryFailures.
- mandatory over null metric → not satisfied with 'cannot evaluate' note.
- no mandatory rules enabled → pass=true (spec edge case).

## Suite 8 — Max-bid solver (`solveMaxBid`)
- Spec worked example shape: maxCashLeftIn £15,000 → maxBid = last passing increment,
  firstFailingBid = maxBid + increment, limitingRuleKey correct, failReason contains both £ figures.
- SDLT-band boundary: solver result respects the recompute (a rule that flips exactly because
  SDLT jumps between increments).
- no passing bids (minPrice fails) → maxBid null + reason.
- every bid passes → ceiling returned + note.
- two rules failing at the same increment → limiting = first, reason names both.
- custom increment (£250 vs £1,000) changes granularity of result, both consistent
  (maxBid1000 ≤ maxBid250 + 750). Rounding at bid boundaries: increments align to start price.
- conflicting rules (minCashflow impossible at any price with given rent) → no passing bids.
- maxMortgageOverride below calculated mortgage affects solver path.

## Suite 9 — Bid ladder (`buildBidLadder`)
- row count = (end−start)/increment + 1; 400-row cap → validation error.
- pass/fail transition row matches solver's firstFailingBid for same config.
- failing rows carry failedRuleKeys; marker rows (guide/current/target/stretch/last-pass/
  first-fail/max) computed correctly; current bid above max bid → marker ordering still correct.

## Suite 10 — Rent recommendation (`recommendRent`)
- weighted mean with evidence-type base weights; asking haircut applied; adjustment + reason.
- similarity: beds ±1, type mismatch, distance bands each move the weight in the right direction.
- staleness factors at 91 and 181 days; duplicate grouping by normalised address; probable-dup
  by postcode+beds+rent≈ across sources.
- excluded comps ignored but preserved; <4 comps fallback C/E/O; 0 comps → insufficient.
- confidence high/medium/low boundary cases.

## Suite 11 — Warnings & verdict
- representative trigger per severity class incl. every 'blocked' code; W-REFURBGTUPLIFT
  (refurb > uplift); hammer > end value still computes (negative equityCreated) with warnings.
- verdict ladder: one test per label incl. 'Insufficient evidence' (no comps, no manual rent)
  and 'Strong' (all green + stress passes); explanation contains scenario name and £ figures.

## Suite 12 — Scenario engine, snapshots, stress, sensitivity
- resolveScenario precedence: scenario override > brr default > manual > report > listing;
  sources map labels each field correctly.
- editing scenario A's overrides leaves scenario B's resolved inputs unchanged (deep-freeze
  B and assert).
- shared property change (e.g. dealCalc.refurbCost) flows into every scenario WITHOUT an
  override; overridden scenario unaffected.
- locked scenario: mutation helper refuses edit (returns unchanged + error).
- snapshot immutability: recompute after input change ≠ stored snapshot outputs; snapshot
  retains its calcVersion when BRR_CALC_VERSION is bumped in-test.
- confirm-hammer flow (pure helper `confirmHammer(brr, price, ctx)`): preserves scenarios +
  snapshots, creates actual scenario with priceBasis 'confirmed', preserves preAuctionMaxBid.
- applyStress: each individual delta; combined example from spec (+5% hammer, +15% refurb,
  −10% value, −10% rent, +2pts rate, −5pts LTV) → four checks evaluated.
- sensitivityGrid: cell at (scenario hammer, scenario value) equals the plain computeBrr result.
