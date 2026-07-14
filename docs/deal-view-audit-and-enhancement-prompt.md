# Property Deal View — Audit & Enhancement Prompt

## Purpose

AJ wants the single-property deal view (the full canvas you land on when you open a
property — all tabs: Overview, Comparables, Intelligence, Deal Analysis, Documents,
Tasks, Notes, Timeline, Bid Log) to be the most effective screen for reviewing a deal
at every stage: researching it, prepping a bid, tracking a live auction, and recording
the outcome (won / lost / passed). This document audits what's there today, flags
duplication, lists gaps, specifies stage-flexibility, and specifies the RightMove Plus
↔ Land Registry comparable-enrichment feature. The appendix is a ready-to-use
implementation prompt.

Scope: **the per-property canvas only** (`propCanvasTab` render block in `src/App.jsx`,
~lines 3740–5500+). The separate top-level portfolio-wide "Deal Analysis & Scenario
Matrix" tab (`activeTab === 'dealanalysis'`, ~line 8902) is out of scope for this round
— noted below only where it collides in naming.

---

## 1. Current state (as it exists in the code today)

**Tabs** (`src/App.jsx` ~3746–3755): Overview, Comparables, Intelligence, Deal Analysis
(`financials`), Documents, Tasks, Notes, Timeline, Bid Log.

**Document upload slots** (~3505–3508) — only four exist:
`mainReport` (Assessment report), `sprift` (Sprift report), `legalPack`, `surveyReport`.
**There is no RightMove Plus upload slot today.**

**Comparables come from three unconnected sources**, merged loosely in the UI, not in
the data:
- Land Registry (`intel.connectors.landRegistry`) — has sold price + sold date, no
  bedroom count.
- Manually-added comps (`currentViewProperty.comparables`).
- Report-parsed comps (`an.compsList`, from the uploaded assessment report).
- AI "Market comparison" comps (`an.dealAnalysisComparables`, from the AI deal review).

There's already a working address-matching pattern to build on:
`addressSimilarity()` (worker/index.js:2716) and `enrichCompsWithEPC()`
(worker/index.js:2728) — used today to cross-reference Land Registry comps against EPC
records by address similarity. The RightMove Plus feature (Part 4) should reuse this,
not invent a new matcher.

**Bid tracking fields already exist**: `bidLog[]`, `lotOutcome`, `lotSalePrice`,
`outbidPrice` — the Overview tab already renders different cards depending on whether
`st === 'Lost'` (~4638) vs `['Won','Refurb','For Sale','Completed'].includes(st)`
(~4716) vs still live (~4592). So some stage-adaptivity already exists — this work
extends and fills it out rather than building from zero.

**Field-ownership contracts are already documented in `CLAUDE.md`** — report-owned
(`reportSummary`, `redFlags`, and the whole `reportFields` whitelist) vs AI-owned
(`aiSummary`, `aiRiskFlags`, `aiStrengths`, `aiDealScore`, `aiReportCrossCheck`, etc.)
are deliberately disjoint so a report re-parse never wipes an AI review. **Any change
below must preserve this separation** — do not add new keys to `reportFields` unless
they come from `parseFullReportAnalytics`, and do not merge AI-owned keys back into it.

---

## 2. Duplicate / redundant content to resolve

### 2a. Freeform notes field on the Deal Analysis tab (confirmed by AJ)
AJ has flagged a freeform notes input that sits on the Deal Analysis (`financials`)
screen itself, separate from the property's dedicated **Notes** tab. I was not able to
pin this to an exact line in this pass — before removing anything, the implementer must:
1. Grep the `financials` tab render block (search `propCanvasTab === 'financials'`,
   currently ~4819–5311 in `src/App.jsx`) for any `<textarea>` or notes-labelled input.
2. Confirm what state/field it writes to (e.g. is it writing into `notesList`, a
   one-off `dealNotes` field, or nothing persisted at all).
3. **Read that function in full before touching it** (per CLAUDE.md). If it writes to
   a field nothing else reads, it's safe to delete the input and, separately, decide
   whether to also drop the now-dead field. If it silently duplicates writes into
   `notesList`, just remove the redundant UI, not the data path.
4. If in doubt, ask AJ rather than guess — this is exactly the "stop and ask" case
   CLAUDE.md calls out for anything touching more than the requested area.

### 2b. Report summary / AI review / AI cross-check — not a true duplicate, but reads as one
These are three separate cards (Overview tab, ~4203–4309): the report's own summary,
the AI deal review (score, verdict, risk flags, strengths, blind spots), and the AI's
explicit agree/disagree cross-check against the report. **CLAUDE.md explicitly
forbids merging these** (disjoint ownership so re-parsing a report never wipes an AI
review). So the fix here is presentational, not structural: consider consolidating
into a single "Deal narrative" card with tabs/accordion (Report / AI review / vs
Report) so it doesn't read as three stacked walls of text, without touching the
underlying data contract.

