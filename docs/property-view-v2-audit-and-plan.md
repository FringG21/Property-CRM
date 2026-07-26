# Property View v2 — Audit & Implementation Plan

**Reviewed:** `src/App.jsx` property canvas (`currentViewProperty` block, ~4160–6800), the
intelligence sidebar, all 10 `propCanvasTab` panels, `src/views/BrrAnalysis.jsx`,
`worker/index.js` (connectors, doc pipeline, AI chain), `worker/brrCalc.js`,
`migrations/0001–0006`, and `docs/deal-view-audit-and-enhancement-prompt.md`.

**Status of the previous audit:** most of it shipped — RightMove Plus slot + enrichment,
deal readiness checklist, bid-day mode, post-mortem/decline reason, staleness chips,
consolidated "Deal verdict" card. This document covers what's left, what broke, and what
the four stated goals still need.

**AJ's decisions (2026-07-24):**

| Question | Answer |
|---|---|
| Deal Analysis vs BRR | **Keep Deal Analysis.** It is the report-driven hammer-price × refurb → profit matrix. Do not merge or remove it. |
| Strategies to model | **Flip, BRR/BRRR, HMO** |
| AI trigger | **Auto on key events**, manual re-run retained |
| Doc slots | Keep current set (Assessment report, Sprift, RightMove Plus, Legal pack, Legal summary) + a free "additional information" slot. **All slots must accept all file types — HTML is used heavily.** |

---

## PART 1 — CURRENT STATE MAP

### Tab structure (`src/App.jsx` ~4437–4462)

| Tab | Key | Primary data source | State |
|---|---|---|---|
| Overview | `overview` | `analytics` (report + AI), readiness, bid-day, outcome cards | Dense but working |
| Comparables | `comparables` | LR connector + `an.compsList` + manual + AI comps + RM Plus enrichment | Working, merged at render |
| Intelligence | `intel` | `intelligence.connectors[12]` | Working |
| Deal Analysis | `financials` | GDV scenarios + matrix from report; **cost stack from `dealCalc`** | **Cost stack is broken — see F1** |
| BRR Analysis | `brr` | `property.brr.scenarios[]` | Working, siloed |
| Documents | `documents` | `files{}`, `legalPackFiles[]`, `customDocs[]`, R2 + Vectorize | Working |
| Tasks | `tasks` | global `tasks[]` filtered by `linkedType/linkedId` | Working |
| Notes | `notes` | `notesList[]` | Working |
| Timeline | `timeline` | `activityLog[]` | Working |
| Bid Log | `bids` | `bidLog[]` | Working, manual entry only |

### Sidebar (~4470–4750)
Deal name / postcode → pipeline stage pills → auction outcome pills → post-auction pills →
vetting → **deal score (fake — see F3)** → bid strategy (walk/target/stretch) → refurb level →
auction details → solicitor → intel quick view → **documents (duplicate of Documents tab — see F6)** →
planning-to-bid + listing link.

### Data model
Everything is a JSON blob in `properties.data`. Extracted columns: `status`, `postcode`,
`auction_date`, `source_lot_id` only. Comps, bids, documents, scenarios, AI runs and
intelligence all live inside the blob.

---

## PART 2 — FINDINGS

### F1 · **BUG (high): the Deal Analysis cost stack can never populate**
`src/App.jsx:4194` reads `const dc2 = currentViewProperty.dealCalc || {}` and the entire
cost-stack panel (~5878–5910) is derived from it. **Nothing in the application writes
`dealCalc`.** Repo-wide, `dealCalc` appears only as a *read* in `App.jsx:4194`,
`worker/brrCalc.js:516`, and in the BRR design docs. There is no input UI anywhere.

Result: the "Cost stack" panel on the Deal Analysis tab always renders the empty state,
which then links to a **"Details & Analysis"** section that no longer exists in the file
(`isPropNotesExpanded` is declared at line 629 and used only at line 5905 — the panel it
used to toggle is gone). So the button visibly does nothing.

