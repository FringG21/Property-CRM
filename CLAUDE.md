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

## Responsive Design & Device Optimisation

### Breakpoints
| Name    | Width        | Boolean available |
|---------|--------------|-------------------|
| Mobile  | < 768px      | `isMobile`        |
| Tablet  | 768–1023px   | `isTablet`        |
| Desktop | ≥ 1024px     | (neither)         |

### Implementation pattern
This project uses **inline styles + JS ternaries only** — no CSS media queries, no Tailwind, no CSS classes. All responsive logic must follow the existing pattern:

```jsx
style={{ width: isMobile ? '100%' : '480px' }}
```

Never use CSS media queries or external class-based frameworks. The `isMobile` and `isTablet` booleans are derived from `window.innerWidth` and updated via a resize listener — use them for every layout decision.

### Layout rules
- **No fixed-width containers** — avoid `width: '600px'`; use `'100%'`, percentages, or ternaries
- **No horizontal scroll** — every view must fit within its viewport width at 375px, 768px, and 1280px; use `overflowX: 'auto'` on tables/grids only when unavoidable, with `className="crm-table-wrap"`
- **Flexbox or Grid** — use `display: 'flex'` or `display: 'grid'` for all multi-column layouts; collapse to single column on mobile via ternary on `gridTemplateColumns` or `flexDirection`
- **Stacking order** — on mobile, secondary panels/sidebars always stack below the primary content, never beside it

### Touch & accessibility
- Interactive elements (buttons, selects, inputs) must have a minimum tap target of **44×44px** on mobile — use `padding` to achieve this if needed
- Minimum font size **14px** on mobile; do not use `fontSize` below `'12px'` for body text, and never below `'10px'` for any visible label
- Maintain **WCAG AA colour contrast** at all sizes — check foreground/background pairs when adding new colour combinations
- Focus states must remain visible — do not remove `outline` without providing an equivalent visible focus indicator

### Images & media
- Always set `loading="lazy"` and explicit `width`/`height` attributes on `<img>` tags to prevent cumulative layout shift (CLS)
- Never use a fixed pixel width on images; use `style={{ maxWidth: '100%', height: 'auto' }}`

### Mental checklist before finalising any UI change
Reason through the layout at all three widths — fix issues before committing:
- [ ] 375px — iPhone SE / small Android (mobile)
- [ ] 768px — tablet portrait
- [ ] 1280px — standard desktop

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
