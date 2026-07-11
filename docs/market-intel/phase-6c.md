# Market Intel — Phase 6c: Area Detail + Comparison UI + flip calculator (frontend, display-only)

Pass B step 3 of 3. Surfaces the `GET /api/market/context` payload (6b) in the UI: an **Area
Detail** screen (comps, growth, GDV, flip economics for one outcode) and an **Area Comparison**
screen (2–3 outcodes side-by-side), plus a **display-only flip calculator** inside Area Detail.
No backend or schema changes — pure frontend consumption of the existing contract.

## What shipped (`src/views/MarketIntel.jsx`, `src/App.jsx`)

- **Nav**: two new sub-tabs, `detail` ("Area Detail") and `compare` ("Compare Areas"), added to
  the existing scrollable sub-nav (`subTabs` array), same button-row pattern as Phase 5.
- **Area Detail** (`view === 'detail'`)
  - Debounced (350 ms) outcode text input; on selection, fetches
    `GET /api/market/context?type=outcode&id=<ID>` and cross-references
    `GET /api/market/areas?type=outcode&prefix=<ID>&limit=20` (same endpoint the ranking table
    already uses) for the area's overall score/confidence, since `context` does not include the
    composite score itself.
  - **Header**: outcode + LAD/region (`context.geo`), `ScoreChip` for the area score, and the
    three 6b factors (`context.score_factors`: flipSpread / compQuality / growthResilience) as
    stats. When `flipSpread <= 5` (≈0), shows an explicit amber caveat instead of presenting a
    weak area as strong — this is the honest-reporting requirement from the plan, and it fires
    for real on S63 (flipSpread = 0).
  - **Comps summary**: table over `context.comps_summary.classes` (Detached / Semi-detached /
    Terraced) — count, median, P25–P75, ceiling; `thin` classes get a "THIN SAMPLE" flag and
    render "insufficient comps" instead of numbers, never a fabricated figure.
  - **Growth chart**: inline-SVG sparkline (same construction as `App.jsx`'s property-canvas LR/HPI
    sparkline — `viewBox 0 0 240 72`, gridlines, polyline, end-dot; no charting library). The
    backend stores derived HPI stats only (no raw time series per point), so the chart backs out
    4 points (-5/-3/-1/0 yr) from the reported `growth5yr/3yr/1yr` percentages and the current
    HPI price — the endpoints are exact, the trend line between them is interpolated for shape.
    Labelled underneath: raw 5/3/1yr growth vs the COVID-adjusted annualised trend + volatility.
  - **Eligible lots + flip economics**: table over `gdvLots` — address, type, beds, purchase
    (labelled `confirmed sale` / `guide midpoint` per `purchaseBasis`), GDV
    conservative/expected/optimistic, expected profit, ROI, and a `BandChip`
    (target=green / entry_opportunity=amber / below_breakeven=slate / thin="Insufficient comps" /
    no purchase price="No purchase price" — four distinct states, never conflated). Clicking a
    row prices that lot in the calculator below.
  - **Flip calculator (display-only)**: full labelled waterfall for the selected lot — purchase
    price (basis labelled), buyer's premium (3%, min £1,500), SDLT + additional-dwelling surcharge,
    legal (buy), holding (7mo × £350), refurb (mid-point of the £20k–£35k band), selling agent
    (1.2%), legal (sell), then GDV conservative/expected/optimistic and the resulting profit/ROI
    with the `band` chip. Premium and agent-fee lines are recomputed client-side using the same
    simple formulas the worker uses (`max(£1,500, 3% of purchase)`, `1.2% of expected GDV`); SDLT
    and legal-sell are shown as the *exact residual* of the worker's authoritative `costs.buyCosts`
    / `costs.sellCostsAtExpected` totals minus the known premium/agent/legal-fixed pieces — so the
    breakdown always reconciles to the real backend total, nothing is invented. No inputs, no
    persistence, explicitly labelled "not editable, not a quote."