**The data you need is already parsed.** `parseFullReportAnalytics` extracts the full cost
stack into `analytics` (App.jsx:1323–1329): `buyersPremium`, `sdlt`, `acquisitionFeesTotal`,
`worksTotal`, `holdingTotal`, `exitTotal`, `totalInvestment`, plus
`refurbLight/Medium/Heavy`. The cost stack is reading the wrong object.

### F2 · **Refurb level is decorative**
The sidebar refurb pills write `property.refurbLevel` and display `an.refurbLight/Medium/Heavy`,
but the Deal Analysis cost stack reads `dealCalc.refurbCost`. Changing refurb level moves
nothing on the Deal Analysis tab. (`computeActuals` at ~2705 *does* respect it — so the same
field drives one calculation and not the other.)

### F3 · **Two competing deal scores**
Sidebar (~4570) renders a score of literally `78 / 52 / 34` mapped from the
`an.bidStrength` string. Meanwhile a real 0–100 `an.aiDealScore` exists and is shown in the
Deal verdict card. Two different numbers labelled "deal score" on one screen.

### F4 · **Naming collision**
Per-property tab labelled "Deal Analysis" (`financials`) vs the top-level portfolio tab
"Deal Analysis & Scenario Matrix" (`activeTab === 'dealanalysis'`). Same name, different
screens.

### F5 · **File-type restrictions contradict how you work**
`FILE_KEYS` (App.jsx:4167–4174): Survey report accepts `.pdf` only; Legal summary accepts
`.pdf,.doc,.docx,.txt` — **no HTML**. You said HTML is your primary format.

### F6 · **Documents exist in two places with different powers**
The sidebar Documents block and the Documents tab both list `FILE_KEYS`. The sidebar can
upload and view but not delete or re-parse; the Documents tab filters `legalPack` out of the
grid and handles it separately. Two upload paths, inconsistent affordances.

### F7 · **Comps are merged at render, never persisted**
Four sources (Land Registry, report `compsList`, manual `comparables`, AI
`dealAnalysisComparables`) are reconciled inside the Comparables render block on every
paint. The enriched, de-duplicated set is never written back. Consequences: the AI review
doesn't see the enriched set, no portfolio-level comp queries, and the data-quality signal
can't be trended.

### F8 · **No structured data for anything portfolio-level**
Because comps, bids, scenarios and AI runs are inside `properties.data` JSON, you cannot
answer: "what's our average margin by outcode", "which auction house do we systematically
underbid at", "how did our max bid drift vs the report max over 12 months". Market Intel
has a full relational `mi_*` schema for *other people's* results; your own deals have none.

### F9 · **No valuation / decision history**
Re-parsing a report or re-running the AI review overwrites in place. `activityLog` records
that an event happened but not the before/after values. You cannot see how GDV, max bid or
verdict moved during the research period.

### F10 · **Bidding data is disconnected from Market Intel**
`bidLog`, `lotOutcome`, `lotSalePrice`, `outbidPrice`, `hammerPrice` are all manual. Market
Intel already scrapes national confirmed sale prices (`sold_for` / `sold_prior_for` /
`sold_after_for`). Nothing cross-references your property's lot against that feed to
auto-fill the sold price or flag "this went for £X, you walked at £Y".

### F11 · **All AI is manual, unorchestrated**
Five separate buttons (Run intelligence, AI review, Market comparison, Full review, Generate
report) in a crowded header. No auto-trigger, no dependency ordering, no "inputs changed
since last review" signal, no record of which provider produced which insight beyond
`aiProvider`.

### F12 · **Legal pack is stored but not understood**
Files upload to R2 and are chunked into Vectorize for semantic search, but nothing extracts
structured legal facts (tenure, lease years remaining, ground rent, service charge,
covenants, easements, rights of way, arrears, special conditions, completion period) into
fields the readiness checklist, AI review or GDV model can use. Search is query-only —
you have to know what to ask.

### F13 · **No strategy comparison**
BRR lives in its own tab with its own scenario engine. The report-driven Flip model lives in
Deal Analysis. There is no HMO model at all, and no screen that shows Flip vs BRR vs HMO
profit/ROI side by side for the same hammer price.

### F14 · **No deal export**
Nothing produces a shareable one-pager (PDF/HTML) for a JV partner, broker or lender.

