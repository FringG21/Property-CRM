import puppeteer from '@cloudflare/puppeteer';

// ============================================================
// Property CRM — Cloudflare Worker
// ============================================================

// Frontend and worker are served from the same origin (single-page app via
// the ASSETS binding), so the only legitimate cross-origin caller is none —
// this just stops arbitrary third-party sites from calling the API with a
// leaked bearer token. Wrangler dev serves both from the same local origin too.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://property-crm.aa-investment-partners.workers.dev',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function corsResponse(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra },
  });
}

// ============================================================
// AUCTION CONTROL CENTRE — STATIC CONFIG
// ============================================================

const AUCTION_HOUSES_CONFIG = [
  { id: 'ah_sy', name: 'Auction House South Yorkshire', shortName: 'AH S.Yorks', diaryUrl: 'https://www.auctionhouse.co.uk/southyorkshire/auction/future-auction-dates' },
  { id: 'sdl', name: 'SDL Property Auctions', shortName: 'SDL', diaryUrl: 'https://www.sdlauctions.co.uk/property-auctions/upcoming-auctions/' },
  { id: 'mj', name: 'Mark Jenkinson & Son', shortName: 'Mark Jenkinson', diaryUrl: 'https://www.markjenkinson.co.uk/auction-diary' },
  { id: 'pugh', name: 'Pugh Auctions', shortName: 'Pugh', diaryUrl: 'https://www.pugh-auctions.com/auction-diary' },
  { id: 'allsop', name: 'Allsop Residential', shortName: 'Allsop', diaryUrl: 'https://www.allsop.co.uk/auctions/property-for-auction-in-sheffield/' },
];

// ============================================================
// AUTH HELPERS
// ============================================================

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

const PBKDF2_ITERATIONS = 100000;

// Salted PBKDF2, self-describing format: pbkdf2$<iterations>$<saltHex>$<hashHex>
async function hashPassword(password, saltHex = null, iterations = PBKDF2_ITERATIONS) {
  const saltBytes = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const resolvedSaltHex = saltHex || bytesToHex(saltBytes);
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, keyMaterial, 256);
  return `pbkdf2$${iterations}$${resolvedSaltHex}$${bytesToHex(new Uint8Array(derivedBits))}`;
}

// Legacy unsalted SHA-256 — kept only to verify hashes created before the PBKDF2 migration
async function legacySha256(password) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return bytesToHex(new Uint8Array(hashBuffer));
}

// Verifies against either format; callers that need to know whether to upgrade
// a legacy hash can compare storedHash.startsWith('pbkdf2$') themselves.
async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  if (storedHash.startsWith('pbkdf2$')) {
    const [, iterStr, saltHex] = storedHash.split('$');
    const candidate = await hashPassword(password, saltHex, parseInt(iterStr, 10));
    return candidate === storedHash;
  }
  return (await legacySha256(password)) === storedHash;
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sendEmail(env, { to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'A&A Partners CRM <noreply@aainvestmentpartners.co.uk>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Resend error:', res.status, err);
    return { ok: false, status: res.status, error: err };
  }
  return { ok: true };
}

function getSessionToken(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function getSession(env, request) {
  const token = getSessionToken(request);
  if (!token) return null;
  return await env.SCRAPER_KV.get(`session:${token}`, 'json');
}

// Rate limiter — returns true if allowed, false if limit exceeded
// Uses a 60-second sliding bucket stored in KV
async function checkRateLimit(env, key, limit, windowSeconds = 60) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const kvKey = `ratelimit:${key}:${bucket}`;
  const current = parseInt((await env.SCRAPER_KV.get(kvKey)) || '0');
  if (current >= limit) return false;
  await env.SCRAPER_KV.put(kvKey, String(current + 1), { expirationTtl: windowSeconds * 2 });
  return true;
}

// Default notification preferences for a user
const DEFAULT_NOTIF = {
  newProperty: true,
  auctionCountdown: true,
  countdownDays: [7, 3, 1],
  noteAdded: true,
  newUser: true,
};

async function getUserNotifSettings(env, userId) {
  const stored = await env.SCRAPER_KV.get(`notif:settings:${userId}`, 'json');
  return stored ? { ...DEFAULT_NOTIF, ...stored } : { ...DEFAULT_NOTIF };
}

// Get all CRM users who have a given notification enabled, with their email
async function getNotifRecipients(env, notifKey) {
  const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
  const verified = users.filter(u => u.verified && u.email);
  const recipients = [];
  for (const u of verified) {
    const prefs = await getUserNotifSettings(env, u.id);
    if (prefs[notifKey]) recipients.push({ id: u.id, name: u.name, email: u.email });
  }
  return recipients;
}

