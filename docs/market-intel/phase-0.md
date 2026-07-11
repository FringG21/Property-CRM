# Market Intel — Phase 0: Plumbing (DONE 2026-07-11)

Full master plan: `C:\Users\Ashle\.claude\plans\go-sleepy-moonbeam.md` (also summarised below so future sessions can resume from this directory alone).

## What shipped
- `migrations/0004_market_intel.sql` — applied to remote `property-crm-db`. Tables: `mi_branches`, `mi_auctions`, `mi_lots`, `mi_lot_results` (append-only history), `mi_area_metrics`, `mi_area_scores`, `mi_jobs`, `mi_lr_cache`, `mi_area_context`, `mi_scoring_models` (seeded `default-v1`: demand .25 / spread .20 / sub-100k supply .20 / comps .15 / growth .15 / risk .05).
- `worker/marketIntel.js` — self-contained module (own CORS/session helpers to avoid circular import with index.js). Routes (ALL behind bearer session): `GET/POST /api/market/branches[/seed]`, `GET /api/market/jobs`, `POST /api/market/jobs/seed`, `POST /api/market/jobs/:id/pause|resume`. Exports pure `parseSitemapRegions` for tests. Constants: `MI_LIMITS` (1.1s fetch spacing, 20 index pages/tick, 15 detail/tick, 5 attempts, 10min·2^n backoff), honest UA.
- `worker/index.js` — 2-line import + `/api/market/` prefix guard at top of `handleApiRoutes`.

## Verified
- 23 branches discovered live from sitemap (2026-07-11), union with hardcoded fallback, zero drift. Slugs: bedsandbucks, birmingham, chesterfieldandnorthderbyshire, cumbria, eastanglia, essex, hertfordshireandwestessex, hullandeastyorkshire, leicestershire, lincolnshire, london, manchester, northamptonshire, northeast, northwales, northwest, scotland, southwest, southyorkshire, staffordshire, sussexandhampshire, wales, westyorkshire.
- Unauth → 401 on every route; `deploy --dry-run` clean; deployed to production.

## Gotchas discovered
- **`wrangler kv`/`d1` commands default to LOCAL storage in wrangler 4 — always pass `--remote`.** Local `.wrangler/state` contains stale dev sessions (`localtoken`, `testtoken`…) that look real.
- `curl` fails TLS on this machine (same root cause as the known `wrangler dev` TLS issue) — use `node -e "fetch(...)"` for API smoke tests.
- Smoke-testing authed routes: mint a temp session directly in remote KV (`session:<token>` JSON, `--ttl 600`), delete after. Real user sessions are 64-char hex.
- **As of Phase 6c (2026-07-11): the Claude Code agent cannot run the temp-session mint above.** Any KV `session:` write — even generating the random token as a prep step — is blocked by the permission classifier as a credential-store write, and stays blocked even after explicit user approval in chat (it's a hard-blocked category, not a per-turn permission). Don't retry it or look for a workaround. For live/authenticated browser verification, either have the user run the `kv key put` / `kv key delete` pair themselves from their own terminal, or have the user log into the deployed app and hand off the already-authenticated tab.

## Result-status contract (locked, implement in Phase 1)
`sold_for` / `sold_prior_for` (price printed) → `price_confirmed=1` — the ONLY confirmed-sale statuses. `sold` / `sold_prior` (no price) → unconfirmed. `last_bid` → demand signal, never a sale. `withdrawn`, `postponed`, `no_bids`, `unsold`, else `unknown` (quarantined). Original wording always kept in `mi_lots.raw`.

## Next: Phase 1 — Pass A parser + tests
- Save 2–3 real `/{region}/auction/past-auctions` pages as `test/fixtures/*.html` (MUST include a "Last Bid" lot).
- Pure functions in marketIntel.js: index-page parser (lot slices → address/guide/status/lot URL/auction end), `normalizeResultStatus`, exclusion classifier. Reuse patterns from index.js: `stableLotId` (:1272), `parseGuidePrice` (:931), `extractOutcode` (:942).
- `worker/marketIntel.test.mjs` + `"test": "node --test"` in package.json.
- `POST /api/market/jobs/tick` running one job page (cap 1 page in body for manual testing).
- Acceptance: `npm test` green; one tick ingests ~20 `mi_lots`; re-tick is a no-op.