### F15 · **Weak collaboration signal**
`activityLog` and notes exist, but there's no per-field attribution ("who changed our max
bid, when, and why"), no unread/what's-changed-since-I-last-looked marker, and the
"shared place of information" goal has no read-state model.

---

## PART 3 — THINGS NOT ON YOUR LIST WORTH CONSIDERING

1. **Bid discipline enforcement.** The Bid Log warns when a logged bid exceeds `ourMaxBid`,
   but nothing stops or records the override reason. On auction day that warning is the
   single highest-value guardrail in the product — it should require a typed reason.
2. **Side-by-side property comparison.** You research several lots in the same auction; there
   is no two-column compare view.
3. **Sensitivity beyond the report matrix.** The matrix varies hammer price × refurb. It does
   not vary sale price falling, refurb overrunning, void/holding period extending, or
   bridging rate moving. One slider row would materially change bid confidence.
4. **Duplicate lot detection.** The same property can enter via scraper, manual add and
   Market Intel with no merge.
5. **Report-max vs our-max drift.** The KPI strip shows "% of report max" once; trending that
   across won/lost deals is the single clearest signal of whether you're bidding well.
6. **Offline / poor signal on auction day.** Bid logging on a phone in a saleroom is the one
   place where a failed write costs real money. Consider a local queue + retry.
7. **Field-level permissions.** `ourMaxBid` is editable by anyone with the property open,
   inline, with no confirmation.
8. **Cost model versioning.** SDLT rates, buyer's premium and bridging costs change. Deals
   analysed under old assumptions should record which cost model version they used.

---

## PART 4 — IMPLEMENTATION PLAN

> **Discipline (from `CLAUDE.md`, non-negotiable):** read each function in full before
> editing; never remove or rename existing fields, keys or params; never add `ai*` keys to
> `reportFields`; keep report-owned and AI-owned analytics disjoint; never use `new Map()`
> in `App.jsx`; declare state above any hook that references it; verify render at 375 /
> 768 / 1280 before `npm run build`; hold deploy until AJ reviews the diff.
>
> **Confirm with AJ between each phase.** Do not chain phases without review.

---

### PHASE 1 — Fix what's broken (no new features)
*Small, high-confidence, unblocks everything downstream.*

**1.1 Wire the Deal Analysis cost stack to real data.** *(Revised — see 1.3.)*
In the `propCanvasTab === 'financials'` cost-stack block (~5878–5910), replace the
`dealCalc`-only derivation with a resolver that reads, in priority order:

1. `property.dealCalc.<field>` — manual entry from the rebuilt Cost assumptions panel (1.3)
2. `property.analytics.<field>` — report-parsed (`buyersPremium`, `sdlt`,
   `acquisitionFeesTotal`, `worksTotal`, `holdingTotal`, `exitTotal`, `totalInvestment`,
   and `refurbLight|Medium|Heavy`)
3. blank

Every row shows a provenance chip (`Manual` / `Report` / `Estimate` / `Quoted`) matching the
existing KPI-strip `src` chip pattern (~4400). **No new field is introduced** — `dealCalc` is
the manual store and is already read by `worker/brrCalc.js:516`. Never write to `analytics`,
and never add `dealCalc` to `reportFields`.

- Keep the row list and labels identical; only the value source changes.
- Report values must survive a re-parse without clobbering anything the user typed.

**1.2 Refurb as a RANGE, not a point estimate.** *(Revised 2026-07-24 after AJ review.)*

The original wording — "make refurb level drive the cost stack" — was wrong. Refurb figures
are estimates, and collapsing Light/Medium/Heavy into one selected number gives the cost
stack false authority. The report already handles this honestly: the matrix varies profit
across refurb level × hammer price. The cost stack must not undo that.

Instead:

- The Refurb row renders as a **range**: `£18k – £41k` with the `refurbLevel` value
  highlighted as "planned". The Total row likewise shows a range, with the planned-level
  total as the headline figure.
- Every estimate-derived row carries an **`Estimate`** chip, visually distinct from the
  `Report` provenance chip — the user must never mistake a modelled figure for a known one.
