// ============================================================
// MARKET INTELLIGENCE — Auction Area Intelligence
// Self-contained module: all /api/market/* routes, branch discovery,
// scrape-job queue. Kept independent of index.js (own CORS/session
// helpers) to avoid a circular import with the main worker.
// Data lives in the mi_* tables (migrations/0004_market_intel.sql).
// ============================================================

export const MI_PARSER_VERSION = 1;

const MI_BASE = 'https://www.auctionhouse.co.uk';

// Honest UA for all Market Intel fetches — this module identifies itself
// rather than impersonating a browser (robots.txt verified permissive for
// past-auction pages, 2026-07-11).
const MI_UA = 'PropertyCRM-MarketIntel/1.0 (personal property research; contact: ashley.a.b@hotmail.com)';

// Scrape etiquette constants — every fetch in this module goes through these.
export const MI_LIMITS = {
  fetchSpacingMs: 1100,        // ~1 req/sec against auctionhouse.co.uk
  indexPagesPerTick: 20,       // free-plan subrequest budget headroom
  detailFetchesPerTick: 15,
  maxAttempts: 5,              // then job -> 'error'
  backoffBaseMinutes: 10,      // next_run_at = now + 10min * 2^attempts
};

// Fallback region list, snapshot of the sitemap on 2026-07-11. Seeding
// re-discovers from the live sitemap and unions with this list, so a
// sitemap outage or format change can never shrink the branch registry.
export const MI_KNOWN_REGIONS = [
  { id: 'bedsandbucks', name: 'Beds & Bucks' },
  { id: 'birmingham', name: 'Birmingham & Black Country' },
  { id: 'chesterfieldandnorthderbyshire', name: 'Chesterfield & North Derbyshire' },
  { id: 'cumbria', name: 'Cumbria' },
  { id: 'eastanglia', name: 'East Anglia' },
  { id: 'essex', name: 'Essex' },
  { id: 'hertfordshireandwestessex', name: 'Hertfordshire & West Essex' },
  { id: 'hullandeastyorkshire', name: 'Hull & East Yorkshire' },
  { id: 'leicestershire', name: 'Leicestershire' },
  { id: 'lincolnshire', name: 'Lincolnshire' },
  { id: 'london', name: 'London' },
  { id: 'manchester', name: 'Manchester' },
  { id: 'northamptonshire', name: 'Northamptonshire' },
  { id: 'northeast', name: 'North East' },
  { id: 'northwales', name: 'North Wales' },
  { id: 'northwest', name: 'North West' },
  { id: 'scotland', name: 'Scotland' },
  { id: 'southwest', name: 'South West' },
  { id: 'southyorkshire', name: 'South Yorkshire' },
  { id: 'staffordshire', name: 'Staffordshire' },
  { id: 'sussexandhampshire', name: 'Sussex & Hampshire' },
  { id: 'wales', name: 'South Wales' },
  { id: 'westyorkshire', name: 'West Yorkshire' },
];

export function miResultsUrl(branchId) {
  return `${MI_BASE}/${branchId}/auction/past-auctions`;
}

// ------------------------------------------------------------
// Local helpers (duplicated from index.js on purpose — see header)
// ------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://property-crm.aa-investment-partners.workers.dev',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function getSession(env, request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return await env.SCRAPER_KV.get(`session:${token}`, 'json');
}

function nowIso() {
  return new Date().toISOString();
}

// ------------------------------------------------------------
// Branch discovery
// ------------------------------------------------------------

// Extracts region slugs that have a past-auctions page from sitemap XML.
export function parseSitemapRegions(xml) {
  const slugs = new Set();
  const re = /auctionhouse\.co\.uk\/([a-z0-9-]+)\/auction\/past-auctions/g;
  let m;
  while ((m = re.exec(xml)) !== null) slugs.add(m[1]);
  return [...slugs];
}