// Send auction countdown alerts — called from scheduled cron
async function sendCountdownAlerts(env) {
  const userIds = (await env.SCRAPER_KV.get('crm:user-ids', 'json')) || [];
  const datasets = await Promise.all(userIds.map(id => env.SCRAPER_KV.get(`crm:user:${id}`, 'json')));
  const allProperties = [];
  const seen = new Set();
  for (const d of datasets.filter(Boolean)) {
    for (const p of (d.properties || [])) {
      if (!seen.has(p.id) && !p.deleted) { seen.add(p.id); allProperties.push(p); }
    }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const users = (await env.SCRAPER_KV.get('users', 'json')) || [];

  for (const u of users.filter(u => u.verified && u.email)) {
    const prefs = await getUserNotifSettings(env, u.id);
    if (!prefs.auctionCountdown) continue;
    const days = prefs.countdownDays || [7, 3, 1];

    for (const p of allProperties) {
      if (!p.auctionDate) continue;
      const auction = new Date(p.auctionDate); auction.setHours(0, 0, 0, 0);
      const diff = Math.round((auction - today) / (1000 * 60 * 60 * 24));
      if (!days.includes(diff)) continue;

      try {
        await d1InsertAlert(env, {
          id: `countdown-${p.id}-${diff}d`,
          type: 'auction_countdown',
          title: `Auction in ${diff} day${diff === 1 ? '' : 's'}: ${p.address}`,
          body: `Guide £${(p.guidePrice || 0).toLocaleString()}${p.maxBid ? ` · Max bid £${p.maxBid.toLocaleString()}` : ''}`,
          targetType: 'property',
          targetId: p.id,
        });
      } catch {}

      await sendEmail(env, {
        to: u.email,
        subject: `⏰ Auction in ${diff} day${diff === 1 ? '' : 's'}: ${p.address}`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
          <div style="background:#0f172a;padding:16px 24px;border-radius:10px 10px 0 0">
            <h2 style="color:#fff;margin:0;font-size:18px">⏰ Auction Countdown — ${diff} day${diff === 1 ? '' : 's'} to go</h2>
          </div>
          <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 10px 10px">
            <p style="font-size:16px;font-weight:bold;color:#0f172a;margin:0 0 16px">${p.address}</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tr><td style="padding:6px 0;color:#64748b">Auction date</td><td style="font-weight:600;color:#0f172a">${p.auctionDate}${p.auctionTime ? ' at ' + p.auctionTime : ''}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Guide price</td><td style="font-weight:600;color:#0f172a">£${(p.guidePrice || 0).toLocaleString()}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Max bid</td><td style="font-weight:600;color:#059669">£${(p.maxBid || 0).toLocaleString()}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Platform</td><td style="font-weight:600;color:#0f172a">${p.sourcePlatform || '—'}</td></tr>
              <tr><td style="padding:6px 0;color:#64748b">Status</td><td style="font-weight:600;color:#0f172a">${p.status || 'Sourced'}</td></tr>
            </table>
            ${p.listingUrl ? `<p style="margin-top:16px"><a href="${p.listingUrl}" style="color:#0284c7">View listing ↗</a></p>` : ''}
          </div>
          <p style="font-size:11px;color:#94a3b8;margin-top:16px;text-align:center">A&A Partners CRM — manage your notification preferences in Settings</p>
        </div>`,
      });
    }
  }
}

// ============================================================
// CALENDAR OAUTH HELPERS
// ============================================================

async function refreshGoogleToken(env, userId, calData) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: calData.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Google token refresh failed');
  const data = await res.json();
  const updated = {
    ...calData,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  await env.SCRAPER_KV.put(`calendar:google:${userId}`, JSON.stringify(updated));
  return updated;
}

async function getGoogleAccessToken(env, userId) {
  const calData = await env.SCRAPER_KV.get(`calendar:google:${userId}`, 'json');
  if (!calData) return null;
  if (Date.now() < calData.expiresAt - 60000) return calData.accessToken;
  const updated = await refreshGoogleToken(env, userId, calData);
  return updated.accessToken;
}

async function refreshMicrosoftToken(env, userId, calData) {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      refresh_token: calData.refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
    }),
  });
  if (!res.ok) throw new Error('Microsoft token refresh failed');
  const data = await res.json();
  const updated = {
    ...calData,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || calData.refreshToken,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  await env.SCRAPER_KV.put(`calendar:microsoft:${userId}`, JSON.stringify(updated));
  return updated;
}

async function getMicrosoftAccessToken(env, userId) {
  const calData = await env.SCRAPER_KV.get(`calendar:microsoft:${userId}`, 'json');
  if (!calData) return null;
  if (Date.now() < calData.expiresAt - 60000) return calData.accessToken;
  const updated = await refreshMicrosoftToken(env, userId, calData);
  return updated.accessToken;
}

// ============================================================
// PROPERTY URL SCRAPER
// ============================================================

function extractPropertyDetails(html, pageUrl) {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  // Guide price
  let guidePrice = 0;
  const pricePatterns = [
    /guide\s*price[^£\d]*£?\s*([\d,]+)/i,
    /opening\s*bid[^£\d]*£?\s*([\d,]+)/i,
    /starting\s*(?:bid|price)[^£\d]*£?\s*([\d,]+)/i,
    /£\s*([\d,]+)\s*(?:\*|guide|opening|start)/i,
  ];
  for (const pat of pricePatterns) {
    const m = clean.match(pat);
    if (m) { guidePrice = parseInt(m[1].replace(/,/g, '')); break; }
  }

  // Bedrooms
  let bedrooms = 0;
  const bedMatch = clean.match(/(\d+)\s*(?:-\s*)?bed(?:room)?s?/i);
  if (bedMatch) bedrooms = parseInt(bedMatch[1]);

  // Address — try title tag first, then common patterns
  let address = '';
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const t = titleMatch[1].replace(/\s*[-|].*$/, '').trim();
    if (t.length > 8 && t.length < 120) address = t;
  }
  if (!address) {
    const h1Match = html.match(/<h1[^>]*>([^<]{8,100})<\/h1>/i);
    if (h1Match) address = h1Match[1].replace(/<[^>]+>/g, '').trim();
  }

  // Auction date
  let auctionDate = '';
  const MONTHS = { january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12' };
  const d1 = clean.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  const d2 = clean.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (d1) auctionDate = `${d1[3]}-${MONTHS[d1[2].toLowerCase()]}-${d1[1].padStart(2,'0')}`;
  else if (d2) auctionDate = `${d2[3]}-${d2[2]}-${d2[1]}`;

  // Auction time
  let auctionTime = '';
  const tMatch = clean.match(/(?:auction|commenc|start)[^0-9]{0,20}(\d{1,2})[.:](\d{2})\s*(am|pm)/i) ||
                 clean.match(/(?:at|from)\s+(\d{1,2})[.:](\d{2})\s*(am|pm)/i);
  if (tMatch) auctionTime = `${tMatch[1]}:${tMatch[2]} ${tMatch[3].toUpperCase()}`;

  // Platform
  let platform = 'URL Import';
  const u = pageUrl.toLowerCase();
  if (u.includes('auctionhouse')) platform = 'Auction House';
  else if (u.includes('sdlauctions') || u.includes('sdl-auctions')) platform = 'SDL Auctions';
  else if (u.includes('allsop')) platform = 'Allsop';
  else if (u.includes('pugh-auctions') || u.includes('pugh')) platform = 'Pugh Auctions';
  else if (u.includes('mchugh')) platform = 'McHugh & Co';
  else if (u.includes('barnardmarcus')) platform = 'Barnard Marcus';
  else if (u.includes('savills')) platform = 'Savills';
  else if (u.includes('jllas') || u.includes('jones-lang')) platform = 'JLL';
  else if (u.includes('eigroup') || u.includes('eigproperty')) platform = 'EI Group';
  else if (u.includes('rightmove')) platform = 'Rightmove';
  else if (u.includes('zoopla')) platform = 'Zoopla';

  return { address, guidePrice, bedrooms, auctionDate, auctionTime, platform };
}

// ============================================================
// CRM DATA HELPERS
// ============================================================

const CRM_KEYS = ['properties', 'companies', 'contacts', 'surveyors', 'watchlist', 'scrapedAuctions', 'globalNotes', 'tasks', 'refurbQuotes', 'specItems', 'specTemplates', 'specAllowances', 'taskTemplates', 'catalogTrades', 'catalogProducts', 'roomTemplates'];

function mergeUserData(datasets) {
  const merged = {};
  // Sort most-recently-saved first so newest version of each record wins
  const sorted = [...datasets].sort((a, b) => {
    const ta = a.savedAt ? new Date(a.savedAt).getTime() : 0;
    const tb = b.savedAt ? new Date(b.savedAt).getTime() : 0;
    return tb - ta;
  });
  for (const key of CRM_KEYS) {
    const seen = new Set();
    merged[key] = [];
    for (const dataset of sorted) {
      for (const record of (dataset[key] || [])) {
        if (!seen.has(record.id) && !record.deleted) {
          seen.add(record.id);
          merged[key].push(record);
        }
      }
    }
  }
  return merged;
}

// ============================================================
// D1 STORAGE LAYER
// ============================================================
// Each CRM entity gets its own table. Rows are keyed (user_id, id) so every
// user's copy of a record is stored separately — reads merge newest-first per
// id, which reproduces the legacy KV mergeUserData() semantics exactly.
// The full record always lives in the `data` JSON column; the extra columns
// are extracted at write time purely for relational queries.

const D1_ENTITY_TABLES = {
  properties: {
    table: 'properties',
    cols: r => ({
      status: r.status ?? null,
      postcode: r.postcode ?? null,
      auction_date: r.auctionDate ?? null,
      source_lot_id: r.sourceLotId != null ? String(r.sourceLotId) : null,
    }),
  },
  companies: { table: 'companies', cols: r => ({ name: r.name ?? null, type: r.type ?? null }) },
  contacts: {
    table: 'contacts',
    cols: r => ({ name: r.name ?? null, role: r.role ?? null, company_id: r.companyId != null ? String(r.companyId) : null }),
  },
  surveyors: { table: 'surveyors', cols: r => ({ name: r.name ?? null }) },
  watchlist: { table: 'watchlist_items', cols: r => ({ status: r.status ?? null }) },
  scrapedAuctions: { table: 'scraped_auctions', cols: () => ({}) },
  globalNotes: {
    table: 'global_notes',
    cols: r => ({ target_type: r.targetType ?? null, target_id: r.targetId != null ? String(r.targetId) : null }),
  },
  tasks: {
    table: 'tasks',
    cols: r => ({
      status: r.status ?? null,
      due_date: r.dueDate ?? null,
      linked_type: r.linkedType ?? null,
      linked_id: r.linkedId != null ? String(r.linkedId) : null,
    }),
  },
  refurbQuotes: {
    table: 'refurb_quotes',
    cols: r => ({
      property_id: r.propertyId != null ? String(r.propertyId) : null,
      company_id: r.companyId != null ? String(r.companyId) : null,
      trade_category: r.tradeCategory ?? null,
    }),
  },
  specItems: { table: 'spec_items', cols: r => ({ property_id: r.propertyId != null ? String(r.propertyId) : null }) },
  specTemplates: { table: 'spec_templates', cols: () => ({}) },
  specAllowances: {
    table: 'spec_allowances',
    cols: r => ({ property_id: r.propertyId != null ? String(r.propertyId) : null, category: r.category ?? null }),
  },
  taskTemplates: { table: 'task_templates', cols: () => ({}) },
  catalogTrades: { table: 'catalog_trades', cols: r => ({ trade: r.trade ?? null, job_type: r.jobType ?? null }) },
  catalogProducts: { table: 'catalog_products', cols: r => ({ category: r.category ?? null, supplier: r.supplier ?? null }) },
  roomTemplates: { table: 'catalog_room_templates', cols: () => ({}) },
};

// Replace a user's rows for every entity key present in the blob. Keys absent
// from the blob are left untouched (some save paths post partial payloads).
async function syncUserBlobToD1(env, userId, blob, savedAt) {
  const stmts = [];
  for (const [key, def] of Object.entries(D1_ENTITY_TABLES)) {
    if (!Array.isArray(blob[key])) continue;
    stmts.push(env.CRM_DB.prepare(`DELETE FROM ${def.table} WHERE user_id = ?`).bind(userId));
    for (const r of blob[key]) {
      if (r == null || r.id == null) continue;
      const extra = def.cols(r);
      const extraNames = Object.keys(extra);
      stmts.push(env.CRM_DB.prepare(
        `INSERT OR REPLACE INTO ${def.table} (id, user_id, updated_at, deleted, data${extraNames.map(c => ', ' + c).join('')}) ` +
        `VALUES (?, ?, ?, ?, ?${', ?'.repeat(extraNames.length)})`
      ).bind(String(r.id), userId, savedAt, r.deleted ? 1 : 0, JSON.stringify(r), ...extraNames.map(c => extra[c])));
    }
  }
  if (stmts.length) await env.CRM_DB.batch(stmts);
}

// Rebuild the merged dataset the frontend expects, from D1.
// Mirrors mergeUserData(): newest updated_at wins per id, deleted rows are
// skipped without claiming the id (so an older live copy can still surface).
async function readCrmFromD1(env) {
  const keys = Object.keys(D1_ENTITY_TABLES);
  const results = await env.CRM_DB.batch(keys.map(k =>
    env.CRM_DB.prepare(`SELECT id, deleted, data FROM ${D1_ENTITY_TABLES[k].table} ORDER BY updated_at DESC`)
  ));
  const merged = {};
  keys.forEach((key, i) => {
    const seen = new Set();
    merged[key] = [];
    for (const row of (results[i]?.results || [])) {
      if (row.deleted || seen.has(row.id)) continue;
      seen.add(row.id);
      try { merged[key].push(JSON.parse(row.data)); } catch {}
    }
  });
  return merged;
}

// One-time backfill of every user's KV blob into D1, guarded by a KV flag.
async function ensureCrmMigratedToD1(env) {
  if (await env.SCRAPER_KV.get('d1:crm:migrated')) return;
  const userIds = (await env.SCRAPER_KV.get('crm:user-ids', 'json')) || [];
  for (const id of userIds) {
    const blob = await env.SCRAPER_KV.get(`crm:user:${id}`, 'json');
    if (blob) await syncUserBlobToD1(env, id, blob, blob.savedAt || new Date().toISOString());
  }
  await env.SCRAPER_KV.put('d1:crm:migrated', new Date().toISOString());
}

// One-time backfill of the auction control-centre datasets into D1.
async function ensureAuctionMigratedToD1(env) {
  if (await env.SCRAPER_KV.get('d1:auction:migrated')) return;
  const dates = (await env.SCRAPER_KV.get('auction:dates', 'json')) || [];
  const lots = (await env.SCRAPER_KV.get('auction:lots', 'json')) || [];
  const stmts = [];
  for (const d of dates) {
    if (d?.id == null) continue;
    stmts.push(env.CRM_DB.prepare(
      'INSERT OR REPLACE INTO auction_dates (id, auction_date, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?)'
    ).bind(String(d.id), d.auctionDate || d.date || null, d.firstSeenAt || null, d.lastScannedAt || d.firstSeenAt || null, JSON.stringify(d)));
  }
  for (const l of lots) {
    if (l?.id == null) continue;
    stmts.push(env.CRM_DB.prepare(
      'INSERT OR REPLACE INTO auction_lots (id, date_id, status, is_withdrawn, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(String(l.id), l.dateId != null ? String(l.dateId) : null, l.status || 'unreviewed', l.isWithdrawn ? 1 : 0, l.firstSeenAt || null, l.lastUpdatedAt || l.firstSeenAt || null, JSON.stringify(l)));
  }
  if (stmts.length) await env.CRM_DB.batch(stmts);
  await env.SCRAPER_KV.put('d1:auction:migrated', new Date().toISOString());
}

async function d1GetAuctionDates(env) {
  const { results } = await env.CRM_DB.prepare('SELECT data FROM auction_dates ORDER BY created_at DESC').all();
  return (results || []).map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);
}

async function d1GetAuctionLots(env, dateId = null) {
  const stmt = dateId
    ? env.CRM_DB.prepare('SELECT data FROM auction_lots WHERE date_id = ? ORDER BY created_at ASC').bind(String(dateId))
    : env.CRM_DB.prepare('SELECT data FROM auction_lots ORDER BY created_at ASC');
  const { results } = await stmt.all();
  return (results || []).map(r => { try { return JSON.parse(r.data); } catch { return null; } }).filter(Boolean);
}

async function d1PutAuctionDate(env, date) {
  await env.CRM_DB.prepare(
    'INSERT OR REPLACE INTO auction_dates (id, auction_date, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?)'
  ).bind(String(date.id), date.auctionDate || date.date || null, date.firstSeenAt || null, date.lastScannedAt || date.firstSeenAt || null, JSON.stringify(date)).run();
}

// Insert an alert; deterministic ids + OR IGNORE make generators idempotent.
async function d1InsertAlert(env, { id, type, title, body = '', targetType = null, targetId = null, userId = null }) {
  await env.CRM_DB.prepare(
    'INSERT OR IGNORE INTO alerts (id, user_id, type, title, body, target_type, target_id, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)'
  ).bind(id || `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, userId, type, title, body, targetType, targetId != null ? String(targetId) : null, new Date().toISOString()).run();
}

// Weekly-deduped nudges for overdue tasks and stale quotes — runs from cron.
async function generateAutoChaseAlerts(env) {
  const today = new Date().toISOString().split('T')[0];
  const week = (() => { const d = new Date(); const start = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}w${Math.ceil(((d - start) / 86400000 + 1) / 7)}`; })();

  const { results: taskRows } = await env.CRM_DB.prepare(
    "SELECT id, data FROM tasks WHERE deleted = 0 AND due_date IS NOT NULL AND due_date < ?"
  ).bind(today).all();
  const seenTasks = new Set();
  for (const row of taskRows || []) {
    if (seenTasks.has(row.id)) continue;
    seenTasks.add(row.id);
    try {
      const t = JSON.parse(row.data);
      if (t.status === 'done' || t.status === 'complete') continue;
      await d1InsertAlert(env, {
        id: `chase-task-${row.id}-${week}`,
        type: 'task_overdue',
        title: `Overdue task: ${t.title || 'Untitled'}`,
        body: `Due ${t.dueDate}${t.linkedName ? ` · ${t.linkedName}` : ''}${t.waitingOn ? ` · waiting on ${t.waitingOn}` : ''}`,
        targetType: 'task',
        targetId: row.id,
      });
    } catch {}
  }

  const staleBefore = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
  const { results: quoteRows } = await env.CRM_DB.prepare(
    "SELECT id, data FROM refurb_quotes WHERE deleted = 0"
  ).all();
  const seenQuotes = new Set();
  for (const row of quoteRows || []) {
    if (seenQuotes.has(row.id)) continue;
    seenQuotes.add(row.id);
    try {
      const q = JSON.parse(row.data);
      if (!['needed', 'received', 'reviewing'].includes(q.status)) continue;
      if ((q.quoteDate || q.createdAt || today) > staleBefore) continue;
      await d1InsertAlert(env, {
        id: `chase-quote-${row.id}-${week}`,
        type: 'quote_stale',
        title: `Stale quote: ${q.tradeCategory || 'Trade'} (${q.status})`,
        body: `No movement since ${q.quoteDate || q.createdAt} — chase or close it`,
        targetType: 'quote',
        targetId: row.id,
      });
    } catch {}
  }
}

async function d1PutAuctionLot(env, lot) {
  await env.CRM_DB.prepare(
    'INSERT OR REPLACE INTO auction_lots (id, date_id, status, is_withdrawn, created_at, updated_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(String(lot.id), lot.dateId != null ? String(lot.dateId) : null, lot.status || 'unreviewed', lot.isWithdrawn ? 1 : 0, lot.firstSeenAt || null, lot.lastUpdatedAt || lot.firstSeenAt || null, JSON.stringify(lot)).run();
}

// ============================================================
// SCRAPER HELPERS
// ============================================================

async function scrapeAuctionHouse(url, browser) {
  const page = await browser.newPage();
  let html;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
    html = await page.content();
  } finally {
    await page.close();
  }
  const dates = [];
  const dateRegex = /(\d{2})\/(\d{2})\/(\d{4})/g;
  let match;
  while ((match = dateRegex.exec(html)) !== null) {
    dates.push(`${match[3]}-${match[2]}-${match[1]}`);
  }
  return [...new Set(dates)];
}

async function scrapeMcHugh(url, browser) {
  const page = await browser.newPage();
  let html;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
    html = await page.content();
  } finally {
    await page.close();
  }
  const months = { January:'01',February:'02',March:'03',April:'04',May:'05',June:'06',July:'07',August:'08',September:'09',October:'10',November:'11',December:'12' };
  const dates = [];
  const dateRegex = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/g;
  let match;
  while ((match = dateRegex.exec(html)) !== null) {
    dates.push(`${match[3]}-${months[match[1]]}-${match[2].padStart(2,'0')}`);
  }
  return [...new Set(dates)];
}

async function scrapePugh(url, browser) {
  const page = await browser.newPage();
  let html;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
    html = await page.content();
  } finally {
    await page.close();
  }
  const months = { January:'01',February:'02',March:'03',April:'04',May:'05',June:'06',July:'07',August:'08',September:'09',October:'10',November:'11',December:'12' };
  const dates = [];
  const dateRegex = /(\d{1,2})(?:st|nd|rd|th)(?:-\d{1,2}(?:st|nd|rd|th))?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/g;
  let match;
  while ((match = dateRegex.exec(html)) !== null) {
    dates.push(`${match[3]}-${months[match[2]]}-${match[1].padStart(2,'0')}`);
  }
  return [...new Set(dates)];
}

async function runScrape(env) {
  const sites = [
    {
      platform: 'Auction House South Yorkshire',
      url: 'https://www.auctionhouse.co.uk/southyorkshire/auction/future-auction-dates',
      scraper: scrapeAuctionHouse,
    },
    {
      platform: 'McHugh & Co',
      url: 'https://www.mchughandco.com/pages/auctions',
      scraper: scrapeMcHugh,
    },
    {
      platform: 'Pugh Auctions',
      url: 'https://www.pugh-auctions.com/auction-diary',
      scraper: scrapePugh,
    },
  ];

  const existing = (await env.SCRAPER_KV.get('results', 'json')) || [];
  const existingIds = new Set(existing.map(e => e.id));
  const newEntries = [];

  const browser = await puppeteer.launch(env.BROWSER);
  try {
    for (const site of sites) {
      try {
        const dates = await site.scraper(site.url, browser);
        for (const date of dates) {
          const id = `${site.platform}-${date}`;
          if (!existingIds.has(id)) {
            newEntries.push({
              id,
              platform: site.platform,
              auctionDate: date,
              diaryUrl: site.url,
              totalLotsFound: 0,
              reviewed: false,
              scrapedAt: new Date().toISOString(),
            });
          }
        }
      } catch (err) {
        console.error(`Scrape failed for ${site.platform}:`, err);
      }
    }
  } finally {
    await browser.close();
  }

  const updated = [...existing, ...newEntries];
  await env.SCRAPER_KV.put('results', JSON.stringify(updated));
  for (const entry of newEntries) {
    try {
      await d1InsertAlert(env, {
        id: `newdate-${entry.id}`,
        type: 'listing_change',
        title: `New auction date: ${entry.platform}`,
        body: `${entry.auctionDate} — scan found a new upcoming auction`,
        targetType: 'auction_date',
        targetId: entry.id,
      });
    } catch {}
  }
  return { added: newEntries.length, total: updated.length };
}

// ============================================================
// PROPERTY INTELLIGENCE — API connector helpers
// ============================================================

async function connectorPostcodes(postcode) {
  const pc = postcode.replace(/\s+/g, '').toUpperCase();
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Postcodes.io HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 200 || !data.result) throw new Error('Postcode not found');
  const r = data.result;
  return {
    postcode: r.postcode, lat: r.latitude, lng: r.longitude,
    localAuthority: r.admin_district, ward: r.admin_ward, region: r.region,
    constituency: r.parliamentary_constituency, lsoa: r.lsoa, msoa: r.msoa, country: r.country,
    laCode: r.codes?.admin_district || null,
    lsoaCode: r.codes?.lsoa || null,
    msoaCode: r.codes?.msoa || null,
    wardCode: r.codes?.admin_ward || null,
  };
}

async function connectorPolice(lat, lng) {
  const now = new Date();
  const months = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const allCrimes = [];
  for (const month of months) {
    try {
      const res = await fetch(
        `https://data.police.uk/api/crimes-street/all-crime?lat=${lat}&lng=${lng}&date=${month}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.ok) { const d = await res.json(); if (Array.isArray(d)) allCrimes.push(...d); }
    } catch {}
  }
  const cats = {};
  for (const c of allCrimes) { const k = c.category || 'other'; cats[k] = (cats[k] || 0) + 1; }
  const total = allCrimes.length;
  const rate = Math.round(total / 3);
  const score = Math.min(10, Math.max(1, Math.round(rate / 4)));
  return {
    totalCrimes: total, monthsAnalysed: 3, monthlyAverage: rate, categories: cats,
    antisocialBehaviour: cats['anti-social-behaviour'] || 0,
    burglary: cats['burglary'] || 0,
    violentCrime: (cats['violent-crime'] || 0) + (cats['violence-and-sexual-offences'] || 0),
    riskScore: score,
    riskLabel: score <= 2 ? 'Low' : score <= 5 ? 'Medium' : score <= 7 ? 'High' : 'Very High',
  };
}

async function connectorFlood(lat, lng) {
  const res = await fetch(
    `https://environment.data.gov.uk/flood-monitoring/id/floodAreas?lat=${lat}&long=${lng}&dist=0.5`,
    { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`EA flood HTTP ${res.status}`);
  const data = await res.json();
  const areas = (data.items || []).map(a => ({
    name: a.label || a.notation || 'Unnamed area',
    severity: a.currentWarning?.severity || null,
    county: a.county || '',
  }));
  return {
    floodAreasNearby: areas.length, areas: areas.slice(0, 5),
    hasCurrentWarning: areas.some(a => a.severity),
    riskNote: areas.length === 0
      ? 'No EA flood management areas within 0.5km'
      : `${areas.length} flood management area(s) within 0.5km`,
  };
}

async function connectorPlanning(lat, lng) {
  const constraintDatasets = [
    'conservation-area', 'listed-building', 'article-4-direction',
    'tree-preservation-order', 'site-of-special-scientific-interest',
    'area-of-outstanding-natural-beauty', 'national-park',
  ];
  const opportunityDatasets = [
    'brownfield-land', 'enterprise-zone', 'opportunity-area',
  ];
  const allDatasets = [...constraintDatasets, ...opportunityDatasets];
  const results = {};
  await Promise.allSettled(allDatasets.map(async ds => {
    try {
      const res = await fetch(
        `https://www.planning.data.gov.uk/api/v1/entity.json?point=POINT(${lng}%20${lat})&dataset=${ds}&limit=5`,
        { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return;
      const d = await res.json();
      const ents = d.entities || [];
      results[ds] = ents.map(e => ({ name: e.name || e.reference || ds, reference: e.reference, grade: e.entity?.grade || null }));
    } catch {}
  }));
  const has = ds => (results[ds] || []).length > 0;
  const listedItems = results['listed-building'] || [];
  return {
    conservationArea: has('conservation-area'),
    listedBuilding: has('listed-building'),
    listedBuildingGrade: listedItems[0]?.grade || null,
    article4Direction: has('article-4-direction'),
    treePO: has('tree-preservation-order'),
    sssi: has('site-of-special-scientific-interest'),
    aonb: has('area-of-outstanding-natural-beauty'),
    nationalPark: has('national-park'),
    brownfield: has('brownfield-land'),
    enterpriseZone: has('enterprise-zone'),
    opportunityArea: has('opportunity-area'),
    constraintCount: constraintDatasets.filter(has).length,
    opportunityCount: opportunityDatasets.filter(has).length,
    planningNote: constraintDatasets.filter(has).length === 0
      ? 'No designated planning constraints at this location'
      : `${constraintDatasets.filter(has).length} constraint(s) found`,
    results,
  };
}

async function connectorOSM(lat, lng) {
  const q = `[out:json][timeout:15];(node["amenity"~"^(school|college|university)$"](around:1609,${lat},${lng});node["amenity"="supermarket"](around:804,${lat},${lng});node["shop"="supermarket"](around:804,${lat},${lng});node["railway"="station"](around:1609,${lat},${lng});node["public_transport"="station"](around:1609,${lat},${lng});node["amenity"="hospital"](around:1609,${lat},${lng});node["amenity"="doctors"](around:804,${lat},${lng});node["leisure"="park"](around:804,${lat},${lng});node["amenity"="pharmacy"](around:804,${lat},${lng}););out body;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: q, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();
  const els = data.elements || [];
  const distKm = e => { const R=6371, dLat=(e.lat-lat)*Math.PI/180, dLng=(e.lon-lng)*Math.PI/180, a=Math.sin(dLat/2)**2+Math.cos(lat*Math.PI/180)*Math.cos(e.lat*Math.PI/180)*Math.sin(dLng/2)**2; return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); };
  const schools  = els.filter(e => ['school','college','university'].includes(e.tags?.amenity));
  const mktpl    = els.filter(e => e.tags?.amenity==='supermarket'||e.tags?.shop==='supermarket');
  const stations = els.filter(e => e.tags?.railway==='station'||e.tags?.public_transport==='station');
  const hospitals= els.filter(e => e.tags?.amenity==='hospital');
  const gp       = els.filter(e => e.tags?.amenity==='doctors');
  const parks    = els.filter(e => e.tags?.leisure==='park');
  const pharma   = els.filter(e => e.tags?.amenity==='pharmacy');
  const nearestM = arr => { if (!arr.length) return null; const n=arr.reduce((a,b)=>distKm(a)<=distKm(b)?a:b); return Math.round(distKm(n)*1000); };
  const fmt = (arr, n=3) => [...arr].sort((a,b)=>distKm(a)-distKm(b)).slice(0,n).map(e=>({ name:e.tags?.name||'', distanceM:Math.round(distKm(e)*1000) }));
  const score = Math.min(10, (schools.length>0?2:0)+(mktpl.length>0?2:0)+(stations.length>0?2:0)+(hospitals.length>0||gp.length>0?1:0)+(parks.length>0?1:0)+(pharma.length>0?1:0)+(stations.length>1?1:0));
  return {
    schools: fmt(schools, 5), nearestSchoolM: nearestM(schools),
    supermarkets: fmt(mktpl, 3), nearestSupermarketM: nearestM(mktpl),
    stations: fmt(stations, 3), nearestStationM: nearestM(stations),
    hospitals: fmt(hospitals, 2), gp: fmt(gp, 3), parks: fmt(parks, 3), pharmacies: fmt(pharma, 3),
    amenityScore: score,
    amenityLabel: score>=8?'Excellent':score>=6?'Good':score>=4?'Moderate':'Limited',
  };
}

// ── IMD: Index of Multiple Deprivation (MHCLG ArcGIS, free, no auth) ───────
async function connectorIMD(lsoaCode) {
  if (!lsoaCode) throw new Error('No LSOA code');
  const url = `https://services3.arcgis.com/ivmBBrHfeMeEtXMo/arcgis/rest/services/IMD_2019/FeatureServer/0/query?where=lsoa11cd%3D%27${encodeURIComponent(lsoaCode)}%27&outFields=IMDRank0,IMDDec0,InDRnk0,InDDec0,EmpRnk0,EmpDec0,EduRnk0,EduDec0,HDDRnk0,HDDDec0,CrRnk0,CrDec0,BHSRnk0,BHSDec0,EnvRnk0,EnvDec0&f=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`IMD HTTP ${res.status}`);
  const data = await res.json();
  const a = data?.features?.[0]?.attributes;
  if (!a) throw new Error('No IMD data for LSOA');
  const dec = a.IMDDec0 || 5;
  return {
    rank: a.IMDRank0,
    decile: dec,
    incomeDecile: a.InDDec0,
    employmentDecile: a.EmpDec0,
    educationDecile: a.EduDec0,
    healthDecile: a.HDDDec0,
    crimeDecile: a.CrDec0,
    housingDecile: a.BHSDec0,
    environmentDecile: a.EnvDec0,
    label: dec >= 8 ? 'Low deprivation' : dec >= 5 ? 'Average area' : dec >= 3 ? 'Elevated deprivation' : 'High deprivation',
    score: dec,
  };
}

// ── UK House Price Index (Land Registry linked data, free, no auth) ──────────
async function connectorHPI(laCode) {
  if (!laCode) throw new Error('No LA code');
  const res = await fetch(
    `https://landregistry.data.gov.uk/data/hpi/averagePrice.json?regionCode=${encodeURIComponent(laCode)}&_pageSize=24&_sort=-refPeriodStart`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) throw new Error(`HPI HTTP ${res.status}`);
  const data = await res.json();
  const items = (data.result?.items || [])
    .map(i => ({ date: i.refPeriodStart || i.date || '', price: Number(i.value) || 0 }))
    .filter(i => i.price > 0 && i.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!items.length) throw new Error('No HPI data');
  const current = items[0].price;
  const findAt = monthsAgo => {
    const t = new Date(items[0].date);
    t.setMonth(t.getMonth() - monthsAgo);
    const tStr = t.toISOString().slice(0, 7);
    return items.find(i => i.date.slice(0, 7) <= tStr)?.price || null;
  };
  const pct = (a, b) => b ? Math.round((a - b) / b * 1000) / 10 : null;
  const p1y = findAt(12), p3y = findAt(36), p5y = findAt(60);
  return {
    avgPrice: Math.round(current),
    growth1yr: pct(current, p1y),
    growth3yr: pct(current, p3y),
    growth5yr: pct(current, p5y),
    area: data.result?.items?.[0]?.refRegion?.label || laCode,
    lastUpdated: items[0].date,
    priceHistory: items.slice(0, 20).map(i => ({ date: i.date, price: Math.round(i.price) })),
  };
}

// ── TfL Unified API (London only, free, no auth needed for basic calls) ──────
async function connectorTfL(lat, lng) {
  if (lat < 51.28 || lat > 51.70 || lng < -0.52 || lng > 0.34) return { inLondon: false };
  const [stopRes, bikeRes] = await Promise.allSettled([
    fetch(
      `https://api.tfl.gov.uk/StopPoint?lat=${lat}&lon=${lng}&stopTypes=NaptanMetroStation,NaptanRailStation,NaptanPublicBusCoachTram&radius=800&returnLines=true`,
      { signal: AbortSignal.timeout(12000) },
    ).then(r => r.json()),
    fetch(
      `https://api.tfl.gov.uk/BikePoint?lat=${lat}&lon=${lng}&radius=400`,
      { signal: AbortSignal.timeout(8000) },
    ).then(r => r.json()),
  ]);
  const stops = stopRes.status === 'fulfilled' ? (stopRes.value?.stopPoints || []) : [];
  const bikes = bikeRes.status === 'fulfilled' ? (Array.isArray(bikeRes.value) ? bikeRes.value : []) : [];
  const tube = stops.filter(s => (s.modes || []).includes('tube'));
  const bus  = stops.filter(s => (s.modes || []).includes('bus'));
  const dlr  = stops.filter(s => (s.modes || []).includes('dlr'));
  const eliz = stops.filter(s => (s.modes || []).includes('elizabeth-line'));
  const over = stops.filter(s => (s.modes || []).includes('overground'));
  const lines = [...new Set([...tube, ...dlr, ...eliz, ...over].flatMap(s => (s.lines || []).map(l => l.name)))];
  const zone = tube[0]?.additionalProperties?.find(p => p.key === 'Zone')?.value || null;
  const score = Math.min(10,
    (tube.length > 0 ? 3 : 0) + (eliz.length > 0 ? 2 : 0) + (dlr.length > 0 ? 1 : 0) +
    (over.length > 0 ? 1 : 0) + (bus.length > 0 ? 1 : 0) + (bikes.length > 0 ? 1 : 0) + (tube.length > 1 ? 1 : 0),
  );
  return {
    inLondon: true,
    tubeStops: tube.slice(0, 3).map(s => ({ name: s.commonName, distanceM: Math.round(s.distance || 0), lines: (s.lines || []).map(l => l.name) })),
    dlrStops: dlr.slice(0, 2).map(s => ({ name: s.commonName, distanceM: Math.round(s.distance || 0) })),
    elizabethLineStops: eliz.slice(0, 2).map(s => ({ name: s.commonName, distanceM: Math.round(s.distance || 0) })),
    overgroundStops: over.slice(0, 2).map(s => ({ name: s.commonName, distanceM: Math.round(s.distance || 0) })),
    busStopsCount: bus.length,
    bikePointsCount: bikes.length,
    tflZone: zone,
    lines: lines.slice(0, 8),
    transportScore: score,
  };
}

// ── Schools with Ofsted ratings (DfE GIAS, free, no auth) ───────────────────
async function connectorSchools(lat, lng) {
  const res = await fetch(
    `https://api.get-information-schools.service.gov.uk/v2/establishment/search?location=${lat},${lng}&radiusInMiles=1&statusOpen=true`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) throw new Error(`GIAS HTTP ${res.status}`);
  const data = await res.json();
  const RATING = { 1: 'Outstanding', 2: 'Good', 3: 'Requires Improvement', 4: 'Inadequate' };
  const schools = (data.value || []).map(s => ({
    name: s.name || '',
    type: s.typeOfEstablishment?.displayName || '',
    phase: s.phaseOfEducation?.displayName || '',
    ofstedRating: RATING[s.ofstedRating?.code] || s.ofstedRating?.displayName || null,
    ofstedCode: s.ofstedRating?.code || null,
    urn: s.urn,
  })).filter(s => s.name).slice(0, 10);
  const outstanding = schools.filter(s => s.ofstedCode === 1 || s.ofstedRating === 'Outstanding').length;
  const good = schools.filter(s => s.ofstedCode === 2 || s.ofstedRating === 'Good').length;
  const inadequate = schools.filter(s => s.ofstedCode === 4 || s.ofstedRating === 'Inadequate').length;
  const bestCode = schools.reduce((best, s) => s.ofstedCode && s.ofstedCode < best ? s.ofstedCode : best, 5);
  return {
    schools,
    schoolCount: schools.length,
    outstandingCount: outstanding,
    goodCount: good,
    inadequateCount: inadequate,
    bestRating: RATING[bestCode] || (schools.length > 0 ? 'Unknown' : null),
    bestSchoolName: schools.find(s => s.ofstedCode === bestCode)?.name || null,
  };
}

// ── ONS Census 2021 demographics (ONS Beta API, free, no auth) ───────────────
async function connectorCensus(msoaCode) {
  if (!msoaCode) throw new Error('No MSOA code');
  const [tenureRes, ageRes, economicRes] = await Promise.allSettled([
    fetch(
      `https://api.beta.ons.gov.uk/v1/population-types/UR_HH/census-observations?area-type=msoa&areas=${msoaCode}&variables=tenure_9a`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) },
    ).then(r => r.json()),
    fetch(
      `https://api.beta.ons.gov.uk/v1/population-types/UR/census-observations?area-type=msoa&areas=${msoaCode}&variables=resident_age_17a`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) },
    ).then(r => r.json()),
    fetch(
      `https://api.beta.ons.gov.uk/v1/population-types/UR/census-observations?area-type=msoa&areas=${msoaCode}&variables=economic_activity_status_12a`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) },
    ).then(r => r.json()),
  ]);

  const obs = r => (r.status === 'fulfilled' ? r.value?.observations || [] : []);
  const sum = arr => arr.reduce((s, o) => s + (o.observation || 0), 0);
  const find = (arr, label) => arr.find(o => (o.dimensions?.find(d => d.option_id)?.option?.label || '').toLowerCase().includes(label.toLowerCase()))?.observation || 0;

  const tenureObs = obs(tenureRes);
  const totalHH = sum(tenureObs) || 1;
  const ownedOutright = find(tenureObs, 'owned outright');
  const ownedMortgage = find(tenureObs, 'mortgage');
  const privateRent = find(tenureObs, 'private rent');
  const socialRent = find(tenureObs, 'social');

  const ageObs = obs(ageRes);
  const totalPop = sum(ageObs) || 1;
  const under35 = ageObs.filter(o => {
    const label = o.dimensions?.find(d => d.option_id)?.option?.label || '';
    return /^(0|1[0-9]|2[0-9]|3[0-4])\b/.test(label) || /under 35|aged [0-2]/i.test(label);
  }).reduce((s, o) => s + (o.observation || 0), 0);
  const over65 = ageObs.filter(o => {
    const label = o.dimensions?.find(d => d.option_id)?.option?.label || '';
    return /65|7[0-9]|8[0-9]|9[0-9]|over 65/i.test(label);
  }).reduce((s, o) => s + (o.observation || 0), 0);

  const ecoObs = obs(economicRes);
  const totalEco = sum(ecoObs) || 1;
  const employed = find(ecoObs, 'employed');
  const unemployed = find(ecoObs, 'unemployed');

  return {
    tenure: {
      ownedOutrightPct: Math.round(ownedOutright / totalHH * 100),
      ownedMortgagePct: Math.round(ownedMortgage / totalHH * 100),
      privateRentPct: Math.round(privateRent / totalHH * 100),
      socialRentPct: Math.round(socialRent / totalHH * 100),
    },
    population: {
      total: totalPop,
      under35Pct: Math.round(under35 / totalPop * 100),
      over65Pct: Math.round(over65 / totalPop * 100),
    },
    employment: {
      employedPct: totalEco > 0 ? Math.round(employed / totalEco * 100) : null,
      unemployedPct: totalEco > 0 ? Math.round(unemployed / totalEco * 100) : null,
    },
    msoaCode,
  };
}