- **Quotes upgrade estimates.** `refurbQuotes` filtered by `propertyId` already exists and is
  already passed to the AI review (`runAiDealReview`, App.jsx ~2329). When accepted quotes
  exist, their total replaces the estimate for that trade and the row is chipped **`Quoted`**.
  Partial coverage shows "3 of 9 trades quoted — £12k quoted + £19k estimated".
- `refurbLevel` therefore becomes a *planning marker* ("this is the job I think it is"), never
  a hidden calculation input.

**1.3 Build the missing "Details & Analysis" panel — do NOT delete the link.**
*(Revised 2026-07-24 after AJ review.)*

**Where it is:** it is not a tab. The only occurrence of that string in the entire codebase is
inside the empty-state sentence of the cost-stack panel on the Deal Analysis tab (App.jsx
line 5905):

> "Use the Deal Calculator in **[Details & Analysis]** below to build a cost stack."

The button toggles `isPropNotesExpanded` — state declared at line 629 and referenced nowhere
else in 14,384 lines. The collapsible panel it controlled is not in the file. Git can't date
the loss: the repo is a single "Initial commit", so it disappeared before version control
started. The word *"below"* is the tell — it pointed at a panel lower down the same tab, not
at another tab.

**The correct fix is to rebuild it, not remove it.** That missing panel is the `dealCalc`
input UI whose absence causes F1. Building it resolves F1 and 1.3 together, and keeps
`dealCalc` as the manual-override store — so **drop the separate `costOverrides` field
proposed in 1.1** and write manual entries to `dealCalc` instead. Less new surface, and
`worker/brrCalc.js:516` (which already reads `dealCalc`) starts receiving real values.

Rebuild as a collapsible **"Cost assumptions"** panel at the foot of the Deal Analysis tab,
controlled by the existing `isPropNotesExpanded` state:

- Fields: purchase price, buyer's premium %, admin fee, legal fees, survey cost, refurb cost
  (per level), contingency %, holding months, holding monthly cost. These are exactly the keys
  `App.jsx:4194–4200` and `brrCalc.js:516` already expect — **do not invent new key names.**
- Each field pre-populates from `analytics` (greyed placeholder showing the report value) and
  only writes to `dealCalc` when the user actually types. Empty `dealCalc` = use the report.
- The resolver from 1.1 becomes: `dealCalc` (manual) → `analytics` (report) → blank.

So the revised 1.1 priority order is **manual `dealCalc` → report `analytics`**, and the
Deal Analysis tab keeps everything ported from the report exactly as it is today — the GDV
scenarios and hammer × refurb matrix panel above are untouched.

**1.4 Retire the fake sidebar deal score.** Replace the hardcoded 78/52/34 block (~4570)
with `an.aiDealScore` when present, falling back to the `bidStrength` chip *without a
number*. One score on the screen, or none.

**1.5 Open up file types.** In `FILE_KEYS` (4167–4174) widen every `accept` to include
`.html,.htm` at minimum; set Legal summary and Survey report to accept the full set used
elsewhere (`.pdf,.html,.htm,.doc,.docx,.txt,.zip,.jpg,.jpeg,.png`). Add a sixth slot:
`{ key: 'additionalInfo', label: 'Additional information', accept: <full set> }`.
Verify the R2 key encode/decode symmetry note in `CLAUDE.md` still holds for new extensions.

**1.6 De-duplicate the Documents UI.** Sidebar Documents block becomes read-only status
(uploaded / missing + count, click → jumps to Documents tab with that slot highlighted).
All upload/delete/re-parse lives in the Documents tab only.

**1.7 Rename to kill the collision.** Per-property tab `financials` label → **"Costs & GDV"**.
The top-level portfolio tab keeps "Deal Analysis & Scenario Matrix". Tab key stays
`financials` — do not rename the key.

**Acceptance:** open a property with a parsed report and no `dealCalc` — the cost stack
renders fully populated with `Report` chips; switching refurb level changes the Refurb row
and the total; manual edit writes `costOverrides` and re-parsing the report does not wipe it.

---