### 2c. Naming collision: "Deal Analysis" exists twice
The per-property `financials` tab is labelled "Deal Analysis" (3750), and there's a
*separate* top-level portfolio tab also labelled "Deal Analysis" (509, "Deal Analysis
& Scenario Matrix"). Out of scope to change this round, but flagging it because it's
likely part of what reads as confusing/duplicated. Worth a future rename (e.g.
per-property tab → "Scenario & Bid" or similar) once the portfolio tab is in scope.

---

## 3. Gaps — things the view doesn't currently do

1. **Deal readiness checklist.** No single glance answer to "is this deal ready to
   bid?" — report uploaded, survey booked/received, legal pack reviewed, AI review
   run, comps sufficient. A small checklist/progress card at the top of Overview
   would let AJ triage at a glance across the pipeline, not just within one deal.

2. **Post-mortem / lessons-learned on Lost or Passed.** `lotOutcome` +
   `lotSalePrice` capture the *result*, but nothing captures *why* — e.g. "outbid by
   how much and by how much margin were we off," or for Passed/Declined deals, "why
   didn't we bid." Without this, patterns (systematically underbidding a category,
   or correctly avoiding a type of deal) never get surfaced. This is also valuable
   input to the separate Market Intel scoring module later, even though wiring that
   up is out of scope here.

3. **Bid-day mode.** Right now the same Overview renders whether you're three weeks
   out or the auction is live today. A lightweight "today's the day" state (using
   the existing `daysLeft <= 0` check already in the code, ~4533) could promote the
   walk-away/target/stretch bid card and a quick bid-log entry form to the very top,
   above everything else — instead of it being one card among many.

4. **Data staleness indicators.** Intelligence connectors store `fetchedAt`
   per-connector, but nothing in the UI flags "this planning/EPC/police data is 40
   days old — refresh before bidding." Cheap add given the data's already there.

5. **Comparable data-quality indicator.** With comps coming from four different
   sources with different completeness (Land Registry has no beds; manual comps may
   be missing sold date), a simple "3 of 5 comps have full data" indicator on the
   Comparables tab would tell AJ how much to trust the derived GDV, and doubles as
   the motivation for Part 4 below.

6. **Guide price / valuation history.** If a report gets re-parsed or the AI review
   re-run, the latest values simply overwrite (`aiReviewedAt` implies last-run-wins).
   No trail of how the numbers moved deal-to-deal. Possibly a "future" item rather
   than this round — flagging for AJ to decide priority.

---

## 4. RightMove Plus ↔ Land Registry comparable enrichment (AUTO, per AJ's decision)

**Trigger:** on upload of a RightMove Plus PDF to a property. This requires adding a
new upload slot — there is currently no document key for it (only `mainReport`,
`sprift`, `legalPack`, `surveyReport` exist at ~3505–3508). Add
`{ key: 'rightmovePlus', label: 'RightMove Plus report', accept: '.pdf,.html,.htm' }`
alongside the existing four, following the exact same upload/parse pipeline pattern
already used for `mainReport`/`sprift` — do not invent a new pipeline.

**Parse fields from the RightMove Plus document:** address, bedrooms, property type,
tenure, floor area (where present), asking/listed price, and sold history if RM Plus
includes it. Use `env.AI.toMarkdown()` for text extraction per the existing pattern
documented in CLAUDE.md's Cloudflare deployment learnings (no Tesseract/Puppeteer/
Python — those don't run in the Workers runtime).

**Matching:** reuse `addressSimilarity()` (worker/index.js:2716) — the same function
`enrichCompsWithEPC()` already uses to match Land Registry ↔ EPC. Match each
RightMove Plus listing against:
- existing comps in `comparables` / `an.compsList` (fill gaps), and
- Land Registry items in `intel.connectors.landRegistry.data.items` (pull sold
  price/date where RightMove Plus has no sale recorded — RM shows *asking* price,
  Land Registry shows *actual sold* price, so LR sold data should take priority for
  price/date when both exist for the same address).

**Merge rule — backfill only, never clobber:** if a comp already has a bedroom count,
tenure, or sold date from a higher-trust source, don't overwrite it. Fill only the
fields that are currently empty/null. This mirrors the "never remove or rename
existing fields" discipline in CLAUDE.md, applied to data as well as schema.

**Provenance:** tag each backfilled field with its source, following the existing
`source` pattern already on comp records (e.g. `'Land Registry'` is already used at
worker/index.js:818, 939). A comp enriched from multiple sources should show which
field came from where — e.g. sold price/date from Land Registry, beds/tenure from
RightMove Plus — so AJ can trust or challenge individual fields rather than the
whole row.

**Surface in the Comparables tab:** an "Enriched" badge on comps that gained data
this way, and roll it into the data-quality indicator from Gap 5 above.

