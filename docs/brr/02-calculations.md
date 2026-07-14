# 02 — Calculation definitions (worker/brrCalc.js)

Pure functions only; no DOM, no bindings, no Date.now() inside formulas (pass timestamps in).
All monetary inputs parsed with `const pf = v => parseFloat(v) || 0` (matches `computeActuals`,
`src/App.jsx:2294`). **Rounding:** compute in floats; round £ to whole pounds only at output
(`Math.round`), % to 1 dp, ratios to 2 dp; the mortgage payment keeps pennies internally and
rounds for display. Rule comparisons use rounded output values so what the user sees is what
is judged.

`computeBrr(resolvedInputs) → BrrOutputs` runs the pipeline below in this exact order.
Every intermediate listed here is a named key on `BrrOutputs`.

## 1. SDLT — `brrSdlt(price, isAdditional = true)`

Numerically identical to `calcSDLT` (`src/App.jsx:2270-2283`): bands 0 / 250,000 / 925,000 /
1,500,000 / ∞; additional-dwelling rates `[0.05, 0.10, 0.15, 0.17]` (standard
`[0, 0.05, 0.10, 0.12]`); marginal banding; `Math.round`; returns 0 for price ≤ 0. BRR always
calls with `isAdditional = true` (investor). Do NOT import App.jsx's copy — re-implement in
`brrCalc.js` with boundary tests pinning both to the same numbers.

## 2. Total buying costs (price-dependent — recompute on every hammer change)

```
buyersPremium = hammer × buyersPremiumPct / 100        // pct inherited/overridden
sdlt          = brrSdlt(hammer, true)
totalBuyingCosts = sdlt + buyersPremium + adminFee + legalFees + surveyCost + otherBuyingCosts
```

## 3. Total cash invested

```
contingency       = refurbBudget × contingencyPct / 100
totalCashInvested = hammer + totalBuyingCosts + refurbBudget + contingency + holdingCost
```
No bridging or finance fees, ever (scope guard).

## 4. Value uplift

```
valueUplift    = endValue − currentValue          // null if currentValue unknown → warning W-NOVAL
netValueUplift = endValue − totalCashInvested
```

## 5. Refinance mortgage

```
grossMortgage = endValue × ltvPct / 100
finalMortgage = maxMortgageOverride != null ? min(grossMortgage, maxMortgageOverride) : grossMortgage
```
`endValue` = the scenario's selected end value (conservative/expected/optimistic/custom).

## 6. Net cash returned (initial version — fixed contract)

```
netCashReturned = finalMortgage        // gross advance; no fee deductions
```

## 7. Cash left in / surplus extracted

```
cashLeftIn = totalCashInvested − netCashReturned
```
Display contract (never show a raw negative):
- `> 0` → "Cash remaining invested: £X"
- `= 0` → "All original capital recycled"
- `< 0` → store `surplusExtracted = |cashLeftIn|`, display "Surplus cash extracted above
  original investment: £X" and treat `cashLeftIn` as 0 for cash-on-cash purposes (see §16).
Outputs carry both `cashLeftIn` (raw, may be ≤ 0) and `cashLeftInDisplay` + `surplusExtracted`.

## 8. Capital recycled

```
capitalRecycledAmount = min(netCashReturned, totalCashInvested)
capitalRecycledPct    = totalCashInvested > 0 ? netCashReturned / totalCashInvested × 100 : null
```
When `capitalRecycledPct > 100`: display "100% of original capital recycled" + separate
surplus line; the raw pct is still stored for tables/sorting.

## 9. Equity

```
equityRetained    = endValue − finalMortgage
equityRetainedPct = endValue > 0 ? equityRetained / endValue × 100 : null
equityCreated     = endValue − totalCashInvested
loanToCostPct     = totalCashInvested > 0 ? finalMortgage / totalCashInvested × 100 : null
```
UI copy must state: *equity created is paper gain, not cash returned* (spec §10).

## 10. Mortgage payments — `mortgagePayment({ principal, annualRatePct, type, termYears })`

Convert: `r = annualRatePct / 100 / 12` (monthly decimal), `n = termYears × 12`.
- **Interest-only:** `monthly = principal × (annualRatePct/100) / 12`.
- **Repayment:** standard amortisation `monthly = principal × r × (1+r)^n / ((1+r)^n − 1)`.
- **Zero interest** (`r === 0`): io → 0 with warning W-ZERORATE; repayment → `principal / n`.
- **Term validation:** `termYears` must be an integer 1–40 for repayment; invalid → return
  `null` + warning W-BADTERM (calculation-blocked for repayment type; io ignores term).
- Returns `{ monthly, annual }` (annual = monthly × 12), pennies precision.
- **Stress payment:** same function with `annualRatePct = stressRatePct`; outputs
  `stressMonthlyPayment`, and downstream `stressMonthlyCashflow` / `stressAnnualCashflow`
  are the full cash-flow pipeline re-run with only the rate swapped.

## 11. Rent & operating costs (spec §12)