### PHASE 2 — Structured data foundation
*Prerequisite for insights, portfolio analytics and AI quality. Migration `0007`.*

**2.1 New D1 tables** (follow the `mi_*` pattern in migration 0004 — extracted columns +
`data` JSON blob, `PRIMARY KEY (user_id, ...)`):

```
property_comps       (user_id, property_id, comp_id, address, postcode, beds, prop_type,
                      tenure, floor_area, price, price_type[sold|asking], price_date,
                      distance_m, source, source_priority, field_sources JSON,
                      confidence, excluded INTEGER, exclude_reason, data JSON)
property_bids        (user_id, property_id, bid_id, amount, at, note, kind[bid|walk|
                      outbid|hammer], over_max INTEGER, override_reason, actor)
property_valuations  (user_id, property_id, at, source[report|ai|market|manual],
                      gdv_conservative, gdv_base, gdv_optimistic, max_bid, total_investment,
                      net_profit, margin, roi, verdict, run_id, data JSON)
property_scenarios   (user_id, property_id, scenario_id, strategy[flip|brr|hmo],
                      name, active INTEGER, locked INTEGER, data JSON)
property_ai_runs     (user_id, property_id, run_id, kind[review|market|report|legal],
                      provider, started_at, finished_at, status, input_hash,
                      output JSON, cost_tokens)
property_legal_facts (user_id, property_id, fact_key, fact_value, confidence,
                      source_doc_key, source_page, extracted_at, confirmed_by, data JSON)
```

**2.2 Write-through, not cut-over.** The property JSON blob remains the source of truth for
render; the new tables are written alongside on every mutation. This preserves every
existing contract and lets Phase 5 (insights) query relationally without a risky migration.
Add a one-off backfill route (`POST /api/properties/backfill-structured`) — per the
`CLAUDE.md` learning that new pipelines never touch old data.

**2.3 Persist the merged comp set (fixes F7).** Move the four-source reconciliation currently
in the Comparables render block into a worker function `resolveComps(property)`. It writes
`property_comps` + a `property.compsResolved` array with per-field `field_sources` and a
`confidence` score. The render block then reads one list. Reuse `addressSimilarity()`
(worker/index.js:2716) — do not write a second matcher. Keep the existing `compOverrides`
and `Enriched` badge behaviour.

**2.4 Valuation history (fixes F9).** Every report parse, AI review and market comparison
appends a `property_valuations` row before overwriting `analytics`. Add a small
"how the numbers moved" sparkline/list to the Costs & GDV tab.

**Acceptance:** `npm test` green; backfill populates all tables for existing properties;
the Comparables tab renders identically but from `compsResolved`; re-parsing a report adds a
valuation row rather than silently overwriting.

---

### PHASE 3 — Strategy engine: Flip / BRR / HMO
*Deal Analysis stays as-is. This adds comparison on top of it, not instead of it.*

**3.1 Generalise the BRR scenario engine.** `property.brr.scenarios[]` gains a
`strategy: 'flip' | 'brr' | 'hmo'` discriminator (default existing scenarios to `'brr'` —
do not rewrite them). `worker/brrCalc.js` gains strategy-specific calc paths sharing the
same cost stack resolver built in 1.1.

**3.2 HMO model (new).** Per-room configuration: room count, room-by-room weekly rent,
communal areas, licensing cost, Article 4 flag, fire/compliance works, void %, management %,
utilities-included flag. Outputs: gross yield, net yield, ROCE, cash-in-cash-out, payback.
Wire the Article 4 / licensing check into the existing `planning` connector where possible.

**3.3 Flip scenario type.** A flip scenario seeded from `analytics` (report GDV + cost stack)
so the same numbers the Deal Analysis tab shows appear as a comparable scenario. **The Deal
Analysis tab's matrix is unchanged and remains the authority for hammer × refurb profit.**

**3.4 Strategy comparison strip.** A new card at the top of the BRR tab (renamed
**"Strategies"**): one row per strategy showing profit / ROI / cash left in / monthly income
at the currently selected hammer price, with the best-by-metric highlighted and a "why"
one-liner. Reads `property_scenarios`.