**Do not** touch `reportFields` or `parseFullReportAnalytics` for this — RightMove
Plus data is comps enrichment, not report analytics, and must stay out of that
whitelist per the report-vs-AI ownership rule in CLAUDE.md (this is a third,
independent data source, not a report and not an AI review).

---

## 5. Stage flexibility

The view should adapt to where the deal actually is, using fields that already exist
(`status`/`st`, `daysLeft`, `lotOutcome`, `bidLog`) rather than inventing a new stage
field.

| Stage | Detected by | Should surface prominently | Should collapse/de-emphasise |
|---|---|---|---|
| Researching | Early status, no report yet | Deal readiness checklist (Gap 1), upload prompts, comps/intelligence | Bid strategy card, bid log |
| Bid prep | Report uploaded, `daysLeft` > 0 | GDV matrix, walk-away/target/stretch bid, AI review, comps quality | Post-mortem fields (N/A yet) |
| Live tracking (bid day) | `daysLeft <= 0`, status still active | Bid-day mode (Gap 3): bid card + quick bid-log entry pinned to top | Long-form report/AI narrative — still reachable but not first thing shown |
| Won | `lotOutcome` = won / status in Won/Refurb/For Sale/Completed | Result vs prediction (already exists ~4716), next steps (survey, legal) | Comps/matrix become reference-only |
| Lost | `status === 'Lost'` | Result vs target bid, variance, **post-mortem note (Gap 2)** | Bid strategy inputs (decision's made) |
| Passed / chose not to bid | Status set to Passed/Declined (check exact status values in the pipeline stage list before implementing — confirm with AJ if this status doesn't already exist) | **Decline reason (Gap 2)**, so it's searchable later | Everything bid-related |

**Open question for AJ:** does a "Passed / declined" status already exist in the
pipeline stage list, or does this need to be added as a new status value? Check the
kanban/pipeline stage config before implementing — CLAUDE.md's discipline says don't
add a new field/status without confirming it's actually missing.

---

## 6. Open questions before implementation

1. Where exactly is the freeform notes field on the Deal Analysis tab (2a) — can't
   be scoped until located and read in full.
2. Does a "Passed/Declined" pipeline status already exist, or is it net-new?
3. Priority order — Which of Gaps 1–6 and Part 4 (RightMove Plus enrichment) does AJ
   want first? Part 4 is the largest single piece (new upload slot + worker parsing +
   matching + UI).
4. Should the "Deal narrative" consolidation (2b) happen now or wait — it's a pure
   presentation change with no data risk, so it could be bundled with anything else.

---

## Appendix — Implementation prompt (ready to use)

Copy the block below when you're ready to have this built. It's scoped to be handed
to Claude Code / an implementing agent directly.

> Follow `CLAUDE.md`'s change discipline exactly: read each function in full before
> editing, never remove or rename existing fields/keys/params, and stop and ask if a
> change needs to touch more than what's listed here.
>
> Implement, in this order, confirming with me between each numbered item before
> moving to the next:
>
> 1. **Locate and fix the duplicate notes field** on the Deal Analysis (`financials`)
>    tab in `src/App.jsx` — read the full `propCanvasTab === 'financials'` block
>    first, tell me what you find and what it currently writes to, before changing
>    anything.
> 2. **Add the RightMove Plus upload slot and auto-enrichment pipeline**: new
>    `rightmovePlus` document key (~3505–3508 pattern), worker-side parsing via
>    `env.AI.toMarkdown()`, matching via the existing `addressSimilarity()` /
>    `enrichCompsWithEPC()` pattern (worker/index.js:2716, 2728) against both
>    existing comps and Land Registry items, backfill-only merge (never overwrite
>    populated fields), source provenance per field, "Enriched" badge + data-quality
>    indicator on the Comparables tab.
> 3. **Deal readiness checklist** at the top of the Overview tab.
> 4. **Bid-day mode**: when `daysLeft <= 0` and the deal is still live, promote the
>    bid strategy card + a quick bid-log entry form above everything else on
>    Overview.
> 5. **Post-mortem / decline-reason capture**: a short free-text (or structured)
>    field shown only when `status === 'Lost'` or Passed/Declined, alongside the
>    existing outcome fields.
> 6. **Data staleness indicators** on the Intelligence tab, using each connector's
>    existing `fetchedAt`.
> 7. **Deal narrative consolidation**: merge the Report summary / AI review / AI
>    cross-check cards into a single tabbed/accordion card on Overview — presentation
>    only, must not change what data is stored under `reportSummary` / `aiSummary` /
>    `aiReportCrossCheck` etc.
>
> After each item: verify at 375px / 768px / 1280px per the responsive checklist in
> CLAUDE.md, `npm run build`, and hold deploy until I've reviewed the diff.
