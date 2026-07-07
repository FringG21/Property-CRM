# Property CRM — Full-Stack Review (July 2026)

Read-only audit of `src/App.jsx` (11,469 lines incl. uncommitted analyser/cost-log changes), `worker/index.js` (3,442 lines, ~48 routes), `extension/` (~1,000 lines), and `wrangler.jsonc`, against the contracts and conventions in `CLAUDE.md`. Responsive claims were verified live at 375 px / 768 px / 1280 px against a local `wrangler dev` instance with real seed data; API suggestions were verified against provider documentation as of 7 July 2026.

## Summary

The app is a working, feature-rich system with more architectural discipline than its size suggests: the worker's D1-primary/KV-fallback storage is carefully built (soft deletes, one-shot migrations, a parity-check admin route), the extension's record shapes match the SPA's field-for-field, and CORS is correctly locked to the production origin. The five most consequential findings:

1. **Lost-update race wipes extension-ingested records** — the SPA's whole-blob autosave (`DELETE` + reinsert per entity table) silently deletes anything the extension ingested since the SPA last loaded. This is the biggest data-integrity risk in the codebase.
2. **Two confirmed report-parser contract violations** — `totalAuctionFees` is parsed but dropped by the `reportFields` merge, and the Deal Analysis KPI row reads two fields that can never be populated. Both render "—" forever.
3. **Five unauthenticated worker write routes** (auction dates/lots, scraper trigger/reviewed) are callable by anyone on the public internet; one spawns a paid Puppeteer session per call.
4. **Tab permissions are cosmetic** — role/allowedTabs come from `localStorage` and are never enforced server-side; any authenticated user can read/write all users' data via the API.
5. **Mobile typography and tap targets systematically violate CLAUDE.md's own rules** — 676 inline styles at 10–11 px (plus one 9 px), mostly unconditional across breakpoints, and nav/tap targets at 30–36 px against the 44 px rule. Layout structure, by contrast, is solid: no horizontal overflow at any audited width.

---

## 1. Code structure

### App.jsx
- **One component, 11,469 lines, 328 `useState` hooks, no context/reducer.** All state lives in the single `App` function; the JSX render block alone spans lines 2845–11469. There is no prop drilling only because there are no child components to drill into — every tab is an inline block guarded by `activeTab === '…'`.
- **Data flow is "load everything, autosave everything":** one `GET /api/crm-data` on mount ([App.jsx:2390](../src/App.jsx)) populates ~16 collections; a 2-second-debounced `POST /api/crm-data` ([App.jsx:2429](../src/App.jsx)) re-sends the *entire* state on any change. Simple and robust for one user, but it is the root cause of the ingest race (§2) and will grow linearly with data volume (KV write amplification, 1 MiB KV value ceiling eventually).
- **Duplication hot-spots:** ~10 modals share identical overlay/backdrop/close boilerplate (spec item 10767–10981, spec template 10983–11176, generate-report 10241–10296, …); four near-identical filter/search state clusters (companies :580, refurb quotes :2329, spec :2374, report cost log :2318); repeated `.analytics?.x ?? .y` fallback chains; status-badge colour maps re-declared inline per section.
- **Naming/section drift:** numbered section banners ("6. AUCTION INTELLIGENCE STATE" at :680) no longer match actual ordering; `parseReportAnalytics` (:1372) is a thin alias of `parseFullReportAnalytics` used interchangeably with it — one name should win.
- **Dead/demo code reachable from UI:** `handleIncomingFileIngest` ([App.jsx:1007](../src/App.jsx)) is wired to a live file input (:5635) and creates a property with **hardcoded demo values** (guide £160,000, auction 2026-08-20, a South Yorkshire listing URL) regardless of the file uploaded. Any user tapping that input gets fake data in the pipeline.