function addressSimilarity(a, b) {
  if (!a || !b) return 0;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
  const na = norm(a), nb = norm(b);
  if (na === nb) return 1;
  const wa = new Set(na.split(' ')), wb = new Set(nb.split(' '));
  const inter = [...wa].filter(w => wb.has(w)).length;
  return inter / new Set([...wa, ...wb]).size;
}

// Cross-reference Land Registry comps with EPC records from the same postcode.
// EPC has floor area, energy rating, and habitable room count that LR lacks.
function enrichCompsWithEPC(lrItems, epcItems) {
  if (!epcItems?.length) return lrItems;
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const shortKey = addr => {
    const tokens = norm(addr).split(' ').filter(Boolean);
    const num = tokens.find(t => /^\d+[a-z]?$/.test(t)) || '';
    const numIdx = tokens.indexOf(num);
    const prefix = numIdx > 0 ? tokens.slice(Math.max(0, numIdx - 1), numIdx).join(' ') : '';
    return `${prefix} ${num}`.trim();
  };
  return lrItems.map(lr => {
    const lrKey = shortKey(lr.address);
    let bestScore = 0.35;
    let bestEpc = null;
    for (const epc of epcItems) {
      const epcAddr = [epc.address1, epc.address2].filter(Boolean).join(' ');
      const score = addressSimilarity(lr.address, epcAddr);
      const keyBonus = (lrKey && shortKey(epcAddr) === lrKey) ? 0.2 : 0;
      if (score + keyBonus > bestScore) { bestScore = score + keyBonus; bestEpc = epc; }
    }
    if (!bestEpc) return lr;
    return {
      ...lr,
      epcRating:      bestEpc.currentRating  || null,
      epcPotential:   bestEpc.potentialRating || null,
      floorArea:      bestEpc.floorArea       || null,
      habitableRooms: bestEpc.habitableRooms  || null,
      heatingType:    bestEpc.heatingType     || null,
    };
  });
}

