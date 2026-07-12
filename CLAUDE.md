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

## Market Intelligence module (worker/marketIntel.js + src/views/MarketIntel.jsx)
Self-contained "Auction Area Intelligence" — national Auction House UK results → area flip ranking, South Yorkshire as the benchmark. Separate from the pre-auction Auction Triage scraper. Data in `mi_*` D1 tables (migration 0004). Full phase notes in `docs/market-intel/phase-0..7.md`.

- **UI**: top-level `marketintel` tab, 6 sub-tabs — Overview, National Ranking, Results Explorer, Area Detail, Compare Areas, Data Health & Settings.
- **Two passes**: Pass A = national scrape/normalise/aggregate/score (all areas). Pass B = per-selected-outcode deep enrichment (lot detail → beds/tenure/exclusions; LR comps + HPI growth + per-lot GDV). Enrich an outcode from Data Health, or `POST /api/market/jobs/seed {type:'passB_lots'|'passB_context', outcode}`.
- **Jobs**: `mi_jobs` queue drained one-per-tick by the `7-57/10` cron (`runMarketIntelTick`). Types: passA_index, passA_refresh, passB_lots, passB_context, aggregate. Idempotent + checkpointed.
- **Scoring**: 6 factors + combined, Bayesian shrinkage confidence; weights in `mi_scoring_models` (editable + copy-on-edit versioned via the weights editor). `runAggregation` recomputes all scores and preserves Pass B factors via the `score_factors` join.
- **Settings**: KV `market:settings` (editable flip cost model + `refreshDays`); `getMarketSettings` merges over `DEFAULT_MARKET_SETTINGS`.
- **Phase 7 steady state**: `maybeSeedWeeklyRefresh` (cron + `POST /api/market/refresh-check`) auto-seeds a light national refresh (pages 1–2/branch) + aggregate once per `refreshDays`, only when idle.
- **Contracts**: confirmed sale = printed price only (`sold_for`/`sold_prior_for`/`sold_after_for`); `last_bid` is never a sale. GDV is matched on LR property *type* (no beds in LR). All `/api/market/*` routes are session-checked at one entry (`handleMarketIntelRoutes`). Parser fixtures + `npm test` (39 tests) — keep them green.

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

- **Validate before deploying binding changes:** `npx wrangler deploy --dry-run --outdir .wrangler-dryrun` bundles the worker and resolves all bindings without touching the account. Run it after any `wrangler.jsonc` edit. (`.wrangler-dryrun` is gitignored.)
- **Commit before you deploy**, or immediately after verifying, so `main` always reflects what is live. Keep commits atomic — check `git status` before starting so pre-existing edits don't get folded into a feature commit. This repo deploys direct from `main`; branch only for infra/binding changes you may want to review or revert.

## Cloudflare deployment learnings (2026-07-09, semantic search build)
- **Vectorize / new resources must exist before deploy.** A `vectorize` (or any) binding that points at a non-existent resource makes `wrangler deploy` fail. Create the resource first: `npx wrangler vectorize create <name> --dimensions=768 --metric=cosine`.
- **Metadata indexes are required for `filter` queries and are async.** You can only `VECTORIZE.query(..., { filter: { field } })` on fields that have a metadata index (`wrangler vectorize create-metadata-index <idx> --property-name=<field> --type=string`). Creation is *enqueued* and takes a few minutes to activate — filtered queries won't work until then. We index on `userId` and `propertyId`.
- **Text extraction in a Worker = `env.AI.toMarkdown([{ name, blob }])`.** Handles PDF/docx/images (with OCR). Tesseract/PaddleOCR/ReportLab/Puppeteer/any Python do **not** run in the Workers runtime — don't reach for them.
- **Embedding model:** `@cf/baai/bge-base-en-v1.5` → 768 dims, cosine. Batch up to ~50 chunks per `AI.run` call.
- **A File/stream can only be read once.** The upload route buffers to `arrayBuffer()` (capped at 20MB) when indexing so the same bytes feed both `CRM_DOCS.put` and the indexer; larger/other files still stream straight to R2.
- **`fetch(request, env, ctx)`** — `ctx` was added to the signature so background indexing can run via `ctx.waitUntil()` without delaying the upload response. **`ctx` is NOT global inside `handleApiRoutes` — it is threaded in as the 4th param (`handleApiRoutes(request, env, url, ctx)`).** Any route that calls `ctx.waitUntil()` depends on that; forgetting it is a `ReferenceError` at runtime, not a build error (see the masking learning below). Fixed 2026-07-12: doc uploads of searchable files (`.pdf`/`.html` ≤20MB) were 400ing because `ctx` was missing here.
- **The top-level `fetch` wrapper masks EVERY unhandled throw in `handleApiRoutes` as `400 {message:'Invalid request'}`.** So a 400 on an `/api/*` route often means a real exception (ReferenceError, bad `await`, R2/D1 failure), NOT a malformed client request — and the status alone hides which. When debugging a mystery 400, run `npx wrangler tail` and reproduce to see the actual `console.error('Unhandled worker error:', err)` line; don't trust the 400 at face value. The frontend compounds this by showing one generic "check your connection" alert for all upload failures.
- **New pipelines don't touch old data.** Documents uploaded before indexing existed need a one-off backfill (`POST /api/search/reindex`, "Index docs" button). Assume any "process on write" feature needs a matching reindex/backfill path for existing records.
- **Workers AI + Vectorize are billed beyond free daily allowances** — keep chunk counts bounded (we cap at 80 chunks/doc).

## AI insights — multi-provider LLM chain (worker/index.js)

`generateInsight({ system, prompt, schema, requiredFields, env })` powers every AI-insight route
(`/api/ai/deal-review`, `/api/ai/deal-analysis`, `/api/ai/triage-insight`). It tries providers in priority
order and returns the first one that responds with valid JSON containing every field in `requiredFields`:

1. **Claude (Anthropic)** — `ANTHROPIC_API_KEY` — best quality, paid, native JSON-schema output.
2. **Groq** — `GROQ_API_KEY` — free tier, Llama 3.3 70B.
3. **Google Gemini** — `GOOGLE_AI_API_KEY` — free tier, large context.
4. **OpenRouter** — `OPENROUTER_API_KEY` — free-model aggregator.
5. **Cloudflare Workers AI** — `env.AI` binding (already provisioned, same one used for doc-search embeddings) —
   zero setup, guaranteed fallback, so every AI-insight route works today with no secrets set.

All secrets are optional — set any via `npx wrangler secret put <NAME>` and the chain upgrades to it
automatically, no code changes. `webSearch(query, env)` (Tavily, `TAVILY_API_KEY`) grounds `/api/ai/deal-analysis`
and `/api/ai/triage-insight` in live local market data; it returns `[]` (not an error) when unset, so those
routes still run on CRM data alone rather than failing outright.

## Rules
1. Read a function fully before editing it
2. Do not remove existing fields from any list (reportFields, connector results, etc.)
3. Do not rename fields the display layer depends on
4. If a fix touches shared code, list every change being made before doing it
5. Do not add comments explaining what code does — only comments for non-obvious WHY
6. Do not create new files unless explicitly asked
7. Ask before refactoring anything not directly related to the task
