# Property CRM — Claude Instructions

## Project overview
React single-file app (`src/App.jsx`) + Cloudflare Workers backend (`worker/index.js`).
Deployed at: https://property-crm.aa-investment-partners.workers.dev

## CRITICAL — Change discipline

**Before editing any function, read it in full first.**
**Never remove or rename existing fields, keys, or function parameters.**
**If a change requires touching more than the requested area, STOP and ask.**

If asked to fix or add something, only change what is necessary. Do not refactor,
clean up, or "improve" surrounding code unless explicitly asked.

## Key files
- `src/App.jsx` — entire React frontend (~6000+ lines, all inline styles)
- `worker/index.js` — Cloudflare Worker: API routes, KV storage, R2 documents, intelligence connectors
- `wrangler.jsonc` — Worker config (KV bindings, R2 bucket, cron schedules)

## Report parser — DO NOT break these contracts

`parseFullReportAnalytics(htmlText)` in `src/App.jsx` extracts these fields from HTML reports.
Every field it sets MUST be present in the `reportFields` array inside `applyReportToProperty`:

### Analytics fields (stored in property.analytics)
- `maxBid`, `netProfit`, `margin`, `profitMargin`, `roi`
- `gdvBase`, `gdvConservative`, `gdvOptimistic`, `conservativeGDV`, `maxGDV`
- `totalInvestment`, `worksTotal`, `epcRating`, `floorArea`
- `verdict`, `bidStrength`, `walkAway`, `targetBid`, `stretchBid`, `breakEvenBid`
- `matrixConservative`, `matrixBase`, `matrixOptimistic`, `matrixHeaders` (GDV matrix display)
- `buyersPremium`, `sdlt`, `acquisitionFeesTotal`, `holdingTotal`, `exitTotal`
- `refurbLight`, `refurbMedium`, `refurbHeavy`
- `completionDate`, `auctionHouseFromReport`, `propertyTypeFromReport`, `comps`

### Property-level fields (stored directly on property, NOT in analytics)
- `guidePrice` — applied in applyReportToProperty extraUpdates, not merged into analytics
- `postcode` — extracted from reportPostcode
- `dealName` — cleaned from reportAddress

### Display aliases — keep in sync
- `an.profitMargin` is the same as `an.margin` — parser sets both
- `an.conservativeGDV` = `an.gdvConservative` — parser sets both
- `an.maxGDV` = `an.gdvOptimistic` — parser sets both
- Property canvas reads: `an.profitMargin ?? an.margin` for the margin KPI

## Intelligence connectors (worker/index.js)
All connectors run in parallel via Promise.allSettled. Results stored as:
`property.intelligence.connectors[key] = { status: 'success'|'error', data: {...}, source, fetchedAt }`

Active connectors: address, landRegistry, epc, police, flood, planning, osm, imd, hpi, tfl, schools, census

EPC enrichment: after allSettled, enrichCompsWithEPC() cross-references LR comps with EPC records by address similarity.

## Responsive breakpoints
- isMobile: viewport width < 768px
- isTablet: viewport width >= 768 and < 1024px
- All layout uses inline styles + JS ternaries (no CSS media queries)

## Build and deploy
npm run build
npx wrangler deploy
Always build and deploy after changes. The chunk size warning is expected and harmless.

## Rules
1. Read a function fully before editing it
2. Do not remove existing fields from any list (reportFields, connector results, etc.)
3. Do not rename fields the display layer depends on
4. If a fix touches shared code, list every change being made before doing it
5. Do not add comments explaining what code does — only comments for non-obvious WHY
6. Do not create new files unless explicitly asked
7. Ask before refactoring anything not directly related to the task
