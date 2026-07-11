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

  const jobAction = path.match(/^\/api\/market\/jobs\/([^/]+)\/(pause|resume)$/);
  if (jobAction && method === 'POST') {
    const [, jobId, action] = jobAction;
    return action === 'pause'
      ? setJobStatus(env, decodeURIComponent(jobId), ['queued', 'error'], 'paused')
      : setJobStatus(env, decodeURIComponent(jobId), ['paused', 'error'], 'queued');
  }

  return json({ success: false, message: 'Not found' }, 404);
}
