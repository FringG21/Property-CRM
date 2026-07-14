# 07 — Warnings catalogue & verdict methodology

Both engines in `worker/brrCalc.js`: `computeWarnings(resolved, outputs, brr, rules)` →
`Warning[]`, `computeVerdict(outputs, ruleResults, warnings, confidences, scenarios)` →
`Verdict`. Pure, unit-tested, derived on render (snapshotted verbatim in snapshots).

```js
Warning = { code, severity: 'info'|'caution'|'high'|'blocked', message, section }
// 'blocked' = calculation cannot run (missing/invalid critical input); dashboard shows
// "—" KPIs and the blocked reason instead of numbers.
```

## Catalogue (spec §26) — code · severity · trigger

**Evidence**
- W-NORENTCOMPS · caution · no included rental comps
- W-WEAKRENT · caution · rental confidence low
- W-STALERENT · caution · all included comps >90 days old
- W-ASKONLY · caution · evidence set is asking/reducedAsking only ("asking rents treated as achieved")
- W-RENTHIGH · high · selected rent > optimistic evidence + 5%
- W-NOSALESCOMPS · caution · no sales comps for end value
- W-WEAKVAL · caution · valuation confidence low
- W-VALHIGH · high · selected end value > report optimistic GDV + 5% (when report present)

**Cash flow & structure**
- W-NEGCF · high · monthly cash flow < 0
- W-NEGSTRESSCF · caution · stressed cash flow < 0 (high if expected also negative)
- W-CASHLEFTIN · high · cash left in > maxCashLeftIn target (when rule enabled)
- W-LOWRECYCLE · caution · recycled % < target (advisory rule echo)
- W-LOWEQUITY · caution · equity retained < target
- W-LOWBUFFER · caution · refinance buffer < minRefinanceBuffer target
- W-MTGCAP · info · mortgage capped by manual maximum override
- W-REFURBGTUPLIFT · high · refurb + contingency > value uplift (endValue − currentValue)
- W-BREAKEVEN · high · selected rent < break-even rent
- W-OCC100 · high · break-even occupancy > 100%

**Data completeness**
- W-NOSC · caution · leasehold tenure and service charge missing
- W-NOGR · info · leasehold and ground rent missing
- W-SHORTLEASE · high · lease length < 80 years (when known)
- W-UNMORTGAGEABLE · high · user-flagged condition/EPC signals (manual flag in v1)
- W-NOBUYCOSTS · caution · legal + survey + admin all zero
- W-NOOPEX · caution · every opex item zero
- W-NOCONT · caution · contingency 0%
- W-NOVAL · info · current value unknown (uplift not computable)
- W-NOREASON · caution · manual override saved without reason (should be blocked at input; belt-and-braces)

**Bidding**
- W-OVERMAX · high · confirmed hammer > pre-auction max recommended bid
- W-NEARMAX · caution · current bid > 90% of max bid
- W-NEXTOVER · high · next bid > max bid ("Do not bid")
- W-ALLRECYCLED · info · cash left in = 0
- W-SURPLUS · info · cash left in < 0 (surplus extracted — shown positively, never raw negative)

**Calculation validity (blocked)**
- W-NOHAMMER · blocked · effective hammer ≤ 0
- W-ZERORENT · blocked for cash-flow metrics · rent ≤ 0 (cash-recycling metrics still shown)
- W-ZERORATE · info · rate = 0 (io payment 0 — flagged, not blocked)
- W-BADTERM · blocked for repayment · term not integer 1–40
- W-BADLTV · blocked · LTV ≤ 0 or > 100
- W-DIV0 · info · any metric nulled by zero denominator (message from `metricNotes`)

## Verdict methodology (spec §25)

```js
Verdict = { label, explanation }   // explanation ALWAYS present, 1–3 sentences
label ∈ 'Strong BRR' | 'Viable BRR' | 'Marginal BRR' | 'High-risk BRR' |
        'BRR does not meet criteria' | 'Insufficient evidence'
```

Decision ladder (first match wins), evaluated on the **active scenario** with cross-checks
against other non-archived, non-actual scenarios:

1. **Insufficient evidence** — any `blocked` warning, or (no rental comps AND no manual rent),
   or no end value resolvable.
2. **BRR does not meet criteria** — any enabled mandatory rule fails on the active scenario.
3. **High-risk BRR** — mandatory rules pass but: any `high` warning fires, OR the combined
   stress test fails ≥2 of its four checks, OR the Conservative scenario fails ≥2 mandatory rules.
4. **Marginal BRR** — mandatory pass but ≥2 advisory failures, or combined stress fails 1
   check, or Conservative fails 1 mandatory rule.
5. **Strong BRR** — mandatory pass, zero advisory failures, zero caution+ warnings, combined
   stress passes all four checks, and both confidences ≥ medium.
6. **Viable BRR** — everything else (mandatory pass with minor advisories).

**Explanation generation:** template assembled from the strongest positive and the weakest
point: `"{label}. The {scenario} scenario recycles {recycled}% of capital and produces
£{cashflow} monthly cash flow."` + when any cross-check bites: `" However, the {other
scenario} scenario {failure clause — e.g. leaves £26,400 invested, exceeding your £20,000
target}."` Failure clauses come from rule `results[].note` strings so wording matches the
rules panel. Verdict label changes append an audit entry (prev→next).