**Acceptance:** a property with a parsed report shows Flip populated with zero manual input;
adding an HMO scenario with 5 rooms produces yield/ROCE; changing the shared cost stack moves
all three; existing BRR scenarios are untouched and still calculate identically.

---

### PHASE 4 — Documents & legal intelligence
*Turns the vault into structured input.*

**4.1 Legal pack extraction (fixes F12).** On upload of any legal-pack file, queue a worker
job (reuse the `report_jobs` queue pattern from migration 0005) that runs
`env.AI.toMarkdown()` then a structured extraction into `property_legal_facts`:
tenure, lease term remaining, ground rent, service charge, restrictive covenants, easements /
rights of way, arrears, special conditions, completion period, VAT position, tenancies in
situ, access/rights issues. Each fact carries confidence + source doc + a **Confirm / Correct**
control — never auto-trust.

**4.2 Legal facts surface where decisions happen.** A "Legal" card on Overview showing
confirmed facts and unconfirmed extractions; deal-breakers (short lease, restrictive covenant,
arrears) escalate into the existing red-flag list with a `Legal` tag alongside `Report` and
`AI`. Add "Legal pack reviewed" to `getDealReadiness` (App.jsx:2784).

**4.3 Document status model.** Each slot gets `status: missing | uploaded | parsed | reviewed`
plus `reviewedBy` / `reviewedAt`. Drives the readiness checklist and a "what's outstanding"
line on the Documents tab.

**4.4 Per-slot "what this gave us".** Under each uploaded doc, show what was extracted from it
(e.g. Sprift → EPC, floor area; RM Plus → 4 comps enriched; Legal pack → 11 facts). Makes the
upload→insight chain visible.

**Acceptance:** uploading a legal pack produces reviewable structured facts within one job
cycle; confirming a fact updates the readiness checklist; a short lease raises a red flag on
Overview.

---

### PHASE 5 — AI automation & orchestration
*Auto on key events, per AJ's decision.*

#### 5.0 AI route audit — what overlaps and what should merge
*(Added 2026-07-24 after reviewing all six property-scoped AI routes end to end.)*

| Route | Inputs | Outputs | Web search |
|---|---|---|---|
| `/api/ai/deal-review` (5791) | analytics, intelligenceSummary, refurbSummary, comparables, marketComparison, areaStats | summary, riskFlags, strengths, blindSpots, bidGuidance, dealScore, verdict, reportComparison | No |
| `/api/ai/deal-analysis` (5861) | analytics, areaStats, **live web search** | marketSummary, comparables, positioning, confidence | **Yes** |
| `/api/ai/intel-narrative` (6061) | intelligenceSummary, intel.scores, areaStats | headline, summary, riskFlags (severity-tagged), opportunities | No |
| `/api/ai/rental-estimate` (5927) | property + area | rental comps for BRR | Yes |
| `/api/ai/parse-rightmove` (5721) | uploaded doc | extraction, not insight | No |
| `report_jobs` queue (migration 0005) | full property | the 3-stage HTML report on AJ's PC | n/a |

**M1 · Merge `intel-narrative` into `deal-review` — genuine duplication.**
`deal-review` **already receives the complete `intelligenceSummary` payload** (App.jsx
~2336–2352). `intel-narrative` is a second LLM call over a *subset* of the same data,
producing a second `summary` and a second `riskFlags` list that then render in a different
place. Two models, same inputs, two answers that can contradict each other on the same screen.

Fold `opportunities` and severity-tagged `riskFlags` into the `deal-review` schema. Keep the
route alive but as a **mode** (`{ scope: 'intelligence' }`) so it still works pre-report, when
only connectors have run — that's its one legitimate standalone use. Saves one full call per
property on every review.

**M2 · Do NOT merge `deal-analysis` — but enforce its order.**
It is the only route that calls `webSearch()`, and `deal-review` consumes its output when
present (`marketComparison` in the payload). That's a correct dependency, not duplication.
The bug is that the standalone buttons let you run the review *without* the analysis,
silently producing a weaker review with no indication. `runFullReview` (App.jsx:2394) already
does analysis→review in the right order. **Make Full Review the default path**; demote the
individual buttons into the dropdown from 5.3.

