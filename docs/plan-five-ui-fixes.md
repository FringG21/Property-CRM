# Property CRM — Five UI/Data Fixes (for Sonnet)

## Context
Ashley reported five separate pain points while using the CRM day-to-day. This plan
turns each into a scoped, low-risk change. **Everything except issue 5 is frontend
(`src/App.jsx`); issue 5 is worker-side (`worker/index.js`).**

Follow the repo's change discipline in `CLAUDE.md`:
- Read each function fully before editing it.
- Do **not** remove/rename existing fields, keys, or props. Only add/adjust what's needed.
- Inline styles + `isMobile`/`isTablet` ternaries only — no CSS classes/media queries.
- After changes: `npm run build`, then (once verified) `npx wrangler deploy`.

Clarified scope from Ashley:
- Issue 1 "wasted white space on the property deal" = the **kanban card padding** (cards on the board), *not* the property detail view. Reduce padding so more cards fit.
- Kanban scroll behaviour = **each column scrolls its own cards** (column headers stay pinned).
- Auction-date fix = **better parsing only** (no manual-edit field).

---

## Issue 1 — Kanban board: make columns scroll + tighten card padding
**File:** `src/App.jsx`, kanban block `pipelineView === 'kanban'` (lines ~6388–6468).

Two parts:

### 1a. Each column scrolls its own card list (headers pinned)
Currently the board container (line 6389) has only `overflowX: 'auto'` (no bounded height), columns (line 6414) have no height cap, and the whole thing grows inside the shared per-tab scroll region (line 5986) — so the page scrolls, not the board.

Fix locally (do **not** touch the shared scroll region at 5986 or other tabs):
- Inside each column (the block at 6414), the **header** (6415–6429) stays as-is (pinned).
- Wrap the card area — the `Empty` placeholder (6432) and the `stageProp.map(...)` cards (6433–6461) — in a new scroll wrapper:
  `<div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: isMobile ? 'calc(100vh - 340px)' : 'calc(100vh - 300px)' }}>`
  (Tune the offset so the tallest column scrolls internally while the toolbar/filter bar above stays visible. The exact px offset should be verified in the browser — see Verification.)
- Keep the existing `gap: '8px'` that the column currently supplies; move it to the wrapper so cards keep their spacing.
- Leave the collapsed-column path (48px) untouched.

### 1b. Reduce card padding so more fit
The card `<div>` at line 6442 uses `padding: '10px'` and several internal margins. Tighten:
- Card padding `'10px'` → `'7px 9px'`.
- Line 6444 header row `marginBottom: '2px'` → `'1px'` (leave as-is if already tight).
- Line 6448 source line `marginBottom: '5px'` → `'3px'`.
- Line 6449 guide-price line `marginBottom: '4px'` → `'2px'`.
- Line 6456 delete-row `marginTop: '4px'` → `'2px'`.
Keep font sizes ≥10px (labels) per CLAUDE.md; these are already at the floor, so do **not** shrink fonts — only padding/margins.

---

## Issue 2 — Property from triage opens a "general page", not the specific lot
**File:** `src/App.jsx`. Root cause found in `sendLotToPipeline` (1866–1875) and the three listing buttons (3505–3509, 3554–3558, 3938–3942), all of which read only `currentViewProperty.listingUrl`. If the triage lot's `lotUrl` was empty or a non-specific URL at promotion time, the property has no/general link. The property does store `sourceLotId` (e.g. `scr-ah_sy-<numericId>`) and `sourceOrigin`, but nothing reconstructs a lot URL from it.

Fix (additive, no field removal):
1. Add a small resolver near the other property helpers, e.g.:
   `const lotLinkFor = (p) => p?.listingUrl || reconstructLotUrl(p);`
   where `reconstructLotUrl` derives the specific Auction House lot URL from `sourceLotId` when origin is scraped — mirror the existing pattern in `src/views/MarketIntel.jsx:483-484`
   (`https://online.auctionhouse.co.uk/lot/redirect/<numericId>`), extracting `<numericId>` from `sourceLotId` via `String(sourceLotId).match(/(\d+)$/)`. Return `''` if it can't build one.
2. In the three listing buttons, replace the `currentViewProperty.listingUrl` guard/href with `lotLinkFor(currentViewProperty)` (compute once into a `const` at the top of the canvas render). Buttons render only when it's truthy — same as today.
3. In `sendLotToPipeline` (1868), keep `listingUrl: lot.lotUrl || ''` but ensure the specific lot URL is preferred: if `lot.lotUrl` is falsy, fall back to the reconstructed URL from `lot.id` at promotion so `listingUrl` is populated for new promotions too.

No new "amend" UI is required — the reconstruction covers existing and future triage properties. (There is currently **no** amend action on the triage page; do not add one unless Ashley later asks.)

---

## Issue 3 — Comparables tab: show the sold DATE clearly
**File:** `src/App.jsx`, comparables block (3953–4083). The date already flows through (`transactionDate` → `date`/`soldDate`) and is rendered as tiny grey sub-text under the price (line 4072). Problems are presentational: the header calls the **price** column "Sold" (4037), there's no dedicated Date column, and LR/manual dates are truncated to `YYYY-MM` (lines 4000, 4007).

