# Full-Stack Review Prompt — Property CRM

Paste this into a fresh Claude session (with this repo folder connected) to get a full review.

---

You are reviewing the Property CRM codebase in full: `src/App.jsx` (React frontend), `worker/index.js` (Cloudflare Worker backend), `extension/` (Chrome extension), and `wrangler.jsonc` (config). This is a read-only audit — do not edit any code. Read `CLAUDE.md` first for architecture, field contracts, and existing conventions before forming opinions.

Go section by section through the app's actual feature areas (deal pipeline / properties, property canvas & report parser, contacts & companies, tasks, documents/R2, intelligence connectors, Chrome extension ingest) and produce a report covering:

## 1. Code structure
- How `App.jsx` is organized internally (state management, component boundaries within the single file, prop drilling vs. context, duplication).
- Worker route organization, KV/R2/D1 usage patterns, error handling consistency.
- Anything that would make the codebase harder to maintain as it grows (naming drift, inconsistent patterns between sections, dead code).

## 2. Features & functionality
- For each section, what it currently does end-to-end, and any obvious gaps, edge cases, or half-finished flows.
- Whether the `reportFields` / analytics contracts in CLAUDE.md are actually respected everywhere they're used.
- Data integrity risks (e.g., places where extension-ingested records could diverge from SPA-produced shapes).

## 3. Flexibility & extensibility
- How easy it currently is to add a new intelligence connector, a new entity type, or a new field — what would need to change, and where the friction is.
- Config vs. hardcoded assumptions (e.g., connector list, D1_ENTITY_TABLES, field lists).

## 4. Usability & responsive design
- Audit against the breakpoint rules in CLAUDE.md (`isMobile` < 768px, `isTablet` 768–1023px) at 375px, 768px, and 1280px.
- Tap target sizes, font sizes, contrast, focus states, horizontal scroll risk on tables/grids.
- Any workflow that's clearly desktop-first and awkward on mobile.

## 5. Free API opportunities
This app already integrates (per CLAUDE.md): address lookup, Land Registry, EPC, Police, Flood, Planning, OSM, IMD, HPI, TfL, Schools, Census — all running in parallel via `Promise.allSettled` in `worker/index.js`.

Research and list **additional free or no-cost-tier UK APIs** that would meaningfully enhance specific sections, without duplicating what's already there. For each suggestion, specify:
- What section/feature it enhances and what new data/capability it adds.
- Whether it's genuinely free (no card required) or free-tier-with-limits, and what the limits are.
- Auth requirements (API key, OAuth, none).
- Rough integration effort (new connector following the existing `connectors[key] = { status, data, source, fetchedAt }` pattern, vs. a bigger lift).

Consider candidates such as: Companies House API (builder/trade company enrichment), Postcodes.io (postcode → geo/admin lookups, no key), OS Data Hub free tier (mapping/boundaries), ONS Open Geography / ONS API (demographics beyond Census), VOA Council Tax valuation list, Environment Agency real-time flood monitoring API (vs. current flood risk connector), Ofsted API (school inspection ratings, vs. current schools connector), Companies House document API, and any other genuinely free UK property/geodata/local-authority APIs — but verify current availability and terms rather than assuming from memory.

## 6. Output format
Structure the final report as: a short summary, then one subsection per numbered area above, then a prioritized recommendations list (impact vs. effort) at the end. Flag anything that would touch the report-parser contracts or extension↔CRM record shapes as higher-risk, per CLAUDE.md's change-discipline rules.