// ============================================================
// MAIN WORKER EXPORT
// ============================================================

export default {
  // Cron handler — runs Wednesday 22:00 and Saturday 22:00 UTC
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all([
      runScrape(env),
      sendCountdownAlerts(env),
      generateAutoChaseAlerts(env).catch(err => console.error('Auto-chase alerts failed:', err)),
    ]));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Routes are handled in handleApiRoutes(); wrapping the call here means a
    // malformed request.json() or any other unexpected throw anywhere below
    // returns a clean JSON error instead of a bare unhandled Worker exception.
    try {
      return await handleApiRoutes(request, env, url);
    } catch (err) {
      console.error('Unhandled worker error:', err);
      if (url.pathname.startsWith('/api/')) {
        return corsResponse({ success: false, message: 'Invalid request' }, 400);
      }
      throw err;
    }
  },
};

async function handleApiRoutes(request, env, url) {
    // --------------------------------------------------------
    // AUCTION CONTROL CENTRE API ROUTES
    // --------------------------------------------------------

    if (url.pathname === '/api/auction/houses' && request.method === 'GET') {
      return corsResponse({ houses: AUCTION_HOUSES_CONFIG });
    }

    if (url.pathname === '/api/auction/dates' && request.method === 'GET') {
      await ensureAuctionMigratedToD1(env);
      const dates = await d1GetAuctionDates(env);
      return corsResponse({ dates });
    }

    if (url.pathname === '/api/auction/dates' && request.method === 'POST') {
      const body = await request.json();
      await ensureAuctionMigratedToD1(env);
      const exists = await env.CRM_DB.prepare('SELECT 1 FROM auction_dates WHERE id = ?').bind(String(body.id)).first();
      if (exists) return corsResponse({ success: false, message: 'Date already exists' }, 409);
      const newDate = { reviewedCount: 0, shortlistedCount: 0, rejectedCount: 0, watchingCount: 0, totalLots: 0, isNew: true, firstSeenAt: new Date().toISOString(), lastScannedAt: new Date().toISOString(), ...body };
      await d1PutAuctionDate(env, newDate);
      return corsResponse({ success: true, date: newDate });
    }

    if (/^\/api\/auction\/dates\/[^/]+$/.test(url.pathname) && request.method === 'PATCH') {
      const id = url.pathname.split('/').pop();
      const updates = await request.json();
      await ensureAuctionMigratedToD1(env);
      const row = await env.CRM_DB.prepare('SELECT data FROM auction_dates WHERE id = ?').bind(String(id)).first();
      if (!row) return corsResponse({ success: false }, 404);
      const updated = { ...JSON.parse(row.data), ...updates };
      await d1PutAuctionDate(env, updated);
      return corsResponse({ success: true });
    }

    if (url.pathname === '/api/auction/lots' && request.method === 'GET') {
      await ensureAuctionMigratedToD1(env);
      const dateId = url.searchParams.get('dateId');
      const lots = await d1GetAuctionLots(env, dateId);
      return corsResponse({ lots });
    }

    if (url.pathname === '/api/auction/lots' && request.method === 'POST') {
      const body = await request.json();
      await ensureAuctionMigratedToD1(env);
      const incoming = Array.isArray(body) ? body : [body];
      const now = new Date().toISOString();
      let created = 0;
      for (const l of incoming) {
        if (l?.id == null) continue;
        const exists = await env.CRM_DB.prepare('SELECT 1 FROM auction_lots WHERE id = ?').bind(String(l.id)).first();
        if (exists) continue;
        const newLot = { status: 'unreviewed', isNew: true, guidePriceChanged: false, isWithdrawn: false, firstSeenAt: now, lastUpdatedAt: now, ...l };
        await d1PutAuctionLot(env, newLot);
        created++;
      }
      return corsResponse({ success: true, created });
    }

    if (/^\/api\/auction\/lots\/[^/]+$/.test(url.pathname) && request.method === 'PATCH') {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const updates = await request.json();
      await ensureAuctionMigratedToD1(env);
      const row = await env.CRM_DB.prepare('SELECT data FROM auction_lots WHERE id = ?').bind(String(id)).first();
      if (!row) return corsResponse({ success: false }, 404);
      const existingLot = JSON.parse(row.data);
      const updatedLot = { ...existingLot, ...updates, lastUpdatedAt: new Date().toISOString() };
      await d1PutAuctionLot(env, updatedLot);

      // Guide-price change on a watched listing → alert feed
      const priceChanged = updates.guidePrice != null && existingLot.guidePrice != null && Number(updates.guidePrice) !== Number(existingLot.guidePrice);
      if (priceChanged || updates.guidePriceChanged === true || updates.isWithdrawn === true) {
        try {
          const what = updates.isWithdrawn === true ? 'withdrawn' : `guide ${Number(existingLot.guidePrice || 0).toLocaleString()} → ${Number(updatedLot.guidePrice || 0).toLocaleString()}`;
          await d1InsertAlert(env, {
            id: `lotchange-${id}-${new Date().toISOString().split('T')[0]}`,
            type: 'listing_change',
            title: `Listing changed: ${updatedLot.address || id}`,
            body: `${updatedLot.houseName || 'Auction'} — ${what}`,
            targetType: 'lot',
            targetId: id,
          });
        } catch {}
      }

      // Recompute parent date counts from the lots table
      const dateId = updatedLot.dateId;
      if (dateId) {
        const dateLots = (await d1GetAuctionLots(env, dateId)).filter(l => !l.isWithdrawn);
        const dateRow = await env.CRM_DB.prepare('SELECT data FROM auction_dates WHERE id = ?').bind(String(dateId)).first();
        if (dateRow) {
          const date = JSON.parse(dateRow.data);
          await d1PutAuctionDate(env, {
            ...date,
            totalLots: dateLots.length,
            reviewedCount: dateLots.filter(l => l.status !== 'unreviewed').length,
            shortlistedCount: dateLots.filter(l => l.status === 'shortlisted').length,
            rejectedCount: dateLots.filter(l => l.status === 'rejected').length,
            watchingCount: dateLots.filter(l => l.status === 'watching').length,
          });
        }
      }
      return corsResponse({ success: true });
    }

    // --------------------------------------------------------
    // SCRAPER API ROUTES
    // --------------------------------------------------------
    if (url.pathname === '/api/scraper/results' && request.method === 'GET') {
      const results = (await env.SCRAPER_KV.get('results', 'json')) || [];
      return corsResponse(results);
    }

    if (url.pathname === '/api/scraper/trigger' && request.method === 'GET') {
      const summary = await runScrape(env);
      return corsResponse({ success: true, ...summary });
    }

    if (url.pathname === '/api/scraper/reviewed' && request.method === 'POST') {
      const { id, reviewed } = await request.json();
      const results = (await env.SCRAPER_KV.get('results', 'json')) || [];
      const updated = results.map(r => r.id === id ? { ...r, reviewed } : r);
      await env.SCRAPER_KV.put('results', JSON.stringify(updated));
      return corsResponse({ success: true });
    }

    // --------------------------------------------------------
    // AUTH API ROUTES
    // --------------------------------------------------------

    // POST /api/auth/setup — one-time first-admin bootstrap, only works while no users exist
    if (url.pathname === '/api/auth/setup' && request.method === 'POST') {
      const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
      if (users.length > 0) return corsResponse({ success: false, message: 'Setup has already been completed' }, 403);

      const { name, email, password } = await request.json();
      if (!name || !email || !password) return corsResponse({ success: false, message: 'Name, email and password are required' }, 400);
      if (password.length < 8) return corsResponse({ success: false, message: 'Password must be at least 8 characters' }, 400);

      const adminUser = {
        id: '1',
        name,
        email,
        role: 'Admin',
        allowedTabs: ['dashboard','pipeline','scraper','surveyors','auctionintel','companies','contacts','tasks','refurb','spec','dealanalysis','portfolio','settings'],
        passwordHash: await hashPassword(password),
        verified: true,
        verifyToken: null,
        verifyExpiry: null,
        resetToken: null,
        resetExpiry: null,
        lastLogin: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      await env.SCRAPER_KV.put('users', JSON.stringify([adminUser]));

      const token = generateToken();
      const sessionData = { userId: adminUser.id, email: adminUser.email, role: adminUser.role, allowedTabs: adminUser.allowedTabs };
      await env.SCRAPER_KV.put(`session:${token}`, JSON.stringify(sessionData), { expirationTtl: 604800 });

      return corsResponse({ success: true, token, user: { name: adminUser.name, email: adminUser.email, role: adminUser.role, allowedTabs: adminUser.allowedTabs } });
    }

    // POST /api/auth/login
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      // 10 attempts per minute per IP — brute-force protection
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const loginAllowed = await checkRateLimit(env, `login:${ip}`, 10);
      if (!loginAllowed) return corsResponse({ success: false, message: 'Too many login attempts — please wait a minute' }, 429);

      const { email, password } = await request.json();

      let users = (await env.SCRAPER_KV.get('users', 'json')) || [];

      if (users.length === 0) {
        return corsResponse({ success: false, needsSetup: true, message: 'No account exists yet — set up the first admin account.' }, 401);
      }

      const user = users.find(u => u.email === email);
      if (!user) {
        return corsResponse({ success: false, message: 'Invalid email or password' }, 401);
      }

      if (!user.verified) {
        return corsResponse({ success: false, message: 'Please verify your email first' }, 401);
      }

      const passwordOk = await verifyPassword(password, user.passwordHash);
      if (!passwordOk) {
        return corsResponse({ success: false, message: 'Invalid email or password' }, 401);
      }

      // Create session
      const token = generateToken();
      const sessionData = { userId: user.id, email: user.email, role: user.role, allowedTabs: user.allowedTabs };
      await env.SCRAPER_KV.put(`session:${token}`, JSON.stringify(sessionData), { expirationTtl: 604800 });

      // Update lastLogin, and opportunistically upgrade any legacy unsalted hash to PBKDF2
      const needsUpgrade = !user.passwordHash.startsWith('pbkdf2$');
      const upgradedHash = needsUpgrade ? await hashPassword(password) : user.passwordHash;
      const updatedUsers = users.map(u => u.id === user.id ? { ...u, lastLogin: new Date().toISOString(), passwordHash: upgradedHash } : u);
      await env.SCRAPER_KV.put('users', JSON.stringify(updatedUsers));

      return corsResponse({
        success: true,
        token,
        user: { name: user.name, email: user.email, role: user.role, allowedTabs: user.allowedTabs },
      });
    }

    // POST /api/auth/logout
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      const token = getSessionToken(request);
      if (token) {
        await env.SCRAPER_KV.delete(`session:${token}`);
      }
      return corsResponse({ success: true });
    }

    // GET /api/auth/me
    if (url.pathname === '/api/auth/me' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      return corsResponse({ success: true, user: session });
    }

    // POST /api/auth/reset (password reset request)
    if (url.pathname === '/api/auth/reset' && request.method === 'POST') {
      const { email } = await request.json();
      const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
      const userIdx = users.findIndex(u => u.email === email);

      if (userIdx !== -1) {
        const resetToken = generateToken();
        const resetExpiry = Date.now() + 60 * 60 * 1000; // 1 hour
        users[userIdx] = { ...users[userIdx], resetToken, resetExpiry };
        await env.SCRAPER_KV.put('users', JSON.stringify(users));

        await sendEmail(env, {
          to: email,
          subject: 'Reset your A&A Partners CRM password',
          html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
            <h2 style="color:#0f172a">Reset Your Password</h2>
            <p>Click the button below to reset your password. This link expires in 1 hour.</p>
            <a href="https://aa-partners-crm.pages.dev/reset?token=${resetToken}"
               style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">
              Reset Password
            </a>
            <p style="color:#64748b;font-size:12px;margin-top:24px">If you did not request this, you can safely ignore this email.</p>
          </div>`,
        });
      }

      return corsResponse({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    // POST /api/auth/reset-confirm
    if (url.pathname === '/api/auth/reset-confirm' && request.method === 'POST') {
      const { token, newPassword } = await request.json();
      const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
      const userIdx = users.findIndex(u => u.resetToken === token && u.resetExpiry > Date.now());

      if (userIdx === -1) {
        return corsResponse({ success: false, message: 'Invalid or expired reset token' }, 400);
      }

      const passwordHash = await hashPassword(newPassword);
      users[userIdx] = { ...users[userIdx], passwordHash, resetToken: null, resetExpiry: null };
      await env.SCRAPER_KV.put('users', JSON.stringify(users));

      return corsResponse({ success: true });
    }

    // POST /api/auth/verify  (verify token + set password in one step)
    if (url.pathname === '/api/auth/verify' && request.method === 'POST') {
      const { token, newPassword } = await request.json();
      const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
      const userIdx = users.findIndex(u => u.verifyToken === token && u.verifyExpiry > Date.now());

      if (userIdx === -1) {
        return corsResponse({ success: false, message: 'This invite link has expired or is invalid. Ask to be re-invited.' }, 400);
      }

      const update = { verified: true, verifyToken: null, verifyExpiry: null };
      if (newPassword) update.passwordHash = await hashPassword(newPassword);
      users[userIdx] = { ...users[userIdx], ...update };
      await env.SCRAPER_KV.put('users', JSON.stringify(users));

      // Auto-login: create session
      const sessionToken = generateToken();
      const user = users[userIdx];
      const sessionData = { userId: user.id, email: user.email, role: user.role, allowedTabs: user.allowedTabs };
      await env.SCRAPER_KV.put(`session:${sessionToken}`, JSON.stringify(sessionData), { expirationTtl: 604800 });

      return corsResponse({ success: true, token: sessionToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, allowedTabs: user.allowedTabs } });
    }

    // POST /api/users/invite
    if (url.pathname === '/api/users/invite' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (session.role !== 'Admin') return corsResponse({ success: false, message: 'Forbidden' }, 403);

      const { name, email, role, allowedTabs } = await request.json();
      const users = (await env.SCRAPER_KV.get('users', 'json')) || [];

      if (users.find(u => u.email === email)) {
        return corsResponse({ success: false, message: 'A user with that email already exists' }, 400);
      }

      const verifyToken = generateToken();
      const verifyExpiry = Date.now() + 48 * 60 * 60 * 1000; // 48 hours
      const tempPassword = generateToken().slice(0, 12);
      const passwordHash = await hashPassword(tempPassword);

      const newUser = {
        id: Date.now().toString(),
        name,
        email,
        role: role || 'Member',
        allowedTabs: allowedTabs || ['dashboard','pipeline','companies','contacts'],
        passwordHash,
        verified: false,
        verifyToken,
        verifyExpiry,
        resetToken: null,
        resetExpiry: null,
        lastLogin: null,
        createdAt: new Date().toISOString(),
      };

      users.push(newUser);
      await env.SCRAPER_KV.put('users', JSON.stringify(users));

      const appOrigin = new URL(request.url).origin;
      const inviteLink = `${appOrigin}/verify?token=${verifyToken}`;

      // Attempt email — invite link is always returned regardless
      let emailSent = false;
      let emailError = null;
      try {
        const result = await sendEmail(env, {
          to: email,
          subject: "You've been invited to A&A Partners CRM",
          html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px">
            <h2 style="color:#0f172a">You've been invited to A&A Partners CRM</h2>
            <p>Hi ${name}, Ashley has invited you to join the A&A Partners property CRM.</p>
            <p>Click the button below to verify your email and set your password:</p>
            <a href="${inviteLink}"
               style="display:inline-block;padding:12px 24px;background:#059669;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">
              Verify Email &amp; Set Password
            </a>
            <p style="color:#64748b;font-size:12px;margin-top:24px">This link expires in 48 hours.</p>
          </div>`,
        });
        emailSent = result.ok;
        if (!result.ok) emailError = result.error;
      } catch (e) { emailError = e.message; }

      // Notify opted-in users about the new user
      try {
        const notifRecipients = await getNotifRecipients(env, 'newUser');
        for (const r of notifRecipients) {
          await sendEmail(env, {
            to: r.email,
            subject: `👤 New user invited: ${name}`,
            html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
              <div style="background:#0f172a;padding:16px 24px;border-radius:10px 10px 0 0">
                <h2 style="color:#fff;margin:0;font-size:18px">👤 New User Invited to CRM</h2>
              </div>
              <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 10px 10px">
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                  <tr><td style="padding:6px 0;color:#64748b">Name</td><td style="font-weight:600;color:#0f172a">${name}</td></tr>
                  <tr><td style="padding:6px 0;color:#64748b">Email</td><td style="font-weight:600;color:#0f172a">${email}</td></tr>
                  <tr><td style="padding:6px 0;color:#64748b">Role</td><td style="font-weight:600;color:#0f172a">${role || 'Member'}</td></tr>
                  <tr><td style="padding:6px 0;color:#64748b">Invited by</td><td style="font-weight:600;color:#0f172a">${session.email}</td></tr>
                </table>
              </div>
              <p style="font-size:11px;color:#94a3b8;margin-top:16px;text-align:center">A&A Partners CRM — manage your notification preferences in Settings</p>
            </div>`,
          });
        }
      } catch {}

      return corsResponse({ success: true, inviteLink, emailSent, emailError });
    }

    // GET /api/users
    if (url.pathname === '/api/users' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (session.role !== 'Admin') return corsResponse({ success: false, message: 'Forbidden' }, 403);

      const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
      const safeUsers = users.map(({ passwordHash, verifyToken, verifyExpiry, resetToken, resetExpiry, ...u }) => u);
      return corsResponse(safeUsers);
    }

    // PATCH /api/users/:id/tabs — update a user's allowedTabs (Admin only)
    if (url.pathname.match(/^\/api\/users\/[^/]+\/tabs$/) && request.method === 'PATCH') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (session.role !== 'Admin') return corsResponse({ success: false, message: 'Forbidden' }, 403);
      const targetId = url.pathname.replace('/api/users/', '').replace('/tabs', '');
      const { allowedTabs } = await request.json();
      if (!Array.isArray(allowedTabs)) return corsResponse({ success: false, message: 'allowedTabs must be an array' }, 400);
      const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
      const idx = users.findIndex(u => u.id === targetId || u.id == targetId);
      if (idx === -1) return corsResponse({ success: false, message: 'User not found' }, 404);
      users[idx] = { ...users[idx], allowedTabs };
      await env.SCRAPER_KV.put('users', JSON.stringify(users));
      return corsResponse({ success: true });
    }

    // DELETE /api/users/:id
    if (url.pathname.startsWith('/api/users/') && request.method === 'DELETE') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (session.role !== 'Admin') return corsResponse({ success: false, message: 'Forbidden' }, 403);
      const targetId = url.pathname.replace('/api/users/', '');
      const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
      const target = users.find(u => u.id === targetId || u.id == targetId);
      if (!target) return corsResponse({ success: false, message: 'User not found' }, 404);
      if (target.role === 'Admin' && users.filter(u => u.role === 'Admin').length <= 1) {
        return corsResponse({ success: false, message: 'Cannot delete the last admin' }, 400);
      }
      await env.SCRAPER_KV.put('users', JSON.stringify(users.filter(u => u.id !== target.id)));
      return corsResponse({ success: true });
    }

    // POST /api/auth/change-password
    if (url.pathname === '/api/auth/change-password' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const { currentPassword, newPassword } = await request.json();
      const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
      const userIdx = users.findIndex(u => u.id === session.userId);

      if (userIdx === -1) return corsResponse({ success: false, message: 'User not found' }, 404);

      const currentOk = await verifyPassword(currentPassword, users[userIdx].passwordHash);
      if (!currentOk) {
        return corsResponse({ success: false, message: 'Current password is incorrect' }, 401);
      }

      users[userIdx] = { ...users[userIdx], passwordHash: await hashPassword(newPassword) };
      await env.SCRAPER_KV.put('users', JSON.stringify(users));

      return corsResponse({ success: true });
    }

    // POST /api/auth/profile — self-service display-name update (email is the
    // login identity and isn't editable here — that needs a re-verification flow)
    if (url.pathname === '/api/auth/profile' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const { name } = await request.json();
      if (!name || !name.trim()) return corsResponse({ success: false, message: 'Name is required' }, 400);

      const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
      const userIdx = users.findIndex(u => u.id === session.userId);
      if (userIdx === -1) return corsResponse({ success: false, message: 'User not found' }, 404);

      users[userIdx] = { ...users[userIdx], name: name.trim() };
      await env.SCRAPER_KV.put('users', JSON.stringify(users));

      return corsResponse({ success: true, user: { id: users[userIdx].id, name: users[userIdx].name, email: users[userIdx].email, role: users[userIdx].role, allowedTabs: users[userIdx].allowedTabs } });
    }

    // GET /api/auth/google
    if (url.pathname === '/api/auth/google' && request.method === 'GET') {
      return corsResponse({ message: 'Google OAuth requires Cloudflare Access setup - see README' });
    }

    // --------------------------------------------------------
    // COMPANIES HOUSE PROXY — avoids browser CORS + keeps key server-side
    // --------------------------------------------------------
    // The CH API rejects browser-origin requests (no CORS) and requires HTTP
    // Basic auth. The browser passes the user's key via the X-CH-Key header (or
    // the worker can hold it as the CH_API_KEY secret); we forward server-side.
    if (url.pathname === '/api/companies-house/search' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const q = url.searchParams.get('q');
      if (!q || !q.trim()) return corsResponse({ success: false, message: 'Missing query' }, 400);

      const apiKey = request.headers.get('X-CH-Key') || env.CH_API_KEY;
      if (!apiKey) return corsResponse({ success: false, message: 'No Companies House API key configured' }, 400);

      try {
        const chRes = await fetch(
          `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=8`,
          { headers: { 'Authorization': 'Basic ' + btoa(apiKey + ':') } },
        );
        if (!chRes.ok) {
          const msg = chRes.status === 401 ? 'Invalid Companies House API key' : `Companies House error (HTTP ${chRes.status})`;
          return corsResponse({ success: false, message: msg }, chRes.status === 401 ? 401 : 502);
        }
        const data = await chRes.json();
        return corsResponse({ success: true, items: data.items || [] });
      } catch (err) {
        return corsResponse({ success: false, message: 'Could not reach Companies House' }, 502);
      }
    }

    // --------------------------------------------------------
    // LAND REGISTRY — Price Paid Data (free, keyless linked-data API)
    // --------------------------------------------------------
    if (url.pathname === '/api/land-registry' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const postcode = (url.searchParams.get('postcode') || '').trim().toUpperCase();
      if (!postcode) return corsResponse({ success: false, message: 'Missing postcode' }, 400);

      try {
        const lrRes = await fetch(
          `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.postcode=${encodeURIComponent(postcode)}&_pageSize=40&_sort=-transactionDate`,
          { headers: { 'Accept': 'application/json' } },
        );
        if (!lrRes.ok) return corsResponse({ success: false, message: `Land Registry error (HTTP ${lrRes.status})` }, 502);
        const data = await lrRes.json();
        const typeLabel = (t) => {
          if (!t) return '';
          const uri = typeof t === 'string' ? t : (t._about || '');
          const tail = uri.split('/').pop() || '';
          return ({ detached: 'Detached', 'semi-detached': 'Semi-detached', terraced: 'Terraced', flat: 'Flat', 'other-property-type': 'Other' }[tail] || tail);
        };
        const items = (data.result?.items || []).map(it => {
          const a = it.propertyAddress || {};
          return {
            price: it.pricePaid || 0,
            date: it.transactionDate || '',
            address: [a.saon, a.paon, a.street].filter(Boolean).join(' '),
            town: a.town || '',
            postcode: a.postcode || postcode,
            propertyType: typeLabel(it.propertyType),
            newBuild: !!it.newBuild,
          };
        }).filter(x => x.price > 0);
        return corsResponse({ success: true, items });
      } catch (err) {
        return corsResponse({ success: false, message: 'Could not reach Land Registry' }, 502);
      }
    }

    // --------------------------------------------------------
    // EPC — domestic energy certificate lookup by postcode
    // --------------------------------------------------------
    if (url.pathname === '/api/epc' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const postcode = (url.searchParams.get('postcode') || '').trim().toUpperCase();
      if (!postcode) return corsResponse({ success: false, message: 'Missing postcode' }, 400);
      if (!env.EPC_API_KEY || !env.EPC_EMAIL) return corsResponse({ success: false, message: 'EPC API not configured' }, 400);

      try {
        const epcRes = await fetch(
          `https://epc.opendatacommunities.org/api/v1/domestic/search?postcode=${encodeURIComponent(postcode)}&size=25`,
          { headers: { 'Authorization': 'Basic ' + btoa(`${env.EPC_EMAIL}:${env.EPC_API_KEY}`), 'Accept': 'application/json' } },
        );
        if (epcRes.status === 401) return corsResponse({ success: false, message: 'EPC auth failed — check the registered email matches the API key' }, 401);
        if (epcRes.status === 404) return corsResponse({ success: true, items: [] });
        if (!epcRes.ok) return corsResponse({ success: false, message: `EPC error (HTTP ${epcRes.status})` }, 502);
        const data = await epcRes.json();
        const items = (data.rows || []).map(r => ({
          address: [r.address1, r.address2, r.address3].filter(Boolean).join(', ') || r.address || '',
          postcode: r.postcode || postcode,
          currentRating: r['current-energy-rating'] || '',
          potentialRating: r['potential-energy-rating'] || '',
          propertyType: r['property-type'] || '',
          floorArea: r['total-floor-area'] || '',
          inspectionDate: r['inspection-date'] || r['lodgement-date'] || '',
        }));
        return corsResponse({ success: true, items });
      } catch (err) {
        return corsResponse({ success: false, message: 'Could not reach EPC register' }, 502);
      }
    }

    // --------------------------------------------------------
    // NOTIFICATION SETTINGS + EVENT TRIGGERS
    // --------------------------------------------------------

    // GET /api/notify/settings — get current user's notification prefs
    if (url.pathname === '/api/notify/settings' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const prefs = await getUserNotifSettings(env, session.userId);
      return corsResponse({ success: true, prefs });
    }

    // POST /api/notify/settings — save current user's notification prefs
    if (url.pathname === '/api/notify/settings' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const body = await request.json();
      const prefs = {
        newProperty: !!body.newProperty,
        auctionCountdown: !!body.auctionCountdown,
        countdownDays: Array.isArray(body.countdownDays) ? body.countdownDays.map(Number).filter(n => [1,3,7,14].includes(n)) : [7,3,1],
        noteAdded: !!body.noteAdded,
        newUser: !!body.newUser,
      };
      await env.SCRAPER_KV.put(`notif:settings:${session.userId}`, JSON.stringify(prefs));
      return corsResponse({ success: true, prefs });
    }

    // GET /api/notify/settings/all — admin: fetch every user's notification prefs
    if (url.pathname === '/api/notify/settings/all' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (session.role !== 'Admin') return corsResponse({ success: false, message: 'Forbidden' }, 403);
      const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
      const result = await Promise.all(
        users.filter(u => u.verified && u.email).map(async u => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          prefs: await getUserNotifSettings(env, u.id),
        }))
      );
      return corsResponse({ success: true, users: result });
    }

    // POST /api/notify/settings/admin — admin: save notification prefs for a specific user
    if (url.pathname === '/api/notify/settings/admin' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (session.role !== 'Admin') return corsResponse({ success: false, message: 'Forbidden' }, 403);
      const body = await request.json();
      if (!body.userId) return corsResponse({ success: false, message: 'Missing userId' }, 400);
      const prefs = {
        newProperty: !!body.prefs?.newProperty,
        auctionCountdown: !!body.prefs?.auctionCountdown,
        countdownDays: Array.isArray(body.prefs?.countdownDays) ? body.prefs.countdownDays.map(Number).filter(n => [1,3,7,14].includes(n)) : [7,3,1],
        noteAdded: !!body.prefs?.noteAdded,
        newUser: !!body.prefs?.newUser,
      };
      await env.SCRAPER_KV.put(`notif:settings:${body.userId}`, JSON.stringify(prefs));
      return corsResponse({ success: true, prefs });
    }

    // POST /api/notify/property-added — send "new property" email to opted-in users
    if (url.pathname === '/api/notify/property-added' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const { property, addedBy } = await request.json();
      if (!property) return corsResponse({ success: false, message: 'Missing property' }, 400);

      const recipients = await getNotifRecipients(env, 'newProperty');
      let sent = 0;
      for (const r of recipients) {
        const result = await sendEmail(env, {
          to: r.email,
          subject: `🏠 New property added: ${property.address}`,
          html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
            <div style="background:#0f172a;padding:16px 24px;border-radius:10px 10px 0 0">
              <h2 style="color:#fff;margin:0;font-size:18px">🏠 New Property Added to Pipeline</h2>
            </div>
            <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 10px 10px">
              <p style="font-size:16px;font-weight:bold;color:#0f172a;margin:0 0 16px">${property.address}</p>
              <table style="width:100%;border-collapse:collapse;font-size:13px">
                <tr><td style="padding:6px 0;color:#64748b">Added by</td><td style="font-weight:600;color:#0f172a">${addedBy || 'A team member'}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b">Guide price</td><td style="font-weight:600;color:#0f172a">£${(property.guidePrice || 0).toLocaleString()}</td></tr>
                ${property.auctionDate ? `<tr><td style="padding:6px 0;color:#64748b">Auction date</td><td style="font-weight:600;color:#dc2626">${property.auctionDate}${property.auctionTime ? ' at ' + property.auctionTime : ''}</td></tr>` : ''}
                <tr><td style="padding:6px 0;color:#64748b">Platform</td><td style="font-weight:600;color:#0f172a">${property.sourcePlatform || '—'}</td></tr>
              </table>
              ${property.listingUrl ? `<p style="margin-top:16px"><a href="${property.listingUrl}" style="color:#0284c7">View listing ↗</a></p>` : ''}
            </div>
            <p style="font-size:11px;color:#94a3b8;margin-top:16px;text-align:center">A&A Partners CRM — manage your notification preferences in Settings</p>
          </div>`,
        });
        if (result.ok) sent++;
      }
      return corsResponse({ success: true, sent });
    }

    // POST /api/notify/note-added — send "note added" email to opted-in users (excluding note author)
    if (url.pathname === '/api/notify/note-added' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const { property, note, authorName } = await request.json();
      if (!property || !note) return corsResponse({ success: false, message: 'Missing fields' }, 400);

      const recipients = await getNotifRecipients(env, 'noteAdded');
      // Don't notify the person who added the note
      const others = recipients.filter(r => r.id !== session.userId);
      let sent = 0;
      for (const r of others) {
        const result = await sendEmail(env, {
          to: r.email,
          subject: `📝 New note on: ${property.address}`,
          html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
            <div style="background:#0f172a;padding:16px 24px;border-radius:10px 10px 0 0">
              <h2 style="color:#fff;margin:0;font-size:18px">📝 New Note Added</h2>
            </div>
            <div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 10px 10px">
              <p style="font-size:13px;color:#64748b;margin:0 0 4px">Property</p>
              <p style="font-size:16px;font-weight:bold;color:#0f172a;margin:0 0 20px">${property.address}</p>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;font-size:13px;color:#334155;line-height:1.6">${note.text}</div>
              <div style="margin-top:12px;font-size:12px;color:#94a3b8">Added by <strong>${authorName || 'A team member'}</strong>${note.type ? ' · ' + note.type : ''}${note.date ? ' · ' + note.date : ''}</div>
            </div>
            <p style="font-size:11px;color:#94a3b8;margin-top:16px;text-align:center">A&A Partners CRM — manage your notification preferences in Settings</p>
          </div>`,
        });
        if (result.ok) sent++;
      }
      return corsResponse({ success: true, sent });
    }

    // --------------------------------------------------------
    // GOOGLE CALENDAR OAUTH + EVENTS
    // --------------------------------------------------------

    // GET /api/calendar/google/auth — redirect to Google consent screen
    if (url.pathname === '/api/calendar/google/auth' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (!env.GOOGLE_CLIENT_ID) return corsResponse({ success: false, message: 'Google Calendar not configured on this server' }, 400);

      const state = btoa(`${session.userId}:${getSessionToken(request)}`);
      const origin = new URL(request.url).origin;
      const redirectUri = `${origin}/api/calendar/google/callback`;

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', state);

      return Response.redirect(authUrl.toString(), 302);
    }

    // GET /api/calendar/google/callback — exchange code for tokens
    if (url.pathname === '/api/calendar/google/callback' && request.method === 'GET') {
      const code = url.searchParams.get('code');
      const stateB64 = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const origin = new URL(request.url).origin;

      if (error || !code || !stateB64) {
        return Response.redirect(`${origin}/?calendar=google&error=${encodeURIComponent(error || 'cancelled')}`, 302);
      }

      let userId, sessionToken;
      try {
        const decoded = atob(stateB64);
        const colonIdx = decoded.indexOf(':');
        userId = decoded.slice(0, colonIdx);
        sessionToken = decoded.slice(colonIdx + 1);
      } catch {
        return Response.redirect(`${origin}/?calendar=google&error=invalid_state`, 302);
      }

      const sess = await env.SCRAPER_KV.get(`session:${sessionToken}`, 'json');
      if (!sess || sess.userId !== userId) {
        return Response.redirect(`${origin}/?calendar=google&error=session_expired`, 302);
      }

      try {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: `${origin}/api/calendar/google/callback`,
            grant_type: 'authorization_code',
          }),
        });
        if (!tokenRes.ok) {
          console.error('Google token exchange error:', await tokenRes.text());
          return Response.redirect(`${origin}/?calendar=google&error=token_exchange`, 302);
        }
        const tokens = await tokenRes.json();
        await env.SCRAPER_KV.put(`calendar:google:${userId}`, JSON.stringify({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
          connectedAt: new Date().toISOString(),
        }));
        return Response.redirect(`${origin}/?calendar=google&connected=true`, 302);
      } catch (err) {
        console.error('Google calendar callback error:', err);
        return Response.redirect(`${origin}/?calendar=google&error=server_error`, 302);
      }
    }

    // GET /api/calendar/google/status
    if (url.pathname === '/api/calendar/google/status' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const calData = await env.SCRAPER_KV.get(`calendar:google:${session.userId}`, 'json');
      return corsResponse({ connected: !!calData, connectedAt: calData?.connectedAt || null });
    }

    // POST /api/calendar/google/disconnect
    if (url.pathname === '/api/calendar/google/disconnect' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      await env.SCRAPER_KV.delete(`calendar:google:${session.userId}`);
      return corsResponse({ success: true });
    }

    // POST /api/calendar/google/event — create a Google Calendar event
    if (url.pathname === '/api/calendar/google/event' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const accessToken = await getGoogleAccessToken(env, session.userId);
      if (!accessToken) return corsResponse({ success: false, message: 'Google Calendar not connected' }, 401);

      const { title, date, time, duration = 60, description = '', location = '' } = await request.json();
      if (!date) return corsResponse({ success: false, message: 'date is required (YYYY-MM-DD)' }, 400);

      const hasTime = !!time;
      const startDt = hasTime ? `${date}T${time}:00` : null;
      const endDt = hasTime ? new Date(new Date(`${date}T${time}:00`).getTime() + duration * 60000).toISOString().slice(0, 19) : null;

      const event = {
        summary: title,
        description,
        location,
        start: hasTime ? { dateTime: startDt, timeZone: 'Europe/London' } : { date },
        end: hasTime ? { dateTime: endDt, timeZone: 'Europe/London' } : { date },
      };

      try {
        const gcalRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
        if (!gcalRes.ok) {
          const err = await gcalRes.json();
          return corsResponse({ success: false, message: err.error?.message || `Google Calendar error (${gcalRes.status})` }, gcalRes.status);
        }
        const created = await gcalRes.json();
        return corsResponse({ success: true, eventId: created.id, htmlLink: created.htmlLink });
      } catch (err) {
        return corsResponse({ success: false, message: 'Could not reach Google Calendar' }, 502);
      }
    }

    // --------------------------------------------------------
    // MICROSOFT OUTLOOK CALENDAR OAUTH + EVENTS
    // --------------------------------------------------------

    // GET /api/calendar/microsoft/auth — redirect to Microsoft consent screen
    if (url.pathname === '/api/calendar/microsoft/auth' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (!env.MICROSOFT_CLIENT_ID) return corsResponse({ success: false, message: 'Outlook Calendar not configured on this server' }, 400);

      const state = btoa(`${session.userId}:${getSessionToken(request)}`);
      const origin = new URL(request.url).origin;
      const redirectUri = `${origin}/api/calendar/microsoft/callback`;

      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      authUrl.searchParams.set('client_id', env.MICROSOFT_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://graph.microsoft.com/Calendars.ReadWrite offline_access');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('response_mode', 'query');

      return Response.redirect(authUrl.toString(), 302);
    }

    // GET /api/calendar/microsoft/callback — exchange code for tokens
    if (url.pathname === '/api/calendar/microsoft/callback' && request.method === 'GET') {
      const code = url.searchParams.get('code');
      const stateB64 = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const origin = new URL(request.url).origin;

      if (error || !code || !stateB64) {
        return Response.redirect(`${origin}/?calendar=microsoft&error=${encodeURIComponent(error || 'cancelled')}`, 302);
      }

      let userId, sessionToken;
      try {
        const decoded = atob(stateB64);
        const colonIdx = decoded.indexOf(':');
        userId = decoded.slice(0, colonIdx);
        sessionToken = decoded.slice(colonIdx + 1);
      } catch {
        return Response.redirect(`${origin}/?calendar=microsoft&error=invalid_state`, 302);
      }

      const sess = await env.SCRAPER_KV.get(`session:${sessionToken}`, 'json');
      if (!sess || sess.userId !== userId) {
        return Response.redirect(`${origin}/?calendar=microsoft&error=session_expired`, 302);
      }

      try {
        const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.MICROSOFT_CLIENT_ID,
            client_secret: env.MICROSOFT_CLIENT_SECRET,
            redirect_uri: `${origin}/api/calendar/microsoft/callback`,
            grant_type: 'authorization_code',
            scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
          }),
        });
        if (!tokenRes.ok) {
          console.error('Microsoft token exchange error:', await tokenRes.text());
          return Response.redirect(`${origin}/?calendar=microsoft&error=token_exchange`, 302);
        }
        const tokens = await tokenRes.json();
        await env.SCRAPER_KV.put(`calendar:microsoft:${userId}`, JSON.stringify({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
          connectedAt: new Date().toISOString(),
        }));
        return Response.redirect(`${origin}/?calendar=microsoft&connected=true`, 302);
      } catch (err) {
        console.error('Microsoft calendar callback error:', err);
        return Response.redirect(`${origin}/?calendar=microsoft&error=server_error`, 302);
      }
    }

    // GET /api/calendar/microsoft/status
    if (url.pathname === '/api/calendar/microsoft/status' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const calData = await env.SCRAPER_KV.get(`calendar:microsoft:${session.userId}`, 'json');
      return corsResponse({ connected: !!calData, connectedAt: calData?.connectedAt || null });
    }

    // POST /api/calendar/microsoft/disconnect
    if (url.pathname === '/api/calendar/microsoft/disconnect' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      await env.SCRAPER_KV.delete(`calendar:microsoft:${session.userId}`);
      return corsResponse({ success: true });
    }

    // POST /api/calendar/microsoft/event — create an Outlook Calendar event
    if (url.pathname === '/api/calendar/microsoft/event' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const accessToken = await getMicrosoftAccessToken(env, session.userId);
      if (!accessToken) return corsResponse({ success: false, message: 'Outlook Calendar not connected' }, 401);

      const { title, date, time, duration = 60, description = '', location = '' } = await request.json();
      if (!date) return corsResponse({ success: false, message: 'date is required (YYYY-MM-DD)' }, 400);

      const hasTime = !!time;
      const startDt = hasTime ? `${date}T${time}:00` : `${date}T09:00:00`;
      const endDt = new Date(new Date(startDt).getTime() + duration * 60000).toISOString().slice(0, 19);

      const event = {
        subject: title,
        body: { contentType: 'HTML', content: description || title },
        start: { dateTime: startDt, timeZone: 'Europe/London' },
        end: { dateTime: endDt, timeZone: 'Europe/London' },
        location: { displayName: location },
        isAllDay: !hasTime,
      };

      try {
        const msRes = await fetch('https://graph.microsoft.com/v1.0/me/events', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
        if (!msRes.ok) {
          const err = await msRes.json();
          return corsResponse({ success: false, message: err.error?.message || `Outlook error (${msRes.status})` }, msRes.status);
        }
        const created = await msRes.json();
        return corsResponse({ success: true, eventId: created.id, webLink: created.webLink });
      } catch (err) {
        return corsResponse({ success: false, message: 'Could not reach Microsoft Graph' }, 502);
      }
    }

    // --------------------------------------------------------
    // PROPERTY URL SCRAPE
    // --------------------------------------------------------
    // POST /api/product-url-fetch — server-side proxy to fetch product data from supplier URLs
    if (url.pathname === '/api/product-url-fetch' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const { url: productUrl } = await request.json();
      if (!productUrl) return corsResponse({ success: false, error: 'No URL provided' }, 400);
      try {
        const res = await fetch(productUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-GB,en;q=0.5',
          },
          redirect: 'follow',
        });
        const html = await res.text();
        const getTag = (prop) => {
          const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
                 || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
          return m ? m[1].trim() : '';
        };
        const ogTitle = getTag('og:title') || getTag('twitter:title');
        const ogImage = getTag('og:image') || getTag('twitter:image');
        const ogDesc  = getTag('og:description') || getTag('description');
        // JSON-LD Product schema
        let ldName='', ldPrice='', ldSku='', ldBrand='', ldAvail='';
        const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
        for (const m of ldMatches) {
          try {
            const obj = JSON.parse(m[1]);
            const prod = obj['@type']==='Product' ? obj : (Array.isArray(obj['@graph']) ? obj['@graph'].find(x=>x['@type']==='Product') : null);
            if (prod) {
              ldName  = prod.name || '';
              ldSku   = prod.sku || prod.mpn || '';
              ldBrand = prod.brand?.name || prod.brand || '';
              const offer = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
              if (offer) { ldPrice = offer.price || ''; ldAvail = offer.availability || ''; }
              break;
            }
          } catch(_){}
        }
        // Price fallback: regex scan for £ pattern
        let priceStr = ldPrice ? String(ldPrice) : '';
        if (!priceStr) {
          const pm = html.match(/["']price["']\s*:\s*["']?([\d.]+)["']?/) || html.match(/£\s*([\d,]+(?:\.\d{1,2})?)/);
          if (pm) priceStr = pm[1].replace(/,/g,'');
        }
        // Title fallback
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = ldName || ogTitle || (titleMatch ? titleMatch[1].split('|')[0].split('-')[0].trim() : '');
        // Supplier from hostname
        const hostname = new URL(productUrl).hostname.replace('www.','');
        const supplierMap = { 'screwfix.com':'Screwfix','toolstation.com':'Toolstation','diy.com':'B&Q','wickes.co.uk':'Wickes','toppstiles.co.uk':'Topps Tiles','carpetright.co.uk':'Carpetright','howdens.com':'Howdens','ikea.com':'IKEA','amazon.co.uk':'Amazon','plumbworld.co.uk':'Plumbworld','victoriaplum.com':'Victoria Plum','bathroomstoredirect.co.uk':'Bathroom Store' };
        const supplier = Object.entries(supplierMap).find(([k])=>hostname.includes(k))?.[1] || hostname;
        const availability = ldAvail.includes('InStock') ? 'In stock' : ldAvail.includes('OutOf') ? 'Out of stock' : ldAvail.includes('PreOrder') ? 'Pre-order' : '';
        return corsResponse({ success:true, name:title, price:priceStr, imageUrl:ogImage, sku:ldSku, brand:ldBrand, description:ogDesc, supplier, availability });
      } catch(e) {
        return corsResponse({ success:false, error:'Could not fetch product data: '+e.message });
      }
    }

    if (url.pathname === '/api/scrape-property' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const { url: propertyUrl } = await request.json();
      try {
        const res = await fetch(propertyUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        });
        const html = await res.text();
        const property = extractPropertyDetails(html, propertyUrl);
        return corsResponse({ success: true, property });
      } catch (err) {
        return corsResponse({ success: false, message: 'Could not fetch that URL. Check it is publicly accessible.' }, 400);
      }
    }

    // --------------------------------------------------------
    // R2 DOCUMENT STORAGE
    // --------------------------------------------------------

    // POST /api/documents/upload — upload a file to R2
    if (url.pathname === '/api/documents/upload' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const formData = await request.formData();
      const file = formData.get('file');
      const propertyId = formData.get('propertyId') || 'unknown';
      const fileKey = formData.get('fileKey') || 'file';
      if (!file) return corsResponse({ success: false, message: 'No file provided' }, 400);
      // Random segment keeps the key from being guessable purely from the low-entropy
      // timestamp-based userId/propertyId — the frontend always echoes back the key
      // the upload response returns rather than reconstructing it, so this is safe to add.
      const keyToken = bytesToHex(crypto.getRandomValues(new Uint8Array(8)));
      const key = `${session.userId}/${propertyId}/${fileKey}/${keyToken}/${file.name}`;
      await env.CRM_DOCS.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
      });
      return corsResponse({ success: true, key, name: file.name });
    }

    // GET /api/documents/* — serve a file from R2 (auth required)
    if (url.pathname.startsWith('/api/documents/') && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return new Response('Unauthorized', { status: 401 });
      const docRateOk = await checkRateLimit(env, `docs:${session.userId}`, 120);
      if (!docRateOk) return new Response('Too many requests', { status: 429 });
      const key = url.pathname.slice('/api/documents/'.length);
      const object = await env.CRM_DOCS.get(key);
      if (!object) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('Cache-Control', 'private, max-age=3600');
      headers.set('Content-Disposition', 'inline');
      return new Response(object.body, { headers });
    }

    // --------------------------------------------------------
    // SOUTH YORKSHIRE AUCTION SCRAPER
    // --------------------------------------------------------
    if (url.pathname === '/api/scrape-auctions' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const SY_KEYWORDS = ['sheffield', 'doncaster', 'rotherham', 'barnsley', 'south yorkshire', ', s1 ', ', s2 ', ', s3 ', ', s4 ', ', s5 ', ', s6 ', ', s7 ', ', s8 ', ', s9 ', ', s10', ', s11', ', s12', ', s13', ', s14', ', s20', ', s21', ', s60', ', s61', ', s62', ', s63', ', s64', ', s65', ', s66', ', dn1', ', dn2', ', dn3', ', dn4', ', dn5'];
      const MONTH_KEYWORDS = ['july', 'jul 2', 'jul 3'];
      const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

      const extractDate = (html) => {
        const m = html.match(/(?:july|jul)[^0-9]*(\d{1,2})[^0-9]{0,5}(2026)?/i);
        if (m) return `2026-07-${String(m[1]).padStart(2, '0')}`;
        return null;
      };

      const countSYMentions = (html) => {
        const low = html.toLowerCase();
        return SY_KEYWORDS.reduce((acc, kw) => acc + (low.split(kw).length - 1), 0);
      };

      const auctionHouses = [
        { name: 'Auction House Yorkshire', url: 'https://www.auctionhouse.co.uk/southyorkshire/auction/future-auction-dates', diaryUrl: 'https://www.auctionhouse.co.uk/southyorkshire/auction/future-auction-dates' },
        { name: 'SDL Property Auctions', url: 'https://www.sdlauctions.co.uk/property-auctions/upcoming-auctions/', diaryUrl: 'https://www.sdlauctions.co.uk/property-auctions/upcoming-auctions/' },
        { name: 'Mark Jenkinson & Son', url: 'https://www.markjenkinson.co.uk/auction-diary', diaryUrl: 'https://www.markjenkinson.co.uk/auction-diary' },
        { name: 'Pugh Auctions', url: 'https://www.pugh-auctions.com/auction-diary', diaryUrl: 'https://www.pugh-auctions.com/auction-diary' },
        { name: 'Allsop Residential', url: 'https://www.allsop.co.uk/auctions/property-for-auction-in-sheffield/', diaryUrl: 'https://www.allsop.co.uk/auctions/property-for-auction-in-sheffield/' },
      ];

      let browser;
      try {
        browser = await puppeteer.launch(env.BROWSER);
      } catch (launchErr) {
        return corsResponse({ success: false, message: `Browser launch failed: ${launchErr.message}`, results: auctionHouses.map(h => ({ name: h.name, diaryUrl: h.diaryUrl, error: `Browser unavailable: ${launchErr.message}`, syMentions: 0, hasJuly: false, accessible: false })) });
      }
      try {
        const data = [];
        for (const house of auctionHouses) {
          const page = await browser.newPage();
          try {
            await page.goto(house.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
            const html = await page.content();
            const low = html.toLowerCase();
            const hasJuly = MONTH_KEYWORDS.some(kw => low.includes(kw));
            const syMentions = countSYMentions(html);
            const auctionDate = extractDate(html);
            // rough lot count: count occurrences of "lot" or "property" in listings context
            const lotMatches = (html.match(/lot\s+\d+|class="[^"]*lot[^"]*"/gi) || []).length;
            data.push({ name: house.name, diaryUrl: house.diaryUrl, syMentions, hasJuly, auctionDate, estimatedLots: lotMatches, accessible: true });
          } catch (err) {
            data.push({ name: house.name, diaryUrl: house.diaryUrl, error: err.message, syMentions: 0, hasJuly: false, accessible: false });
          } finally {
            await page.close();
          }
        }
        return corsResponse({ success: true, results: data, scrapedAt: new Date().toISOString() });
      } finally {
        await browser.close();
      }
    }

    // --------------------------------------------------------
    // PROPERTY INTELLIGENCE ORCHESTRATOR
    // --------------------------------------------------------
    if (url.pathname === '/api/intelligence/run' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      let { postcode, address, lat, lng } = await request.json();
      postcode = (postcode || '').trim().toUpperCase().replace(/\s+/g, ' ');

      if (!postcode && !lat) return corsResponse({ success: false, message: 'Provide postcode or coordinates' }, 400);

      const result = { runAt: new Date().toISOString(), connectors: {} };
      let resolvedLat = lat ? parseFloat(lat) : null;
      let resolvedLng = lng ? parseFloat(lng) : null;

      // Step 1: Address resolution (sequential — other connectors depend on lat/lng and geography codes)
      let addrData = null;
      if (postcode) {
        try {
          addrData = await connectorPostcodes(postcode);
          result.connectors.address = { status: 'success', data: addrData, source: 'Postcodes.io', fetchedAt: new Date().toISOString() };
          if (!resolvedLat) { resolvedLat = addrData.lat; resolvedLng = addrData.lng; }
        } catch (err) {
          result.connectors.address = { status: 'error', error: err.message, source: 'Postcodes.io', fetchedAt: new Date().toISOString() };
        }
      }

      const lsoaCode = addrData?.lsoaCode || null;
      const msoaCode = addrData?.msoaCode || null;
      const laCode   = addrData?.laCode   || null;

      // Step 2: All remaining connectors in parallel
      const tasks = [];

      if (postcode) {
        // Land Registry Price Paid (postcode-level sales history)
        tasks.push(
          fetch(
            `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.postcode=${encodeURIComponent(postcode)}&_pageSize=40&_sort=-transactionDate`,
            { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) },
          ).then(r => r.json()).then(data => {
            const typeLabel = t => { if (!t) return ''; const uri=typeof t==='string'?t:(t._about||''); const tail=uri.split('/').pop()||''; return ({detached:'Detached','semi-detached':'Semi-detached',terraced:'Terraced',flat:'Flat','other-property-type':'Other'}[tail]||tail); };
            const items = (data.result?.items||[]).map(it => { const a=it.propertyAddress||{}; return { price:it.pricePaid||0, date:it.transactionDate||'', address:[a.saon,a.paon,a.street].filter(Boolean).join(' '), town:a.town||'', postcode:a.postcode||postcode, propertyType:typeLabel(it.propertyType), newBuild:!!it.newBuild }; }).filter(x=>x.price>0);
            const sorted=[...items].sort((a,b)=>b.date.localeCompare(a.date));
            const recent=sorted.slice(0,10), older=sorted.slice(10,20);
            const avgRecent=recent.length?Math.round(recent.reduce((s,i)=>s+i.price,0)/recent.length):0;
            const avgOlder=older.length?Math.round(older.reduce((s,i)=>s+i.price,0)/older.length):0;
            const priceGrowth=avgOlder>0?Math.round((avgRecent-avgOlder)/avgOlder*1000)/10:null;
            return { key:'landRegistry', status:'success', data:{ items:items.slice(0,20), avgPrice:avgRecent, priceGrowth, salesCount:items.length }, source:'Land Registry Price Paid' };
          }).catch(err => ({ key:'landRegistry', status:'error', error:err.message, source:'Land Registry' }))
        );

        // EPC (only if credentials configured) — fetch 25 records for comp enrichment
        if (env.EPC_API_KEY && env.EPC_EMAIL) {
          tasks.push(
            fetch(
              `https://epc.opendatacommunities.org/api/v1/domestic/search?postcode=${encodeURIComponent(postcode)}&size=25`,
              { headers: { 'Authorization':'Basic '+btoa(`${env.EPC_EMAIL}:${env.EPC_API_KEY}`), 'Accept':'application/json' }, signal: AbortSignal.timeout(8000) },
            ).then(r => r.json()).then(data => {
              const items=(data.rows||[]).map(r=>({
                address1: r.address1||'', address2: r.address2||'', address3: r.address3||'',
                address:[r.address1,r.address2,r.address3].filter(Boolean).join(', '),
                currentRating:r['current-energy-rating']||'', potentialRating:r['potential-energy-rating']||'',
                propertyType:r['property-type']||'', floorArea:r['total-floor-area']||'',
                habitableRooms: r['number-habitable-rooms'] ? Number(r['number-habitable-rooms']) : null,
                inspectionDate:r['inspection-date']||r['lodgement-date']||'',
                heatingType:r['main-fuel']||'', walls:r['walls-description']||'', windows:r['windows-description']||'',
              }));
              const best=items[0];
              const flags=[
                best?.currentRating&&['E','F','G'].includes(best.currentRating)?`Low EPC rating (${best.currentRating})`:null,
                best?.heatingType?.toLowerCase().includes('electric')?'Electric heating':null,
                best?.windows?.toLowerCase().includes('single')?'Single glazing':null,
                best?.walls?.toLowerCase().includes('no insulation')?'Uninsulated walls':null,
              ].filter(Boolean);
              return { key:'epc', status:'success', data:{ items:items.slice(0,5), allItems:items, best, epcRating:best?.currentRating, potentialRating:best?.potentialRating, floorArea:best?.floorArea, heatingType:best?.heatingType, energyFlags:flags }, source:'EPC Open Data' };
            }).catch(err => ({ key:'epc', status:'error', error:err.message, source:'EPC' }))
          );
        }

        // UK HPI — official area-level price growth (local authority)
        if (laCode) {
          tasks.push(
            connectorHPI(laCode)
              .then(data => ({ key: 'hpi', status: 'success', data, source: 'Land Registry UK HPI' }))
              .catch(err => ({ key: 'hpi', status: 'error', error: err.message, source: 'Land Registry UK HPI' }))
          );
        }

        // IMD — deprivation decile by LSOA
        if (lsoaCode) {
          tasks.push(
            connectorIMD(lsoaCode)
              .then(data => ({ key: 'imd', status: 'success', data, source: 'MHCLG IMD 2019' }))
              .catch(err => ({ key: 'imd', status: 'error', error: err.message, source: 'MHCLG IMD 2019' }))
          );
        }

        // ONS Census 2021 demographics by MSOA
        if (msoaCode) {
          tasks.push(
            connectorCensus(msoaCode)
              .then(data => ({ key: 'census', status: 'success', data, source: 'ONS Census 2021' }))
              .catch(err => ({ key: 'census', status: 'error', error: err.message, source: 'ONS Census 2021' }))
          );
        }
      }

      if (resolvedLat && resolvedLng) {
        tasks.push(
          connectorPolice(resolvedLat, resolvedLng).then(data=>({ key:'police', status:'success', data, source:'Police.uk' })).catch(err=>({ key:'police', status:'error', error:err.message, source:'Police.uk' })),
          connectorFlood(resolvedLat, resolvedLng).then(data=>({ key:'flood', status:'success', data, source:'Environment Agency' })).catch(err=>({ key:'flood', status:'error', error:err.message, source:'Environment Agency' })),
          connectorPlanning(resolvedLat, resolvedLng).then(data=>({ key:'planning', status:'success', data, source:'DLUHC Planning Data' })).catch(err=>({ key:'planning', status:'error', error:err.message, source:'DLUHC Planning Data' })),
          connectorOSM(resolvedLat, resolvedLng).then(data=>({ key:'osm', status:'success', data, source:'OpenStreetMap' })).catch(err=>({ key:'osm', status:'error', error:err.message, source:'OpenStreetMap' })),
          connectorSchools(resolvedLat, resolvedLng).then(data=>({ key:'schools', status:'success', data, source:'DfE GIAS / Ofsted' })).catch(err=>({ key:'schools', status:'error', error:err.message, source:'DfE GIAS' })),
          connectorTfL(resolvedLat, resolvedLng).then(data=>({ key:'tfl', status:'success', data, source:'TfL Unified API' })).catch(err=>({ key:'tfl', status:'error', error:err.message, source:'TfL' })),
        );
      }

      const settled = await Promise.allSettled(tasks);
      for (const s of settled) {
        if (s.status==='fulfilled' && s.value?.key) {
          const v = s.value;
          result.connectors[v.key] = { status:v.status, data:v.data, error:v.error, source:v.source, fetchedAt:new Date().toISOString() };
        }
      }

      // Post-process: enrich LR comps with EPC data (floor area, rating, rooms)
      const lrConn  = result.connectors.landRegistry;
      const epcConn = result.connectors.epc;
      if (lrConn?.data?.items?.length && epcConn?.data?.allItems?.length) {
        lrConn.data.items = enrichCompsWithEPC(lrConn.data.items, epcConn.data.allItems);
        lrConn.data.compsEnriched = true;
      }

      return corsResponse({ success: true, intelligence: result });
    }

    // POST /api/intelligence/duplicate-check
    if (url.pathname === '/api/intelligence/duplicate-check' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const { postcode, address, listingUrl, properties } = await request.json();
      if (!Array.isArray(properties) || !properties.length) return corsResponse({ success: true, matches: [] });

      const pc = (postcode || '').replace(/\s+/g, '').toUpperCase();
      const matches = [];
      for (const p of properties) {
        if (p.deleted) continue;
        let confidence = 0; const reasons = [];
        const pPc = (p.address||'').toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/)?.[0]?.replace(/\s+/g,'')||'';
        if (pc && pPc === pc) { confidence += 40; reasons.push('Matching postcode'); }
        const sim = addressSimilarity(p.address, address);
        if (sim >= 0.7) { confidence += 40; reasons.push(`Address match (${Math.round(sim*100)}%)`); }
        else if (sim >= 0.4) { confidence += 15; reasons.push('Partial address match'); }
        if (listingUrl && p.listingUrl && (listingUrl===p.listingUrl||p.listingUrl.includes(listingUrl)||listingUrl.includes(p.listingUrl))) { confidence += 30; reasons.push('Matching auction URL'); }
        if (confidence >= 35) matches.push({ id:p.id, address:p.address, confidence, reasons, status:p.status, guidePrice:p.guidePrice });
      }
      matches.sort((a,b) => b.confidence - a.confidence);
      return corsResponse({ success: true, matches: matches.slice(0, 3) });
    }

    // --------------------------------------------------------
    // AI — deal review (summary, risk flags, deal score)
    // --------------------------------------------------------
    if (url.pathname === '/api/ai/deal-review' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (!env.ANTHROPIC_API_KEY) {
        return corsResponse({ success: false, message: 'AI not configured — set the ANTHROPIC_API_KEY secret: npx wrangler secret put ANTHROPIC_API_KEY' }, 400);
      }
      const aiRateOk = await checkRateLimit(env, `ai:${session.userId}`, 10);
      if (!aiRateOk) return corsResponse({ success: false, message: 'Too many AI requests — please wait a minute' }, 429);

      const { property } = await request.json();
      if (!property || !property.address) return corsResponse({ success: false, message: 'Missing property' }, 400);

      // Compact, bounded context — never ship whole blobs to the model
      const clip = (obj) => JSON.stringify(obj ?? null).slice(0, 6000);
      const context = [
        `Address: ${property.address}${property.dealName ? ` (${property.dealName})` : ''}`,
        `Status: ${property.status || 'Sourced'} · Guide price: £${Number(property.guidePrice || 0).toLocaleString()} · Auction: ${property.auctionDate || 'unknown'}`,
        `Type: ${property.propertyType || 'unknown'} · Beds: ${property.bedrooms || 'unknown'}`,
        `Report analytics: ${clip(property.analytics)}`,
        `Area intelligence highlights: ${clip(property.intelligenceSummary)}`,
        `Refurb position: ${clip(property.refurbSummary)}`,
        `Comparables: ${clip(property.comparables)}`,
      ].join('\n');

      const schema = {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'riskFlags', 'strengths', 'dealScore', 'verdict'],
        properties: {
          summary: { type: 'string', description: '3-5 sentence plain-English assessment of this deal for a UK property flip investor' },
          riskFlags: { type: 'array', items: { type: 'string' }, description: 'Specific risks found in the data — thin margin, low comps, flood/planning/crime issues, missing information, over-guide pressure. Empty if genuinely none.' },
          strengths: { type: 'array', items: { type: 'string' }, description: 'Specific strengths of the deal grounded in the data.' },
          dealScore: { type: 'integer', description: 'Deal quality score from 0 (avoid at any price) to 100 (exceptional opportunity)' },
          verdict: { type: 'string', enum: ['strong_buy', 'buy', 'conditional', 'avoid'] },
        },
      };

      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-opus-4-8',
            max_tokens: 8000,
            thinking: { type: 'adaptive' },
            system: 'You are a UK property investment analyst reviewing auction flip deals for a small investment partnership in South Yorkshire. Be direct and specific: ground every claim in the numbers provided, flag what is missing, and never invent figures. Margins under 15% are tight for a flip; under 5% are usually not worth the risk.',
            messages: [{ role: 'user', content: `Review this auction deal and score it.\n\n${context}` }],
            output_config: { format: { type: 'json_schema', schema } },
          }),
        });
        if (!aiRes.ok) {
          const errText = await aiRes.text();
          console.error('Anthropic API error:', aiRes.status, errText);
          return corsResponse({ success: false, message: `AI request failed (HTTP ${aiRes.status})` }, 502);
        }
        const aiData = await aiRes.json();
        if (aiData.stop_reason === 'refusal') {
          return corsResponse({ success: false, message: 'AI declined to review this content' }, 502);
        }
        const textBlock = (aiData.content || []).find(b => b.type === 'text');
        if (!textBlock) return corsResponse({ success: false, message: 'AI returned no content' }, 502);
        const review = JSON.parse(textBlock.text);
        return corsResponse({ success: true, review, reviewedAt: new Date().toISOString() });
      } catch (err) {
        console.error('AI deal review failed:', err);
        return corsResponse({ success: false, message: 'Could not complete AI review' }, 502);
      }
    }

    // --------------------------------------------------------
    // ALERTS — persisted team-wide alert feed
    // --------------------------------------------------------

    // GET /api/alerts?unread=1 — latest alerts, newest first
    if (url.pathname === '/api/alerts' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const unreadOnly = url.searchParams.get('unread') === '1';
      const stmt = unreadOnly
        ? env.CRM_DB.prepare('SELECT * FROM alerts WHERE read = 0 ORDER BY created_at DESC LIMIT 100')
        : env.CRM_DB.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 100');
      const { results } = await stmt.all();
      return corsResponse({ success: true, alerts: results || [] });
    }

    // POST /api/alerts — create an alert (used by frontend automations)
    if (url.pathname === '/api/alerts' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const body = await request.json();
      if (!body.type || !body.title) return corsResponse({ success: false, message: 'type and title are required' }, 400);
      await d1InsertAlert(env, {
        id: body.id,
        type: String(body.type).slice(0, 40),
        title: String(body.title).slice(0, 200),
        body: String(body.body || '').slice(0, 500),
        targetType: body.targetType || null,
        targetId: body.targetId ?? null,
        userId: session.userId,
      });
      return corsResponse({ success: true });
    }

    // POST /api/alerts/mark-read — { ids: [...] } or { all: true }
    if (url.pathname === '/api/alerts/mark-read' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const body = await request.json();
      if (body.all) {
        await env.CRM_DB.prepare('UPDATE alerts SET read = 1 WHERE read = 0').run();
      } else if (Array.isArray(body.ids) && body.ids.length) {
        await env.CRM_DB.batch(body.ids.slice(0, 200).map(id =>
          env.CRM_DB.prepare('UPDATE alerts SET read = 1 WHERE id = ?').bind(String(id))
        ));
      }
      return corsResponse({ success: true });
    }

    // --------------------------------------------------------
    // CRM DATA ROUTES
    // --------------------------------------------------------

    // GET /api/crm-data — load merged CRM data. Primary source is D1 (backfilled
    // from the KV blobs on first read after deploy); any D1 failure falls back
    // to the legacy KV merge so reads can never break during the migration.
    if (url.pathname === '/api/crm-data' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      try {
        await ensureCrmMigratedToD1(env);
        const merged = await readCrmFromD1(env);
        return corsResponse({ success: true, data: merged });
      } catch (err) {
        console.error('D1 read failed, falling back to KV:', err);
        const userIds = (await env.SCRAPER_KV.get('crm:user-ids', 'json')) || [];
        const datasets = await Promise.all(
          userIds.map(id => env.SCRAPER_KV.get(`crm:user:${id}`, 'json'))
        );
        const merged = mergeUserData(datasets.filter(Boolean));
        return corsResponse({ success: true, data: merged });
      }
    }

    // POST /api/crm-data — save current user's CRM data (dual-write: KV blob
    // stays the rollback path while D1 becomes the primary read source)
    if (url.pathname === '/api/crm-data' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      // 60 saves per minute per user — well above the 2s debounce ceiling
      const allowed = await checkRateLimit(env, `crm:${session.userId}`, 60);
      if (!allowed) return corsResponse({ success: false, message: 'Too many requests — please slow down' }, 429);

      const body = await request.json();
      const userId = session.userId;
      const savedAt = new Date().toISOString();
      await env.SCRAPER_KV.put(`crm:user:${userId}`, JSON.stringify({ ...body, savedAt }));

      const userIds = (await env.SCRAPER_KV.get('crm:user-ids', 'json')) || [];
      if (!userIds.includes(userId)) {
        userIds.push(userId);
        await env.SCRAPER_KV.put('crm:user-ids', JSON.stringify(userIds));
      }

      let d1Synced = true;
      try {
        await syncUserBlobToD1(env, userId, body, savedAt);
      } catch (err) {
        d1Synced = false;
        console.error('D1 dual-write failed (KV save succeeded):', err);
      }
      return corsResponse({ success: true, d1Synced });
    }

    // GET /api/admin/d1-parity — compare KV-merged data vs D1 reads per entity
    if (url.pathname === '/api/admin/d1-parity' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (session.role !== 'Admin') return corsResponse({ success: false, message: 'Forbidden' }, 403);

      const userIds = (await env.SCRAPER_KV.get('crm:user-ids', 'json')) || [];
      const datasets = await Promise.all(userIds.map(id => env.SCRAPER_KV.get(`crm:user:${id}`, 'json')));
      const kvMerged = mergeUserData(datasets.filter(Boolean));
      await ensureCrmMigratedToD1(env);
      const d1Merged = await readCrmFromD1(env);

      const report = {};
      let match = true;
      for (const key of Object.keys(D1_ENTITY_TABLES)) {
        const kvIds = new Set((kvMerged[key] || []).map(r => String(r.id)));
        const d1Ids = new Set((d1Merged[key] || []).map(r => String(r.id)));
        const missingInD1 = [...kvIds].filter(id => !d1Ids.has(id));
        const extraInD1 = [...d1Ids].filter(id => !kvIds.has(id));
        if (missingInD1.length) match = false;
        report[key] = { kvCount: kvIds.size, d1Count: d1Ids.size, missingInD1, extraInD1 };
      }
      return corsResponse({ success: true, match, report });
    }

    // --------------------------------------------------------
    // API 404 — unknown /api route gets a JSON 404, not the SPA
    // --------------------------------------------------------
    if (url.pathname.startsWith('/api/')) {
      return corsResponse({ success: false, message: 'Not found' }, 404);
    }

    // --------------------------------------------------------
    // SPA FALLTHROUGH — serve the React app for all other routes
    // --------------------------------------------------------
    // Client-side routes like /verify?token=… and /reset?token=… have no
    // matching static asset, so they reach the Worker. Hand them to the
    // ASSETS binding, which (with not_found_handling: "single-page-application")
    // returns index.html so the React app can read the token from the URL.
    return env.ASSETS.fetch(request);
}