### worker/index.js
- **One `fetch` handler, one long if/else chain** grouped by feature (auction → auth → intelligence → notify → calendar → documents → scraper → CRM sync → ingest). Within CRM routes the auth pattern is uniform (`getSession` → 401). Error responses conflate client/server failures (mostly 400 or bare 500 with `console.error` only).
- **Storage separation is clean and intentional:** D1 is the entity store (per-row `data` JSON + typed index columns, `PRIMARY KEY (user_id, id)`, soft-delete flag), KV holds sessions/settings/tokens and the legacy per-user blob kept as a rollback path, R2 holds documents under collision-proof random-token keys ([worker/index.js:2793](../worker/index.js)). One-shot migrations are KV-flag-guarded (:513, :524) and there's an admin parity check route (:3403) — good operational hygiene.
- **Connector pattern drift:** seven connectors are tidy named functions (`connectorPostcodes` :1260 … `connectorCensus` :1541), but Land Registry and EPC are ~40-line inline promise chains inside the route itself (:2985, :3003). Same output shape, two different homes.
- **Uncommitted worker change** is a single, correct fix: `decodeURIComponent` on R2 document keys before lookup (:2811).

### Extension
Clean three-layer split (popup UI → background service-worker API gateway → on-demand content scripts). All API calls go through the background worker with `host_permissions`, as CLAUDE.md requires. Weak points are the hardcoded API base ([background.js:7](../extension/background.js)), enum lists copy-pasted from the SPA ([popup.js:10–14](../extension/popup/popup.js)), and per-site `h1` selectors in [extract.js:79–90](../extension/content/extract.js) that will silently degrade when Rightmove/Zoopla change markup.

---

## 2. Features & functionality

### Deal pipeline / properties
End-to-end solid: manual add, URL import (`/api/scrape-property` → Puppeteer), auction-triage promotion, board/table/map views, filters persisted to localStorage, CSV export, stage automation that posts alerts and auto-applies task templates ([App.jsx:1054](../src/App.jsx)). Gaps: the demo-data file input above; URL-import properties get no `dealName`/`postcode` at creation (the extension's equivalent shape does set them).

### Property canvas & report parser — **contract verification (higher-risk area)**
- ✅ The alias contracts hold: parser sets `profitMargin`/`margin`, `conservativeGDV`/`gdvConservative`, `maxGDV`/`gdvOptimistic` (:1323–1325) and every display read uses the documented fallback pairs (:1942, :2598, :3127, :3131).
- ✅ `guidePrice`/`postcode`/`dealName` are applied at property level via `extraUpdates` exactly as documented (:906–929).
- ❌ **`totalAuctionFees` violates the contract**: parsed at [App.jsx:1149](../src/App.jsx), read by the Deal Analysis KPI at :7735 (`sub: `fees: ${fmt(an.totalAuctionFees)}``), but **absent from `reportFields`** (:881–898) — `applyReportToProperty` drops it, so the sub-label always renders "fees: —". Fix = add one string to `reportFields` (parser-contract change → follow CLAUDE.md change discipline).
- ❌ **`an.guidePrice` can never exist**: the same KPI row reads `an.guidePrice` (:7736), but guide price is deliberately kept *off* analytics (property-level, :906). Should read `activeDeal.guidePrice`. Verified live: both KPIs show "—" on a property with a fully parsed report.
- ⚠️ **CLAUDE.md's documented field list is stale**: code's `reportFields` also contains `compsList`, `aiSummary`, `redFlags` (:895–897), which the doc omits. Docs-only fix, but worth doing — that list is the safety net future edits check against.
- ⚠️ **AI deal review overlap**: `/api/ai/deal-review` writes `aiSummary` (among `aiRiskFlags`, `aiStrengths`, …) straight into analytics (:2013). `aiSummary` is *also* in `reportFields`, so a later report upload silently overwrites the AI review's summary. The other `ai*` fields are outside the contract and survive. Decide which producer owns `aiSummary`.
- ⚠️ **Report Costs tab can't be granted**: the new nav gate `can('reportcosts')` (:3015) is admin-only in practice because `reportcosts` is missing from `ALL_TABS` (:456–470) and from the worker's setup `allowedTabs` (:1834).

### Contacts & companies
CRUD, filtering, Companies House search proxy, builder/trade extra fields editable in the detail panel (:7033). Extension shapes match the SPA's exactly (see below). Note `owner: 'Ashley Austin-Buah'` is hardcoded in SPA creation paths (:704, :955) rather than `user.name` — cosmetic multi-user drift.

### Tasks
Full lifecycle: create/edit drawer, templates (+ stage-automation auto-apply), subtasks/comments/reminders arrays, normalised status handling. SPA `linkedId` is `parseInt`-coerced (:7969) while the extension preserves the record's native id — both numeric in practice (ids are `Date.now()`), no mismatch found.

### Documents / R2
Upload keys are `userId/propertyId/fileKey/<random>/<name>` — unguessable, good. GET requires a session but does **not** check the key's `userId` segment against the caller (:2802–2818): any logged-in user can fetch any document. Consistent with the shared-workspace model but worth stating as a deliberate choice. The uncommitted decode fix (:2811) is correct and needed (filenames with spaces/em-dashes previously 404'd).

