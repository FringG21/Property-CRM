# 06 — Live Auction mode & confirmed hammer price

## Live Auction mode (spec §22)

A toggle in the BRR summary dashboard, auto-suggested (pulsing chip) when the existing
bid-day condition is true — same logic as `src/App.jsx:3517`
(`daysLeft <= 0 && status not in [Won, Lost, Refurb, For Sale, Completed, Not Proceeding]`).
It does not replace the Overview bid-day card (flip-oriented, `src/App.jsx:4252`) — it is the
BRR equivalent inside the BRR tab.

**Layout (speed-first, one-handed on mobile — controls in bottom half, ≥44px targets):**

- **State banner** (full-width, colour-coded):
  - `Safe` (green): current bid ≤ maxBid × 0.9 (threshold editable in code const).
  - `Caution` (amber): current bid > maxBid × 0.9.
  - `Limit reached` (red outline): current bid or next bid === maxBid.
  - `Do not bid` (solid red): next bid > maxBid, or next-bid evaluation fails any enabled
    mandatory rule.
- **Numbers row:** current bid · next bid · **max recommended BRR bid** · headroom
  (max − current, floor 0).
- **Quick facts:** total cash required at next bid · cash left in · capital recycled % ·
  equity retained · expected monthly cash flow · stressed monthly cash flow · limiting rule.
  All recomputed live by running `computeBrr` with hammer = next bid.
- **Controls:** current-bid input; increment picker (£250/£500/£1,000/£2,500/custom);
  `+increment` big button (sets nextBid = currentBid + increment); "Log bid" button →
  existing `addBid(amount, 'BRR live auction')` (`src/App.jsx:1164`) AND writes
  `brr.currentAuctionBid`; scenario switcher (chip row, non-archived scenarios only).
- Compact warning banners only (caution+); everything else hidden (see 03 §section table).

**Invariant (spec):** the max BRR bid is computed from the active scenario + rules ONLY.
Bidding activity never raises it. Assumption/rule editing is unavailable inside Live Auction
mode — the user must toggle out (guards against heat-of-the-moment loosening; toggling out
and back is deliberate friction, log an audit entry if assumptions changed between).

## Confirmed hammer price (spec §23) — phase 7

Trigger: "Property won — confirm hammer price" action (also offered automatically when
`property.bidOutcome?.result === 'won'` or `property.hammerPrice` gets set elsewhere, e.g. by
the flip post-auction panel — `hammerPrice` is the shared source of truth,
`src/App.jsx:4727`).

On confirm, atomically (one `updateFieldInView('brr', …)` call):
1. Write `brr.confirmed = { hammerPrice, confirmedAt, actualScenarioId,
   preAuctionMaxBid: <active scenario's solver result at confirm time>,
   preAuctionSnapshotId }`.
2. Append a `kind:'confirmed'` snapshot of the ACTIVE scenario as it stood (immutable
   preservation of the pre-auction forecast).
3. Create the **actual-purchase scenario**: duplicate of the active scenario with
   `type:'actual'`, `name:'Actual purchase'`, `priceBasis:'confirmed'`,
   `assumedHammerPrice: null` (resolves to `property.hammerPrice`), `locked:false`; set it
   active. All price-dependent values (SDLT, premium, fees, totals, cash returned/left in,
   recycled, equity, yields, verdict) recompute automatically because they're derived.
4. If `property.hammerPrice` isn't already set, write it via `updateFieldInView('hammerPrice',…)`
   (never overwrite an existing different value — surface a mismatch warning instead).
5. Audit entry + `withActivity(prop,'brr','Hammer price confirmed at £X')`.

**Never** modify or delete pre-auction scenarios, snapshots, or the preserved max bid.

**Forecast-vs-actual panel** (replaces the max-bid section once confirmed):
- hammer vs target bid (Δ£, Δ%), hammer vs pre-auction max BRR bid (over/under, red if over —
  warning W-OVERMAX), and a two-column table: pre-auction snapshot outputs vs actual-scenario
  outputs for total cash in, mortgage, cash returned, cash left in, recycled %, equity,
  monthly cash flow, verdict.
- Phase 7 extends the actual scenario with post-completion actuals as plain overrides the
  user updates over time: actual rent achieved, actual refinance valuation (→ endValue
  custom), actual mortgage (→ maxMortgageOverride used as the actual advance), from which
  actual cash returned / left in / variance derive with the same formulas. No new field
  types needed — they are scenario overrides on the actual scenario, each audit-logged.
