# Phase 6 — Bid ladder + Live Auction mode

Prerequisite: phase 5 committed (solver + rules live).

## Goal

The bid-ladder table over a configurable price range, and the simplified one-handed Live
Auction mode with Safe / Caution / Limit reached / Do not bid states, current-bid quick
updates, headroom, and bid logging into the existing bid log.

## Read ONLY these

- `docs/brr/04-rules-solver-ladder.md` (§bid ladder), `docs/brr/06-live-auction-and-confirmed.md`
  (§Live Auction — confirmed-hammer half is phase 7), `docs/brr/03-ux-screens.md` (§mobile,
  §section table live-auction column), `docs/brr/08-testing.md` (suite 9)
- `CLAUDE.md`
- Your files: `worker/brrCalc.js`, `worker/brrCalc.test.mjs`, `src/views/BrrAnalysis.jsx`
- `src/App.jsx` ranges: 1164–1171 (`addBid`), 3510–3520 (bid-day condition to mirror),
  4252–4292 (Overview bid-day card — for visual consistency only, do NOT modify it)

## Guardrails

Same as phase 1 (`docs/brr/phases/phase-1.md` §Guardrails). The max BRR bid NEVER moves in
response to bidding activity; assumption/rule editing is unavailable while Live Auction mode
is on. Ladder rows are derived (local state); `brr.bidLadder` config, `brr.currentAuctionBid`
and `brr.nextBid` are the only persisted additions.

## Build

1. **brrCalc.js**: `buildBidLadder({...})` per 04 — row shape, default start/end
   (guide×0.8 rounded to increment → first-fail + 5 increments or guide×1.3), increments
   {250, 500, 1000, 2500, custom}, 400-row cap validation, per-row pass/failedRuleKeys/
   failNote, marker computation (guide / current / target / stretch / last passing / first
   failing / max recommended).
2. **BrrAnalysis.jsx section 13 (Bid ladder)**: config inputs; desktop full column set,
   mobile compact set (hammer / cash in / returned / left in / recycled / cash flow /
   result) in `crm-table-wrap`; marker icons + row tinting per 04; full-screen overlay
   toggle on mobile; each failing row shows its failed-rule short label.
3. **Live Auction mode**: dashboard toggle, auto-suggested (pulsing chip) when the bid-day
   condition is true (mirror the `src/App.jsx:3517` expression against the property's
   `auctionDate`/status — compute locally in the view; do not import from App).
   When on: hide sections per the 03 table; render per 06 — state banner (Safe ≤90% of max;
   Caution >90%; Limit reached at ==max for current or next; Do not bid when next > max OR
   next-bid evaluation fails a mandatory rule), numbers row (current / next / max / headroom
   floor 0), quick facts recomputed at hammer = next bid, controls (current-bid input,
   increment picker, big `+increment` button, "Log bid" → `addBid(amount, 'BRR live
   auction')` AND persist `brr.currentAuctionBid`, scenario chip switcher). One-handed
   layout: controls in the bottom half on mobile, ≥44px targets. Compact warning banners only.
4. **Tests**: suite 9 complete (row count, cap, solver-consistency of the pass/fail boundary,
   markers incl. current-bid-above-max ordering).

## Acceptance criteria

- Ladder boundary row equals the phase-5 solver's firstFailingBid for the same config; each
  fail row names its rule; markers land on the right rows.
- Live mode: stepping the current bid through 89% → 91% → ==max → +1 increment of max walks
  the four states in order; "Log bid" appends to the Bid Log tab AND survives reload.
- Max bid does not change while bidding (edit-lock verified); toggling live mode off restores
  the full tab.
- `npm test` green; live mode fully usable one-handed at 375px (screenshot it).

## Verify & ship

`npm test` → `npm run build` → `npx wrangler deploy` → live walk-through (mobile width
included) → commit `BRR Analysis phase 6: bid ladder + live auction mode` → update README
status + notes.

---
_Post-phase notes:_