### Intelligence connectors
12 connectors, orchestrated as documented: sequential Postcodes.io first (coordinates + geography codes), then `Promise.allSettled` for the rest (:3068), results in the exact `{ status, data, error, source, fetchedAt }` shape, EPC comp-enrichment post-pass (:3079). Gaps: **no caching** — every run refetches 12 external APIs live; no per-connector timeout consistency (10 s LR, 8 s EPC, varies elsewhere); results are stored on the property only by the SPA/extension caller, so two users running intel on the same postcode double-fetch.

### Chrome extension ingest — **contract verification (higher-risk area)**
Field-for-field diff of `popup.js save()` (:307–347) against SPA creation sites:

| Entity | SPA reference | Verdict |
|---|---|---|
| property | URL-import object [App.jsx:1780](../src/App.jsx) | ✅ superset (adds `dealName`, `postcode`; `dataSource: 'extension'`) |
| contact | [App.jsx:955](../src/App.jsx) | ✅ exact match (`origin`/`owner` differ by design) |
| company | [App.jsx:704](../src/App.jsx) | ✅ exact match + documented builder/trade extras |
| globalNotes | [App.jsx:965](../src/App.jsx) | ✅ match; `origId()` preserves native id type |
| task | [App.jsx:7966](../src/App.jsx) | ✅ match incl. `dueDate`, `status: 'not_started'`, capitalised `linkedType` |

The shapes are healthy. The **pipeline around them is not**:

- 🔴 **Lost-update race (top finding).** `POST /api/ingest/:entity` upserts one row into D1 and patches the KV blob (:3360–3400). But the SPA's debounced autosave calls `syncUserBlobToD1`, which runs `DELETE FROM <table> WHERE user_id = ?` and reinserts only what's in the posted blob ([worker/index.js:476](../worker/index.js)), and replaces the whole KV blob (:3291). Sequence: SPA open → extension saves a property → user touches anything in the SPA → autosave fires → **extension record deleted from D1 and KV**. Extension captures survive only if every SPA tab reloads before its next save. The same last-writer-wins applies to two concurrent SPA sessions. Fixing this (server-side merge by `updated_at`, or SPA refetch-before-save, or delta saves) touches the crm-data contract — treat as high-risk, plan carefully.
- `readCrmFromD1` dedupes by `id` alone across users (:503) while the PK is `(user_id, id)` — two users creating records in the same millisecond shadow one of them in the merged view. Low likelihood, easy to note.
- `main.jsx` trusts `localStorage.crm_user` for role/allowedTabs (:78) and never re-validates via `/api/auth/me`. Verified live: a valid session with missing `crm_user` renders a **completely empty nav**. Stale permissions persist until manual re-login; and since no worker route checks tabs, permissions are purely cosmetic.

