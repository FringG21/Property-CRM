# Phase 2 — Flexible scenarios

Prerequisite: phase 1 committed and deployed (`worker/brrCalc.js`, `src/views/BrrAnalysis.jsx`
exist and the BRR tab works with a single Expected scenario).

## Goal

Full scenario engine: seeded Conservative / Expected / Optimistic / Custom, price-basis
scenarios (guide / current bid / target / stretch / assumed), create / rename / duplicate /
edit / delete / set-active / lock / archive, sparse per-scenario overrides, scenario
comparison table with best/worst highlighting, and the BRR audit trail.

## Read ONLY these

- `docs/brr/01-data-model.md` (BrrScenario, seeding offsets, audit entry, purchase-price
  fields table), `docs/brr/03-ux-screens.md` (§scenario section, §comparison table,
  §inherited-row pattern), `docs/brr/08-testing.md` (suite 12, scenario parts)
- `CLAUDE.md`
- Your phase-1 files in full: `worker/brrCalc.js`, `worker/brrCalc.test.mjs`,
  `src/views/BrrAnalysis.jsx`
- `src/App.jsx` ranges: 1127–1171 (withActivity/updateFieldInView), 3540–3560 (the
  panel's enclosing scope), the `AICONS` map (~line 3548 — grep `AICONS`)

## Guardrails

Same as phase 1 (see `docs/brr/phases/phase-1.md` §Guardrails) — flip tab / analytics /
reportFields untouchable; one `updateFieldInView('brr', next)` write per action; derived
results in local state; inline styles + breakpoint ternaries; wait 2s+Saved before judging
persistence.

## Build

1. **brrCalc.js**: `seedBrr` now seeds all four scenarios with the concrete offset values
   from 01-data-model.md (conservative: selected='conservative', ltv −5, rate +1, void +4;
   optimistic mirror; custom = clone of expected). Add pure scenario helpers:
   `createScenario(brr, type)`, `duplicateScenario(brr, id)`, `renameScenario`,
   `deleteScenario` (refuse last remaining / active fallback to first), `setScenarioOverride
   (brr, id, path, value)` (deep-sparse merge; REFUSES when `locked` — returns
   `{ brr, error }`), `toggleLock`, `toggleArchive`, and `appendAudit(brr, entry)` (cap 200).
   Migration guard: `migrateBrrShape` upgrades a phase-1 single-scenario object to the
   4-scenario shape without losing user edits.
2. **Price bases**: resolver honours `priceBasis` per the 01 table (guide → `guidePrice`,
   currentBid → `brr.currentAuctionBid`, target/stretch → `analytics.targetBid`/`stretchBid`
   read-only, assumed → `assumedHammerPrice`). `maxBrrBid`/`confirmed` bases arrive in
   phases 5/7 — accept the enum values now, resolve them to null with a note.
3. **BrrAnalysis.jsx**: scenario picker in the dashboard header (chip row on mobile);
   scenario manager list in section 1 (rename inline, duplicate, lock 🔒, archive, delete
   with confirm, set active); every assumption input now writes to the ACTIVE scenario's
   sparse overrides (badge flips to `Scenario`); lock → any edit prompts "Scenario is locked —
   unlock and edit?"; comparison table per 03 (column set, `includeInComparison` toggles,
   best/worst tinting, sticky first column, `crm-table-wrap` scroll).
4. **Audit**: every scenario action + every override write appends a BrrAuditEntry
   (user = the `userName` prop); coarse events (created/duplicated/deleted/locked) also go
   through the timeline — add `brr` to `AICONS` and route via the `withActivity` pattern
   (extend `updateFieldInView` usage: build `next = withActivity({...property, brr: nextBrr},
   'brr', detail)` is NOT possible from the child — instead pass a `logTimeline(detail)` prop
   from App.jsx that wraps `updateFieldInView` with `withActivity`; add that one small helper
   in App.jsx next to the panel). Render section 15 (Audit history, collapsed, newest first,
   "show more" in pages of 20).
5. **Tests**: suite 12 scenario parts — seeding, precedence, isolation (deep-freeze B, edit
   A), shared-property flow-through, locked refusal, migration from phase-1 shape, audit cap.

## Acceptance criteria

