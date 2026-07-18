# Report Generation Queue — CRM ⇄ Property Analyser Integration Prompt

Paste this whole document to Claude Code working across TWO repos:

- **CRM**: `C:\Users\Ashle\property-crm` (Cloudflare Workers + React, deployed at
  https://property-crm.aa-investment-partners.workers.dev)
- **Analyser**: `C:\Users\Ashle\Documents\property-analyser-ai-agent` (local Node/Express/
  Playwright app, pm2 process `property-analyser`, port 3000)

This is one of the most critical pieces of the whole solution — the user's investor-grade
report generator becoming a one-click action inside the CRM. Read both repos' CLAUDE.md
files first and follow every rule, in particular the CRM's: read a function in full before
editing, never remove or rename existing fields, never add `ai*` keys to `reportFields`,
and stop and list extra files before touching anything beyond what a section describes.

## The goal, in one paragraph

Inside the CRM, on a property's canvas (the Documents/Assessment area), the user clicks
**"Generate report"**. The CRM queues a job carrying everything it already knows about the
property. The analyser app — running on the user's PC under pm2 — polls the CRM for
pending jobs (outbound-only; the PC has no public URL), runs its existing 3-stage pipeline
(extraction → research → analysis), and pushes the finished HTML report back to the CRM,
where it is stored in R2 against that property like any uploaded document, auto-parsed by
the existing `parseFullReportAnalytics` flow into `property.analytics`, and visible to any
logged-in user (the user's friend requests reports from his laptop with zero setup — the
generation happens wherever the analyser runs). If the PC is off, the job waits in the
queue and is picked up next time the analyser is running.

## Architecture decisions already made (do not re-litigate)

- **Pull, not push**: the CRM never calls the analyser. The analyser polls the CRM.
  Localhost stays unreachable from Cloudflare; outbound polling always works.
- **Auth**: the analyser authenticates with a long-lived extension token from the existing
  `POST /api/auth/extension-token` route (same mechanism as the Chrome extension — it is
  just a `session:{token}` KV entry with a 90-day TTL). No new auth scheme. The
  `CRM_SHARED_SECRET` var in the analyser's `.env.example` is dead/aspirational — ignore
  it; use a bearer token in `CRM_API_TOKEN` instead.
- **Storage**: finished reports go through the existing R2 document path (`CRM_DOCS`,
  key shape `{userId}/{propertyId}/{fileKey}/{token}/{filename}`) so View / inline open /
  Re-parse / semantic indexing all work unchanged. Remember the CLAUDE.md gotcha: R2 keys
  are stored with the literal filename and reads must `decodeURIComponent` — keep
  upload-write and GET-read symmetric by reusing the existing helpers, not reimplementing.
- **Queue store**: D1 (`CRM_DB`), new table via the next-numbered migration in
  `migrations/` (check the directory; market-intel used 0004). KV is wrong for this — jobs
  need listing, claiming, and status transitions.
- **Report format**: the analyser's HTML already shares the CRM parser's class vocabulary
  (`.big-verdict`, `.bid-box`, `.epc-chip`, `table.scenario`, `.flag-title`, label/value
  spans — see the analyser's `REPORT_FORMAT.md` and `src/prompts/analysis.prompt.js`).
  Do NOT change the report format. One known gap is fixed in §5 below.

Implement in the numbered order. Each section is one atomic commit. For CRM sections:
`npm run build` + `npx wrangler deploy` after each (dry-run first if wrangler.jsonc
changed). For analyser sections: restart pm2 and smoke-test with `MOCK_CLAUDE=true`
before any real run.

---

## 1. CRM — job queue table + routes (worker/index.js, new migration)

**Migration** — `report_jobs` table:

```sql
CREATE TABLE report_jobs (
  id TEXT PRIMARY KEY,             -- uuid
  user_id TEXT NOT NULL,           -- requester; report docs are stored under this user
  property_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | claimed | generating | done | failed
  payload TEXT NOT NULL,           -- JSON snapshot of property data (see below)
  result_doc_key TEXT,             -- R2 key of the finished report doc
  error TEXT,
  created_at TEXT NOT NULL,
  claimed_at TEXT,
  completed_at TEXT
);
CREATE INDEX idx_report_jobs_status ON report_jobs(status);
CREATE INDEX idx_report_jobs_property ON report_jobs(property_id);
```

**Routes** (all inside `handleApiRoutes`, all session-checked via `getSession` — the
extension token IS a session, so no special-casing needed; all rate-limited with the
existing `checkRateLimit` helper):

1. `POST /api/reports/jobs` — body `{ propertyId }`. Load the property (investigate how
   other routes load a single property for the session's user — reuse that). Reject 404 if
   not found, 409 if a `pending`/`claimed`/`generating` job already exists for this
   property (one in-flight job per property). Build the **payload snapshot** from the
   property record — every field the analyser's form would want, mapped to the analyser's
   form-field names (read `routes/generate.js` `parseNumbers` and the form in the
   analyser's `public/` to get the exact names): address, postcode, guidePrice, beds,
   propertyType, EPC rating, floorArea, auction date, auction house, listingUrl,
   refurb light/medium/heavy estimates if present, holding months, admin fee, plus
   `dealName`. Missing fields are simply omitted — the analyser pipeline already tolerates
   partial form data. Insert the job, return `{ success, jobId }`.

   **§1 amendment (document references in the payload).** The user usually uploads
   **Sprift, RightMove Plus, and legal-pack documents** to enhance reports, and wants
   CRM-stored docs to feed the pipeline automatically. So the payload snapshot also
   carries the property's stored documents as a `documents: []` array — one entry per
   R2 doc with `{ key, filename, kind }`, where `kind` is inferred deterministically from
   the fileKey and filename patterns into one of `sprift` / `rmplus` / `legalpack` /
   `survey` / `other`. The snapshot stores references only (R2 key + filename + inferred
   kind) — the analyser downloads the bytes itself in §3. Do not exclude the property's
   own generated `report` docs from feeding? Yes exclude them: skip docs whose `fileKey`
   is `report` or `mainReport` (a report must not re-ingest itself). Reuse whatever helper
   already lists a property's documents; add the `kind` inference as a small pure function.
2. `GET /api/reports/jobs/next` — the analyser's poll. Atomically claim the oldest
   `pending` job: `UPDATE ... SET status='claimed', claimed_at=... WHERE id = (SELECT id
   FROM report_jobs WHERE status='pending' ORDER BY created_at LIMIT 1) RETURNING *` (D1
   supports RETURNING; if not in this wrangler version, do it in two statements and accept
   the tiny race — there is one poller). Also: any job stuck in `claimed`/`generating`
   older than 30 minutes is reset to `pending` first (crash recovery). Return
   `{ success, job }` or `{ success, job: null }`.
3. `POST /api/reports/jobs/:id/progress` — body `{ status: 'generating', message }`.
   Optional nicety for the UI badge; just updates status + a transient message column or
   reuses `error` as a message field — builder's choice, keep it simple.
4. `POST /api/reports/jobs/:id/complete` — body is `multipart/form-data` with the HTML
   file (mirror how `/api/documents/upload` reads FormData) OR JSON `{ html }` capped at
   5MB — pick whichever lets you REUSE the existing R2 write path with the least new code.
   Store under the JOB's `user_id` and `property_id` with `fileKey` `'report'` and
   filename like `AI Report - {address} - {yyyy-mm-dd}.html`. Set `result_doc_key`,
   status `done`, `completed_at`. Trigger the same post-upload hooks the normal upload
   route runs (semantic indexing via `ctx.waitUntil` where eligible — remember `ctx` is
   the 4th param of `handleApiRoutes`, NOT a global).
5. `POST /api/reports/jobs/:id/fail` — body `{ error }`. Status `failed`, store message.
6. `GET /api/reports/jobs/status?propertyId=` — latest job for a property (the UI badge
   polls this). Returns `{ success, job: { id, status, error, createdAt, completedAt,
   resultDocKey } | null }`.

Notes:
- Multi-user: jobs are claimed globally by the poller regardless of which user created
  them (that's what makes the friend's requests work), but the finished document is
  written under the **job creator's** user so it lands on the right property record.
  Verify how the friend actually shares data in this CRM (same login vs separate user in
  `users`) by reading how properties/documents are scoped — if the deployment is
  effectively single-account, this all collapses gracefully.
- The top-level fetch wrapper masks thrown errors as generic 400s — wrap route bodies in
  try/catch with meaningful `corsResponse` errors, and test with `npx wrangler tail`.

## 2. CRM — "Generate report" button + status badge (src/App.jsx)

In the property canvas's Documents section (find where uploaded documents are listed and
where "Re-parse" lives — read that whole render block first):

- Add a **"Generate AI report"** button (styled like existing document-area actions,
  inline styles, 44px tap target on mobile, `isMobile` ternaries per the responsive
  rules). On click: `POST /api/reports/jobs`, then show the badge.
- **Status badge** next to the button: `Queued` (grey) → `Generating` (blue, subtle
  pulse ok) → `Done` (green) → `Failed` (red, with the error on hover/tap and a "Retry"
  action that creates a new job). While a job is `pending`/`claimed`/`generating`, poll
  `GET /api/reports/jobs/status` every 15s — ONLY while the property canvas is open and
  a job is in flight; clear the interval on unmount/close (mirror how existing polling
  effects in App.jsx clean up). On `done`, refresh the property's document list so the
  new report appears, and surface a small "Report ready — parse now?" affordance that
  runs the EXISTING re-parse flow (`parseFullReportAnalytics` → `applyReportToProperty`)
  on the new document. Do not auto-parse without the user seeing it happen — parsing
  overwrites analytics fields and the user should know.
- If the queue has a pending job and nothing picks it up (job older than ~10 minutes and
  still `pending`), show a gentle hint in the badge tooltip: "Analyser offline? The job
  will run next time it's up." No new mechanism — just compare `createdAt` to now.
- Remember the App.jsx `Map` icon shadow — no `new Map()` anywhere.

## 3. Analyser — CRM poller (new module + server.js wiring)

New file `src/crm/poller.js` (the analyser repo has no rule against new files):

- Env vars (add to `.env.example` with comments): `CRM_ORIGIN` (already exists),
  `CRM_API_TOKEN` (the extension token), `CRM_POLL_SECONDS` (default 30, `0` disables).
- On an interval: `GET {CRM_ORIGIN}/api/reports/jobs/next` with
  `Authorization: Bearer {CRM_API_TOKEN}` — via `resilientFetch` (this machine's HTTPS
  inspection breaks default fetch; every HTTP call in this repo goes through
  resilientFetch — follow suit).
- On receiving a job: map `job.payload` into the same `formData` shape
  `routes/generate.js` builds from the web form (reuse its `parseNumbers`; read the
  existing route in full and extract shared logic into a function BOTH the form route and
  the poller call — do not fork the pipeline invocation into two copies). Report
  `progress: generating`, run the 3 agents exactly as the form route does (extraction will
  simply have no uploaded files — the pipeline already tolerates that; research + analysis
  run normally, seeded with the CRM's property facts). Save locally to `reports/{uuid}`
  exactly as today (local history keeps working), THEN push the final HTML to
  `POST /api/reports/jobs/{id}/complete`. On any pipeline error, `POST .../fail` with the
  message (reuse `friendlyError`).
- **§3 amendment (download + feed the CRM-stored documents).** When `job.payload.documents`
  is non-empty, before running extraction the poller downloads each referenced doc via the
  existing `GET /api/documents/*` route (`Authorization: Bearer {CRM_API_TOKEN}`, via
  `resilientFetch`; mind the CLAUDE.md `decodeURIComponent` gotcha — the key must be
  URL-encoded exactly as the upload path stored it). It writes each to a temp file and
  groups them by `kind` into the SAME file-role arrays the web form produces —
  `spriftFiles` (kind `sprift`), `rmPlusFiles` (kind `rmplus`), `surveyFiles` (kind
  `survey`), `otherFiles` (kind `other`) — and passes them into `runExtractionAgent`
  exactly as `routes/generate.js` does for uploaded files (read that route to get the
  exact array names and shape; do not invent new ones). Legal-pack docs (kind `legalpack`)
  are handled separately: after stage 1 completes, if any legal-pack docs are present, run
  the existing `src/pipeline/legalPackAgent.js` (stage 2) over them exactly as the web form
  route does, and push that stage-2 HTML to the CRM as a **second** document on the same
  job (`fileKey` distinct from the stage-1 report, e.g. `legalpack-report`, via the same
  `/complete` R2 path or a second upload) so the legal-pack analysis lands on the property
  alongside the main report. Clean up temp files in a `finally`. If a download fails, log
  it and continue without that doc — a report must never fail because one upload 404'd.
- One job at a time — do not poll while a job is running. Log clearly to pm2 logs:
  claimed job id + address, each stage, completion/failure.
- Wire into `src/server.js` startup: start the poller iff `CRM_API_TOKEN` is set. Zero
  config = zero behaviour change.

## 4. Analyser — extend the free-model chain to CRM parity

`src/lib/llmProvider.js` currently chains Groq → Gemini → OpenRouter → Workers AI. The
CRM worker now also has **Mistral (`MISTRAL_API_KEY`, mistral-small-latest), Qwen
(`QWEN_API_KEY`, DashScope intl compatible-mode, qwen-turbo), Hugging Face
(`HUGGINGFACE_API_KEY`, router.huggingface.co), and Routeway (`ROUTEWAY_API_KEY`,
api.routeway.ai/v1, deepseek-r1:free)** — read `callMistral`/`callQwen`/
`callHuggingFace`/`callRouteway` in the CRM's `worker/index.js` (~line 3160+) and port
them into the analyser's provider module in its existing style (resilientFetch, per-
provider maxTokens ceilings, MODEL_IDS entries registered at $0 in `usageTracking.js`).
Default chain order: groq, gemini, mistral, qwen, openrouter, huggingface, routeway,
workersai — overridable via the existing `REPORT_LLM_CHAIN` var. Copy the same API keys
into the analyser's `.env`. This directly reduces "report failed because a free tier ran
out" — the whole reason the fallback chain exists.

## 4a. Analyser — model strategy: strongest first, strict fallback

The user's requirement: every pipeline stage uses the STRONGEST model available to them,
falling back to the second-strongest only when the first is out of quota/erroring — not a
fixed arbitrary order. There is deliberately no `ANTHROPIC_API_KEY` (no Claude charges),
so rank the FREE providers by capability per stage and encode that order:

- **Analysis stage** (long HTML, needs the largest output ceiling and best writing):
  Gemini (`gemini-flash-latest`, ~32k output, currently the strongest free option) →
  Groq `llama-3.3-70b-versatile` → then the remaining chain. At build time, check
  each provider's current top free model (Groq/OpenRouter/Routeway catalogs move fast —
  e.g. newer Llama or DeepSeek variants may outrank 3.3-70b) and pick deliberately;
  document the choice in a comment.
- **Research stage**: search capability outranks raw model strength — see §4b order.
- **Extraction stage** (vision/PDF): Gemini remains the only free vision-capable option;
  keep its existing fallback behaviour.

Keep `REPORT_LLM_CHAIN` as the user-facing override. Log the model that actually served
each stage into the existing usage tracking so "which model wrote this report?" is always
answerable (this also feeds the CRM's AI Usage panel expectations later).

## 4b. Analyser — free web-search for the research stage

The research agent (`src/pipeline/researchAgent.js`) currently only gets real web search
when `REPORT_LLM=claude` (Anthropic's native web_search tool); in free mode it falls back
to a weaker path. Upgrade the free-mode research stage to a layered free search stack:

1. **Gemini Grounding with Google Search** (primary): the free tier includes ~1,500
   grounded requests/day on Gemini 2.5 models (5,000/month on Gemini 3). In the Gemini
   call in `llmProvider.js`, support passing `tools: [{ google_search: {} }]` for
   research-stage calls so the model searches Google natively and grounds its comps in
   live results. Verify the exact current request shape against Google's docs at build
   time — grounding config naming has changed across API versions.
2. **Groq Compound** (secondary): `groq/compound-mini` (one built-in web search per
   request) or `groq/compound` (multiple) are free-tier-accessible and do server-side
   web search. Add them as research-stage-only model options in the Groq caller.
3. **Tavily** (floor): keep the existing webSearch fallback as-is.

Wire this so ONLY the research stage uses search-capable variants — extraction and
analysis stay on the plain chain (search adds latency/quota cost and they don't need it).
Chain order for research in free mode: gemini-grounded → groq-compound → current
Tavily-based fallback. Log which search path served each report (extend the existing
usage tracking) so failures are diagnosable. Do not remove the Claude-native path —
`REPORT_LLM=claude` must behave exactly as before.

**What the research stage must actually capture.** The gold standard is the user's
hand-enhanced reports — read these two files before writing any research prompt changes:

- `C:\Users\Ashle\Documents\Property\AI property Reports\Auction House Analysis\95 Lound Road S9 4BH\Deal Report — 95 Lound Road, Sheffield S9 4BH v2.html`
- `C:\Users\Ashle\Documents\Property\AI property Reports\Auction House Analysis\78 Bevercotes Road\Deal_Report_78_Bevercotes_Road_v3.html`

These are base reports the user then fed to Claude chat with live web search to enhance —
the whole point of §4b is making the pipeline produce this quality WITHOUT that manual
step. Update the research prompt (`src/prompts/research.prompt.js`) and its output schema
so free-mode search explicitly hunts for and returns:

1. **Active listings — including Sold STC.** Every currently-marketed comparable in the
   immediate area, each labelled with status: `Asking` / `Sold STC` / `Under Offer` /
   `Achieved` (recently completed). Capture per listing where findable: agent/portal name,
   asking or achieved price, beds, type, tenure, condition notes, days on market, £/sqft.
   STC listings matter to the user — they show real buyer appetite at a price level — but
   must carry the exemplar's warning framing: asking/STC prices are NOT achieved prices
   and are never GDV anchors.
2. **Past sold prices, same road first.** Sold history on the subject's own road (then
   widening to the outcode), with date, price, type — and staleness flags on sales older
   than ~2 years (the exemplar marks these `stale`).
3. **Anomaly discipline.** Any comp priced far outside its peers gets an explicit
   anomaly note (with its own prior-sale history if findable) and is excluded from the
   GDV anchor — mirroring the exemplar's "£225k — not used as GDV anchor" treatment.
4. **Market position ladder.** Enough data for the analysis stage to state: Floor
   (lowest recent same-road sale), Most Recent Same-Type Sold, Ceiling (best achieved
   refurbed/extended price), and Active Asking Sentiment — the exemplar's four-line
   summary. Add this ladder to the analysis prompt's required output if not already
   derivable.
5. **Flip proof narrative.** The analysis prompt should require a short evidenced
   paragraph tying the refurbished exit price to a concrete achieved sale (as in the
   exemplar's "Flip Proof Narrative"), not just a number.

Schema changes must be additive to `research.prompt.js`'s existing `comparableSolds` /
`activeListings` shapes (add `status`, `agent`, `daysOnMarket`, `pricePerSqft`, `tenure`,
`stale`, `anomaly` fields; don't rename existing ones), and `analysis.prompt.js` gains
the corresponding rendering instructions. Do not break the existing class-name/format
contract the CRM parser depends on — these are new sections/columns, not renames.

## 4c. Analyser — wire Land Registry + EPC APIs into the pipeline

The repo has working API modules — `src/apis/landRegistry.js` (HM Land Registry sold
prices) and `src/apis/epc.js` (EPC register; needs `EPC_EMAIL`/`EPC_API_KEY`, already in
`.env`) — but the CURRENT 3-stage pipeline never calls them (verified: no references in
extractionAgent/researchAgent/analysisAgent/generate.js — they're only used by the old
`src/agent/` architecture). That means base reports only get Land Registry/EPC data when
the user uploads a Sprift PDF. Fix:

- Add a deterministic **data-gathering step** in the pipeline (before or alongside the
  research agent — a plain async function, NOT another LLM call): call
  `landRegistry` for sold prices on the subject's postcode/road and `epc` for the
  subject's EPC record (rating, floor area, construction era) plus EPC records for
  same-road comps where cheap to do so. Read both API modules in full first — reuse
  their existing exported functions and error handling; add nothing to their internals.
- Merge results into the data handed to the analysis agent (extend the object
  `runAnalysisAgent` receives) clearly labelled by source — Land Registry data is
  authoritative for sold prices and should be preferred over web-search versions of the
  same sales when both exist (dedupe by address+date).
- Feed the subject's EPC floor area into the £/sqft calculations when the form didn't
  supply floor area.
- Both APIs fail soft today (return empty on error) — keep that; a report must never
  fail because a free government API was down.
- These calls are free and unmetered (Land Registry SPARQL / EPC ODC) — no quota
  concerns, so run them on EVERY report, both form-initiated and CRM-queued.

## 4d. Analyser — multi-source data reconciliation (the enrichment merge)

After §4b and §4c, one property's data arrives from up to six places: the CRM job payload
(or web form), uploaded documents (Sprift / RM+ PDFs when present), the Land Registry
API, the EPC API, web search (grounded Gemini / Groq compound / Tavily), and the auction
listing scrape. The same fact will frequently appear in several of them with slight
differences (same sold price with a different date format; same comp with "Rd" vs
"Road"; floor area in sqft in one source and m² in another). Build ONE reconciliation
step that merges these into a single enriched dataset BEFORE the analysis agent runs, so
the report is written from reconciled data — not from six overlapping lists the LLM has
to untangle (LLMs silently double-count duplicate comps; that corrupts GDV).

- **Normalisation helpers** (one shared module): address normalisation (case, punctuation,
  `Rd`→`Road`, `St`→`Street`, strip postcode from the string, collapse whitespace);
  area normalisation to sqft (convert m² — EPC reports m²); date normalisation to
  ISO month precision.
- **Dedupe rule for sold comps**: same normalised address + same sale month = same sale.
  Keep one record with a `sources: []` list.
- **Precedence when values conflict**:
  - Sold price / sale date: **Land Registry > Sprift upload > web search** (LR is the
    registry of record). If LR and another source disagree on price for the same sale by
    more than ~1%, keep the LR figure and add a `conflict` note — never average.
  - EPC rating / floor area / construction era: **EPC API > Sprift > form/CRM payload**.
  - Guide price, auction date, refurb estimates: **CRM payload / form** (the user's own
    inputs are authoritative for deal parameters).
  - Beds / property type per comp: whichever source states it explicitly; `Unknown` if
    none does — never inherited from the subject (REPORT_LOGIC.md's comp-integrity rule).
  - Active listings: web search is the only source; dedupe by normalised address +
    agent; a listing that also appears as an LR sold record within the last 3 months is
    reclassified `Achieved` with the LR price.
- **Provenance**: every merged record carries its source labels, and the analysis prompt
  is told to cite the source tier in comp tables (the exemplar's T1 ★ pattern already
  does this — extend, don't replace). Genuine conflicts (not resolved by precedence)
  surface in the report as amber flags rather than being silently dropped.
- This step is deterministic code with unit-testable behaviour — add a small test file
  with fixture cases (dupe address spellings, m²-vs-sqft, LR-vs-scrape price conflict)
  runnable via `node --test` or the repo's existing test convention if one exists.

## 4e. Analyser — "Data Coverage & Enhancement" section in every report

The user wants to SEE the difference uploads make: what a search-only report is missing,
and how much Sprift / RM+ / legal-pack uploads improve it. Add a **Data Coverage &
Enhancement** section to every generated report, built deterministically from §4d's
provenance labels (NOT LLM-invented — this is rendered from the reconciled dataset's
source tags, so it is always accurate to what actually fed the report):

- A table of **data categories** — sold comps, active listings, EPC / floor area, tenure,
  legal title risks, planning, refurb evidence, rental / yield — each row showing:
  1. **Which source(s) supplied it** — web search / LR API / EPC API / Sprift / RM+ /
     legal pack / CRM form — taken straight from the provenance labels on the reconciled
     records for that category.
  2. **Present or MISSING** — whether the report has this category at all.
  3. **How a gap could be filled** — for each missing category, whether a scraper/search
     could fill it, or whether ONLY an upload can (e.g. legal title risks come only from
     the legal pack; detailed floor plans / room dimensions only from RM+; charge/tenure
     specifics often only from Sprift). This mapping is a fixed lookup (category → which
     source classes can supply it), not a guess.
- Net effect: a **search-only** report explicitly lists "what uploading Sprift / RM+ /
  legal pack would add"; a **regenerated report with those uploads** shows those same
  categories now sourced from the uploads — giving the user the before/after visibility
  they asked for.
- Rendering: use **new additive class names** (e.g. `.data-coverage`, `.coverage-row`,
  `.coverage-missing`) — this section is purely additive and MUST NOT disturb the CRM
  parser's existing class/format contract (§0 architecture decision) or any field the
  CRM's `parseFullReportAnalytics` reads. It is display-only; the CRM parser can ignore it.
- Because it is driven by the §4d provenance tags, the CRM-doc feeding from the §1/§3
  amendments flows straight through: uploads that fed the pipeline appear as their source
  class in the coverage table automatically.

## 5. CRM — parser fix: "Expected" GDV alias (src/App.jsx)

`parseFullReportAnalytics` recognises Conservative/Base/Optimistic scenario labels, but
the analyser's report emits a 4-scenario set including **"Expected"** — which currently
silently fails to parse. Read the GDV-matrix parsing block in full (~lines 1406–1478),
then add "Expected" handling additively: map Expected → the existing optimistic-adjacent
fields ONLY if that preserves the current meaning — otherwise capture it as new keys
(`gdvExpected`, `matrixExpected`) added to BOTH the parser output and the `reportFields`
whitelist in `applyReportToProperty` (adding new fields is allowed; renaming/removing is
not). Also verify `redFlags` and `reportSummary` extract cleanly from a real analyser
report: take one from `C:\Users\Ashle\Documents\property-analyser-ai-agent\reports\`
(any `stage1.html`), paste key excerpts into a quick node script against the same regexes
if practical, and fix additively where they miss. Never touch the `ai*` ownership rules.

## 6. Analyser — pm2 auto-start on Windows boot

Make the analyser survive reboots with no manual start:

- `pm2 start ecosystem.config.cjs` (already configured), then `pm2 save`.
- Install `pm2-windows-startup` (`npm i -g pm2-windows-startup && pm2-startup install`) —
  registers a registry-run entry that resurrects the saved pm2 process list at login.
  If that package misbehaves on this machine, fall back to a Task Scheduler "At log on"
  task running `pm2 resurrect`. Verify by rebooting… is not practical in-session, so
  verify the registry entry / scheduled task exists and `pm2 ls` shows the app after
  `pm2 kill && pm2 resurrect`.
- Document in the analyser README: how to check it's alive (`pm2 ls`, pm2 logs), and that
  CRM jobs queue harmlessly while the PC is off.

## 7. End-to-end verification (do not skip; do not mark done without this)

1. **Token**: user generates an extension token in CRM Settings → Integrations and puts it
   in the analyser's `.env` as `CRM_API_TOKEN`. (Claude cannot do this step — ask.)
2. **$0 dry-run**: set `MOCK_CLAUDE=true` in the analyser. In the CRM (deployed), open a
   property, click Generate report. Watch: badge goes Queued → Generating → Done; the mock
   report appears in the property's documents; it opens/views correctly (filename with
   spaces survives the R2 decode path); job row in D1 is `done`. Run `npx wrangler tail`
   during this to catch masked errors.
3. **Parse check**: run the CRM's re-parse on a REAL previously-generated analyser report
   (from `reports/`) uploaded through the new path — confirm maxBid, netProfit, margin,
   GDV scenarios incl. Expected, verdict, redFlags, comps all populate `property.analytics`.
4. **Failure path**: kill the analyser mid-job → job resets to pending after the 30-min
   claim timeout (temporarily lower it to 1 min to test, then restore). Set a bogus
   `CRM_API_TOKEN` → poller logs a clear auth error and does not crash-loop.
5. **Real run** (only after 2–4 pass, with the user's go-ahead — it spends provider
   quota): one real report end-to-end with `MOCK_CLAUDE` unset, `REPORT_LLM=free`.
   Judge the output against the two exemplar reports named in §4b: it must contain
   active listings with Asking/STC/Achieved status labels, same-road sold history with
   staleness flags, the four-line market ladder, a flip-proof narrative, and Land
   Registry + EPC data even with NO files uploaded. If any of those are missing, iterate
   on the prompts (§4b/§4c) before calling the section done.
6. Commit per section; CRM deploys from main; analyser repo commit + pm2 restart.

## Explicitly out of scope (do not build)

- Any VPS/cloud deployment of the analyser (decided against for now — datacenter IPs get
  blocked by Rightmove/Zoopla; revisit later).
- Changing the report's visual format or the class-name contract the CRM parser reads
  (prompt/schema changes are allowed ONLY as specified in §4b/§4d, and only additively).
- Auto-parsing without user visibility (§2's affordance is the boundary).
- A second poller on the friend's laptop (possible later; single poller for now).
- Webhooks/push from CRM to analyser (impossible: no public URL).