Normalise every OpexItem to annual £: `pct` → `grossAnnualRent × value/100`;
`monthly` → `value × 12`; `annual` → `value`.

```
grossMonthlyRent  = selected rent
grossAnnualRent   = grossMonthlyRent × 12
voidAllowance     = grossAnnualRent × voidPct / 100
voidAdjustedRent  = grossAnnualRent − voidAllowance          // = gross × (1 − void%)
management        = voidAdjustedRent × managementPct / 100   // charged on collected rent
opexAnnual        = management + Σ(normalised items: maintenance, insurance, serviceCharge,
                    groundRent, licensing, compliance, utilities, councilTax, cleaning,
                    gardening) + otherMonthly×12 + otherAnnual
netOperatingIncome = voidAdjustedRent − opexAnnual           // NOI, before mortgage
monthlyCashflow    = NOI/12 − monthlyMortgagePayment
annualCashflow     = NOI − annualMortgagePayment
```
Never compute cash flow as rent − mortgage alone; NOI is mandatory in the pipeline. Negative
opex item values are clamped to 0 with warning W-NEGOPEX.

## 12. Performance metrics (spec §13)

```
grossYieldOnHammer   = grossAnnualRent / hammer × 100
grossYieldOnCash     = grossAnnualRent / totalCashInvested × 100
grossYieldOnEndValue = grossAnnualRent / endValue × 100
netYield             = NOI / netYieldBasis × 100     // basis selectable: 'totalCashInvested' (default) | 'endValue' | 'hammer'; output records which
cashOnCash           = annualCashflow / cashLeftIn × 100
interestCoverage     = NOI / annualMortgageInterest   // io: annual payment; repayment: principal × rate
debtServiceCoverage  = NOI / annualMortgagePayment
refurbPctOfValue     = (refurbBudget + contingency) / endValue × 100
projectCostPctOfValue= totalCashInvested / endValue × 100
```
**Guards (all division):** denominator ≤ 0 → metric is `null` and outputs carry a
`metricNotes[key]` string. Cash-on-cash with `cashLeftIn <= 0` → `null` + note
`'All capital recycled'` or `'Surplus cash extracted'` (never Infinity). ICR/DSCR with zero
mortgage → `null` + `'No mortgage debt'`.

## 13. Break-evens & refinance buffer

```
breakEvenMonthlyRent: smallest gross monthly rent R where the full pipeline (void %, pct-based
  opex recomputed on R, fixed opex, mortgage payment) yields monthlyCashflow ≥ 0.
  Closed-form: R = (annualMortgage + fixedOpexAnnual) / 12 /
                   ((1 − void%)(1 − mgmt% − maintPct%) )   // only pct items that scale with rent
  Implement algebraically from the normalised items; add a unit test proving
  computeBrr at R gives cashflow ≈ 0 (±£1).
breakEvenOccupancyPct = requiredAnnualIncome / grossAnnualRent × 100
  where requiredAnnualIncome = annualMortgage + opexAnnual (management recomputed at that income).
  > 100 → warning W-OCC100.
refinanceBuffer = endValue − minValueToSupportMortgage
  where minValueToSupportMortgage = finalMortgage / (ltvPct/100)
  (buffer is 0 when no maxMortgageOverride caps the loan; positive when the override or a
   lower loan means the value could fall by `buffer` and still support the mortgage at LTV).
```

## 14. Sensitivity grids (spec §17) — `sensitivityGrid({ inputs, rowAxis, colAxis, metric })`

Generic 2-axis helper: axes are `{ field, values[] }` where field ∈
hammer | endValue | rent | ratePct | ltvPct | refurbBudget | opexScale; each cell re-runs
`computeBrr` with the two substitutions and returns the requested metric + pass/fail under
current rules. Default ranges: ±10% in 5 steps around the scenario value (rate: ±2pts in
0.5pt steps; LTV: 60–80 in 5pt steps). The required tables from the spec are presets over
this one helper (hammer×cashLeftIn, hammer×recycledPct, hammer×totalCash, endValue×LTV,
endValue×cashLeftIn, endValue×equity, rent×rate, rent×cashflow, rent×opexScale,
refurb×cashLeftIn, rate×cashflow, LTV×cashReturned, LTV×equity).

## 15. Stress testing (spec §18) — `applyStress(inputs, stress)`

```
StressConfig = { hammerPct: +5, refurbPct: +15, endValuePct: −10, rentPct: −10,
                 ratePts: +2, ltvPts: −5, serviceChargePct: +25, opexPct: +10,
                 voidPtsExtra: +4 }   // all editable defaults
```
Individual stresses = apply one delta; combined = apply all. Output: the four checks from the
spec — positive cash flow? capital recycled ≥ target? equity ≥ target? cash left in ≤ max? —
each `pass|fail` with the stressed number shown.

## 16. Output object

`BrrOutputs` carries every named value above plus `metricNotes`, and is the single input to
`evaluateRules`, `computeWarnings`, `computeVerdict` (04/07 docs). Snapshot `outputs` is this
object verbatim.