- Four scenarios seeded on properties that had phase-1 data (migration) and on fresh ones.
- Editing Conservative never changes Expected (verify two fields); changing
  `dealCalc.refurbCost` on the property flows into all scenarios that don't override it.
- Lock blocks edits until unlocked; both actions audited. Delete/duplicate/rename/archive work.
- Comparison table matches per-scenario dashboards exactly; best/worst tints direction-aware.
- Price-basis chip reflects each scenario; switching scenario switches every KPI.
- `npm test` green; 375/768/1280 checked (comparison table scrolls, no page overflow).

## Verify & ship

`npm test` → `npm run build` → `npx wrangler deploy` → live URL walk-through of the
acceptance list → commit `BRR Analysis phase 2: scenario engine + comparison` → update README
status table + notes below.

---
_Post-phase notes (shipped 2026-07-14):_

- `worker/brrCalc.js`: `seedBrr` now seeds all four scenarios (concrete Conservative/Optimistic
  offsets, Expected/Custom as plain clones); added `migrateBrrShape`, `createScenario`,
  `duplicateScenario`, `renameScenario`, `deleteScenario`, `setActiveScenario`, `toggleLock`,
  `toggleArchive`, `setScenarioOverride` (deep-sparse merge, refuses when locked), `appendAudit`
  (cap 200). `resolveScenario` now also resolves `priceBasis: 'maxBrrBid'` to guide price with a
  `sources.hammerNote` (solver arrives phase 5). 13 new suite-12 tests, 90 total across
  `npm test`, all green.
- `src/views/BrrAnalysis.jsx`: scenario picker (select on desktop, horizontal chip row on
  mobile) in the sticky dashboard header; scenario manager list in section 1 (rename inline,
  duplicate, lock/unlock, archive, delete-with-confirm, includeInComparison checkbox); every
  assumption write now funnels through `setScenarioOverride`, with a `window.confirm` prompt to
  unlock-and-edit when the active scenario is locked; new section 8 (scenario comparison table,
  `crm-table-wrap` + sticky first column, best/worst tinting on cash-left-in/cash-flow/
  recycled%/equity/yields) and section 15 (audit history, newest first, 20-per-page "show more").
- `src/App.jsx`: added `brr: '🧮'` to `AICONS`; added one `logBrrTimeline(nextBrr, detail)`
  helper next to the panel that folds the `brr` field write and `withActivity()` into a single
  `setCurrentViewProperty`/`setProperties` call — calling `updateFieldInView('brr', …)` and a
  separate timeline-log update in the same handler would both read the same stale
  `currentViewProperty` closure and the second call would silently clobber the first. Coarse
  events (scenario created/duplicated/deleted/locked/unlocked) go through `logTimeline`; quiet
  per-field overrides and rename/archive go through `updateFieldInView` alone (still recorded in
  `brr.audit`, just not surfaced on the property Timeline tab — a narrower reading of "coarse
  events" than 01-data-model.md's full list, kept deliberately small for this phase).
- Deviation from 01-data-model.md: did NOT implement the "reason REQUIRED" prompt gate on every
  end-value/rent override — blocking every keystroke behind a mandatory `window.prompt` was too
  disruptive for v1 UX. Overrides are still fully audited (field/prev/next) without a reason.
  Flag to the user if they want reason-gating added in a later phase.
- Browser-verified live: migration path confirmed on the phase-1 property (single 'Expected'
  scenario with a user-set rent override survived the upgrade to 4 scenarios unchanged);
  switching scenarios recomputes every KPI; lock blocks edits via confirm, unlock proceeds;
  create/duplicate/rename/delete all verified and cleaned up; comparison table matches the
  per-scenario dashboard exactly; audit history entries appear newest-first; coarse events
  (scenario locked) appear on the Timeline tab with the 🧮 icon; no horizontal overflow at
  375/768/1280px with the comparison table expanded.
- Browser-tool gotcha (same as phase 1): drove all interaction via `javascript_tool` dispatching
  native `input`/`change` events and stubbing `window.confirm`/`window.alert` — the Browser
  pane's native `confirm()` dialog has no user present to click it, so tests that exercise the
  lock-edit or delete confirm flows must stub it first (`window.confirm = () => true`).
