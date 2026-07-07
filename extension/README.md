# Property CRM — Browser Extension

Capture **properties, contacts, companies/builders, notes and tasks** into the Property CRM
straight from the page you're looking at. Click the toolbar button → it reads the page,
pre-fills the right form, warns on duplicates → you confirm → it saves. No copy-paste.

Lives inside the main CRM repo (`property-crm/extension/`). It's plain static files and does
**not** participate in `npm run build` or `wrangler deploy`.

## Install (unpacked, private)

1. In the CRM, go to **Settings → Integrations → Browser Extension** and click
   **Generate extension token**. Copy it.
2. Open `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.
4. Click the extension's toolbar icon, paste the token, hit **Connect**. Done (valid 90 days).

## What it captures

| Type | Where it shines | Lands as |
|---|---|---|
| **Property** | Rightmove, Zoopla, the six tracked auction houses; generic fallback elsewhere | Pipeline, stage `Sourced` |
| **Contact** | Estate-agent block on a listing, a LinkedIn profile, a Gmail message | Contacts (optionally linked to a company) |
| **Company/Builder** | A builder's site, or a Companies House page (adds company number + registered address) | Companies (Builder type reveals trade specialisms / day rate / lead time / labour type) |
| **Note** | Highlight any text on any page first — it becomes the note body | Attached to a chosen property/contact/company |
| **Task** | Any page — title pre-filled | Tasks, optionally linked to a record |

The popup auto-detects the page type and pre-selects the tab; you can override it. Every entity
is duplicate-checked before saving (property by address/postcode/URL, contact by email, company by name).

## Phase 2 — due-diligence + two-way CRM

- **Area-intelligence overlay** — an "🏠 Area intel" button on listing pages runs
  `/api/intelligence/run` for the postcode and shows EPC, flood risk, planning, crime, schools,
  Land Registry comps and HPI in a floating panel (`content/overlay.js`). A "Preview area intel"
  button in the popup does the same inline.
- **Auto-enrich on save** — after a property is saved, the extension runs the intelligence
  connectors and merges the results (lat/lng, EPC, Land Registry `comparables`,
  `property.intelligence`) exactly as the in-app "Run intelligence" does, then re-ingests. Captured
  properties land fully enriched.
- **Media & documents** — on save it can capture a screenshot of the listing and grab photos,
  floorplan, EPC image and any legal-pack PDF into the property's documents (R2). Cross-origin CDNs
  without a host permission are skipped; the tab screenshot always works.
- **"In CRM" badges** — `content/badges.js` marks Rightmove/Zoopla search results and listing pages
  already in your pipeline (matched by listing URL), showing the stage.
- **Omnibox** — type `crm <query>` in the address bar to search properties/contacts/companies.
- **Post-save actions** — push the auction date to Google/Outlook calendar
  (`/api/calendar/*/event`), and one-click "also add listing agent + agency" (linked).

## How it works

- **`background.js`** — service worker; the *only* code that talks to the API. Holds the pairing
  token (`chrome.storage.local`). Because requests go through the background worker with
  `host_permissions`, no CORS handling is needed on the worker. Owns intelligence, media upload,
  calendar and omnibox.
- **`content/extract.js`** — a single self-contained function injected on demand via
  `chrome.scripting.executeScript`. Reads the rendered DOM (site address selectors → JSON-LD →
  cleaned OpenGraph → visible-text regex) and returns `{ kind, fields, media, agent, … }`.
- **`content/overlay.js` + `content/badges.js`** — declarative content scripts on the listing
  sites (needs the listing-site `host_permissions`) for the overlay and pipeline badges.
- **`popup/`** — per-entity form, dedupe, save to `/api/ingest/:entity`, and post-save actions.

## Backend endpoints used

- `POST /api/auth/extension-token` — mint the 90-day pairing token (from CRM Settings).
- `POST /api/ingest/:entity` — single-record upsert (`properties|contacts|companies|surveyors|globalNotes|tasks`).
- `POST /api/intelligence/run` — area intelligence (overlay + auto-enrich).
- `POST /api/intelligence/duplicate-check` — property dedupe (loads your list server-side).
- `POST /api/documents/upload` — media/legal-pack files → R2.
- `POST /api/calendar/{google,microsoft}/event` — push auction dates to a calendar.
- `GET /api/crm-data` — company-link dropdowns, dedupe, badges, omnibox.

## Configuration

The CRM base URL is set in `background.js` (`API_BASE`). Change it there if you deploy elsewhere.

## Maintenance notes
- Not built or deployed by the app toolchain — reload it in `chrome://extensions` after any
  change. A manifest permission change (new host) triggers a re-accept prompt.
- Deploy coupling: its worker routes must be live, and `npx wrangler deploy` ships the worker +
  the whole frontend together — check `git status` first (see root CLAUDE.md).
- Record shapes are a contract — `popup.js` `save()` must match the SPA entity shapes
  (property mirrors src/App.jsx ~1780; task `dueDate`/`status:'not_started'`; capitalised
  `targetType`/`linkedType`).
- Address selectors need live confirmation — Rightmove/Zoopla render client-side; check the
  per-site selectors in `content/extract.js` (`addressFromDom`) against the live DOM when a site
  changes markup. `cleanAddress()` is the safety net.
- Media capture is best-effort — cross-origin CDN images without a matching `host_permission`
  are skipped; the tab screenshot always works.
- Automated verification needs a connected browser bridge (claude-in-chrome); otherwise test
  manually after loading unpacked.

## Roadmap (Phase 3)

AI deal review on a listing (`/api/ai/deal-review` — needs `ANTHROPIC_API_KEY`) · AI-summarise an
auction legal pack into a note · right-click "Add to CRM" menu · bulk multi-lot auction capture ·
toolbar badge (task/auction counts).