- **Compare Areas** (`view === 'compare'`)
  - 2 outcode `<select>` pickers (populated from `GET /api/market/areas?type=outcode&limit=500`,
    lazy-loaded once) plus a "+ Add third area" toggle for a 3rd.
  - Fetches `context` + area meta for each selected outcode in parallel; renders a card per area:
    score, the three factors, per-class median comps, 5yr/COVID-adjusted growth, and the headline
    median-expected-GDV vs median-purchase spread. "Open full Area Detail →" jumps into the Detail
    screen for that outcode.
  - Grid: 1 column on mobile (stacked), 2 on tablet, up to 3 on desktop (`isMobile`/`isTablet`
    ternaries, no CSS media queries — per CLAUDE.md).
- **Entry points into Area Detail**: outcode rows in National Ranking are clickable (only when
  `areaType === 'outcode'`, since `context` only exists for outcode-level areas — town/branch rows
  are left inert rather than wired to a route that would 404); a new "South Yorkshire — flagship
  area" card on Overview links straight to S63 (the fully Pass-B-enriched outcode).
- **Carry-forward fixes**:
  - Explorer evidence link: `/lot/<id>` (404s) → `/lot/redirect/<id>` (flagged in phase-6a.md:55 /
    phase-6b.md:60).
  - `isTablet` now threaded into `<MarketIntel />` from `App.jsx:7206` (previously only
    `isMobile`); used for the header stat grid, the flip-calculator two-column layout, and the
    Compare Areas card grid.

## Data-contract notes (verified against `worker/marketIntel.js`, not just the plan's prose)

- `context.comps_summary` is `{ classes: {Detached, 'Semi-detached', Terraced}, houseSales,
  totalSales, outcodeCeiling, medianExpectedGdv, medianPurchase, lotsWithEconomics, eligibleLots }`
  — it does **not** contain `houseAll` or a `sameStreet` map (those live in the separate `ceiling`
  context row, unused by this screen). Built against the actual `runPassBContextJob` /
  `buildComps` output, not the plan's paraphrase, where the two differed.
- `context.hpi` (the raw `hpiGrowth()` return) has no per-point time series — only
  `{ current, growth1yr/3yr/5yr, covidAdjustedAnnual, volatility, lastUpdated, points }`. The
  growth chart's synthetic point-backing (documented above) exists because of this; it mirrors the
  precedent already in `App.jsx` (the property-canvas sparkline also interpolates points from an
  aggregate growth % rather than a real series).
- `context` does not carry the area's overall composite score — Area Detail/Compare fetch it
  separately via `/api/market/areas?type=outcode&prefix=<id>` and match the exact `area_id`.

## Verification done

- `npm test` — 37/37 green, unchanged (display-only build, no backend touched).
- `npm run build` then `npx wrangler deploy --dry-run --outdir .wrangler-dryrun` — clean, all
  bindings resolve (SCRAPER_KV, CRM_DB, VECTORIZE, CRM_DOCS, BROWSER, AI, ASSETS).
- Code review of the diff against the plan's data contract and CLAUDE.md's responsive/field-safety
  rules (inline styles + `isMobile`/`isTablet` ternaries only, `crm-table-wrap` on every new table,
  44×44 px tap targets on new mobile controls, no field renames/removals).
- Committed `6b69325`, built, and deployed via `npx wrangler deploy` (version
  `6d20397c-5620-447c-b2aa-93d22d185376`, live at
  https://property-crm.aa-investment-partners.workers.dev).
- **Not done: live browser verification against deployed S63 data** (plan step 3–7:
  screenshots at 375/768/1280px, console-clean check, numeric spot-check against phase-6b.md's
  recorded S63 figures — Terraced median ~£45k / Semi ~£61k / Detached ~£120k, 5yr +27.4% raw /
  +4.6%/yr COVID-adjusted, 153/155 lots `below_breakeven`). Doing this requires an authenticated
  session; minting one directly in KV (the `docs/market-intel/phase-0.md` recipe) was attempted
  twice and blocked both times by the tool-permission classifier as a credential-store write, even
  after explicit user sign-off — it's treated as a hard-blocked category regardless of chat
  approval, not something to route around. User (ashley.a.b@hotmail.com) opted to skip this and
  will spot-check the deployed screens manually.

## Files changed

- `src/views/MarketIntel.jsx` — all new UI (Area Detail, Compare Areas, nav, click-through entry
  points, BandChip/growth-spark helpers), Explorer link fix.
- `src/App.jsx` — one line: `isTablet` threaded into `<MarketIntel />` at line 7206.
- `docs/market-intel/phase-6c.md` — this note.
- No backend/schema/test changes.
