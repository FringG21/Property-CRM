# 04 — Investment rules, max-bid solver, bid ladder

All in `worker/brrCalc.js`, pure and unit-tested.

## Investment-rule framework (spec §19)

Rule shape and the 15 `RuleKey`s: see 01-data-model.md. Evaluation:

```
evaluateRules(outputs, rules, confidences) → {
  pass: boolean,                      // every ENABLED MANDATORY rule satisfied
  results: [{ ruleKey, enabled, mandatory, target, actual, satisfied, note }],
  mandatoryFailures: [...], advisoryFailures: [...],
}
```

Per-key comparisons (actual from `BrrOutputs`, rounded display values):

| RuleKey | Satisfied when |
|---|---|
| maxCashLeftIn | `cashLeftIn ≤ target` (surplus counts as 0) |
| minCapitalRecycledPct | `capitalRecycledPct ≥ target` |
| minMonthlyCashflow / minAnnualCashflow | `monthlyCashflow ≥ target` / annual |
| minEquityRetained / minEquityRetainedPct | `equityRetained ≥ target` / pct |
| minRefinanceBuffer | `refinanceBuffer ≥ target` |
| minGrossYieldPct | `grossYieldOnHammer ≥ target` |
| minNetYieldPct | `netYield ≥ target` |
| minICR / minDSCR | ratio ≥ target (null ratio = not satisfied, note 'No mortgage debt') |
| maxTotalCashInvested | `totalCashInvested ≤ target` |
| maxProjectCostPctOfValue | `projectCostPctOfValue ≤ target` |
| minRentalConfidence / minValuationConfidence | confidence rank (low=1 med=2 high=3) ≥ target |

Null/blocked metrics: a mandatory rule over a `null` metric evaluates **not satisfied** with
note `'cannot evaluate — <metricNote>'`; advisory over null → warning only. Disabled rules
are skipped everywhere. Mandatory failures → fail; advisory failures → warnings only
(spec: advisory never auto-fails a deal). Conflicting rules (no price can satisfy all) are
not detected statically — they surface as "no passing bids" in the solver (tested).

## Maximum BRR bid solver (spec §20) — `solveMaxBid(opts)`

```
solveMaxBid({ property, brr, scenario, rules, minPrice = 5000, increment = 500,
              ceiling = 2_000_000 }) → {
  maxBid: number|null,          // last passing hammer price; null if none pass
  limitingRuleKey: string|null, // the mandatory rule that fails first above maxBid
  firstFailingBid: number|null,
  failReason: string,           // human sentence, e.g. "At £109,000 cash left in becomes £15,635, exceeding your £15,000 maximum"
  outputsAtMax: BrrOutputs|null,
  rows: [...optional trace],
}
```

Algorithm — **iterative walk, never static subtraction** (SDLT bands, % premium and % fees
make cash-left-in nonlinear in price):

1. Start at `minPrice`.
2. For each candidate hammer `h` (step `increment`): rebuild resolved inputs with
   `assumedHammerPrice = h` (recomputing SDLT, buyer's premium, %-fees, totals), run
   `computeBrr`, run `evaluateRules` (enabled mandatory rules only).
3. Continue while passing. On the first failing `h`: `maxBid = h − increment`,
   `firstFailingBid = h`, `limitingRuleKey` = the first mandatory rule in the failure list
   (if several fail simultaneously, report all in `failReason`, first as limiting).
4. If `minPrice` itself fails → `maxBid = null`, reason from that evaluation ("no bid passes
   your mandatory rules under this scenario").
5. If `ceiling` reached still passing → `maxBid = ceiling` with note "every tested bid passes
   — check your rules" (tested: "every bid passing").
6. Monotonicity is NOT assumed; the walk stops at the *first* failure by design (contract:
   max bid = last passing price before the first failure, matching the spec's example).

Output panel must show: recommended max bid, total cash at that bid, mortgage, cash returned,
cash left in, recycled %, equity retained, expected + stressed monthly cash flow, limiting
rule, first failing bid, and the reason sentence (worked example from the spec: max
£108,500; limiting rule maxCashLeftIn £15,000; at £109,000 cash left in £15,635).

Run per scenario — Conservative / Expected / Optimistic / Custom each get their own max bid
(shown as a 4-tile row). Never assume BRR supports a higher bid than flip; the number comes
only from the assumptions + rules. "Save result" appends a `kind:'maxBid'` snapshot.

## Bid ladder (spec §21) — `buildBidLadder(opts)`

```
buildBidLadder({ property, brr, scenario, rules, startBid, endBid, increment }) → rows[]
row = { hammer, sdlt, auctionFees, totalBuyingCosts, totalCashInvested, mortgage,
        cashReturned, cashLeftIn, capitalRecycledPct, surplusExtracted, equityRetained,
        grossYield, netYield, monthlyPayment, monthlyCashflow, stressMonthlyCashflow,
        pass, failedRuleKeys: [], failNote }
```

Config defaults: start = round-down(guide × 0.8, increment), end = first failing bid +
5 increments (or guide × 1.3), increment ∈ {250, 500, 1000, 2500, custom}. Cap at 400 rows
(validation error beyond). Row markers (icon column): guide price, current bid, target bid,
stretch bid, last passing bid, first failing bid, max recommended BRR bid. Each failing row
shows *which* rule failed (short label) — the table itself explains the boundary. Colour:
pass rows normal, first-fail row `#3f0d0d` tint, subsequent fails dimmed.

UI: table in `crm-table-wrap` horizontal scroll; column set collapses on mobile to
hammer / cash in / returned / left in / recycled / cash flow / result (spec example table),
full columns on desktop; full-screen overlay option on mobile.