### Worker security notes
- 🔴 Unauthenticated writes: `POST /api/auction/dates` (:1702), `PATCH /api/auction/dates/{id}` (:1712), `PATCH /api/auction/lots/{id}` (:1749), `POST /api/scraper/reviewed` (:1808), and `GET /api/scraper/trigger` (:1803) — the last spawns a Browser-Rendering (Puppeteer) session per call, a cost/DoS vector. CORS locking does not protect against non-browser callers.
- ✅ Calendar OAuth callbacks *do* validate state against the KV session (:2467–2470) — but the state embeds the raw session bearer token, which then appears in Google/Microsoft redirect URLs, browser history, and any intermediary logs (:2430). Prefer a single-use random nonce mapped to the session in KV.
- `/api/scrape-property` fetches an arbitrary user-supplied URL server-side (:2764) — SSRF-shaped, mitigated by auth + Cloudflare's egress-only environment; keep an eye on it if bindings ever expose internal services.
- New-feature dependency: `handleRunGenerateReport` ([App.jsx:1537–1614](../src/App.jsx)) calls a **separate analyser service** defaulting to `http://localhost:3000` (:1536). In production this silently depends on the user running the analyser locally, and `ANALYSER_SECRET` is passed as an SSE query parameter (:1564) — same URL-leak class as the OAuth token.

---

## 3. Flexibility & extensibility

**Adding an intelligence connector** — 3–4 touchpoints, no registry:
1. Worker: a `connectorX()` function + a `tasks.push(...)` line in `/api/intelligence/run` (or worse, inline like LR/EPC).
2. SPA: a display block in the property canvas Intelligence tab.
3. Extension: the overlay's hardcoded connector-key list ([overlay.js:53–72](../extension/content/overlay.js)) if it should appear there.
The `{ status, data, source, fetchedAt }` shape means nothing breaks if a display is missing — unknown keys are just invisible. A small worker-side registry array (`{ key, source, needs: 'postcode'|'latlng'|'laCode', fn }`) would collapse the worker side to one entry and end the inline-vs-helper drift.

**Adding an entity type** — ~5 touchpoints: `D1_ENTITY_TABLES` entry + SQL migration + SPA state hook + the load-effect key list (:2390–2427) + the save payload + (optionally) `INGEST_ALLOWED` (:3365). The `D1_ENTITY_TABLES` map itself is the right pattern — the friction is that the SPA's load/save lists are hand-maintained parallels of it.

**Adding a field** — trivial everywhere *except* the two contract lists: `reportFields` (must stay in sync with the parser — already violated once, see §2) and the extension's record builders (must mirror SPA shapes). These are exactly the high-risk areas CLAUDE.md calls out; the `totalAuctionFees` bug shows the sync is enforced only by discipline. A shared constants module is impossible while the extension is plain static files, but a comment-block checklist in both files (or a tiny build-time check script) would catch omissions.

**Hardcoded assumptions worth knowing about:** extension API base (background.js:7); enum lists duplicated SPA↔extension (popup.js:10–14 vs App.jsx constants); `AUCTION_HOUSES_CONFIG`; `STAGE_TASK_TEMPLATES` (:1053); analyser URL/secret via build-time env (:1536); worker setup `allowedTabs` list (:1834) as a third copy of the tab list.

---

## 4. Usability & responsive design

Verified live (wrangler dev, seeded data) at 375/768/1280 with DOM measurement; screenshots were unavailable in this environment, so figures below are computed from `getBoundingClientRect`/`getComputedStyle`.

**What's right:**
- **No horizontal document overflow on any audited view** (dashboard, pipeline board, property canvas, tasks, companies) at any of the three widths. The no-fixed-width rule is being followed where it matters.
- The sidebar correctly switches to an off-canvas drawer below 768 px with overlay + Menu button; grids collapse via `isMobile` ternaries (266 usages); tasks and companies render card layouts on mobile rather than tables; 19 table sites use `crm-table-wrap`.

