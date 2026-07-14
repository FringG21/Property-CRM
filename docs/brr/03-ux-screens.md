# 03 — UX & screens (src/views/BrrAnalysis.jsx)

Rendered from `{propCanvasTab === 'brr' && <BrrAnalysis …/>}` in the property canvas.
Style rules: dark palette + inline styles matching existing canvas cards (bg `#0f172a`/
`#1e293b` cards, border `#1e293b`/`#334155`, text `#f1f5f9`/`#94a3b8`, accent `#7C3AED`,
good `#059669`, warn `#d97706`, bad `#dc2626`). Responsive via `isMobile`/`isTablet` ternaries
only (`src/App.jsx:385-386`); check every layout at 375 / 768 / 1280px.

Component receives props: `property` (currentViewProperty), `updateFieldInView`, `addBid`,
`logActivity` (thin wrapper around the `withActivity` update pattern), `isMobile`, `isTablet`,
`sessionUser`. All calc calls go to `../../worker/brrCalc.js`. Solver/ladder/sensitivity
results live in **local component state** — only user inputs and snapshots are persisted.

## Screen structure (spec §24)

### Sticky summary dashboard — always visible

Top card, `position: 'sticky', top: 0` inside the scrollable main column. Two rows:

1. **Header strip:** scenario picker (dropdown of non-archived scenarios), price-basis chip
   (Guide / Current bid / Target / Stretch / Max BRR bid / Assumed / **Confirmed** — the chip
   is the spec's "obvious which price the result is based on" requirement; Confirmed renders
   green with a lock icon), verdict pill, "Live Auction" toggle (armed when the existing
   bid-day condition is true — `src/App.jsx:3517` pattern), "Save snapshot" button.
2. **KPI grid** (`gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)'`, wraps to
   more rows): assumed/confirmed hammer · max BRR bid · bidding headroom (max − current bid) ·
   total cash invested · end value (with C/E/O selector inline) · refinance mortgage · cash
   returned · **cash left in / surplus extracted** · capital recycled % · equity retained ·
   monthly rent · mortgage payment · monthly cash flow · stressed cash flow · gross yield ·
   net yield (basis label) · rental confidence · valuation confidence · limiting rule.
   On mobile show the 9 priority KPIs first (spec §27 list) with a "More" expander.

### Sections below (spec §24 numbering), each a collapsible card
(hand-rolled pattern: `useState` bool + header row toggle, like `isDealCalcExpanded`,
`src/App.jsx:2532`)

| # | Section | Default | Live Auction mode |
|---|---|---|---|
| 1 | Purchase-price scenarios (list + price fields + basis) | expanded | replaced by quick controls |
| 2 | Purchase & refurb costs (inherited, with source badges + override) | collapsed | hidden |
| 3 | End-value assumptions (C/E/O/custom, £/sqft, confidence, override reason) | collapsed | hidden |
| 4 | Mortgage assumptions | collapsed | hidden |
| 5 | Rental assumptions (C/E/O/custom, confidence) | collapsed | hidden |
| 6 | Rental comparables (05-rental-comps.md) | collapsed | hidden |
| 7 | Operating costs (pct/monthly/annual entry per item) | collapsed | hidden |
| 8 | Scenario comparison table | collapsed | hidden |
| 9 | Sensitivity analysis | collapsed | hidden |
| 10 | Stress testing | collapsed | hidden |
| 11 | Investment rules | collapsed | hidden |
| 12 | Maximum-bid calculator | expanded | result pinned in summary |
| 13 | Bid ladder | collapsed | full-screen option |
| 14 | Risks & warnings | expanded when any ≥ caution | compact banner strip |
| 15 | Audit history (brr.audit, newest first, "show more") | collapsed | hidden |

Summary dashboard: always visible + sticky. Warnings: caution+ items also render as a slim
banner directly under the dashboard so they're seen without scrolling.

## Inherited-value row pattern (sections 2–5)

Each input renders: label · value input · source badge (`Manual`/`Report`/`Listing`/
`External`/`BRR default`/`Scenario`) · reset-to-inherited "↺" when overridden. Badge style =
the KPI `src` chip (`src/App.jsx:3747`). Editing writes a scenario override (sparse) — it
never mutates the property; a small "push to property record" link appears only on fields
that map 1:1 to a property field (guide price, service charge, ground rent) and confirms
before writing via `updateFieldInView`.

## Scenario comparison table (spec §16)

Columns: name, type, assumed hammer, refurb+contingency, total buying costs, total cash
invested, end value, LTV, rate, mortgage, cash returned, cash left in, recycled %, surplus,
equity retained, rent, mortgage payment, monthly cash flow, stressed cash flow, gross yield,
net yield, max-bid result, valuation confidence, rental confidence, verdict.
Row per scenario with `includeInComparison` toggle. Per-metric best value tinted `#059669`,
worst `#dc2626` (only when ≥2 scenarios shown; direction-aware — lower is better for cash
left in, higher for cash flow). Wrap in `overflowX:'auto'` + `className="crm-table-wrap"`;
first column sticky (`position:'sticky', left:0`).

## Sensitivity UX (spec §17)

Preset picker (the 13 named tables) + generic axis/metric dropdowns. Grid of cells:
value + background colour by state — pass `#052e1b`, advisory-fail `#3a2a06`, mandatory-fail
`#3f0d0d`; the scenario's current cell gets a `#7C3AED` outline. Tap/click a cell → detail
popover: the two substituted inputs and the full mini-KPI set at that point. Mobile: max 5
columns, horizontal scroll, sticky row-header column; axis-range controls collapse into a
"Ranges" expander.

## Stress testing UX (spec §18)

Editable delta inputs (StressConfig), an "individual" list (each delta applied alone with its
stressed KPI + pass/fail) and a "combined downside" card showing the four checks (cash flow
positive / recycled ≥ target / equity ≥ target / cash-left-in ≤ max) as tick/cross rows with
stressed values.

## Verdict card

Label pill + always an explanation paragraph, generated per 07-warnings-verdict.md (e.g.
"Viable BRR. The expected scenario recycles 88% of capital and produces £285 monthly cash
flow. However, the conservative scenario leaves £26,400 invested, exceeding your £20,000
target."). Never a bare label.

## Mobile behaviour (spec §27)

- Priority order (top of dashboard, 2-col grid): current bid, next bid, max BRR bid,
  headroom, total cash required, cash left in, capital recycled, monthly cash flow, verdict.
- Live Auction mode is one-handed: controls in the bottom half, ≥44×44px tap targets,
  full-width +increment buttons, sticky max-bid summary at top, compact warning banners.
- Scenario switcher = horizontal chip row. Comparison + sensitivity + ladder tables scroll
  horizontally in `crm-table-wrap`; ladder offers a full-screen overlay on mobile.
- Locked scenarios: any edit attempt opens a confirm ("Scenario is locked — unlock and
  edit?"); unlock is logged to audit.
- Font sizes ≥14px body / ≥10px labels; WCAG AA pairs (the palette above already passes on
  the dark backgrounds — keep amber text `#fbbf24`-on-`#1e293b`, not `#d97706`-on-dark, for
  small text).