**M3 · Unify the risk model — three lists reach the UI today.**
`an.redFlags` (report), `an.aiRiskFlags` (deal-review), and intel-narrative's severity-tagged
flags. The Deal verdict card merges the first two (App.jsx ~5036) and ignores the third.
Move to one shape — `{ text, source: 'report'|'ai'|'intel'|'legal', severity }` — rendered
once, sorted by severity. Phase 4.2's legal flags slot straight in. **Presentation and
assembly only: keep writing `redFlags` and `aiRiskFlags` to their existing disjoint keys per
the `CLAUDE.md` ownership contract.**

**M4 · Unify score presentation — four scoring concepts.**
`an.aiDealScore` (deal quality, 0–100), `intel.scores` (area/due-diligence composites),
`an.bidStrength` (report's bid aggression), and the fake sidebar score being deleted in 1.4.
These measure genuinely different things, so don't collapse them into one number — but show
them as one three-dimensional panel (Deal / Area / Bid) instead of scattered across the
sidebar, verdict card and Intelligence tab.

**M5 · Build the run context once.** All three insight routes independently call
`getAreaMarketStats(env, postcode)` and independently re-clip/re-serialise the same property
JSON. On a Full Review that's 2–3 identical lookups and triple token spend on shared context.
Under auto-triggering it multiplies per property per event. The orchestrator (5.1) must build
one context object per run and pass it to each step.

**5.1 One orchestrator.** `runDealPipeline(propertyId, { reason, steps })` in the worker,
running in dependency order: intelligence → comps resolve → legal extract → AI review →
market comparison. Each step writes a `property_ai_runs` row with an `input_hash` so a step
is skipped when its inputs haven't changed. Returns a single progress stream to the UI.

**5.2 Auto-triggers** (all overridable in Settings):

| Event | Runs |
|---|---|
| Property created with a postcode | intelligence + comps |
| Assessment report uploaded / parsed | AI review + market comparison |
| Legal pack uploaded | legal extraction, then re-run AI review |
| RightMove Plus uploaded | comps resolve (exists) + refresh comp quality |
| Auction ≤ 7 days and any input changed since last run | full pipeline |
| Intelligence > 30 days old (cron) | intelligence refresh only |

Debounce so a burst of uploads triggers one run. Respect the existing rate-limit table
(migration 0006).

**5.3 Header cleanup.** Collapse the five buttons into one primary **"Analyse deal"** with a
dropdown for individual steps, plus a status line ("Reviewed 2h ago · Claude · report + legal
+ 14 comps"). Keeps every existing manual re-run reachable.

**5.4 "What changed" signal.** When an input hash differs from the last successful review,
show a subtle badge on the Deal verdict card: *"Report re-parsed since this review — re-run?"*

**5.5 Feed the AI better inputs.** The AI review prompt should receive `compsResolved`
(Phase 2.3), confirmed legal facts (Phase 4.1), and the strategy comparison (Phase 3.4) —
not just `analytics`. Keep the disjoint-key contract: AI writes only `ai*` keys.

**Acceptance:** creating a property with a postcode auto-populates intelligence and comps
with no clicks; uploading a report auto-runs the review; re-uploading the same file does not
re-spend tokens; every run is visible in `property_ai_runs`.

---

### PHASE 6 — Bidding & outcome tracking
*Fixes F10 and the bid-discipline gap.*

**6.1 Structured bid entry.** Bid Log entries gain `kind` (`bid` / `walk-away` / `outbid` /
`hammer`), `bidder`, and — when the amount exceeds `ourMaxBid` — a **required** override
reason before the entry saves. Writes to `property_bids`.

**6.2 Market Intel cross-reference.** After the auction date passes, match the property to
Market Intel lot results by outcode + address similarity (`addressSimilarity()`), and offer a
one-click "Confirmed sold for £X — record outcome". Only ever from a printed price
(`sold_for` / `sold_prior_for` / `sold_after_for`) — per the `CLAUDE.md` contract,
`last_bid` is never a sale.

**6.3 Result vs prediction.** Extend the existing Won/Lost cards with: our max vs report max
vs hammer, variance %, and — for Lost — "we were £X / Y% short". Persist as a valuation row so
it trends.

**6.4 Structured post-mortem.** Keep the free-text `postMortem` / `declineReason`, add a
short structured layer: primary reason (dropdown), was our GDV right (yes/no/too high/too low),
was our refurb estimate right, would we bid the same again. Enables Phase 7 pattern detection.

**Acceptance:** a bid above max cannot be logged without a reason; a passed auction offers a
one-click confirmed-price fill; the Lost card shows variance vs both our max and report max.

---

### PHASE 7 — Insights, sharing & export
*The payoff from Phases 2–6.*

**7.1 Portfolio insight cards** (dashboard, powered by the new tables): average margin by
outcode, our-max vs report-max drift over time, win rate by auction house, systematic
under/over-bidding by property type, refurb estimate accuracy (estimate vs actual on
completed deals), decline reasons by frequency.

**7.2 Deal sheet export.** One-click PDF/HTML one-pager per property: KPIs, GDV scenarios,
cost stack, top comps with provenance, legal facts, red flags, AI verdict, bid strategy.
Use the `pdf` skill pattern / existing HTML report generator — not pypdf.

**7.3 Shared-state layer.** Per-field change attribution on the sensitive fields
(`ourMaxBid`, `status`, `refurbLevel`, GDV overrides) surfaced in Timeline; an "updated since
you last opened" marker per property using a per-user `lastSeenAt`.

**7.4 Live artifact (optional).** A persistent HTML view of the pipeline that pulls fresh data
each time it's opened — useful for a partner who shouldn't have full CRM access.

---

## PART 5 — SUGGESTED SEQUENCING

| Phase | Effort | Risk | Unblocks |
|---|---|---|---|
| 1 — Fix broken | S | Low | Everything (correct numbers) |
| 2 — Structured data | M | Medium (migration) | 3, 5, 6, 7 |
| 4 — Legal intelligence | M | Low | 5 (better AI input) |
| 5 — AI automation | M | Medium (cost) | Goal: AI insights |
| 3 — Strategies | L | Low | Goal: strategy comparison |
| 6 — Bidding | S | Low | Goal: bid/sold tracking |
| 7 — Insights & export | M | Low | Goal: decision view |

**Recommended order: 1 → 2 → 4 → 5 → 6 → 3 → 7.** Phase 1 alone fixes the most visible
problem (an analysis screen showing no analysis). Phase 3 is the largest single build and
benefits from the cost-stack resolver and structured data landing first.

---

## PART 6 — OPEN QUESTIONS FOR AJ

1. **Cost overrides.** When you manually override a cost that the report also provides, should
   a re-parse (a) keep your override silently, (b) keep it but flag the difference, or
   (c) prompt you? Plan assumes **(b)**.
2. **AI spend.** Auto-triggering means more provider calls. Do you want a monthly token/cost
   ceiling in Settings, and what should happen at the ceiling — stop, or fall back to Workers AI?
3. **HMO depth.** Full room-by-room modelling, or a simplified "N rooms × average rent" first
   pass? Plan assumes full, but simplified is a third of the work.
4. **Legal facts.** Should extraction ever auto-populate a field used in the GDV/cost model
   (e.g. lease years → value adjustment), or always require your confirmation first? Plan
   assumes **always confirm**.
5. **Sold-price feed.** Is Market Intel's coverage good enough for your auction houses to make
   6.2 worthwhile, or should confirmed prices stay fully manual for now?
6. **Who else uses this?** The "shared place" goal implies more than one user. How many, and do
   they need different permissions (e.g. read-only on `ourMaxBid`)?
7. **Intelligence narrative (M1).** Confirm you're happy for the standalone intelligence
   summary to become part of the AI review output rather than its own separately-run block —
   it would still be available pre-report via the scope flag.
8. **Refurb quotes (1.2).** When accepted quotes cover only some trades, should the Total show
   quoted + estimated blended, or hold the full estimate until every trade is quoted? Plan
   assumes blended with an explicit "3 of 9 trades quoted" label.
