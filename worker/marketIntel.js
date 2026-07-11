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

  return json({ success: false, message: 'Not found' }, 404);
}