Fix:
- Add a dedicated **Date** column. Change the grid template (header 4036 and rows 4055) from `'1fr auto auto'` to `'1fr auto auto auto'`, and add a `Date` header cell (4037) plus a per-row date cell (near 4070–4073) showing the full date.
- Stop truncating: at line 4000 use `date: item.date || ''` (full date, drop `.slice(0,7)`); at line 4007 use `date: (c.soldDate || c.date) || ''`. Report comps (3995) already keep the full date.
- Keep the price cell (4071) as the price; remove the now-redundant grey date sub-line (4072) since the date has its own column. Format the date cell consistently (e.g. `en-GB`), guarding empty values with `'—'`.
- Verify the PDF/print export (line ~2080) still reads `c.soldDate || c.date` — no change needed there.

---

## Issue 4 — Remove the redundant Notes section from the Intelligence tab
**File:** `src/App.jsx`, lines **4294–4351** (comment `Row 3 — Notes …`), inside the intel block. It is a full duplicate composer + recent-notes list bound to the same `notesList` field and `handleAddPropertyNote` handler used by the dedicated **Notes tab** (5137–5211) and the Deal-Analysis notes block (4865–4940).

Fix:
- Delete the `Row 3 — Notes` block (4294–4351) only. No data loss — notes live on `property.notesList` and remain in the Notes tab. Do **not** touch `handleAddPropertyNote`, `noteText/noteType/noteAuthor` state, or the other two notes surfaces.
- Confirm the surrounding intel block still closes correctly (the block ends at 4353–4355).

---

## Issue 5 — "36 Victoria Road" auction date shows as unknown (better parsing)
**File:** `worker/index.js`. Auction House lots get their date from `enrichLotFromDetailPage` (1105–1140), which matches only `closing on dd/mm/yyyy` / `Bidding Opens dd/mm/yyyy` then falls back to `extractAuctionDate` (966–975). For this lot the current regexes miss it. The parent auction URL embeds the date: `…/online/auction/2026/8/4` = 4 Aug 2026.

Fix — broaden parsing (best-effort, additive):
1. **Handle single-digit day/month.** The `dd/mm/yyyy` regexes require two digits. Loosen `\d{2}` → `\d{1,2}` (pad on output) in:
   - `enrichLotFromDetailPage` lines 1110–1111,
   - `extractAuctionDate` line 972,
   - `parseListingPage` line 513 (`d2`).
2. **Parse the date from a linked auction URL.** In `enrichLotFromDetailPage`, after the existing checks and before returning, if `!lot.auctionDate`, scan the fetched `html` for `/auction/(\d{4})/(\d{1,2})/(\d{1,2})` and, if found, set `lot.auctionDate = ${yyyy}-${mm.padStart2}-${dd.padStart2}`. This is the reliable path for Auction House online lots like this one.
3. Leave the `'tbc'`/`'—'`/`'Date TBC'` display fallbacks alone — once parsing populates the date, they resolve on their own.

Note: report-only imports still won't get an auction date (the report parser never extracts one) — out of scope for "better parsing only". If this property was imported via a report rather than a scraped lot, re-import it from the auction URL after deploy.

---

## Build, verify, deploy

1. **Build:** `npm run build` (chunk-size warning is expected/harmless).
2. **Worker dry-run** (issue 5 touched the worker): `npx wrangler deploy --dry-run --outdir .wrangler-dryrun`.
3. **Browser verification** (use the preview tools — dev server, not manual):
   - **Kanban:** open the Pipeline → Board. Confirm the toolbar/filter bar stays put while a tall column scrolls internally; check at 375px (mobile → table view still fine), 768px, 1280px. Confirm cards look tighter and more fit per column.
   - **Triage link:** open a property that came from auction triage; the listing button should open the specific lot page. Spot-check one with an empty `listingUrl` to confirm the reconstructed URL works.
   - **Comps:** open a deal with Land Registry comps; confirm a dedicated Date column shows full sold dates (not `YYYY-MM`, not buried under price).
   - **Intel tab:** confirm the notes composer is gone from Intelligence and notes still appear/post in the Notes tab.
   - **Auction date:** re-scrape the 36 Victoria Road lot URL (`https://online.auctionhouse.co.uk/lot/details/483bc615-…`) and confirm the date resolves to 2026-08-04 instead of unknown/blank.
4. **Deploy:** `npx wrangler deploy`. Commit atomically (check `git status` first) so `main` reflects what's live.

## Critical files
- `src/App.jsx` — kanban (6388–6468), listing buttons (3505/3554/3938) + `sendLotToPipeline` (1866), comps (3953–4083), intel-notes block (4294–4351).
- `worker/index.js` — `enrichLotFromDetailPage` (1105–1140), `extractAuctionDate` (966–975), `parseListingPage` date block (509–515).
- Pattern reference: `src/views/MarketIntel.jsx:483-484` (lot redirect URL).