**Where CLAUDE.md's own rules are broken:**
- **Typography:** 347 inline `fontSize: '10px'`, 328 × `'11px'`, and one `'9px'` (the KPI source badge, [App.jsx:3269](../src/App.jsx) — below even the 10 px absolute floor). Only 14 styles bump fonts up on mobile. Measured live on the property canvas at 375 px: minimum on-screen font 9 px, 39 visible text nodes under 12 px (labels like "Auction House", "Planning to bid", stage chips). The ≥14 px body / ≥12 px floor rules are systematically unmet.
- **Tap targets:** nav buttons are 36 px tall, the global search input 30 px; ~27 on-screen interactive elements per mobile view measure under 40 px height. The 44×44 px rule is not met anywhere consistently.
- **Tablet (768–1023):** the full 260 px static sidebar stays open, leaving ~508 px of content at 768 px — the property canvas and board get cramped. `isTablet` exists but is barely used; defaulting the sidebar to its collapsed (icon) state on tablet would be a one-ternary fix.
- **Resilience trap:** the empty-nav failure when `crm_user` is missing (§2) is also a UX landmine — the user sees a logged-in shell with no navigation and no error.
- **Desktop-first workflows:** the GDV matrix tables, spec builder, and refurb cost-log tables are dense multi-column grids that technically scroll but are impractical at 375 px; fine if mobile is triage-only (checking pipeline, adding notes/tasks), which the current design implicitly assumes.

---

## 5. Free API opportunities (verified 7 July 2026)

Already covered — don't duplicate: Postcodes.io (the `address` connector), GIAS **including Ofsted ratings** ([worker/index.js:1509–1538](../worker/index.js) already maps `ofstedRating` — a separate "Ofsted API" adds nothing), EA flood *areas*, planning.data.gov.uk constraint datasets, LR Price Paid + HPI, EPC, Police.uk, OSM, IMD, TfL, Census.

**Not viable:** VOA council tax valuation list — no official API exists (public lookup site only; third-party paid caches). Skip.

| # | API | Enhances | New capability | Cost/limits | Auth | Effort |
|---|---|---|---|---|---|---|
| 1 | **EA Real-Time flood-monitoring — live warnings** (`/flood-monitoring/id/floods`) | existing `flood` connector | Active flood *warnings/alerts* with severity + 3-day risk, vs. today's static "flood areas nearby" count. Updated ~5 min. | Free, OGL, no registration | None | **Trivial** — extra fetch inside `connectorFlood` |
| 2 | **planning.data.gov.uk extra datasets** (green belt, article-4-direction, flood-risk-zone, brownfield-land) | existing `planning` connector | More refurb/extension constraint signals from an API you already call | Free, OGL | None | **Trivial** — extend the dataset list in `connectorPlanning` |
| 3 | **Companies House full suite** — officers, filing history, PSC, insolvency, Document API (PDF accounts) | Companies tab (builder/trade due diligence) | Director history, late filings, PSC, insolvency flags, downloadable accounts for any builder before you hire them | Free; 600 req / 5 min | API key (already have `CH_API_KEY` + proxy at :2186) | **Low** — new proxy routes + a "Company health" panel |
| 4 | **Ofcom Fixed & Mobile Coverage APIs** (api.ofcom.org.uk) | property canvas / intelligence | Broadband max speeds + mobile coverage by postcode — a rent/resale factor nothing currently covers | Free; 50,000 req / 28 days | Free API key (portal signup) | **Low** — standard new connector |
| 5 | **ONS Open Geography Portal** (ArcGIS REST, `f=geojson`) | pipeline map, intelligence display | LSOA/ward/LA boundary polygons — draw the deprivation/census area a property actually sits in on the Leaflet map | Free, no key | None | **Low–medium** — connector is easy; Leaflet overlay is the work |
| 6 | **Mining Remediation Authority (Coal Authority) open ArcGIS layers** | intelligence (very relevant to South Yorkshire stock) | Coal-mining legacy risk: development risk areas, mine entries — a survey/insurance red-flag generator | Free, OGL | None | **Medium** — ArcGIS REST point-in-polygon query, no JSON convenience API |
| 7 | **OS Data Hub — OpenData tier** (OS Maps tiles; *not* Places) | pipeline map | Proper OS basemaps instead of OSM tiles | Free tier; 600 transactions/min throttle | Free API key | **Low–medium**; note **OS Places API is Premium — avoid** |

