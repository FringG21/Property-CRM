# 05 — Rental comparables module & methodology

No rental data exists anywhere in the app today — this module is net-new, manual-entry-first.
Stored at `property.brr.rentalComps[]`; recommendation engine in `worker/brrCalc.js`
(`recommendRent(comps, subject)`), fully unit-testable. Sales comps remain read-only reused
evidence for END VALUES (existing merged sources — report `compsList`, manual `comparables`,
Land Registry connector, cf. `src/App.jsx:4114-4148`); rental comps are a separate list.

## RentalComp record (spec §14)

```js
RentalComp = {
  id: 'rc_' + uuid, createdAt, addedBy,
  address: string, postcode: string|null, distanceMiles: number|null,
  monthlyRent: number,
  evidenceType: 'asking'|'reducedAsking'|'letAgreed'|'achieved'|'agentAppraisal'|'userEvidence',
  listedAt: iso|null, letAgreedAt: iso|null, achievedAt: iso|null,
  propertyType: string|null, beds: number|null, baths: number|null, floorAreaSqm: number|null,
  condition: 'poor'|'average'|'good'|'refurbished'|null,
  furnished: 'furnished'|'unfurnished'|'part'|null,
  garden: bool|null, parking: bool|null, transportNote: string|null,
  source: string|null, evidenceUrl: string|null, attachmentKey: string|null, // R2 doc key if screenshot uploaded via existing docs flow
  adjustment: number|null,        // £/month manual adjustment (+/−), applied to weighted calc
  adjustmentReason: string|null,  // required if adjustment set
  weight: number,                 // 0–1 user weighting, default from quality score
  confidence: 'low'|'medium'|'high',   // per-comp, defaulted from evidence type + staleness
  included: boolean,              // exclude without deleting — original evidence preserved
  notes: string|null,
  // derived at render (not stored): rentPerBed, rentPerSqft, ageDays, staleFlag, dupGroup
  unitLabel: string|null,         // future-proofing: null = whole single let; later 'Room 1', 'Flat A', …
}
```
`unitLabel` (+ the fact rents are per-record, not per-property) is the only HMO/multi-unit/SA
provision needed now — do NOT build unit UI in v1.

## Methodology (spec §15)

**Duplicate / same-property detection:** normalise address (lowercase, strip punctuation,
collapse whitespace — reuse the `normKey` approach from the sales-comp merge) + postcode;
same normalised address ⇒ duplicate group; also flag *probable* duplicates when postcode +
beds + rent within ±£25 match across different agents (`source` differs). Groups render
stacked with a "possible duplicate" chip; only the highest-quality member defaults to
`included:true`.

**Staleness:** `ageDays` from the most recent of achievedAt/letAgreedAt/listedAt.
>90 days = stale (amber chip, weight ×0.7), >180 = very stale (red, weight ×0.4) — reuse the
`staleChip` visual convention (`src/App.jsx:5653`). "No longer available" is inferred only
manually in v1 (checkbox in notes-level UI is out of scope; user unticks `included`).

**Asking vs achieved:** evidence quality ranking drives base weight:
achieved 1.0 · letAgreed 0.9 · agentAppraisal 0.7 · reducedAsking 0.6 · asking 0.5 ·
userEvidence 0.5. Asking-type rents also get a haircut of −3% applied inside the weighted
calc (documented in UI copy: "asking rents discounted 3%"). A warning fires when the
evidence set is asking-only (W-ASKONLY).

**Similarity scoring (0–1)** vs subject property, multiplied into the weight:
beds exact 1.0 / ±1 0.7 / else 0.3; type match 1.0 / house-vs-flat 0.5; floor area within
±15% 1.0, ±30% 0.7, else 0.5 (skip if unknown, factor 0.8); condition matches post-refurb
target ('refurbished'/'good') 1.0 else 0.8; distance ≤0.25mi 1.0, ≤0.5 0.9, ≤1 0.75, else
0.5; garden/parking/furnished mismatches −0.05 each. Effective weight =
`userWeight × evidenceBase × similarity × stalenessFactor` (userWeight defaults to 1).

**Weighted recommended rent:**
```
adjustedRent_i = (monthlyRent_i + adjustment_i) × (askingHaircut if asking-type)
recommended    = Σ(adjustedRent_i × w_i) / Σ(w_i)      over included comps
conservative   = min(25th percentile of adjustedRents, recommended × 0.95)
expected       = recommended
optimistic     = max(75th percentile, recommended × 1.05)
```
(Percentiles over ≥4 comps; with <4, use recommended ×0.9 / ×1.0 / ×1.08.) Round to whole £.
Results stored in `brr.rentRecommendation = { recommended, conservative, expected,
optimistic, confidence, computedAt, compIdsUsed }` so later overrides can be diffed.

**Rental confidence score** (feeds `minRentalConfidence` rule and the verdict):
high = ≥3 included comps, ≥1 achieved/letAgreed, none very stale, spread (max−min)/median
≤20%; medium = ≥2 comps and not asking-only; low = otherwise; plus "insufficient evidence"
when 0 included comps (blocks confidence-based rules with a warning, not a crash).

**Override with audit:** "Use recommended" buttons copy values into `defaults.rent.*`. A
manual rent materially above evidence (> optimistic + 5%) fires W-RENTHIGH. Any manual edit
of rent when a recommendation exists requires `overrideReason` and writes an audit entry
{field:'rent', prev: recommended, next: value, reason}; the original recommendation is
retained in `rentRecommendation` (never overwritten by the override).