function titleCaseSlug(slug) {
  return slug
    .replace(/and/g, ' & ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(w => w === '&' ? '&' : w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Fetches the live sitemap, unions discovered regions with the known-region
// fallback, and upserts mi_branches. Never deactivates branches here — a
// branch missing from the sitemap is only flagged inactive manually or by a
// later fetch 404, so a transient sitemap problem can't hide history.
export async function seedBranches(env) {
  let discovered = [];
  let sitemapError = null;
  try {
    const res = await fetch(`${MI_BASE}/sitemap.xml`, {
      headers: { 'User-Agent': MI_UA },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      discovered = parseSitemapRegions(await res.text());
    } else {
      sitemapError = `sitemap HTTP ${res.status}`;
    }
  } catch (err) {
    sitemapError = String(err);
  }

  const byId = new Map(MI_KNOWN_REGIONS.map(r => [r.id, r.name]));
  for (const slug of discovered) {
    if (!byId.has(slug)) byId.set(slug, titleCaseSlug(slug));
  }

  const now = nowIso();
  const stmts = [];
  for (const [id, name] of byId) {
    stmts.push(env.CRM_DB.prepare(
      `INSERT INTO mi_branches (id, name, results_url, active, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET results_url = excluded.results_url, updated_at = excluded.updated_at`
    ).bind(id, name, miResultsUrl(id), now, now));
  }
  await env.CRM_DB.batch(stmts);

  return {
    total: byId.size,
    discoveredFromSitemap: discovered.length,
    newFromSitemap: discovered.filter(s => !MI_KNOWN_REGIONS.some(r => r.id === s)),
    sitemapError,
  };
}

// ------------------------------------------------------------
// Pass A page parsing — pure functions, fixture-tested via
// worker/marketIntel.test.mjs against saved real pages.
// ------------------------------------------------------------

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&#163;|&pound;/g, '£')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

export function parseMoney(text) {
  const m = decodeEntities(text).match(/£\s*([\d,]+)/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

// Guide formats seen live: '£15,000' | '£10,000 - £25,000' | '£80,000+'
export function parseGuide(text) {
  const t = decodeEntities(text);
  const amounts = [...t.matchAll(/£\s*([\d,]+)/g)].map(m => parseInt(m[1].replace(/,/g, ''), 10));
  if (!amounts.length) return { guideMin: null, guideMax: null };
  if (amounts.length >= 2) return { guideMin: amounts[0], guideMax: amounts[1] };
  // '£80,000+' has an open top end — max unknown, not equal to min
  if (/\+/.test(t)) return { guideMin: amounts[0], guideMax: null };
  return { guideMin: amounts[0], guideMax: amounts[0] };
}

// Contract: only statuses carrying a printed price count as confirmed sale
// evidence (sold_for, sold_prior_for, sold_after_for). A bare 'Sold' /
// 'Sold Prior' / 'Sold After' is real but unconfirmed. 'Last Bid: £X' is a
// bid, never a sale — its amount goes in lastBidPrice, NOT soldPrice.
export function normalizeResultStatus(text) {
  const t = decodeEntities(text).trim().replace(/\s+/g, ' ');
  const lower = t.toLowerCase();
  const price = parseMoney(t);
  const out = { status: 'unknown', soldPrice: null, priceConfirmed: 0, lastBidPrice: null, rawText: t };
  if (/^sold prior/.test(lower)) {
    out.status = price != null ? 'sold_prior_for' : 'sold_prior';
  } else if (/^sold after/.test(lower)) {
    out.status = price != null ? 'sold_after_for' : 'sold_after';
  } else if (/^sold/.test(lower)) {
    out.status = price != null ? 'sold_for' : 'sold';
  } else if (/^last bid/.test(lower)) {
    out.status = 'last_bid';
    out.lastBidPrice = price;
    return out;
  } else if (/^no bids?/.test(lower)) {
    out.status = 'no_bids';
  } else if (/^withdrawn/.test(lower)) {
    out.status = 'withdrawn';
  } else if (/^postponed/.test(lower)) {
    out.status = 'postponed';
  } else if (/^unsold/.test(lower)) {
    out.status = 'unsold';
  } else if (/^available/.test(lower)) {
    out.status = 'available';
  }
  if (price != null && ['sold_for', 'sold_prior_for', 'sold_after_for'].includes(out.status)) {
    out.soldPrice = price;
    out.priceConfirmed = 1;
  }
  return out;
}

const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;

export function extractPostcodeParts(address) {
  const m = String(address || '').match(POSTCODE_RE);
  if (!m) return { postcode: null, outcode: null };
  return { postcode: `${m[1].toUpperCase()} ${m[2].toUpperCase()}`, outcode: m[1].toUpperCase() };
}

// Town heuristic for 'street, town[, county], postcode' shaped addresses.
// Outcode is the primary area key; town is display-level only.
export function extractTown(address) {
  const parts = String(address || '').split(',').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const withoutPc = POSTCODE_RE.test(parts[parts.length - 1]) ? parts.slice(0, -1) : parts;
  if (!withoutPc.length) return null;
  return withoutPc.length >= 3 ? withoutPc[withoutPc.length - 2] : withoutPc[withoutPc.length - 1];
}

// Pass A eligibility from address text alone — deliberately conservative:
// only patterns that unambiguously identify a non-house. Everything else
// stays eligible-pending until the Pass B lot page settles it.
export function classifyLotPassA(address) {
  const a = String(address || '').toLowerCase();
  const reasons = [];
  if (/^(apartment|flat|maisonette)\b/.test(a) || /\b(apartment|flat|maisonette)\s+\d/.test(a)) reasons.push('flat');
  if (/^(land|plot)\b|\bland (at|adjacent|adjoining|to the (rear|side|front)|off)\b/.test(a)) reasons.push('land');
  if (/\bgarage(s)?\b/.test(a) && !/\bwith garage\b/.test(a)) reasons.push('garage');
  if (/\b(car park(ing)?|parking space)\b/.test(a)) reasons.push('parking');
  if (/\b(public house|retail unit|commercial unit|office(s)? at|workshop)\b/.test(a)) reasons.push('commercial');
  return { excluded: reasons.length ? 1 : 0, reasons, leaseholdFlag: 0 };
}

// '07/07/2026 13:06' -> '2026-07-07T13:06' (naive local time; string-sortable)
export function parseAuctionEnd(text) {
  const m = String(text || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return { endAt: null, date: null };
  const date = `${m[3]}-${m[2]}-${m[1]}`;
  return { endAt: m[4] ? `${date}T${m[4]}:${m[5]}` : date, date };
}

// Parses one /{region}/auction/past-auctions page. Rows are
// <tr class="fw-normal"> with cells: image+lot link | address | auctioneer |
// auction ended | guide | result. Structure verified against saved fixtures.
export function parsePastAuctionPage(html) {
  const lots = [];
  const rows = String(html).split('<tr class="fw-normal">').slice(1);
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m =>
      decodeEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
    );
    if (cells.length < 6) continue;
    const urlMatch = row.match(/online\.auctionhouse\.co\.uk\/lot\/(?:redirect\/)?(\d+)/);
    const address = cells[1];
    const { endAt, date } = parseAuctionEnd(cells[3]);
    const { guideMin, guideMax } = parseGuide(cells[4]);
    const result = normalizeResultStatus(cells[5]);
    const { postcode, outcode } = extractPostcodeParts(address);
    lots.push({
      platformLotId: urlMatch ? urlMatch[1] : null,
      lotUrl: urlMatch ? `https://online.auctionhouse.co.uk/lot/${urlMatch[1]}` : null,
      address,
      postcode,
      outcode,
      town: extractTown(address),
      auctioneer: cells[2] || null,
      auctionEndAt: endAt,
      auctionDate: date,
      guideMin,
      guideMax,
      guideText: cells[4] || null,
      ...result,
    });
  }
  const pageNums = [...String(html).matchAll(/past-auctions\?page=(\d+)/g)].map(m => parseInt(m[1], 10));
  // hasResultsShell distinguishes a legitimately-empty branch (page renders,
  // heading present, zero rows) from a redesign/outage (shell missing).
  const hasResultsShell = /Past online auction results/i.test(html);
  return { lots, totalPages: pageNums.length ? Math.max(...pageNums) : 1, hasResultsShell };
}

// ------------------------------------------------------------
// Pass B — lot detail page parse + eligibility refinement
// ------------------------------------------------------------

// Strips a lot detail page to newline-delimited text. Scripts/styles are
// removed first so the bidding-widget noise can never leak into extraction.
// Self-contained (mirrors index.js stripHtml) to keep the circular-import-free
// boundary this module deliberately maintains.
export function stripLotHtml(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, '\n')
  ).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

// Ordered so multi-word types win over their bare stems (semi-detached before
// detached, end/mid terrace before terrace). 'flat' is last and guarded below
// against 'flat roof' / 'flat pack'.
const MI_TYPE_TOKEN_RE = /\b(end[- ]?terraced?|mid[- ]?terraced?|through[- ]?terraced?|semi[- ]?detached|detached|terraced?|town\s?house|cottage|bungalow|mews|apartment|maisonette|flat)\b/gi;
const MI_FLAT_TYPES = /^(apartment|maisonette|flat)$/;

// Parses an online.auctionhouse.co.uk lot detail page. Everything is best-effort
// off the description text; absent fields return null and are NEVER guessed.
// Each derived value carries an evidence snippet for provenance. method='text'.
export function parseLotDetail(html) {
  const text = stripLotHtml(html);
  const evidence = {};

  // Bedrooms: the '<n> Bedroom(s)' summary chip is the reliable signal; fall
  // back to counting 'Bedroom 1/2/3' enumerations in the accommodation list.
  let bedrooms = null;
  // Same-line only ([ \t]*, never \s*): the summary chip is '<n> Bedroom(s)' on
  // one line. Allowing \n would let a room dimension ('... x 3.10') bleed into
  // the following 'Bedroom 1 -' enumeration line and read '10 Bedrooms'.
  let m = text.match(/(\d+)[ \t]*Bedrooms?\b/i);
  if (m) { bedrooms = parseInt(m[1], 10); evidence.bedrooms = m[0].trim(); }
  else {
    const nums = [...text.matchAll(/\bBedroom\s*(\d+)\b/gi)].map(x => parseInt(x[1], 10));
    if (nums.length) { bedrooms = nums.length; evidence.bedrooms = `enumerated x${nums.length}`; }
  }
  if (bedrooms != null && (!Number.isFinite(bedrooms) || bedrooms < 1 || bedrooms > 15)) { bedrooms = null; delete evidence.bedrooms; }

  // Property type: first type keyword in the description, guarding 'flat roof'.
  let propertyType = null, isFlat = false;
  for (const mm of text.matchAll(MI_TYPE_TOKEN_RE)) {
    const val = mm[0].toLowerCase().replace(/\s+/g, ' ');
    if (val === 'flat') {
      const after = text.slice(mm.index + mm[0].length, mm.index + mm[0].length + 8).toLowerCase();
      if (/^[- ]?(roof|pack|screen)/.test(after)) continue;
    }
    propertyType = val;
    isFlat = MI_FLAT_TYPES.test(val);
    evidence.propertyType = mm[0];
    break;
  }

  // Tenure.
  let tenure = null;
  if (/\bleasehold\b/i.test(text)) { tenure = 'leasehold'; evidence.tenure = 'leasehold'; }
  else if (/\bfreehold\b/i.test(text)) { tenure = 'freehold'; evidence.tenure = 'freehold'; }

  // Page-stated EPC (A-G) and council tax band (A-H). Sourced 'listing' — the
  // authoritative EPC register match is Phase 6b, not this.
  let epcRating = null;
  m = text.match(/EPC(?:\s*Rating)?[:\s]+([A-G])\b/i);
  if (m) { epcRating = m[1].toUpperCase(); evidence.epcRating = m[0].trim(); }
  let councilTaxBand = null;
  m = text.match(/Council Tax(?:\s*Band)?[:\s]+([A-H])\b/i);
  if (m) { councilTaxBand = m[1].toUpperCase(); evidence.councilTaxBand = m[0].trim(); }

  // Condition / occupancy exclusion signals — deliberately tight patterns to
  // stay clear of legal boilerplate ('if sold subject to a tenancy...'). The
  // policy decision (whether to exclude) lives in classifyLotPassB.
  const signals = {
    tenanted: /\b(?:tenant in situ|tenant in place|sold with (?:a |the )?(?:sitting )?tenant|currently (?:let|tenanted)|subject to an? (?:existing|assured shorthold) tenanc)/i.test(text),
    fireDamaged: /\bfire[- ]?damaged?\b|damaged by (?:a )?fire\b|following a (?:recent )?fire\b/i.test(text),
    nonStandard: /\bnon[- ]?standard construction\b|\bconcrete construction\b|\bairey\b|\bno[- ]?fines\b/i.test(text),
    noAccess: /\bno internal access\b|internal (?:access|inspection) (?:is )?(?:not available|unavailable)/i.test(text),
  };
  for (const [k, v] of Object.entries(signals)) if (v) (evidence.signals ||= []).push(k);

  return { propertyType, isFlat, bedrooms, tenure, leaseholdFlag: tenure === 'leasehold' ? 1 : 0, epcRating, councilTaxBand, signals, evidence };
}

// Refines Pass A eligibility with detail-page facts. Conservative by design:
// only adds exclusions on positive evidence; unknown attributes never exclude
// (they cost confidence at scoring, per the brief). Leasehold *houses* are
// flagged, not excluded — only a leasehold flat is excluded (via its type).
export function classifyLotPassB(passA, detail) {
  const reasons = new Set(Array.isArray(passA?.reasons) ? passA.reasons : []);
  let leaseholdFlag = passA?.leaseholdFlag ? 1 : 0;
  if (detail?.isFlat) reasons.add('flat');
  if (detail?.leaseholdFlag) leaseholdFlag = 1;
  if (Number.isInteger(detail?.bedrooms) && detail.bedrooms < 2) reasons.add('under_2_beds');
  const s = detail?.signals || {};
  if (s.tenanted) reasons.add('tenanted');
  if (s.fireDamaged) reasons.add('fire_damaged');
  if (s.nonStandard) reasons.add('non_standard_construction');
  if (s.noAccess) reasons.add('no_internal_access');
  return { excluded: reasons.size ? 1 : 0, reasons: [...reasons], leaseholdFlag };
}

// ------------------------------------------------------------
// Ingestion — idempotent upserts; observation history is append-only
// ------------------------------------------------------------

function lotRowId(branchId, lot) {
  if (lot.platformLotId) return `mi-${branchId}-${lot.platformLotId}`;
  // Fallback identity mirrors stableLotId's spirit: date + address slug
  const slug = String(lot.address || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
  return `mi-${branchId}-${lot.auctionDate || 'nodate'}-${slug}`;
}

export async function ingestParsedPage(env, branch, parsed, sourceUrl) {
  const now = nowIso();
  const stmts = [];
  const auctionIds = new Set();
  let upserts = 0;
  for (const lot of parsed.lots) {
    if (!lot.address || !lot.auctionDate) continue;
    const lotId = lotRowId(branch.id, lot);
    const auctionId = `${branch.id}:${lot.auctionDate}`;
    if (!auctionIds.has(auctionId)) {
      auctionIds.add(auctionId);
      stmts.push(env.CRM_DB.prepare(
        `INSERT INTO mi_auctions (id, branch_id, auction_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`
      ).bind(auctionId, branch.id, lot.auctionDate, now, now));
    }
    const cls = classifyLotPassA(lot.address);
    const raw = JSON.stringify({
      sourceUrl,
      parserVersion: MI_PARSER_VERSION,
      resultText: lot.rawText,
      guideText: lot.guideText,
      lastBidPrice: lot.lastBidPrice,
      auctioneer: lot.auctioneer,
    });
    // Relists: the newer observation wins mi_lots (guarded on auction_end_at);
    // every observation is preserved in mi_lot_results regardless.
    stmts.push(env.CRM_DB.prepare(
      `INSERT INTO mi_lots (id, platform_lot_id, branch_id, auction_id, address, postcode, outcode, town,
         guide_min, guide_max, result_status, sold_price, price_confirmed,
         excluded, exclusion_reasons, auction_end_at, first_seen_at, last_seen_at, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         auction_id = excluded.auction_id,
         guide_min = excluded.guide_min,
         guide_max = excluded.guide_max,
         result_status = excluded.result_status,
         sold_price = excluded.sold_price,
         price_confirmed = excluded.price_confirmed,
         auction_end_at = excluded.auction_end_at,
         last_seen_at = excluded.last_seen_at,
         raw = excluded.raw
       WHERE excluded.auction_end_at >= mi_lots.auction_end_at OR mi_lots.auction_end_at IS NULL`
    ).bind(
      lotId, lot.platformLotId, branch.id, auctionId, lot.address, lot.postcode, lot.outcode, lot.town,
      lot.guideMin, lot.guideMax, lot.status, lot.soldPrice, lot.priceConfirmed,
      cls.excluded, JSON.stringify(cls.reasons), lot.auctionEndAt, now, now, raw
    ));
    stmts.push(env.CRM_DB.prepare(
      `INSERT INTO mi_lot_results (lot_id, auction_id, observed_at, result_status, sold_price, guide_min, guide_max, source_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(lot_id, auction_id, result_status) DO NOTHING`
    ).bind(lotId, auctionId, now, lot.status, lot.soldPrice, lot.guideMin, lot.guideMax, sourceUrl));
    upserts++;
  }
  if (stmts.length) await env.CRM_DB.batch(stmts);
  return { upserts, auctions: auctionIds.size };
}

// ------------------------------------------------------------
// Job runner — one job per tick, cursor checkpointed after every page
// ------------------------------------------------------------

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function saveJob(env, job, fields) {
  const merged = { ...job, ...fields, updated_at: nowIso() };
  await env.CRM_DB.prepare(
    `UPDATE mi_jobs SET status=?, cursor=?, attempts=?, next_run_at=?, last_error=?, stats=?, updated_at=? WHERE id=?`
  ).bind(merged.status, merged.cursor, merged.attempts, merged.next_run_at, merged.last_error, merged.stats, merged.updated_at, job.id).run();
  return merged;
}

async function runPassAIndexJob(env, job, opts) {
  const branch = await env.CRM_DB.prepare('SELECT * FROM mi_branches WHERE id = ?').bind(job.target).first();
  if (!branch) {
    await saveJob(env, job, { status: 'error', last_error: `Unknown branch: ${job.target}` });
    return { jobId: job.id, error: 'unknown branch' };
  }
  const cursor = JSON.parse(job.cursor || '{"nextPage":1}');
  const stats = JSON.parse(job.stats || '{}');
  const pageBudget = Math.min(opts.maxPages || MI_LIMITS.indexPagesPerTick, MI_LIMITS.indexPagesPerTick);
  let fetched = 0;

  while (fetched < pageBudget) {
    const page = cursor.nextPage || 1;
    if (cursor.maxPages && page > cursor.maxPages) break;
    if (cursor.totalPages && page > cursor.totalPages) break;
    const pageUrl = page > 1 ? `${branch.results_url}?page=${page}` : branch.results_url;
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': MI_UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${pageUrl}`);
    const parsed = parsePastAuctionPage(await res.text());
    fetched++;

    if (!parsed.lots.length) {
      // Page-1 zero lots is only a parser/site-change tripwire when the
      // branch has previously yielded lots (a regression). Branches with no
      // online results render no table at all (hertfordshireandwestessex,
      // northwales as of 2026-07) — those finish cleanly as empty. Deeper
      // pages just mean we ran off the end of pagination.
      if (page === 1) {
        const existing = await env.CRM_DB.prepare(
          'SELECT COUNT(*) n FROM mi_lots WHERE branch_id = ?'
        ).bind(branch.id).first();
        if (existing.n > 0) {
          stats.zeroParse = (stats.zeroParse || 0) + 1;
          await saveJob(env, job, { status: 'error', last_error: `zero_parse on ${pageUrl}`, stats: JSON.stringify(stats) });
          return { jobId: job.id, error: 'zero_parse', pageUrl };
        }
      }
      cursor.totalPages = page === 1 ? 0 : page - 1;
      break;
    }

    const { upserts } = await ingestParsedPage(env, branch, parsed, pageUrl);
    cursor.totalPages = parsed.totalPages;
    cursor.nextPage = page + 1;
    stats.pagesFetched = (stats.pagesFetched || 0) + 1;
    stats.lotsUpserted = (stats.lotsUpserted || 0) + upserts;
    await saveJob(env, { ...job, status: 'running' }, { status: 'running', cursor: JSON.stringify(cursor), stats: JSON.stringify(stats) });
    if (parsed.totalPages !== branch.page_count_estimate) {
      await env.CRM_DB.prepare('UPDATE mi_branches SET page_count_estimate = ?, updated_at = ? WHERE id = ?')
        .bind(parsed.totalPages, nowIso(), branch.id).run();
    }
    const limitReached = cursor.maxPages ? cursor.nextPage > cursor.maxPages : false;
    if (cursor.nextPage > cursor.totalPages || limitReached) break;
    await sleep(MI_LIMITS.fetchSpacingMs);
  }

  const finished = (cursor.totalPages != null && (cursor.nextPage || 1) > cursor.totalPages)
    || (cursor.maxPages && (cursor.nextPage || 1) > cursor.maxPages);
  await saveJob(env, job, {
    status: finished ? 'done' : 'queued',
    cursor: JSON.stringify(cursor),
    attempts: 0,
    last_error: null,
    stats: JSON.stringify(stats),
  });
  return { jobId: job.id, status: finished ? 'done' : 'queued', pagesFetched: fetched, cursor };
}

// Pass B lot-detail enrichment. Targets one outcode; each tick fetches the next
// batch of not-yet-enriched, not-already-excluded lots, fills type/beds/tenure
// and refines exclusions. Every processed lot gets enrichment_level=1 (even on
// fetch failure) so the job always terminates; re-running only picks up level-0
// lots, so it is idempotent and resumable.
async function runPassBLotsJob(env, job, opts) {
  const outcode = String(job.target || '').toUpperCase().trim();
  if (!outcode) {
    await saveJob(env, job, { status: 'error', last_error: 'passB_lots job has no outcode target' });
    return { jobId: job.id, error: 'no target' };
  }
  const stats = JSON.parse(job.stats || '{}');
  const budget = Math.min(opts.maxDetail || MI_LIMITS.detailFetchesPerTick, MI_LIMITS.detailFetchesPerTick);

  const { results: lots } = await env.CRM_DB.prepare(
    `SELECT id, platform_lot_id, excluded, exclusion_reasons, leasehold_flag, raw
     FROM mi_lots WHERE outcode = ? AND excluded = 0 AND enrichment_level = 0
     ORDER BY id LIMIT ?`
  ).bind(outcode, budget).all();

  if (!lots.length) {
    await saveJob(env, job, { status: 'done', attempts: 0, last_error: null, stats: JSON.stringify(stats) });
    return { jobId: job.id, status: 'done', outcode, processed: 0 };
  }

  let processed = 0;
  for (const lot of lots) {
    const now = nowIso();
    let up = { propertyType: null, bedrooms: null, tenure: null, leaseholdFlag: lot.leasehold_flag || 0, epcRating: null, excluded: 0, reasons: JSON.parse(lot.exclusion_reasons || '[]'), passB: {} };
    try {
      if (!lot.platform_lot_id) {
        up.passB = { enrichError: 'no_lot_id', fetchedAt: now, parserVersion: MI_PARSER_VERSION };
        stats.noId = (stats.noId || 0) + 1;
      } else {
        const detailUrl = `https://online.auctionhouse.co.uk/lot/redirect/${lot.platform_lot_id}`;
        const res = await fetch(detailUrl, { headers: { 'User-Agent': MI_UA, Accept: 'text/html' }, signal: AbortSignal.timeout(20000) });
        if (!res.ok) {
          up.passB = { enrichError: `http_${res.status}`, detailUrl, fetchedAt: now, parserVersion: MI_PARSER_VERSION };
          stats[`http_${res.status}`] = (stats[`http_${res.status}`] || 0) + 1;
        } else {
          const detail = parseLotDetail(await res.text());
          const passA = { excluded: lot.excluded, reasons: JSON.parse(lot.exclusion_reasons || '[]'), leaseholdFlag: lot.leasehold_flag || 0 };
          const cls = classifyLotPassB(passA, detail);
          up = {
            propertyType: detail.propertyType, bedrooms: detail.bedrooms, tenure: detail.tenure,
            leaseholdFlag: cls.leaseholdFlag, epcRating: detail.epcRating, excluded: cls.excluded, reasons: cls.reasons,
            passB: { detailUrl, finalUrl: res.url || detailUrl, fetchedAt: now, method: 'text', parserVersion: MI_PARSER_VERSION, evidence: detail.evidence, councilTaxBand: detail.councilTaxBand },
          };
          stats.enriched = (stats.enriched || 0) + 1;
          if (cls.excluded && !lot.excluded) {
            stats.excludedNew = (stats.excludedNew || 0) + 1;
            for (const r of cls.reasons) stats.byReason = { ...stats.byReason, [r]: (stats.byReason?.[r] || 0) + 1 };
          }
        }
      }
    } catch (err) {
      up.passB = { enrichError: String(err).slice(0, 120), fetchedAt: now, parserVersion: MI_PARSER_VERSION };
      stats.errors = (stats.errors || 0) + 1;
    }

    let raw;
    try { raw = JSON.parse(lot.raw || '{}'); } catch { raw = {}; }
    raw.passB = up.passB;
    // COALESCE keeps existing card data when the detail page yielded nothing.
    await env.CRM_DB.prepare(
      `UPDATE mi_lots SET property_type = COALESCE(?, property_type), bedrooms = COALESCE(?, bedrooms),
         tenure = COALESCE(?, tenure), leasehold_flag = ?, epc_rating = COALESCE(?, epc_rating),
         excluded = ?, exclusion_reasons = ?, enrichment_level = 1, last_seen_at = ?, raw = ?
       WHERE id = ?`
    ).bind(up.propertyType, up.bedrooms, up.tenure, up.leaseholdFlag, up.epcRating, up.excluded, JSON.stringify(up.reasons), now, JSON.stringify(raw), lot.id).run();
    processed++;
    stats.processed = (stats.processed || 0) + 1;
    if (processed < lots.length) await sleep(MI_LIMITS.fetchSpacingMs);
  }

  const remaining = await env.CRM_DB.prepare(
    'SELECT COUNT(*) n FROM mi_lots WHERE outcode = ? AND excluded = 0 AND enrichment_level = 0'
  ).bind(outcode).first();
  const done = remaining.n === 0;
  await saveJob(env, job, { status: done ? 'done' : 'queued', attempts: 0, last_error: null, stats: JSON.stringify(stats) });
  return { jobId: job.id, status: done ? 'done' : 'queued', outcode, processed, remaining: remaining.n };
}

const MI_CONTEXT_FETCHES_PER_TICK = 12;
const LR_CACHE_DAYS = 90;

// Loads cached LR PPD items for a set of postcodes (fresh cache only).
async function loadLrCache(env, postcodes) {
  if (!postcodes.length) return {};
  const now = nowIso();
  const rows = await env.CRM_DB.prepare(
    `SELECT cache_key, data FROM mi_lr_cache WHERE cache_key IN (${postcodes.map(() => '?').join(',')}) AND (expires_at IS NULL OR expires_at > ?)`
  ).bind(...postcodes.map(p => `ppd:${p}`), now).all();
  const out = {};
  for (const r of rows.results) { try { out[r.cache_key] = JSON.parse(r.data); } catch { out[r.cache_key] = []; } }
  return out;
}

// Pass B area context: LR comps, ceilings, HPI growth (COVID-split), per-lot GDV,
// and the score factors Pass A cannot compute. Outcode-targeted, two-stage cursor
// (fetch LR per postcode → compute). Idempotent: re-runs rebuild from cache.
async function runPassBContextJob(env, job, opts) {
  const outcode = String(job.target || '').toUpperCase().trim();
  if (!outcode) {
    await saveJob(env, job, { status: 'error', last_error: 'passB_context job has no outcode target' });
    return { jobId: job.id, error: 'no target' };
  }
  const stats = JSON.parse(job.stats || '{}');
  let cursor = JSON.parse(job.cursor || '{}');

  // Initialise the postcode worklist from the outcode's eligible lots.
  if (!cursor.postcodes) {
    const { results } = await env.CRM_DB.prepare(
      `SELECT DISTINCT postcode FROM mi_lots WHERE outcode = ? AND excluded = 0 AND postcode IS NOT NULL AND postcode != '' ORDER BY postcode`
    ).bind(outcode).all();
    cursor = { stage: 'fetch', postcodes: results.map(r => r.postcode), idx: 0 };
  }

  // ---- FETCH STAGE: LR PPD per postcode, cached 90 days ----
  if (cursor.stage === 'fetch') {
    const fresh = await loadLrCache(env, cursor.postcodes);
    let fetched = 0;
    while (cursor.idx < cursor.postcodes.length && fetched < MI_CONTEXT_FETCHES_PER_TICK) {
      const pc = cursor.postcodes[cursor.idx];
      if (fresh[`ppd:${pc}`]) { cursor.idx++; continue; }               // already cached
      try {
        const res = await fetch(
          `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.postcode=${encodeURIComponent(pc)}&_pageSize=100&_sort=-transactionDate`,
          { headers: { Accept: 'application/json', 'User-Agent': MI_UA }, signal: AbortSignal.timeout(15000) }
        );
        const items = res.ok ? parseLrPpd(await res.json(), pc) : [];
        const expires = new Date(Date.now() + LR_CACHE_DAYS * 864e5).toISOString();
        await env.CRM_DB.prepare(
          `INSERT INTO mi_lr_cache (cache_key, fetched_at, expires_at, data) VALUES (?, ?, ?, ?)
           ON CONFLICT(cache_key) DO UPDATE SET fetched_at=excluded.fetched_at, expires_at=excluded.expires_at, data=excluded.data`
        ).bind(`ppd:${pc}`, nowIso(), expires, JSON.stringify(items)).run();
        stats.lrFetched = (stats.lrFetched || 0) + 1;
        stats.lrSales = (stats.lrSales || 0) + items.length;
      } catch (err) {
        stats.lrErrors = (stats.lrErrors || 0) + 1;
      }
      fetched++;
      cursor.idx++;
      if (cursor.idx < cursor.postcodes.length && fetched < MI_CONTEXT_FETCHES_PER_TICK) await sleep(MI_LIMITS.fetchSpacingMs);
    }
    if (cursor.idx >= cursor.postcodes.length) cursor.stage = 'compute';
    await saveJob(env, { ...job, status: 'running' }, { status: 'queued', cursor: JSON.stringify(cursor), stats: JSON.stringify(stats), attempts: 0, last_error: null });
    return { jobId: job.id, status: 'queued', outcode, stage: 'fetch', idx: cursor.idx, of: cursor.postcodes.length };
  }

  // ---- COMPUTE STAGE: comps + growth + per-lot GDV + score ----
  const cache = await loadLrCache(env, cursor.postcodes);
  const lrItems = Object.values(cache).flat();
  const comps = buildComps(lrItems, { months: 24 });

  // geo + HPI (one call each) — best-effort, never blocks the compute.
  let geo = null, growth = null, hpiRaw = null;
  const sampleLot = await env.CRM_DB.prepare(
    `SELECT postcode FROM mi_lots WHERE outcode = ? AND postcode IS NOT NULL AND postcode != '' LIMIT 1`
  ).bind(outcode).first();
  if (sampleLot?.postcode) {
    try {
      const pRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(sampleLot.postcode)}`, { signal: AbortSignal.timeout(10000) });
      if (pRes.ok) {
        const pj = await pRes.json();
        const r = pj.result || {};
        geo = { laCode: r.codes?.admin_district || null, localAuthority: r.admin_district || null, region: r.region || null, lat: r.latitude || null, lon: r.longitude || null, country: r.country || null };
      }
    } catch { /* geo optional */ }
  }
  // UK HPI is keyed by region SLUG (not the GSS code); refPeriodStart is a human
  // date ('Sun, 01 Jan 1995') so parse it to ISO and sort by refMonth desc.
  const laSlug = geo?.localAuthority
    ? geo.localAuthority.toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : null;
  if (geo) geo.laSlug = laSlug;
  if (laSlug) {
    try {
      const hRes = await fetch(
        `https://landregistry.data.gov.uk/data/ukhpi/region/${encodeURIComponent(laSlug)}/month.json?_pageSize=80&_sort=-refMonth`,
        { headers: { Accept: 'application/json', 'User-Agent': MI_UA }, signal: AbortSignal.timeout(12000) }
      );
      if (hRes.ok) {
        const hj = await hRes.json();
        const series = (hj.result?.items || []).map(i => ({
          date: i.refPeriodStart ? new Date(i.refPeriodStart).toISOString().slice(0, 10) : '',
          price: Number(i.averagePrice) || 0,
        }));
        hpiRaw = hpiGrowth(series);
        growth = hpiRaw ? { growth5yr: hpiRaw.growth5yr, growth3yr: hpiRaw.growth3yr, growth1yr: hpiRaw.growth1yr, covidAdjustedAnnual: hpiRaw.covidAdjustedAnnual, volatility: hpiRaw.volatility, lastUpdated: hpiRaw.lastUpdated } : null;
      }
    } catch { /* hpi optional */ }
  }

  // Per-lot GDV for eligible lots. streetCeiling = best same-street LR sale whose
  // street name appears in the lot address.
  const { results: eligibleLots } = await env.CRM_DB.prepare(
    `SELECT id, address, property_type, sold_price, price_confirmed, guide_min, guide_max, raw FROM mi_lots WHERE outcode = ? AND excluded = 0 AND enrichment_level = 1`
  ).bind(outcode).all();
  const streetKeys = Object.keys(comps.sameStreet);
  const expectedGdvs = [], purchases = [];
  const updates = [];
  let withEconomics = 0;
  for (const lot of eligibleLots) {
    const normAddr = normStreet(lot.address);
    let streetCeiling = null;
    for (const k of streetKeys) if (k.length >= 4 && normAddr.includes(k)) streetCeiling = Math.max(streetCeiling || 0, comps.sameStreet[k]);
    const lrClass = lotTypeToLrClass(lot.property_type);
    let purchase = null, basis = null;
    if (lot.price_confirmed && lot.sold_price) { purchase = lot.sold_price; basis = 'confirmed_sale'; }
    else if (lot.guide_min) { purchase = lot.guide_max ? Math.round((lot.guide_min + lot.guide_max) / 2) : lot.guide_min; basis = 'guide_midpoint'; }
    const g = computeGdv(purchase, comps, lrClass, { streetCeiling });
    if (g.gdvExpected != null) { expectedGdvs.push(g.gdvExpected); if (purchase) purchases.push(purchase); }
    if (g.band) withEconomics++;
    let raw; try { raw = JSON.parse(lot.raw || '{}'); } catch { raw = {}; }
    raw.passBContext = { ...g, purchase, purchaseBasis: basis, streetCeiling, computedAt: nowIso() };
    updates.push(env.CRM_DB.prepare('UPDATE mi_lots SET raw = ? WHERE id = ?').bind(JSON.stringify(raw), lot.id));
  }
  for (const batch of chunkBatches(env, updates)) if (batch.length) await env.CRM_DB.batch(batch);

  // Score factors + area-level summaries.
  const medExpected = expectedGdvs.length ? quantile([...expectedGdvs].sort((a, b) => a - b), 0.5) : null;
  const medPurchase = purchases.length ? quantile([...purchases].sort((a, b) => a - b), 0.5) : null;
  const factors = {
    flipSpread: flipSpreadScore(medExpected, medPurchase),
    compQuality: compQualityScore(comps.houseSales),
    growthResilience: growthResilienceScore(growth?.covidAdjustedAnnual ?? null, growth?.volatility ?? null),
  };
  const compsSummary = {
    classes: Object.fromEntries(Object.entries(comps.classes).map(([k, v]) => [k, { count: v.count, thin: v.thin, median: v.median, p25: v.p25, p75: v.p75, ceiling: v.ceiling }])),
    houseSales: comps.houseSales, totalSales: comps.totalSales, outcodeCeiling: comps.outcodeCeiling,
    medianExpectedGdv: medExpected, medianPurchase: medPurchase, lotsWithEconomics: withEconomics, eligibleLots: eligibleLots.length,
  };
  const ceiling = { outcodeCeiling: comps.outcodeCeiling, topStreets: Object.entries(comps.sameStreet).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([street, price]) => ({ street, price })) };

  const ctxNow = nowIso();
  const ctxStmts = [
    ['comps_summary', compsSummary], ['ceiling', ceiling], ['score_factors', factors],
  ];
  if (geo) ctxStmts.push(['geo', geo]);
  if (growth) ctxStmts.push(['growth', growth]);
  if (hpiRaw) ctxStmts.push(['hpi', hpiRaw]);
  await env.CRM_DB.batch(ctxStmts.map(([kind, data]) => env.CRM_DB.prepare(
    `INSERT INTO mi_area_context (area_type, area_id, kind, data, fetched_at) VALUES ('outcode', ?, ?, ?, ?)
     ON CONFLICT(area_type, area_id, kind) DO UPDATE SET data=excluded.data, fetched_at=excluded.fetched_at`
  ).bind(outcode, kind, JSON.stringify(data), ctxNow)));

  // Merge the new factors into the existing Pass A score and recompute.
  const model = await env.CRM_DB.prepare('SELECT * FROM mi_scoring_models WHERE is_default = 1 LIMIT 1').first();
  const weights = JSON.parse(model?.weights || '{}');
  const existing = await env.CRM_DB.prepare(
    `SELECT components, confidence FROM mi_area_scores WHERE area_type='outcode' AND area_id=? AND model_id=?`
  ).bind(outcode, model?.id || 'default-v1').first();
  let scoreWritten = null;
  if (existing) {
    const prev = JSON.parse(existing.components || '{}');
    const merged = { ...(prev.values || {}), ...Object.fromEntries(Object.entries(factors).filter(([, v]) => v != null)) };
    const { score, values, missing } = computeAreaScore(merged, weights);
    scoreWritten = score;
    await env.CRM_DB.prepare(
      `UPDATE mi_area_scores SET score=?, components=?, computed_at=? WHERE area_type='outcode' AND area_id=? AND model_id=?`
    ).bind(score, JSON.stringify({ ...prev, values, missing, passB: factors }), ctxNow, outcode, model?.id || 'default-v1').run();
  }

  stats.compute = { eligibleLots: eligibleLots.length, houseSales: comps.houseSales, medianExpectedGdv: medExpected, factors, scoreWritten };
  await saveJob(env, job, { status: 'done', cursor: JSON.stringify(cursor), attempts: 0, last_error: null, stats: JSON.stringify(stats) });
  return { jobId: job.id, status: 'done', outcode, ...stats.compute };
}

export async function runMarketIntelTick(env, opts = {}) {
  const now = nowIso();
  const job = await env.CRM_DB.prepare(
    `SELECT * FROM mi_jobs WHERE status = 'queued' AND (next_run_at IS NULL OR next_run_at <= ?)
     ORDER BY created_at LIMIT 1`
  ).bind(now).first();
  if (!job) return { idle: true };

  // Optimistic lock — a concurrent manual tick + cron tick can both select
  // the same job; only one wins this UPDATE.
  const lock = await env.CRM_DB.prepare(
    `UPDATE mi_jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'queued'`
  ).bind(now, job.id).run();
  if (lock.meta.changes === 0) return { idle: true, reason: 'lost lock' };

  try {
    if (job.type === 'passA_index' || job.type === 'passA_refresh') {
      return await runPassAIndexJob(env, job, opts);
    }
    if (job.type === 'passB_lots') {
      return await runPassBLotsJob(env, job, opts);
    }
    if (job.type === 'passB_context') {
      return await runPassBContextJob(env, job, opts);
    }
    await saveJob(env, job, { status: 'error', last_error: `Job type not implemented yet: ${job.type}` });
    return { jobId: job.id, error: 'not implemented' };
  } catch (err) {
    const attempts = (job.attempts || 0) + 1;
    const dead = attempts >= MI_LIMITS.maxAttempts;
    const backoffMs = MI_LIMITS.backoffBaseMinutes * 60 * 1000 * Math.pow(2, attempts);
    await saveJob(env, job, {
      status: dead ? 'error' : 'queued',
      attempts,
      next_run_at: dead ? null : new Date(Date.now() + backoffMs).toISOString(),
      last_error: String(err).slice(0, 500),
    });
    return { jobId: job.id, error: String(err), attempts, dead };
  }
}

// ------------------------------------------------------------
// Job queue CRUD (the cron tick that consumes these lands in Phase 1+)
// ------------------------------------------------------------

async function seedJobs(env, body) {
  const type = body?.type || 'passA_index';
  if (!['passA_index', 'passA_refresh', 'passB_lots', 'passB_context', 'aggregate'].includes(type)) {
    return json({ success: false, message: `Unknown job type: ${type}` }, 400);
  }

  // Pass B jobs are targeted by outcode, not branch — one job per area.
  if (type === 'passB_lots' || type === 'passB_context') {
    const outcode = String(body?.outcode || '').toUpperCase().trim();
    if (!outcode) return json({ success: false, message: `${type} requires an outcode (e.g. "S63")` }, 400);
    const id = `${type}:${outcode}`;
    const now = nowIso();
    if (body?.force) {
      await env.CRM_DB.prepare(
        `INSERT INTO mi_jobs (id, type, target, status, cursor, attempts, stats, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', '{}', 0, '{}', ?, ?)
         ON CONFLICT(id) DO UPDATE SET status='queued', cursor='{}', attempts=0, last_error=NULL, stats='{}', updated_at=excluded.updated_at`
      ).bind(id, type, outcode, now, now).run();
      return json({ success: true, type, outcode, jobId: id, reset: 1 });
    }
    const res = await env.CRM_DB.prepare(
      `INSERT INTO mi_jobs (id, type, target, status, cursor, attempts, stats, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', '{}', 0, '{}', ?, ?)
       ON CONFLICT(id) DO NOTHING`
    ).bind(id, type, outcode, now, now).run();
    return json({ success: true, type, outcode, jobId: id, created: res.meta.changes > 0 ? 1 : 0, skipped: res.meta.changes > 0 ? 0 : 1 });
  }

  let branchIds = Array.isArray(body?.branches) && body.branches.length
    ? body.branches.map(String)
    : (await env.CRM_DB.prepare('SELECT id FROM mi_branches WHERE active = 1').all()).results.map(r => r.id);
  if (!branchIds.length) {
    return json({ success: false, message: 'No branches — run POST /api/market/branches/seed first' }, 400);
  }

  const force = !!body?.force;
  const now = nowIso();
  const maxPages = Number.isInteger(body?.maxPages) ? body.maxPages : null;
  let created = 0, reset = 0, skipped = 0;
  for (const branchId of branchIds) {
    const id = `${type}:${branchId}`;
    const cursor = JSON.stringify({ nextPage: 1, ...(maxPages ? { maxPages } : {}) });
    if (force) {
      await env.CRM_DB.prepare(
        `INSERT INTO mi_jobs (id, type, target, status, cursor, attempts, stats, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', ?, 0, '{}', ?, ?)
         ON CONFLICT(id) DO UPDATE SET status='queued', cursor=excluded.cursor, attempts=0, last_error=NULL, updated_at=excluded.updated_at`
      ).bind(id, type, branchId, cursor, now, now).run();
      reset++;
    } else {
      const res = await env.CRM_DB.prepare(
        `INSERT INTO mi_jobs (id, type, target, status, cursor, attempts, stats, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', ?, 0, '{}', ?, ?)
         ON CONFLICT(id) DO NOTHING`
      ).bind(id, type, branchId, cursor, now, now).run();
      if (res.meta.changes > 0) created++; else skipped++;
    }
  }
  return json({ success: true, type, created, reset, skipped });
}

async function setJobStatus(env, jobId, from, to) {
  const res = await env.CRM_DB.prepare(
    `UPDATE mi_jobs SET status = ?, updated_at = ? WHERE id = ? AND status IN (${from.map(() => '?').join(',')})`
  ).bind(to, nowIso(), jobId, ...from).run();
  if (res.meta.changes === 0) {
    return json({ success: false, message: `Job not found or not in state [${from.join(', ')}]` }, 409);
  }
  return json({ success: true, id: jobId, status: to });
}

// ------------------------------------------------------------
// Aggregation + scoring (Pass A) — pure helpers exported for tests
// ------------------------------------------------------------

export function quantile(sortedNums, q) {
  if (!sortedNums.length) return null;
  const pos = (sortedNums.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sortedNums[lo];
  return Math.round(sortedNums[lo] + (sortedNums[hi] - sortedNums[lo]) * (pos - lo));
}

// Bayesian shrinkage toward a broader mean: small samples get pulled to the
// national value instead of dominating rankings. k≈8 confirmed sales = the
// point where an area's own data carries half the weight.
export const SHRINKAGE_K = 8;

export function shrink(value, n, nationalValue, k = SHRINKAGE_K) {
  if (value == null) return nationalValue;
  return (n * value + k * nationalValue) / (n + k);
}

export function shrinkConfidence(n, k = SHRINKAGE_K) {
  return n / (n + k);
}

// Combined Pass A score. Weights come from mi_scoring_models; factors the
// model names but Pass A cannot compute (flipSpread, compQuality,
// growthResilience — all Pass B) are renormalised away and listed as
// missing, so a Pass A score is never silently padded with fake data.
export function computeAreaScore(components, weights) {
  const values = {};
  let weightSum = 0, acc = 0;
  const missing = [];
  for (const [factor, w] of Object.entries(weights)) {
    const v = components[factor];
    if (v == null || Number.isNaN(v)) {
      missing.push(factor);
      continue;
    }
    values[factor] = Math.round(v * 10) / 10;
    weightSum += w;
    acc += w * v;
  }
  if (weightSum === 0) return { score: null, values, missing };
  return { score: Math.round((acc / weightSum) * 10) / 10, values, missing };
}

// ------------------------------------------------------------
// Pass B — comparables, growth, GDV (pure helpers, exported for tests)
// LR PPD gives sale price + property type + street, but NO bedroom count, so
// GDV is matched on property type only. Everything here is best-effort off
// public data; thin samples are flagged, never invented.
// ------------------------------------------------------------

const MI_HOUSE_LR_CLASSES = ['Detached', 'Semi-detached', 'Terraced'];

// Default flip cost model — clearly-labelled, configurable assumptions
// (surfaced/editable in Phase 6c settings). Never silently invents a fee.
export const MI_FLIP_COSTS = {
  buyersPremiumPct: 0.03,     // auction buyer's premium (typical; per-branch fee overrides later)
  buyersPremiumMin: 1500,
  sdltSurchargePct: 0.05,     // additional-dwelling surcharge (flips are 2nd properties)
  legalBuy: 1500,
  legalSell: 1200,
  holdingMonths: 7,
  holdingPerMonth: 350,       // insurance/utilities/void council tax/finance proxy
  agentPct: 0.012,            // selling agent fee
  refurbLight: 20000,
  refurbHeavy: 35000,
  targetReturn: 0.15,
};

// Banded SDLT (England residential) + optional additional-dwelling surcharge on
// the whole price. Labelled assumption — user can zero the surcharge in settings.
export function sdlt(price, surchargePct = MI_FLIP_COSTS.sdltSurchargePct) {
  if (!price || price <= 0) return 0;
  const bands = [[125000, 0], [250000, 0.02], [925000, 0.05], [1500000, 0.10], [Infinity, 0.12]];
  let tax = 0, prev = 0;
  for (const [cap, rate] of bands) {
    if (price <= prev) break;
    tax += (Math.min(price, cap) - prev) * rate;
    prev = cap;
  }
  return Math.round(tax + price * surchargePct);
}

// Land Registry Price Paid parse — mirrors the shape used in index.js.
export function parseLrPpd(json, postcode) {
  const typeLabel = t => {
    if (!t) return '';
    const uri = typeof t === 'string' ? t : (t._about || '');
    const tail = uri.split('/').pop() || '';
    return ({ detached: 'Detached', 'semi-detached': 'Semi-detached', terraced: 'Terraced', flat: 'Flat', 'other-property-type': 'Other' }[tail] || tail);
  };
  return (json?.result?.items || []).map(it => {
    const a = it.propertyAddress || {};
    return {
      price: it.pricePaid || 0,
      date: String(it.transactionDate || '').slice(0, 10),
      paon: a.paon || '',
      street: a.street || '',
      address: [a.saon, a.paon, a.street].filter(Boolean).join(' '),
      town: a.town || '',
      postcode: a.postcode || postcode,
      propertyType: typeLabel(it.propertyType),
      newBuild: !!it.newBuild,
    };
  }).filter(x => x.price > 0 && x.date);
}

const normStreet = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

function summarizePrices(sortedPrices, minSample) {
  const count = sortedPrices.length;
  if (count < minSample) return { count, thin: true, median: null, p25: null, p75: null, min: null, ceiling: null };
  return {
    count, thin: false,
    median: quantile(sortedPrices, 0.5),
    p25: quantile(sortedPrices, 0.25),
    p75: quantile(sortedPrices, 0.75),
    min: sortedPrices[0],
    ceiling: quantile(sortedPrices, 0.95),
  };
}

// Aggregate LR items into per-class distributions + same-street / outcode
// ceilings. New-builds are separated out (not refurb-flip comparables).
export function buildComps(items, opts = {}) {
  const months = opts.months ?? 24;
  const minSample = opts.minSample ?? 3;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cut = cutoff.toISOString().slice(0, 10);
  const recent = (items || []).filter(i => i.price > 0 && i.date >= cut);
  const houses = recent.filter(i => MI_HOUSE_LR_CLASSES.includes(i.propertyType) && !i.newBuild);
  const classes = {};
  for (const cls of MI_HOUSE_LR_CLASSES) {
    const arr = houses.filter(i => i.propertyType === cls).map(i => i.price).sort((a, b) => a - b);
    classes[cls] = summarizePrices(arr, minSample);
  }
  const allHouse = houses.map(i => i.price).sort((a, b) => a - b);
  const houseAll = summarizePrices(allHouse, minSample);
  const sameStreet = {};
  for (const i of houses) {
    const st = normStreet(i.street);
    if (!st) continue;
    if (!sameStreet[st] || i.price > sameStreet[st]) sameStreet[st] = i.price;
  }
  const outcodeCeiling = allHouse.length >= 5 ? quantile(allHouse, 0.95) : (allHouse.length ? allHouse[allHouse.length - 1] : null);
  return { classes, houseAll, sameStreet, outcodeCeiling, months, minSample, totalSales: recent.length, houseSales: houses.length };
}

// Maps a parsed lot property type to the LR class its comps come from.
// Ambiguous types (bungalow/cottage/mews) fall back to the all-house pool.
export function lotTypeToLrClass(propertyType) {
  const t = String(propertyType || '').toLowerCase();
  if (!t) return null;
  if (/terrace|town\s?house/.test(t)) return 'Terraced';
  if (/semi/.test(t)) return 'Semi-detached';
  if (/\bdetached\b/.test(t)) return 'Detached';
  return null; // bungalow, cottage, mews, unknown → all-house fallback
}

// Per-lot GDV bands + flip economics. conservative=P25, expected=median,
// optimistic=P75 capped at the same-street ceiling. purchase basis is the
// caller's responsibility (confirmed price vs guide midpoint) and is echoed back.
export function computeGdv(purchase, comps, lrClass, opts = {}) {
  const c = { ...MI_FLIP_COSTS, ...(opts.costs || {}) };
  const minSample = opts.minSample ?? comps.minSample ?? 3;
  const cls = (lrClass && comps.classes[lrClass] && !comps.classes[lrClass].thin)
    ? comps.classes[lrClass] : comps.houseAll;
  if (!cls || cls.thin) {
    return { gdvConservative: null, gdvExpected: null, gdvOptimistic: null, compClass: lrClass, compCount: cls?.count ?? 0, thin: true };
  }
  const streetCeil = opts.streetCeiling || null;
  const gdvConservative = cls.p25;
  const gdvExpected = cls.median;
  const gdvOptimistic = streetCeil ? Math.min(cls.p75, streetCeil) : cls.p75;
  const compClass = comps.classes[lrClass] && !comps.classes[lrClass].thin ? lrClass : 'all-house';

  // GDV bands stand on the comps alone; flip economics need a purchase price.
  if (!purchase) {
    return { gdvConservative, gdvExpected, gdvOptimistic, compClass, compCount: cls.count, profitExpected: null, roiExpected: null, band: null, refurbBand: [c.refurbLight, c.refurbHeavy], thin: false };
  }

  const buyersPremium = Math.max(c.buyersPremiumMin, Math.round(purchase * c.buyersPremiumPct));
  const buyCosts = buyersPremium + sdlt(purchase, c.sdltSurchargePct) + c.legalBuy;
  const holding = c.holdingPerMonth * c.holdingMonths;
  const refurbMid = Math.round((c.refurbLight + c.refurbHeavy) / 2);
  const sellCosts = gdv => Math.round(gdv * c.agentPct) + c.legalSell;
  const totalCost = refurb => purchase + buyCosts + holding + refurb;
  const profitAt = (gdv, refurb) => gdv - totalCost(refurb) - sellCosts(gdv);

  const profitExpected = profitAt(gdvExpected, refurbMid);
  const roiExpected = +(profitExpected / totalCost(refurbMid)).toFixed(3);
  const band = roiExpected >= c.targetReturn ? 'target' : (profitExpected > 0 ? 'entry_opportunity' : 'below_breakeven');

  return {
    gdvConservative, gdvExpected, gdvOptimistic,
    compClass, compCount: cls.count,
    profitExpected, roiExpected, band,
    refurbBand: [c.refurbLight, c.refurbHeavy],
    costs: { buyCosts, holding, sellCostsAtExpected: sellCosts(gdvExpected) },
    thin: false,
  };
}

// HPI growth with the 2020 COVID shock separated out (raw 1/3/5yr kept for
// transparency; the score uses the post-2021 annualised trend + volatility).
export function hpiGrowth(series) {
  const items = (series || []).filter(i => i.price > 0 && i.date).sort((a, b) => b.date.localeCompare(a.date));
  if (!items.length) return null;
  const current = items[0].price;
  const at = monthsAgo => {
    const t = new Date(items[0].date);
    t.setMonth(t.getMonth() - monthsAgo);
    const s = t.toISOString().slice(0, 7);
    return items.find(i => i.date.slice(0, 7) <= s)?.price || null;
  };
  const pct = (a, b) => b ? Math.round((a - b) / b * 1000) / 10 : null;
  const postCovid = items.find(i => i.date.slice(0, 7) <= '2021-07');
  let covidAdjustedAnnual = null;
  if (postCovid && postCovid.price > 0) {
    const months = Math.max(1, Math.round((new Date(items[0].date) - new Date(postCovid.date)) / (30.44 * 864e5)));
    if (months >= 6) covidAdjustedAnnual = Math.round((Math.pow(current / postCovid.price, 12 / months) - 1) * 1000) / 10;
  }
  const yoy = [];
  for (let m = 12; m <= 60; m += 12) {
    const younger = m === 12 ? current : at(m - 12);
    const older = at(m);
    if (younger && older) yoy.push((younger - older) / older);
  }
  let volatility = null;
  if (yoy.length >= 2) {
    const mean = yoy.reduce((s, v) => s + v, 0) / yoy.length;
    volatility = +(Math.sqrt(yoy.reduce((s, v) => s + (v - mean) ** 2, 0) / yoy.length) * 100).toFixed(1);
  }
  return {
    current: Math.round(current),
    growth1yr: pct(current, at(12)), growth3yr: pct(current, at(36)), growth5yr: pct(current, at(60)),
    covidAdjustedAnnual, volatility, lastUpdated: items[0].date, points: items.length,
  };
}

// Pass B area-score factors (0-100). Null when the underlying data is absent.
export function flipSpreadScore(medianExpectedGdv, medianPurchase) {
  if (!medianExpectedGdv || !medianPurchase) return null;
  const spread = (medianExpectedGdv - medianPurchase) / medianPurchase;
  return Math.max(0, Math.min(100, Math.round(spread / 0.5 * 100))); // 50%+ spread saturates at 100
}
export function compQualityScore(houseSales) {
  if (houseSales == null) return null;
  return Math.round(100 * houseSales / (houseSales + 25)); // ~40 comps → ~62, saturating
}
export function growthResilienceScore(covidAdjustedAnnual, volatility) {
  if (covidAdjustedAnnual == null) return null;
  let s = 50 + covidAdjustedAnnual * 7;
  if (volatility != null) s -= Math.min(20, volatility * 1.5);
  return Math.max(0, Math.min(100, Math.round(s)));
}

const CONFIRMED_STATUSES = ['sold_for', 'sold_prior_for', 'sold_after_for'];
const UNCONFIRMED_SOLD_STATUSES = ['sold', 'sold_prior', 'sold_after'];
const MI_WINDOW = '24m';
const SUB100K = 100000;

function windowCutoffs() {
  const now = new Date();
  const from = new Date(now);
  from.setUTCMonth(from.getUTCMonth() - 24);
  return { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
}

function chunkBatches(env, stmts, size = 90) {
  const batches = [];
  for (let i = 0; i < stmts.length; i += size) batches.push(stmts.slice(i, i + size));
  return batches;
}

// Free-plan subrequest budget shapes this: 3 GROUP BY queries + 1 bulk
// confirmed-price fetch + 1 repeat-lot query cover every area, then
// ~90-statement batches write metrics and scores (~35 subrequests total).
export async function runAggregation(env) {
  const { from, to } = windowCutoffs();
  const now = nowIso();
  const confirmedIn = CONFIRMED_STATUSES.map(s => `'${s}'`).join(',');
  const unconfirmedIn = UNCONFIRMED_SOLD_STATUSES.map(s => `'${s}'`).join(',');

  const groupSql = key => `
    SELECT ${key} area_id,
      COUNT(*) lots_total,
      SUM(CASE WHEN excluded = 0 THEN 1 ELSE 0 END) lots_eligible,
      SUM(CASE WHEN excluded = 0 AND result_status IN (${confirmedIn}) THEN 1 ELSE 0 END) sold_confirmed,
      SUM(CASE WHEN excluded = 0 AND result_status IN (${unconfirmedIn}) THEN 1 ELSE 0 END) sold_unconfirmed,
      SUM(CASE WHEN excluded = 0 AND price_confirmed = 1 AND sold_price <= ${SUB100K} THEN 1 ELSE 0 END) sub100k_confirmed,
      SUM(CASE WHEN excluded = 0 AND result_status IN ('withdrawn','postponed') THEN 1 ELSE 0 END) not_offered,
      SUM(CASE WHEN excluded = 0 AND result_status IN ('no_bids','unsold','last_bid') THEN 1 ELSE 0 END) failed_to_sell
    FROM mi_lots
    WHERE auction_end_at >= ? AND auction_end_at <= ? AND ${key} IS NOT NULL
    GROUP BY ${key}`;

  const [outcodeGroups, townGroups, branchGroups, confirmedRows, repeatRows, model, contextRows] = await Promise.all([
    env.CRM_DB.prepare(groupSql('outcode')).bind(from, to + 'T23:59').all(),
    env.CRM_DB.prepare(groupSql('town')).bind(from, to + 'T23:59').all(),
    env.CRM_DB.prepare(groupSql('branch_id')).bind(from, to + 'T23:59').all(),
    env.CRM_DB.prepare(
      `SELECT outcode, town, branch_id, sold_price, guide_min, substr(auction_end_at, 1, 7) month
       FROM mi_lots
       WHERE excluded = 0 AND price_confirmed = 1 AND auction_end_at >= ? AND auction_end_at <= ?`
    ).bind(from, to + 'T23:59').all(),
    env.CRM_DB.prepare(
      `SELECT l.outcode, l.town, l.branch_id, COUNT(*) n FROM (
         SELECT lot_id FROM mi_lot_results GROUP BY lot_id HAVING COUNT(DISTINCT auction_id) > 1
       ) r JOIN mi_lots l ON l.id = r.lot_id
       GROUP BY l.outcode, l.town, l.branch_id`
    ).all(),
    env.CRM_DB.prepare('SELECT * FROM mi_scoring_models WHERE is_default = 1 LIMIT 1').first(),
    env.CRM_DB.prepare(`SELECT area_type, area_id, data FROM mi_area_context WHERE kind = 'score_factors'`).all(),
  ]);
  const weights = JSON.parse(model?.weights || '{}');
  // Pass B factors, keyed by area — injected so a wholesale recompute never
  // clobbers an enriched area's fuller score with Pass-A-only nulls.
  const passBFactors = new Map();
  for (const r of (contextRows?.results || [])) {
    try { passBFactors.set(`${r.area_type}:${r.area_id}`, JSON.parse(r.data)); } catch { /* skip */ }
  }

  // Per-area detail from the bulk confirmed-price rows
  const detailByArea = { outcode: new Map(), town: new Map(), branch: new Map() };
  const areaKeyOf = { outcode: r => r.outcode, town: r => r.town, branch: r => r.branch_id };
  for (const row of confirmedRows.results) {
    for (const [type, keyFn] of Object.entries(areaKeyOf)) {
      const key = keyFn(row);
      if (!key) continue;
      let d = detailByArea[type].get(key);
      if (!d) detailByArea[type].set(key, d = { prices: [], guideRatios: [], months: {}, sub100kMonths: new Set() });
      d.prices.push(row.sold_price);
      if (row.guide_min > 0) d.guideRatios.push(row.sold_price / row.guide_min);
      d.months[row.month] = (d.months[row.month] || 0) + 1;
      if (row.sold_price <= SUB100K) d.sub100kMonths.add(row.month);
    }
  }
  const repeatByArea = { outcode: new Map(), town: new Map(), branch: new Map() };
  for (const r of repeatRows.results) {
    if (r.outcode) repeatByArea.outcode.set(r.outcode, (repeatByArea.outcode.get(r.outcode) || 0) + r.n);
    if (r.town) repeatByArea.town.set(r.town, (repeatByArea.town.get(r.town) || 0) + r.n);
    repeatByArea.branch.set(r.branch_id, (repeatByArea.branch.get(r.branch_id) || 0) + r.n);
  }

  // National baselines for shrinkage
  const natGroups = branchGroups.results;
  const natEligible = natGroups.reduce((s, g) => s + g.lots_eligible, 0);
  const natConfirmed = natGroups.reduce((s, g) => s + g.sold_confirmed, 0);
  const natUnconfirmed = natGroups.reduce((s, g) => s + g.sold_unconfirmed, 0);
  const natSub100k = natGroups.reduce((s, g) => s + g.sub100k_confirmed, 0);
  const natNotOffered = natGroups.reduce((s, g) => s + g.not_offered, 0);
  const natOffered = natEligible - natNotOffered;
  const national = {
    sellThrough: natOffered > 0 ? (natConfirmed + natUnconfirmed) / natOffered : 0,
    pctUnderBudget: natConfirmed > 0 ? natSub100k / natConfirmed : 0,
  };

  const metricStmts = [];
  const scoreStmts = [];
  const groupsByType = { outcode: outcodeGroups.results, town: townGroups.results, branch: branchGroups.results };
  const summary = { areas: 0, scored: 0 };

  for (const [type, groups] of Object.entries(groupsByType)) {
    for (const g of groups) {
      const d = detailByArea[type].get(g.area_id) || { prices: [], guideRatios: [], months: {}, sub100kMonths: new Set() };
      const prices = d.prices.slice().sort((a, b) => a - b);
      const offered = g.lots_eligible - g.not_offered;
      const sellThrough = offered > 0 ? (g.sold_confirmed + g.sold_unconfirmed) / offered : null;
      const guideRatio = d.guideRatios.length >= 3
        ? d.guideRatios.reduce((s, v) => s + v, 0) / d.guideRatios.length : null;
      const n = g.sold_confirmed;
      const detail = {
        statusCounts: { failedToSell: g.failed_to_sell, notOffered: g.not_offered },
        monthlyConfirmed: d.months,
        activeSub100kMonths: d.sub100kMonths.size,
        repeatLots: repeatByArea[type].get(g.area_id) || 0,
      };
      metricStmts.push(env.CRM_DB.prepare(
        `INSERT INTO mi_area_metrics (area_type, area_id, window, lots_total, lots_eligible, sold_confirmed,
           sold_unconfirmed, sub100k_confirmed, sell_through_pct, price_median, price_p25, price_p75,
           guide_to_sold_ratio, sample_size, detail, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(area_type, area_id, window) DO UPDATE SET
           lots_total=excluded.lots_total, lots_eligible=excluded.lots_eligible,
           sold_confirmed=excluded.sold_confirmed, sold_unconfirmed=excluded.sold_unconfirmed,
           sub100k_confirmed=excluded.sub100k_confirmed, sell_through_pct=excluded.sell_through_pct,
           price_median=excluded.price_median, price_p25=excluded.price_p25, price_p75=excluded.price_p75,
           guide_to_sold_ratio=excluded.guide_to_sold_ratio, sample_size=excluded.sample_size,
           detail=excluded.detail, computed_at=excluded.computed_at`
      ).bind(
        type, g.area_id, MI_WINDOW, g.lots_total, g.lots_eligible, g.sold_confirmed,
        g.sold_unconfirmed, g.sub100k_confirmed,
        sellThrough != null ? +(sellThrough * 100).toFixed(1) : null,
        prices.length >= 3 ? quantile(prices, 0.5) : null,
        prices.length >= 3 ? quantile(prices, 0.25) : null,
        prices.length >= 3 ? quantile(prices, 0.75) : null,
        guideRatio != null ? +guideRatio.toFixed(3) : null,
        n, JSON.stringify(detail), now
      ));
      summary.areas++;

      // Pass A components + any Pass B factors already computed for this area.
      const pb = passBFactors.get(`${type}:${g.area_id}`) || {};
      const components = {
        sub100kSupply: 100 * g.sub100k_confirmed / (g.sub100k_confirmed + 20),
        demandLiquidity: sellThrough != null
          ? shrink(sellThrough, n, national.sellThrough) * 100 : null,
        risk: shrinkConfidence(n) * 100,
        flipSpread: pb.flipSpread ?? null,
        compQuality: pb.compQuality ?? null,
        growthResilience: pb.growthResilience ?? null,
      };
      const { score, values, missing } = computeAreaScore(components, weights);
      if (score == null) continue;
      scoreStmts.push(env.CRM_DB.prepare(
        `INSERT INTO mi_area_scores (area_type, area_id, model_id, score, confidence, components, computed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(area_type, area_id, model_id) DO UPDATE SET
           score=excluded.score, confidence=excluded.confidence,
           components=excluded.components, computed_at=excluded.computed_at`
      ).bind(
        type, g.area_id, model?.id || 'default-v1', score,
        +shrinkConfidence(n).toFixed(3),
        JSON.stringify({
          values, missing,
          shrinkage: { k: SHRINKAGE_K, n, nationalSellThrough: +(national.sellThrough * 100).toFixed(1) },
          pctUnderBudget: n > 0 ? +((g.sub100k_confirmed / n) * 100).toFixed(1) : null,
        }), now
      ));
      summary.scored++;
    }
  }

  for (const batch of chunkBatches(env, metricStmts)) await env.CRM_DB.batch(batch);
  for (const batch of chunkBatches(env, scoreStmts)) await env.CRM_DB.batch(batch);
  return { ...summary, window: MI_WINDOW, from, to, national: { sellThroughPct: +(national.sellThrough * 100).toFixed(1), pctUnderBudget: +(national.pctUnderBudget * 100).toFixed(1) }, modelId: model?.id };
}

// ------------------------------------------------------------
// Storage projection (Phase 2 go/no-go gate before national backfill)
// ------------------------------------------------------------

// Fetches page 1 of every active branch to record real pagination depth —
// no ingestion, just page_count_estimate. ~23 fetches at 1.1s spacing.
async function probeBranches(env) {
  const { results: branches } = await env.CRM_DB.prepare(
    'SELECT * FROM mi_branches WHERE active = 1 ORDER BY id'
  ).all();
  const probed = [];
  for (const b of branches) {
    try {
      const res = await fetch(b.results_url, { headers: { 'User-Agent': MI_UA }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) {
        probed.push({ id: b.id, error: `HTTP ${res.status}` });
      } else {
        const parsed = parsePastAuctionPage(await res.text());
        await env.CRM_DB.prepare('UPDATE mi_branches SET page_count_estimate = ?, updated_at = ? WHERE id = ?')
          .bind(parsed.totalPages, nowIso(), b.id).run();
        probed.push({ id: b.id, pages: parsed.totalPages, lotsOnPage1: parsed.lots.length });
      }
    } catch (err) {
      probed.push({ id: b.id, error: String(err).slice(0, 120) });
    }
    await sleep(MI_LIMITS.fetchSpacingMs);
  }
  return probed;
}

async function storageEstimate(env) {
  const lotSample = await env.CRM_DB.prepare(
    `SELECT COUNT(*) n, AVG(
       LENGTH(id) + LENGTH(COALESCE(platform_lot_id,'')) + LENGTH(branch_id) +
       LENGTH(COALESCE(auction_id,'')) + LENGTH(COALESCE(address,'')) +
       LENGTH(COALESCE(postcode,'')) + LENGTH(COALESCE(outcode,'')) +
       LENGTH(COALESCE(town,'')) + LENGTH(result_status) +
       LENGTH(COALESCE(exclusion_reasons,'')) + LENGTH(COALESCE(auction_end_at,'')) +
       LENGTH(COALESCE(first_seen_at,'')) + LENGTH(COALESCE(last_seen_at,'')) +
       LENGTH(raw) + 80
     ) avg_bytes FROM mi_lots`
  ).first();
  const resSample = await env.CRM_DB.prepare(
    `SELECT COUNT(*) n, AVG(
       LENGTH(lot_id) + LENGTH(auction_id) + LENGTH(observed_at) +
       LENGTH(result_status) + LENGTH(COALESCE(source_url,'')) + 60
     ) avg_bytes FROM mi_lot_results`
  ).first();
  const { results: branches } = await env.CRM_DB.prepare(
    'SELECT id, page_count_estimate FROM mi_branches WHERE active = 1'
  ).all();

  const LOTS_PER_PAGE = 30;
  const knownPages = branches.filter(b => b.page_count_estimate != null);
  const totalKnownPages = knownPages.reduce((s, b) => s + b.page_count_estimate, 0);
  const projectedLots = totalKnownPages * LOTS_PER_PAGE;
  const INDEX_FACTOR = 1.35;      // measured-vs-raw D1 overhead allowance
  const RELIST_FACTOR = 1.2;      // history rows exceed lots when lots reappear
  const avgLot = lotSample.avg_bytes || 900;
  const avgRes = resSample.avg_bytes || 200;
  const projectedBytes = Math.round((projectedLots * avgLot + projectedLots * RELIST_FACTOR * avgRes) * INDEX_FACTOR);

  const dbSize = await env.CRM_DB.prepare('SELECT page_count * page_size AS bytes FROM pragma_page_count(), pragma_page_size()').first().catch(() => null);

  return {
    sample: {
      lots: lotSample.n,
      avgLotBytes: Math.round(avgLot),
      historyRows: resSample.n,
      avgHistoryBytes: Math.round(avgRes),
    },
    branchesProbed: knownPages.length,
    branchesUnprobed: branches.length - knownPages.length,
    pagesByBranch: Object.fromEntries(knownPages.map(b => [b.id, b.page_count_estimate])),
    projection: {
      totalPages: totalKnownPages,
      lots: projectedLots,
      bytes: projectedBytes,
      mb: +(projectedBytes / 1048576).toFixed(1),
      pctOfFreeDbLimit: +((projectedBytes / (500 * 1048576)) * 100).toFixed(2),
    },
    currentDbBytes: dbSize ? dbSize.bytes : null,
  };
}

// ------------------------------------------------------------
// Route handler — single session-checked entry for all /api/market/*
// ------------------------------------------------------------

export async function handleMarketIntelRoutes(request, env, url) {
  const session = await getSession(env, request);
  if (!session) return json({ success: false, message: 'Unauthorized' }, 401);

  const path = url.pathname;
  const method = request.method;

  if (path === '/api/market/branches' && method === 'GET') {
    const { results } = await env.CRM_DB.prepare(
      'SELECT * FROM mi_branches ORDER BY name'
    ).all();
    return json({ success: true, branches: results });
  }

  if (path === '/api/market/branches/seed' && method === 'POST') {
    const result = await seedBranches(env);
    return json({ success: true, ...result });
  }

  if (path === '/api/market/branches/probe' && method === 'POST') {
    const probed = await probeBranches(env);
    return json({ success: true, probed });
  }

  if (path === '/api/market/storage-estimate' && method === 'GET') {
    return json({ success: true, ...(await storageEstimate(env)) });
  }

  if (path === '/api/market/aggregate' && method === 'POST') {
    return json({ success: true, ...(await runAggregation(env)) });
  }

  if (path === '/api/market/overview' && method === 'GET') {
    const [totals, areas, jobs, branches, lastAgg] = await Promise.all([
      env.CRM_DB.prepare(
        `SELECT COUNT(*) lots,
           SUM(price_confirmed) confirmed,
           SUM(CASE WHEN price_confirmed = 1 AND sold_price <= 100000 THEN 1 ELSE 0 END) sub100k,
           SUM(CASE WHEN result_status = 'unknown' THEN 1 ELSE 0 END) unknown_status,
           COUNT(DISTINCT outcode) outcodes,
           MIN(auction_end_at) earliest, MAX(auction_end_at) latest
         FROM mi_lots`
      ).first(),
      env.CRM_DB.prepare(`SELECT COUNT(*) n FROM mi_area_scores WHERE model_id = (SELECT id FROM mi_scoring_models WHERE is_default = 1 LIMIT 1)`).first(),
      env.CRM_DB.prepare(`SELECT status, COUNT(*) n FROM mi_jobs GROUP BY status`).all(),
      env.CRM_DB.prepare(`SELECT COUNT(*) n FROM mi_branches WHERE active = 1`).first(),
      env.CRM_DB.prepare(`SELECT MAX(computed_at) t FROM mi_area_metrics`).first(),
    ]);
    return json({
      success: true,
      totals,
      areasScored: areas.n,
      branches: branches.n,
      jobs: Object.fromEntries(jobs.results.map(r => [r.status, r.n])),
      lastAggregatedAt: lastAgg.t,
    });
  }

  if (path === '/api/market/lots' && method === 'GET') {
    const p = url.searchParams;
    const where = ['1=1'];
    const binds = [];
    const add = (clause, value) => { binds.push(value); where.push(clause.replace('?', `?${binds.length}`)); };
    if (p.get('branch')) add('branch_id = ?', p.get('branch'));
    if (p.get('outcode')) add('outcode LIKE ?', p.get('outcode').toUpperCase() + '%');
    if (p.get('status')) add('result_status = ?', p.get('status'));
    if (p.get('confirmedOnly') === '1') where.push('price_confirmed = 1');
    if (p.get('excluded') === '0') where.push('excluded = 0');
    if (p.get('maxPrice')) add('sold_price <= ?', parseInt(p.get('maxPrice'), 10) || 100000);
    if (p.get('q')) add('address LIKE ?', '%' + p.get('q') + '%');
    const sort = p.get('sort') === 'price' ? 'sold_price DESC' : 'auction_end_at DESC';
    const limit = Math.min(parseInt(p.get('limit') || '50', 10), 1000);
    const offset = Math.max(parseInt(p.get('offset') || '0', 10), 0);
    const whereSql = where.join(' AND ');
    const [rows, count] = await Promise.all([
      env.CRM_DB.prepare(
        `SELECT id, platform_lot_id, branch_id, address, postcode, outcode, town, guide_min, guide_max,
                result_status, sold_price, price_confirmed, excluded, exclusion_reasons, auction_end_at
         FROM mi_lots WHERE ${whereSql} ORDER BY ${sort} LIMIT ${limit} OFFSET ${offset}`
      ).bind(...binds).all(),
      env.CRM_DB.prepare(`SELECT COUNT(*) n FROM mi_lots WHERE ${whereSql}`).bind(...binds).first(),
    ]);
    return json({ success: true, total: count.n, limit, offset, lots: rows.results });
  }

  if (path === '/api/market/areas' && method === 'GET') {
    const type = url.searchParams.get('type') || 'outcode';
    if (!['outcode', 'town', 'branch'].includes(type)) {
      return json({ success: false, message: 'type must be outcode|town|branch' }, 400);
    }
    const minConfirmed = parseInt(url.searchParams.get('minConfirmed') || '0', 10);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 500);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
    const prefix = url.searchParams.get('prefix');
    const sort = url.searchParams.get('sort') === 'sub100k' ? 'm.sub100k_confirmed' : 's.score';
    let where = 'm.area_type = ?1 AND m.window = ?2 AND m.sold_confirmed >= ?3';
    const binds = [type, '24m', minConfirmed];
    if (prefix) {
      where += ` AND m.area_id LIKE ?${binds.length + 1}`;
      binds.push(prefix.toUpperCase() + '%');
    }
    const { results } = await env.CRM_DB.prepare(
      `SELECT m.area_id, m.lots_total, m.lots_eligible, m.sold_confirmed, m.sold_unconfirmed,
              m.sub100k_confirmed, m.sell_through_pct, m.price_median, m.price_p25, m.price_p75,
              m.guide_to_sold_ratio, m.detail, m.computed_at,
              s.score, s.confidence, s.components
       FROM mi_area_metrics m
       LEFT JOIN mi_area_scores s ON s.area_type = m.area_type AND s.area_id = m.area_id
         AND s.model_id = (SELECT id FROM mi_scoring_models WHERE is_default = 1 LIMIT 1)
       WHERE ${where}
       ORDER BY ${sort} DESC
       LIMIT ${limit} OFFSET ${offset}`
    ).bind(...binds).all();
    return json({ success: true, type, window: '24m', count: results.length, areas: results });
  }

  if (path === '/api/market/jobs' && method === 'GET') {
    const { results } = await env.CRM_DB.prepare(
      'SELECT * FROM mi_jobs ORDER BY created_at'
    ).all();
    return json({ success: true, jobs: results });
  }

  if (path === '/api/market/jobs/seed' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return seedJobs(env, body);
  }

  if (path === '/api/market/jobs/tick' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const maxPages = Number.isInteger(body?.maxPages) ? body.maxPages : undefined;
    const result = await runMarketIntelTick(env, { maxPages });
    return json({ success: true, ...result });
  }

  const jobAction = path.match(/^\/api\/market\/jobs\/([^/]+)\/(pause|resume)$/);
  if (jobAction && method === 'POST') {
    const [, jobId, action] = jobAction;
    return action === 'pause'
      ? setJobStatus(env, decodeURIComponent(jobId), ['queued', 'error'], 'paused')
      : setJobStatus(env, decodeURIComponent(jobId), ['paused', 'error'], 'queued');
  }

  // Pass B area context: comps/growth/ceiling summaries + per-lot GDV bands.
  if (path === '/api/market/context' && method === 'GET') {
    const areaType = url.searchParams.get('type') || 'outcode';
    const areaId = (url.searchParams.get('id') || '').toUpperCase();
    if (!areaId) return json({ success: false, message: 'id is required' }, 400);
    const [ctx, lots] = await Promise.all([
      env.CRM_DB.prepare('SELECT kind, data, fetched_at FROM mi_area_context WHERE area_type = ? AND area_id = ?').bind(areaType, areaId).all(),
      areaType === 'outcode'
        ? env.CRM_DB.prepare(
            `SELECT id, address, property_type, bedrooms, tenure, sold_price, price_confirmed, guide_min, guide_max,
                    json_extract(raw, '$.passBContext') gdv
             FROM mi_lots WHERE outcode = ? AND excluded = 0 AND enrichment_level = 1
               AND json_extract(raw, '$.passBContext.gdvExpected') IS NOT NULL
             ORDER BY json_extract(raw, '$.passBContext.roiExpected') DESC LIMIT 300`
          ).bind(areaId).all()
        : Promise.resolve({ results: [] }),
    ]);
    const context = {};
    for (const r of ctx.results) { try { context[r.kind] = { ...JSON.parse(r.data), fetchedAt: r.fetched_at }; } catch { /* skip */ } }
    const gdvLots = (lots.results || []).map(l => ({ ...l, gdv: l.gdv ? JSON.parse(l.gdv) : null }));
    return json({ success: true, areaType, areaId, context, gdvLots });
  }

  return json({ success: false, message: 'Not found' }, 404);
}