Recommended order: 1 & 2 (same-day wins inside existing connectors), then 3 (highest business value for the builder/trade workflow), then 4.

Sources: [EA flood-monitoring API reference](https://environment.data.gov.uk/flood-monitoring/doc/reference) · [Companies House rate limiting](https://developer-specs.company-information.service.gov.uk/guides/rateLimiting) · [Companies House filing history API](https://developer-specs.company-information.service.gov.uk/companies-house-public-data-api/reference/filing-history) · [Ofcom API portal](https://api.ofcom.org.uk/) · [ONS Open Geography Portal](https://geoportal.statistics.gov.uk/) · [OS Data Hub plans](https://osdatahub.os.uk/plans) · [Mining Remediation Authority map hub](https://datamine-cauk.hub.arcgis.com/) · [BGS OpenGeoscience](https://www.bgs.ac.uk/geological-data/opengeoscience/)

---

## 6. Prioritized recommendations

**P0 — data loss / security (do before further feature work)**
1. **Fix the ingest lost-update race** — extension records are silently deleted by SPA autosave ([worker/index.js:476](../worker/index.js)). Options: merge-by-`updated_at` server-side; or have autosave send deltas; cheapest stopgap: SPA refetches `/api/crm-data` and merges before each save. ⚠️ Touches the crm-data/ingest contract — high-risk change per CLAUDE.md.
2. **Add `getSession` to the five unauthenticated write routes** (:1702, :1712, :1749, :1803, :1808). Low effort, no contract impact.

**P1 — correctness (small, high-confidence fixes)**
3. Add `'totalAuctionFees'` to `reportFields` ([App.jsx:881](../src/App.jsx)). ⚠️ Parser-contract change — one line, but follow the change-discipline rules and update CLAUDE.md's list (adding `compsList`, `aiSummary`, `redFlags` while there).
4. Deal Analysis KPI: read `activeDeal.guidePrice` instead of `an.guidePrice` (:7736).
5. Remove or fix the demo-data file input (`handleIncomingFileIngest`, :1007/:5635).
6. Add `reportcosts` to `ALL_TABS` (:456) and the setup `allowedTabs` (:1834).
7. Re-validate the session user via `/api/auth/me` on app load in `main.jsx` (:78) — fixes both stale permissions and the empty-nav trap.

**P2 — high value, moderate effort**
8. Free-API quick wins #1–#3 from §5 (flood warnings, planning datasets, Companies House due-diligence panel).
9. Cache intelligence results in KV keyed by postcode (e.g. 24 h TTL) — cuts 12 external calls per repeat run.
10. Move the OAuth session token out of redirect URLs (single-use nonce in KV, :2430); same for the analyser SSE secret (:1564).
11. Mobile typography/tap-target pass: lift the 9 px badge (:3269) and the worst 10 px labels to ≥12 px via `isMobile` ternaries; pad nav buttons and the search input to ≥44 px on mobile. (Hundreds of sites — do it view by view, starting with pipeline + canvas.)
12. Collapse the sidebar by default on tablet (`isTablet` → icon mode).

**P3 — structural (when growth demands it)**
13. Worker-side connector registry (one array, one loop) to end the inline-vs-helper drift and make §5 additions one-liners.
14. Extract the repeated modal/filter/table boilerplate in App.jsx into local helper components (still one file if preferred) — the report cost log additions show each new feature currently re-pastes ~200 lines of scaffolding.
15. Decide the multi-user story explicitly: today every user sees and can overwrite all data, tab permissions are client-side only, and `owner` fields are hardcoded. Fine for a two-person team — document it as intended, or add server-side scoping before inviting more users.
16. Consider delta-based saves (per-entity POST) to retire the whole-blob autosave before data volume makes it a problem.
