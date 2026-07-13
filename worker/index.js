import puppeteer from '@cloudflare/puppeteer';
import { handleMarketIntelRoutes, runMarketIntelTick, maybeSeedWeeklyRefresh, extractPostcodeParts } from './marketIntel.js';

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
  { id: 'mchugh', name: 'McHugh & Co', shortName: 'McHugh', diaryUrl: 'https://www.mchughandco.com/' },
  { id: 'eig', name: 'EIG (mixed auctioneers)', shortName: 'EIG', diaryUrl: 'https://www.eigpropertyauctions.co.uk/search/property/south-yorkshire?view=1&order=0' },
  { id: 'otm', name: 'OnTheMarket (mixed auctioneers)', shortName: 'OnTheMarket', diaryUrl: 'https://www.onthemarket.com/auction/property/south-yorkshire/' },
];

const EIG_BASE_URL = 'https://www.eigpropertyauctions.co.uk';
const EIG_HOUSE_NAME = 'EIG (mixed auctioneers)';

const OTM_BASE_URL = 'https://www.onthemarket.com';
const OTM_HOUSE_NAME = 'OnTheMarket (mixed auctioneers)';

const SY_KEYWORDS = ['sheffield', 'doncaster', 'rotherham', 'barnsley', 'south yorkshire', ', s1 ', ', s2 ', ', s3 ', ', s4 ', ', s5 ', ', s6 ', ', s7 ', ', s8 ', ', s9 ', ', s10', ', s11', ', s12', ', s13', ', s14', ', s20', ', s21', ', s60', ', s61', ', s62', ', s63', ', s64', ', s65', ', s66', ', dn1', ', dn2', ', dn3', ', dn4', ', dn5'];

const SCRAPER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Defaults for the lot-level auction scan; user overrides stored in KV so the
// cron can read them without a session.
const DEFAULT_SCAN_SETTINGS = {
  keywords: ['sheffield', 'doncaster', 'rotherham', 'barnsley', 'south yorkshire'],
  postcodeAreas: ['S', 'DN'],
  maxGuidePrice: 100000,
  propertyTypes: 'all',
};

// 'houses' scan setting: drop flats/land/commercial; unknown types stay in
// so a parse miss never hides a house.
function isExcludedFromHouses(propertyType) {
  return /flat|apartment|maisonette|land|garage|commercial/i.test(String(propertyType || ''));
}

async function getScanSettings(env) {
  const stored = await env.SCRAPER_KV.get('auction:scan-settings', 'json');
  return stored ? { ...DEFAULT_SCAN_SETTINGS, ...stored } : { ...DEFAULT_SCAN_SETTINGS };
}

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
// TASK REMINDERS — Email + Telegram (free channels)
// ============================================================

const REMINDER_OFFSET_LABEL = { '1w': '1 week', '3d': '3 days', '2d': '2 days', '1d': '1 day', '4h': '4 hours', '2h': '2 hours', '1h': '1 hour' };

function parseReminderOffsetMs(off) {
  const m = /^(\d+)\s*([wdhm])$/i.exec(String(off || '').trim());
  if (!m) return null;
  const n = parseInt(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === 'w' ? 604800000 : unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : 60000;
  return n * mult;
}

// ── UK bank holidays (gov.uk, free, keyless) — cached 24h in KV ──────────────
async function getBankHolidays(env, division = 'england-and-wales') {
  const cacheKey = `bankhols:${division}`;
  const cached = await env.SCRAPER_KV.get(cacheKey, 'json');
  if (cached) return cached;
  try {
    const res = await fetch('https://www.gov.uk/bank-holidays.json', {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Bank holidays HTTP ${res.status}`);
    const data = await res.json();
    const events = (data[division]?.events || []).map(e => ({ date: e.date, title: e.title }));
    const payload = { division, dates: events.map(e => e.date), events, fetchedAt: new Date().toISOString() };
    await env.SCRAPER_KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 86400 });
    return payload;
  } catch (e) {
    return { division, dates: [], events: [], error: e.message };
  }
}

function isWorkingDay(dateStr, holidaySet) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d)) return true;
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !holidaySet.has(dateStr);
}

// First working day on or after dateStr (looks up to 21 days ahead).
function nextWorkingDay(dateStr, holidaySet) {
  let d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d)) return dateStr;
  for (let i = 0; i < 21; i++) {
    const s = d.toISOString().slice(0, 10);
    if (isWorkingDay(s, holidaySet)) return s;
    d = new Date(d.getTime() + 86400000);
  }
  return dateStr;
}

async function sendTelegram(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return { ok: false };
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!res.ok) { console.error('Telegram error:', res.status, await res.text()); return { ok: false }; }
    return { ok: true };
  } catch (e) { console.error('Telegram send failed:', e); return { ok: false }; }
}

// Scan every user's CRM blob for tasks whose reminders are now due, and deliver
// them via the requested channels. A KV marker (rem:{taskId}:{offset}) dedupes so
// each reminder fires once even though the cron runs repeatedly. Marker keys are
// used instead of writing sentAt back into the blob to avoid a lost-update race
// with the SPA's own saves.
async function dispatchTaskReminders(env) {
  const userIds = (await env.SCRAPER_KV.get('crm:user-ids', 'json')) || [];
  const users = (await env.SCRAPER_KV.get('users', 'json')) || [];
  const userByName = {};
  for (const u of users) { if (u.name) userByName[u.name.toLowerCase()] = u; }
  const now = Date.now();
  const seenTasks = new Set();

  const bankHols = await getBankHolidays(env);
  const holidaySet = new Set(bankHols.dates || []);
  const holidayTitleByDate = {};
  for (const e of (bankHols.events || [])) holidayTitleByDate[e.date] = e.title;

  for (const uid of userIds) {
    const blob = await env.SCRAPER_KV.get(`crm:user:${uid}`, 'json');
    if (!blob || !Array.isArray(blob.tasks)) continue;
    for (const t of blob.tasks) {
      if (!t || seenTasks.has(t.id)) continue;
      seenTasks.add(t.id);
      if (!t.dueDate || !Array.isArray(t.reminders) || t.reminders.length === 0) continue;
      if (t.status === 'done' || t.status === 'complete') continue;
      const dueTime = (t.dueTime && /^\d{2}:\d{2}$/.test(t.dueTime)) ? t.dueTime : '09:00';
      const dueTs = Date.parse(`${t.dueDate}T${dueTime}:00Z`);
      if (isNaN(dueTs)) continue;

      const assignee = t.assignee ? userByName[String(t.assignee).toLowerCase()] : null;
      const ownerUser = users.find(u => u.id === uid);
      const recipient = assignee || ownerUser;
      const email = recipient && recipient.email;
      const recipientId = (recipient && recipient.id) || uid;
      const chatId = await env.SCRAPER_KV.get(`tg:chat:${recipientId}`);

      for (const r of t.reminders) {
        const offMs = parseReminderOffsetMs(r.offset);
        if (offMs == null) continue;
        const fireTs = dueTs - offMs;
        if (now < fireTs) continue;                 // not yet time
        if (now > dueTs + 2 * 86400000) continue;   // too far past due — skip
        const marker = `rem:${t.id}:${r.offset}`;
        if (await env.SCRAPER_KV.get(marker)) continue;

        const channels = Array.isArray(r.channels) && r.channels.length ? r.channels : ['email'];
        const label = REMINDER_OFFSET_LABEL[r.offset] || r.offset;
        const safeTitle = String(t.title || 'Untitled task');
        let sentAny = false;

        // Flag due dates that land on a weekend or bank holiday
        const dueNonWorking = !isWorkingDay(t.dueDate, holidaySet);
        const dueNwd = dueNonWorking ? nextWorkingDay(t.dueDate, holidaySet) : null;
        const dueReason = dueNonWorking ? (holidayTitleByDate[t.dueDate] || 'weekend') : null;

        if (channels.includes('email') && email) {
          const res = await sendEmail(env, {
            to: email,
            subject: `🔔 Task reminder — ${safeTitle} (due ${t.dueDate})`,
            html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:28px">
              <div style="background:#0f172a;padding:14px 22px;border-radius:10px 10px 0 0"><h2 style="color:#fff;margin:0;font-size:17px">🔔 Task reminder</h2></div>
              <div style="border:1px solid #e2e8f0;border-top:none;padding:22px;border-radius:0 0 10px 10px">
                <p style="font-size:16px;font-weight:bold;color:#0f172a;margin:0 0 10px">${safeTitle.replace(/</g, '&lt;')}</p>
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                  <tr><td style="padding:5px 0;color:#64748b">Due</td><td style="font-weight:600;color:#0f172a">${t.dueDate}</td></tr>
                  <tr><td style="padding:5px 0;color:#64748b">Reminder</td><td style="font-weight:600;color:#0f172a">${label} before</td></tr>
                  ${t.linkedName ? `<tr><td style="padding:5px 0;color:#64748b">Linked to</td><td style="font-weight:600;color:#0f172a">${String(t.linkedName).replace(/</g, '&lt;')}</td></tr>` : ''}
                  ${t.assignee ? `<tr><td style="padding:5px 0;color:#64748b">Assignee</td><td style="font-weight:600;color:#0f172a">${String(t.assignee).replace(/</g, '&lt;')}</td></tr>` : ''}
                </table>
                ${dueNonWorking ? `<p style="margin-top:12px;padding:8px 12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;font-size:12px;color:#92400e">⚠️ Due date is a non-working day (${String(dueReason).replace(/</g, '&lt;')}). Nearest working day: <strong>${dueNwd}</strong>.</p>` : ''}
                ${t.notes ? `<p style="margin-top:14px;font-size:13px;color:#334155;white-space:pre-wrap">${String(t.notes).slice(0, 500).replace(/</g, '&lt;')}</p>` : ''}
              </div>
              <p style="font-size:11px;color:#94a3b8;margin-top:14px;text-align:center">A&A Partners CRM</p>
            </div>`,
          });
          if (res.ok) sentAny = true;
        }
        if (channels.includes('telegram') && chatId) {
          const tgTitle = safeTitle.replace(/[<>&]/g, '');
          const linkLine = t.linkedName ? `\n${String(t.linkedName).replace(/[<>&]/g, '')}` : '';
          const holLine = dueNonWorking ? `\n⚠️ Due on a non-working day (${String(dueReason).replace(/[<>&]/g, '')}) — nearest working day ${dueNwd}` : '';
          const res = await sendTelegram(env, chatId, `🔔 <b>Task reminder</b>\n<b>${tgTitle}</b>\nDue ${t.dueDate} · ${label} before${linkLine}${t.assignee ? `\nAssignee: ${String(t.assignee).replace(/[<>&]/g, '')}` : ''}${holLine}`);
          if (res.ok) sentAny = true;
        }
        if (sentAny) await env.SCRAPER_KV.put(marker, String(now), { expirationTtl: 30 * 86400 });
      }
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
  const d2 = clean.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (d1) auctionDate = `${d1[3]}-${MONTHS[d1[2].toLowerCase()]}-${d1[1].padStart(2,'0')}`;
  else if (d2) auctionDate = `${d2[3]}-${d2[2].padStart(2,'0')}-${d2[1].padStart(2,'0')}`;

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

const CRM_KEYS = ['properties', 'companies', 'contacts', 'surveyors', 'watchlist', 'scrapedAuctions', 'globalNotes', 'tasks', 'refurbQuotes', 'specItems', 'specTemplates', 'specAllowances', 'taskTemplates', 'catalogTrades', 'catalogProducts', 'roomTemplates', 'customCardTypes'];

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
  customCardTypes: { table: 'custom_card_types', cols: () => ({}) },
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

async function d1GetAuctionLotById(env, id) {
  const row = await env.CRM_DB.prepare('SELECT data FROM auction_lots WHERE id = ?').bind(String(id)).first();
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
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
// LOT-LEVEL AUCTION SCRAPERS
// ============================================================

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#163;|&pound;/gi, '£')
    .replace(/&#0?39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function parseGuidePrice(text) {
  try {
    const t = String(text || '');
    let m = t.match(/(?:\*?\s*guide(?:\s*price)?)[^£\d]{0,40}£\s*([\d,]+)/i);
    if (!m) m = t.match(/£\s*([\d,]{4,})/);
    if (!m) return null;
    const n = Number(m[1].replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

function extractOutcode(text) {
  const m = String(text || '').toUpperCase().match(/\b([A-Z]{1,2})(\d{1,2}[A-Z]?)\s*\d[A-Z]{2}\b/);
  if (!m) return null;
  return { area: m[1], outcode: m[1] + m[2] };
}

function extractLotNumber(text) {
  const m = String(text || '').match(/\bLot\s*[:#]?\s*(\d+[A-Z]?)\b/i);
  return m ? m[1] : null;
}

function extractPropertyType(text) {
  const m = String(text || '').match(/\b(?:end[- ]|mid[- ])?(?:semi[- ]detached|detached|terraced?|town[- ]?house|cottage|flat|apartment|studio|bungalow|maisonette|mews|block of flats|building plot|land|plot|garage|lock[- ]?up|commercial|retail|office|shop|mixed[- ]use|hmo)\b(?:[ \t]+(?:house|bungalow|flat|apartment))?/i);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

function extractBedrooms(text) {
  const m = String(text || '').match(/\b(\d+)\s*bed(?:room)?s?\b/i);
  return m ? Number(m[1]) : 0;
}

const MONTHS_MAP = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };

function extractAuctionDate(text) {
  const t = String(text || '');
  let m = t.match(/(\d{1,2})(?:st|nd|rd|th)?(?:\s*[-–]\s*\d{1,2}(?:st|nd|rd|th)?)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (m) return `${m[3]}-${MONTHS_MAP[m[2].toLowerCase()]}-${String(m[1]).padStart(2, '0')}`;
  m = t.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m) return `${m[3]}-${MONTHS_MAP[m[1].toLowerCase()]}-${String(m[2]).padStart(2, '0')}`;
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return null;
}

function matchesRegion(address, settings) {
  if (!address) return false;
  const low = String(address).toLowerCase();
  if ((settings.keywords || []).some(kw => kw && low.includes(String(kw).toLowerCase()))) return true;
  const oc = extractOutcode(address);
  if (oc && (settings.postcodeAreas || []).some(a => String(a).toUpperCase() === oc.area)) return true;
  return false;
}

async function getPageHtml(browser, url) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(SCRAPER_UA);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    // JS-rendered catalogues (e.g. online.auctionhouse.co.uk) need a beat to paint lot cards
    await page.waitForSelector('a[href*="lot"]', { timeout: 4000 }).catch(() => {});
    return await page.content();
  } finally {
    await page.close();
  }
}

function collectLinks(html, baseUrl, re) {
  const out = [];
  const seen = new Set();
  const aRe = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let m;
  while ((m = aRe.exec(html)) !== null) {
    const rawHref = m[1];
    if (!re.test(rawHref)) continue;
    let href;
    try { href = new URL(rawHref, baseUrl).href; } catch { continue; }
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

// Slice raw HTML into per-lot windows anchored on lot-detail links. A card
// usually carries several anchors with the same href (image + button), so
// anchors are grouped by href and each slice spans its group, bounded by the
// neighbouring groups so one card's fields never bleed into the next.
function extractLotSlices(html, anchorRe) {
  const groups = [];
  const byHref = new Map();
  const aRe = /<a[^>]+href=["']([^"']+)["']/gi;
  let m;
  while ((m = aRe.exec(html)) !== null) {
    const href = m[1];
    if (!anchorRe.test(href)) continue;
    if (byHref.has(href)) {
      byHref.get(href).last = m.index;
    } else {
      const g = { href, first: m.index, last: m.index };
      byHref.set(href, g);
      groups.push(g);
    }
  }
  const slices = [];
  for (let i = 0; i < groups.length; i++) {
    // A card's fields live inside/after its own anchor (AH wraps the whole
    // card in one <a>), so the main window starts AT the anchor — reaching
    // back would swallow the previous card's address. preHtml is a short
    // look-behind used only for "Lot N" headers rendered above the link.
    const nextStart = i + 1 < groups.length ? groups[i + 1].first : html.length;
    const end = Math.min(nextStart, groups[i].last + 3500);
    const preStart = Math.max(i > 0 ? groups[i - 1].last : 0, groups[i].first - 300);
    slices.push({ href: groups[i].href, html: html.slice(groups[i].first, end), preHtml: html.slice(preStart, groups[i].first) });
  }
  return slices;
}

// Field extraction from the stripped text of one lot block; null when the
// block has neither an address nor a price (nav/footer noise).
function parseLotText(text) {
  const guidePrice = parseGuidePrice(text);
  let address = null;
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length > 10 && line.length < 160 && extractOutcode(line)) { address = line; break; }
  }
  if (!address) {
    const cand = lines.find(l => l.includes(',') && l.length > 15 && l.length < 160 && !/guide|fee|auction|view|bid|register/i.test(l));
    if (cand) address = cand;
  }
  if (!address && guidePrice == null) return null;
  return { address, guidePrice, lotNumber: extractLotNumber(text), propertyType: extractPropertyType(text), bedrooms: extractBedrooms(text) };
}

function parseLotSlice(slice, baseUrl) {
  const text = stripHtml(slice.html);
  const fields = parseLotText(text);
  if (!fields) return null;
  if (!fields.lotNumber && slice.preHtml) fields.lotNumber = extractLotNumber(stripHtml(slice.preHtml));
  // Dead listings show a status sticker where the guide price normally sits
  const statusM = text.match(/\b(sold prior|withdrawn|postponed|exchanged|sold)\b/i);
  const listingStatus = statusM ? statusM[1].toLowerCase() : null;
  let lotUrl = slice.href || null;
  if (lotUrl && !/^https?:/i.test(lotUrl)) {
    try { lotUrl = new URL(lotUrl, baseUrl).href; } catch { lotUrl = null; }
  }
  const imgM = slice.html.match(/<img[^>]+src=["']([^"']+)["']/i);
  let imageUrl = imgM && !/\.svg|logo|icon|sprite|^data:/i.test(imgM[1]) ? imgM[1] : null;
  if (imageUrl && !/^https?:/i.test(imageUrl)) {
    try { imageUrl = new URL(imageUrl, baseUrl).href; } catch { imageUrl = null; }
  }
  return { ...fields, listingStatus, auctionDate: null, lotUrl, imageUrl };
}

function parseCataloguePage(html, baseUrl, anchorRe) {
  const slices = extractLotSlices(html, anchorRe);
  let lots = slices.map(s => parseLotSlice(s, baseUrl)).filter(Boolean);
  if (!lots.length) {
    // Text fallback: split on "Lot N" boundaries for markup without lot links
    const blocks = stripHtml(html).split(/(?=\bLot\s*[:#]?\s*\d+[A-Z]?\b)/i).slice(1);
    lots = blocks.map(b => {
      const fields = parseLotText(b);
      return fields ? { ...fields, auctionDate: null, lotUrl: null, imageUrl: null } : null;
    }).filter(Boolean);
  }
  const auctionDate = extractAuctionDate(stripHtml(html).slice(0, 4000));
  return { lots, auctionDate };
}

// AH lot cards carry no auction date, but each lot's detail page is plain
// server-rendered HTML with "closing on dd/mm/yyyy" in the meta description
// and a guide-price range — fetchable without Browser Rendering.
async function enrichLotFromDetailPage(lot) {
  if (!lot.lotUrl) return lot;
  const res = await fetch(lot.lotUrl, { headers: { 'User-Agent': SCRAPER_UA, 'Accept': 'text/html' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return lot;
  const html = await res.text();
  let m = html.match(/closing on\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (!m) m = html.match(/Bidding Opens\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (m) lot.auctionDate = `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  const stripped = stripHtml(html);
  if (!lot.auctionDate) {
    const d = extractAuctionDate(stripped.slice(0, 6000));
    if (d) lot.auctionDate = d;
  }
  if (!lot.auctionDate) {
    const au = html.match(/\/auction\/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (au) lot.auctionDate = `${au[1]}-${String(au[2]).padStart(2, '0')}-${String(au[3]).padStart(2, '0')}`;
  }
  if (lot.guidePrice == null) {
    const g = stripped.match(/Guide Price\*?\s*:?\s*£\s*([\d,]+)/i) || stripped.match(/£\s*([\d,]{4,})/);
    if (g) {
      const n = Number(g[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) lot.guidePrice = n;
    }
  }
  // Detail pages carry the full description, so fill the fields the terse
  // catalogue card left blank — never overwrite good card data.
  if (!lot.propertyType) {
    const pt = extractPropertyType(stripped);
    if (pt) lot.propertyType = pt;
  }
  if (!lot.bedrooms) {
    const bd = extractBedrooms(stripped);
    if (bd) lot.bedrooms = bd;
  }
  if (!lot.address) {
    const fields = parseLotText(stripped);
    if (fields && fields.address) lot.address = fields.address;
  }
  return lot;
}

// EIG (eigpropertyauctions.co.uk) aggregates ~24 auctioneers but hides the
// auctioneer name and per-lot deep link behind a login. Its search pages are
// plain server-rendered HTML (no Browser Rendering needed): one lot per
// `<div class="card overflow-hidden">`, so we slice on that boundary and reuse
// the shared field extractors. The lot GUID lives in the card image src.
function parseEigCatalogue(html, baseUrl) {
  const lots = [];
  // Split on card boundaries; index 0 is the page chrome before the first card.
  const chunks = String(html || '').split(/<div class="card overflow-hidden/i).slice(1);
  for (const chunk of chunks) {
    const guidM = chunk.match(/lots\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
      || chunk.match(/%2Flot%2F([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    const guid = guidM ? guidM[1] : null;

    const titleM = chunk.match(/property-title[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const address = titleM ? stripHtml(titleM[1]).replace(/\n+/g, ' ').trim() : null;

    const h4M = chunk.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
    // EIG encodes £ as the hex entity &#xA3;, which stripHtml doesn't decode.
    const h4Text = h4M ? stripHtml(h4M[1]).replace(/&#xA3;|&#0*163;|&pound;/gi, '£') : '';
    const guidePrice = parseGuidePrice(h4Text);
    const lotNumber = extractLotNumber(h4Text);

    const descM = chunk.match(/property-description[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    const descText = descM ? stripHtml(descM[1]) : '';

    const cardText = stripHtml(chunk);
    const auctionDate = extractAuctionDate(cardText);

    let imageUrl = null;
    const imgM = chunk.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgM && !/\.svg|logo|icon|sprite|^data:/i.test(imgM[1])) {
      try { imageUrl = new URL(imgM[1], baseUrl).href; } catch { imageUrl = null; }
    }
    const lotUrl = guid ? `${EIG_BASE_URL}/lot/${guid}` : null;

    if (!address && guidePrice == null) continue;
    lots.push({
      address,
      guidePrice,
      lotNumber,
      propertyType: extractPropertyType(descText || cardText),
      bedrooms: extractBedrooms(descText || cardText),
      auctionDate,
      imageUrl,
      lotUrl,
      eigGuid: guid,
    });
  }
  return lots;
}

// Crawl EIG's South Yorkshire future-auctions search over its numbered pages.
// Plain fetch (server-rendered), capped, stops when a page yields no lots.
// Never throws — failures surface via the returned error field.
async function scrapeEigLots(opts = {}) {
  const result = { lots: [], pagesFetched: 0, error: null };
  const maxPages = opts.maxPages || 8;
  try {
    const seen = new Set();
    for (let page = 1; page <= maxPages; page++) {
      const url = `${EIG_BASE_URL}/search/property/south-yorkshire?page=${page}&view=1&order=0`;
      let html;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': SCRAPER_UA, 'Accept': 'text/html' }, signal: AbortSignal.timeout(12000) });
        if (!res.ok) { if (page === 1) result.error = `EIG HTTP ${res.status}`; break; }
        html = await res.text();
      } catch (err) {
        if (page === 1) result.error = err.message;
        break;
      }
      result.pagesFetched++;
      const pageLots = parseEigCatalogue(html, EIG_BASE_URL);
      if (!pageLots.length) break;
      for (const lot of pageLots) {
        const key = lot.eigGuid || `${(lot.address || '').toLowerCase()}|${lot.guidePrice ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.lots.push(lot);
      }
    }
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

// OnTheMarket (onthemarket.com) auction search results are server-rendered
// Next.js: the full listings array is embedded as JSON in a
// <script id="__NEXT_DATA__"> tag, so no HTML slicing/regex fields are needed
// — just parse the JSON and read props.initialReduxState.results.list. Unlike
// EIG this is mostly individual agent listings (Modern Method of Auction /
// online bidding), so there's no shared auction event date or lot number.
function parseOtmCatalogue(html) {
  const m = String(html || '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return [];
  let data;
  try { data = JSON.parse(m[1]); } catch { return []; }
  const list = data?.props?.initialReduxState?.results?.list;
  if (!Array.isArray(list)) return [];
  const lots = [];
  for (const item of list) {
    const address = item.address || null;
    const guidePrice = parseGuidePrice(item.price);
    if (!address && guidePrice == null) continue;
    const otmId = item.id != null ? String(item.id) : null;
    const imageUrl = item['cover-image']?.default || item.images?.[0]?.default || null;
    const lotUrl = item['details-url'] ? `${OTM_BASE_URL}${item['details-url']}` : null;
    lots.push({
      address, guidePrice,
      lotNumber: null,
      propertyType: item['humanised-property-type'] || null,
      bedrooms: item.bedrooms || 0,
      auctionDate: null,
      imageUrl, lotUrl, otmId,
    });
  }
  return lots;
}

// Crawl OTM's South Yorkshire auction search over its numbered pages. Plain
// fetch (server-rendered), capped, stops when a page yields no lots. Never
// throws — failures surface via the returned error field.
async function scrapeOtmLots(opts = {}) {
  const result = { lots: [], pagesFetched: 0, error: null };
  const maxPages = opts.maxPages || 15;
  try {
    const seen = new Set();
    for (let page = 1; page <= maxPages; page++) {
      const url = page === 1
        ? `${OTM_BASE_URL}/auction/property/south-yorkshire/`
        : `${OTM_BASE_URL}/auction/property/south-yorkshire/?page=${page}`;
      let html;
      try {
        const res = await fetch(url, { headers: { 'User-Agent': SCRAPER_UA, 'Accept': 'text/html' }, signal: AbortSignal.timeout(12000) });
        if (!res.ok) { if (page === 1) result.error = `OTM HTTP ${res.status}`; break; }
        html = await res.text();
      } catch (err) {
        if (page === 1) result.error = err.message;
        break;
      }
      result.pagesFetched++;
      const pageLots = parseOtmCatalogue(html);
      if (!pageLots.length) break;
      for (const lot of pageLots) {
        const key = lot.otmId || `${(lot.address || '').toLowerCase()}|${lot.guidePrice ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.lots.push(lot);
      }
    }
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

// Trailing postcode token for cross-source matching. EIG addresses carry only a
// district (e.g. "Sheffield, South Yorkshire, S2"), so extractOutcode (which
// needs a full postcode) returns null; fall back to the full-postcode outcode
// for direct-house addresses.
function extractDistrict(address) {
  const m = String(address || '').toUpperCase().match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b\s*$/);
  if (m) return m[1];
  const oc = extractOutcode(address);
  return oc ? oc.outcode : null;
}

function lotScraperConfigs() {
  return [
    {
      houseId: 'ah_sy',
      houseName: 'Auction House South Yorkshire',
      diaryUrl: 'https://www.auctionhouse.co.uk/southyorkshire/auction/future-auction-dates',
      startUrls: ['https://www.auctionhouse.co.uk/southyorkshire/current-lots', 'https://www.auctionhouse.co.uk/southyorkshire'],
      followRe: /(view-lots|current-lots|catalogue|online\.auctionhouse)/i,
      anchorRe: /online\.auctionhouse\.co\.uk\/lot\/|\/lot\/(?:redirect\/)?\d+/i,
      maxFollow: 4,
      maxPages: 8,
      enrichFromLotPage: true,
    },
    {
      houseId: 'pugh',
      houseName: 'Pugh Auctions',
      diaryUrl: 'https://www.pugh-auctions.com/auction-diary',
      startUrls: ['https://www.pugh-auctions.com/auction-diary'],
      followRe: /(\/auctions?\/|catalogue|\/lots|\/search|\/propert)/i,
      anchorRe: /\/propert(?:y|ies)\/[\w-]+|\/lot[\/-]?\d+/i,
      maxFollow: 4,
      maxPages: 6,
      enrichFromLotPage: true,
    },
    {
      houseId: 'mchugh',
      houseName: 'McHugh & Co',
      diaryUrl: 'https://www.mchughandco.com/',
      startUrls: ['https://www.mchughandco.com/pages/auctions', 'https://www.mchughandco.com/'],
      followRe: /(current|catalogue|\/lots|auction)/i,
      anchorRe: /\/(?:propert(?:y|ies)|lots?)\/[\w-]+|\/auction\/details\/\d+/i,
      maxFollow: 3,
      maxPages: 4,
      enrichFromLotPage: true,
    },
    {
      houseId: 'sdl',
      houseName: 'SDL Property Auctions',
      diaryUrl: 'https://www.sdlauctions.co.uk/property-auctions/upcoming-auctions/',
      startUrls: ['https://www.sdlauctions.co.uk/find-a-property/', 'https://www.sdlauctions.co.uk/property-auctions/upcoming-auctions/'],
      followRe: /(find-a-property|upcoming-auctions|catalogue|\/lot|\/propert)/i,
      anchorRe: /\/(?:property|lot)\/[\w-]+/i,
      maxFollow: 4,
      maxPages: 6,
      enrichFromLotPage: true,
    },
    {
      // Diary lists /auction/<code> catalogue links; each lot is /property/<code>
      // and catalogue cards already carry address + guide price.
      houseId: 'mj',
      houseName: 'Mark Jenkinson & Son',
      diaryUrl: 'https://www.markjenkinson.co.uk/auction-diary',
      startUrls: ['https://www.markjenkinson.co.uk/auctions', 'https://www.markjenkinson.co.uk/auction-diary'],
      followRe: /(\/auction\/|catalogue|\/lots|current)/i,
      anchorRe: /\/(?:property|lot)\/[\w-]+/i,
      maxFollow: 4,
      maxPages: 6,
      enrichFromLotPage: true,
    },
    {
      // Lots surface via the JS-rendered property search (residential, Sheffield
      // radius) — Browser Rendering paints the cards a plain fetch can't.
      houseId: 'allsop',
      houseName: 'Allsop Residential',
      diaryUrl: 'https://www.allsop.co.uk/auctions/property-for-auction-in-sheffield/',
      startUrls: ['https://www.allsop.co.uk/property-search?available_only=true&lot_type=residential&location=sheffield-uk&radius=15', 'https://www.allsop.co.uk/auctions/property-for-auction-in-sheffield/'],
      followRe: /(property-search|auctions?|catalogue|\/lots|property-details|lot-details)/i,
      anchorRe: /\/(?:property-details|lot-details|property|lot)\/[\w-]+/i,
      maxFollow: 4,
      maxPages: 6,
      enrichFromLotPage: true,
    },
  ];
}

// Crawl one house: start pages, follow catalogue links when a page has no
// lots, paginate when it does. Never throws — failures land in result.error.
async function scrapeHouseLots(browser, cfg, opts = {}) {
  const result = { houseId: cfg.houseId, houseName: cfg.houseName, diaryUrl: cfg.diaryUrl, lots: [], pagesFetched: 0, error: null, debug: { urlsTried: [] } };
  try {
    const visited = new Set();
    const queue = [...cfg.startUrls];
    let followBudget = cfg.maxFollow;
    while (queue.length && result.pagesFetched < cfg.maxPages) {
      const pageUrl = queue.shift();
      if (visited.has(pageUrl)) continue;
      visited.add(pageUrl);
      let html;
      try {
        html = await getPageHtml(browser, pageUrl);
        result.pagesFetched++;
        result.debug.urlsTried.push(pageUrl);
      } catch (err) {
        result.debug.urlsTried.push(`${pageUrl} — ${err.message}`);
        continue;
      }
      if (/just a moment|attention required|access denied/i.test(html.slice(0, 3000))) {
        result.debug.urlsTried[result.debug.urlsTried.length - 1] += ' — blocked';
        continue;
      }
      if (opts.debug && !result.debug.strippedSample) {
        result.debug.htmlLength = html.length;
        result.debug.strippedSample = stripHtml(html).slice(0, 2500);
      }
      const { lots, auctionDate } = parseCataloguePage(html, pageUrl, cfg.anchorRe);
      if (lots.length) {
        for (const lot of lots) result.lots.push({ ...lot, auctionDate: lot.auctionDate || auctionDate });
        for (const l of collectLinks(html, pageUrl, /[?&]page=\d+/i)) {
          if (!visited.has(l)) queue.push(l);
        }
      } else if (followBudget > 0) {
        for (const l of collectLinks(html, pageUrl, cfg.followRe).slice(0, followBudget)) {
          if (!visited.has(l)) { queue.push(l); followBudget--; }
        }
      }
    }
    // Same card can carry two differently-hrefed anchors — collapse by content
    const seenKeys = new Set();
    result.lots = result.lots.filter(l => {
      const key = `${(l.address || '').toLowerCase()}|${l.guidePrice ?? ''}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
    if (!result.pagesFetched) result.error = 'No pages fetched';
  } catch (err) {
    result.error = err.message;
  }
  return result;
}

function stableLotId(houseId, raw) {
  const urlId = raw.lotUrl && raw.lotUrl.match(/\/lot\/(?:redirect\/)?(\d+)/i);
  if (urlId) return `scr-${houseId}-${urlId[1]}`;
  if (raw.lotUrl) {
    const tail = raw.lotUrl.replace(/\/+$/, '').split('/').pop();
    if (tail && /\d/.test(tail)) return `scr-${houseId}-${tail.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
  }
  if (raw.auctionDate && raw.lotNumber) return `scr-${houseId}-${raw.auctionDate}-lot${raw.lotNumber}`;
  const slug = String(raw.address || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `scr-${houseId}-${raw.auctionDate || 'tbc'}-${slug}`;
}

async function recomputeAuctionDateCounts(env, dateId) {
  const dateLots = (await d1GetAuctionLots(env, dateId)).filter(l => !l.isWithdrawn);
  const row = await env.CRM_DB.prepare('SELECT data FROM auction_dates WHERE id = ?').bind(String(dateId)).first();
  if (!row) return;
  const date = JSON.parse(row.data);
  await d1PutAuctionDate(env, {
    ...date,
    totalLots: dateLots.length,
    reviewedCount: dateLots.filter(l => l.status !== 'unreviewed').length,
    shortlistedCount: dateLots.filter(l => l.status === 'shortlisted').length,
    rejectedCount: dateLots.filter(l => l.status === 'rejected').length,
    watchingCount: dateLots.filter(l => l.status === 'watching').length,
  });
}

// Shared by POST /api/scrape-lots and the cron. Scrapes every configured
// house, filters by region + max guide price, upserts into auction_dates /
// auction_lots preserving triage state, detects price changes + withdrawals.
async function runLotScan(env, settings, opts = {}) {
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const results = [];
  const matchedLotRecords = [];
  // Scan-wide detail-page fetch budget so 6 houses of enrichment can't blow the
  // request time limit (which was silently starving the later houses).
  let enrichBudget = 50;
  // Manual scans run one house per request so no single house can be starved by
  // the request time limit; cron passes no houseId and scans them all.
  const configs = opts.houseId ? lotScraperConfigs().filter(c => c.houseId === opts.houseId) : lotScraperConfigs();
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    for (const cfg of configs) {
      const res = await scrapeHouseLots(browser, cfg);
      const summary = { houseId: cfg.houseId, name: cfg.houseName, lotsFound: res.lots.length, matched: 0, newLots: 0, updated: 0, withdrawn: 0, error: res.error };
      let matched = res.lots.filter(l => matchesRegion(l.address, settings) && (l.guidePrice == null || l.guidePrice <= settings.maxGuidePrice) && !(l.listingStatus && l.guidePrice == null));
      if (settings.propertyTypes === 'houses') matched = matched.filter(l => !isExcludedFromHouses(l.propertyType));
      summary.matched = matched.length;

      // Fill missing auction dates (and guides) from lot detail pages —
      // plain fetch, capped so a large catalogue can't stall the scan.
      if (cfg.enrichFromLotPage && !opts.dryRun) {
        for (const lot of matched) {
          // Enrich when the card is missing an auction date OR a usable property
          // type — the detail page is where both usually live.
          const needsEnrich = !lot.auctionDate || !lot.propertyType;
          if (!needsEnrich || !lot.lotUrl || enrichBudget <= 0) continue;
          enrichBudget--;
          try { await enrichLotFromDetailPage(lot); } catch {}
        }
      }

      if (!opts.dryRun && !res.error) {
        const matchedIds = new Set(matched.map(l => stableLotId(cfg.houseId, l)));
        const allScrapedIds = new Set(res.lots.map(l => stableLotId(cfg.houseId, l)));
        const ensuredDates = new Set();
        const touchedDateIds = new Set();
        const processed = new Set();

        for (const raw of res.lots) {
          const lotId = stableLotId(cfg.houseId, raw);
          if (processed.has(lotId)) continue;
          processed.add(lotId);
          const row = await env.CRM_DB.prepare('SELECT data FROM auction_lots WHERE id = ?').bind(lotId).first();
          const isMatch = matchedIds.has(lotId);
          if (!row && !isMatch) continue;

          const auctionDate = raw.auctionDate || (row ? JSON.parse(row.data).auctionDate : null) || null;
          const dateId = row ? (JSON.parse(row.data).dateId || `${cfg.houseId}-${auctionDate || 'tbc'}`) : `${cfg.houseId}-${auctionDate || 'tbc'}`;
          if (!ensuredDates.has(dateId)) {
            ensuredDates.add(dateId);
            const dRow = await env.CRM_DB.prepare('SELECT data FROM auction_dates WHERE id = ?').bind(String(dateId)).first();
            if (dRow) {
              await d1PutAuctionDate(env, { ...JSON.parse(dRow.data), lastScannedAt: now });
            } else {
              await d1PutAuctionDate(env, { id: dateId, houseId: cfg.houseId, houseName: cfg.houseName, auctionDate, diaryUrl: cfg.diaryUrl, totalLots: 0, reviewedCount: 0, shortlistedCount: 0, rejectedCount: 0, watchingCount: 0, isNew: true, firstSeenAt: now, lastScannedAt: now });
            }
          }
          touchedDateIds.add(dateId);

          if (!row) {
            const newLot = {
              id: lotId, dateId, origin: 'scraped', status: 'unreviewed', isNew: true,
              guidePriceChanged: false, isWithdrawn: false, firstSeenAt: now, lastUpdatedAt: now,
              address: raw.address, guidePrice: raw.guidePrice, bedrooms: raw.bedrooms || 0,
              propertyType: raw.propertyType || 'Unknown', lotNumber: raw.lotNumber,
              auctionDate, auctionTime: '', houseName: cfg.houseName,
              lotUrl: raw.lotUrl || '', imageUrl: raw.imageUrl || null, notes: '',
            };
            await d1PutAuctionLot(env, newLot);
            summary.newLots++;
            matchedLotRecords.push(newLot);
            if (opts.onNewLot) { try { await opts.onNewLot(newLot); } catch {} }
          } else {
            const existing = JSON.parse(row.data);
            const updatedLot = {
              ...existing,
              address: raw.address || existing.address,
              propertyType: raw.propertyType || existing.propertyType,
              bedrooms: raw.bedrooms || existing.bedrooms,
              lotNumber: raw.lotNumber || existing.lotNumber,
              lotUrl: raw.lotUrl || existing.lotUrl,
              imageUrl: raw.imageUrl || existing.imageUrl,
              auctionDate: auctionDate || existing.auctionDate,
              lastUpdatedAt: now,
            };
            if (raw.listingStatus) {
              updatedLot.isWithdrawn = true;
              if (!existing.isWithdrawn) {
                try {
                  await d1InsertAlert(env, {
                    id: `lotchange-${lotId}-${today}`,
                    type: 'listing_change',
                    title: `Listing changed: ${updatedLot.address || lotId}`,
                    body: `${cfg.houseName} — ${raw.listingStatus}`,
                    targetType: 'lot',
                    targetId: lotId,
                  });
                } catch {}
              }
            } else if (existing.isWithdrawn) updatedLot.isWithdrawn = false;
            const priceChanged = raw.guidePrice != null && existing.guidePrice != null && Number(raw.guidePrice) !== Number(existing.guidePrice);
            if (priceChanged) {
              updatedLot.previousGuidePrice = existing.guidePrice;
              updatedLot.guidePrice = raw.guidePrice;
              updatedLot.guidePriceChanged = true;
              try {
                await d1InsertAlert(env, {
                  id: `lotchange-${lotId}-${today}`,
                  type: 'listing_change',
                  title: `Listing changed: ${updatedLot.address || lotId}`,
                  body: `${cfg.houseName} — guide ${Number(existing.guidePrice || 0).toLocaleString()} → ${Number(raw.guidePrice || 0).toLocaleString()}`,
                  targetType: 'lot',
                  targetId: lotId,
                });
              } catch {}
            } else if (raw.guidePrice != null && existing.guidePrice == null) {
              updatedLot.guidePrice = raw.guidePrice;
            }
            await d1PutAuctionLot(env, updatedLot);
            summary.updated++;
            if (isMatch) matchedLotRecords.push(updatedLot);
          }
        }

        // Withdrawals — only when this house's scrape actually found lots, so
        // a site outage or parse failure never mass-withdraws a catalogue.
        if (res.lots.length > 0) {
          for (const dateId of touchedDateIds) {
            const dateLots = await d1GetAuctionLots(env, dateId);
            for (const lot of dateLots) {
              if (lot.origin !== 'scraped' || lot.isWithdrawn) continue;
              if (allScrapedIds.has(String(lot.id))) continue;
              await d1PutAuctionLot(env, { ...lot, isWithdrawn: true, lastUpdatedAt: now });
              summary.withdrawn++;
              try {
                await d1InsertAlert(env, {
                  id: `lotchange-${lot.id}-${today}`,
                  type: 'listing_change',
                  title: `Listing changed: ${lot.address || lot.id}`,
                  body: `${cfg.houseName} — withdrawn`,
                  targetType: 'lot',
                  targetId: lot.id,
                });
              } catch {}
            }
          }
        }

        for (const dateId of touchedDateIds) {
          try { await recomputeAuctionDateCounts(env, dateId); } catch {}
        }
      }

      results.push(summary);
    }
  } finally {
    await browser.close();
  }
  return { success: true, results, lots: matchedLotRecords, scrapedAt: now };
}

async function runScheduledLotScan(env) {
  await ensureAuctionMigratedToD1(env);
  const settings = await getScanSettings(env);
  const onNewLot = async (lot) => {
    await d1InsertAlert(env, {
      id: `newlot-${lot.id}`,
      type: 'listing_change',
      title: `New auction lot: ${lot.address || lot.id}`,
      body: `${lot.houseName} — ${lot.guidePrice ? `guide £${Number(lot.guidePrice).toLocaleString()}` : 'guide TBC'}${lot.auctionDate ? ` · ${lot.auctionDate}` : ''}`,
      targetType: 'lot',
      targetId: lot.id,
    });
  };
  const direct = await runLotScan(env, settings, { onNewLot });
  // EIG runs after the direct houses so it can tag lots they just refreshed.
  const eig = await runEigScan(env, settings, { onNewLot });
  // OTM runs last so it can tag lots either of the above just refreshed.
  const otm = await runOtmScan(env, settings, { onNewLot });
  return { ...direct, results: [...(direct.results || []), ...(eig.results || []), ...(otm.results || [])], lots: [...(direct.lots || []), ...(eig.lots || []), ...(otm.lots || [])] };
}

function houseIdForName(name) {
  const h = AUCTION_HOUSES_CONFIG.find(x => x.name === name);
  return h ? h.id : 'direct';
}

// EIG's own scan pass: scrape the aggregated SY search, then for each lot either
// TAG an existing direct-house lot that matches (same date + guide + postcode
// district) with an 'eig' source — so both origins are visible — or, when no
// match, upsert it as its own EIG-sourced lot. Kept entirely separate from the
// 6-house runLotScan loop so that shared machinery is untouched. Never throws.
async function runEigScan(env, settings, opts = {}) {
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const summary = { houseId: 'eig', name: EIG_HOUSE_NAME, lotsFound: 0, matched: 0, tagged: 0, newLots: 0, updated: 0, withdrawn: 0, error: null };
  const matchedLotRecords = [];

  const scrape = await scrapeEigLots({});
  summary.lotsFound = scrape.lots.length;
  summary.error = scrape.error;

  // Same region/price/type filters the 6 houses use.
  let matched = scrape.lots.filter(l => matchesRegion(l.address, settings) && (l.guidePrice == null || l.guidePrice <= settings.maxGuidePrice));
  if (settings.propertyTypes === 'houses') matched = matched.filter(l => !isExcludedFromHouses(l.propertyType));
  summary.matched = matched.length;

  if (opts.dryRun) {
    return { success: true, results: [summary], lots: matched.slice(0, 100), scrapedAt: now, dryRun: true };
  }
  // A failed scrape that returned nothing must never withdraw the catalogue.
  if (scrape.error && !scrape.lots.length) {
    return { success: true, results: [summary], lots: [], scrapedAt: now };
  }

  // One read of every lot: direct-house lots become match candidates, existing
  // EIG lots feed the upsert + withdrawal detection.
  const allLots = await d1GetAuctionLots(env);
  const candidateIndex = new Map();
  for (const l of allLots) {
    if (l.houseName === EIG_HOUSE_NAME || l.isWithdrawn || l.guidePrice == null || !l.auctionDate) continue;
    const d = extractDistrict(l.address);
    if (!d) continue;
    // Keyed by date+district only; guide is matched with tolerance below so a
    // small guide difference between EIG and the direct house still merges.
    const key = `${l.auctionDate}|${d}`;
    if (!candidateIndex.has(key)) candidateIndex.set(key, []);
    candidateIndex.get(key).push(l);
  }
  const eigExistingById = new Map(allLots.filter(l => l.houseName === EIG_HOUSE_NAME).map(l => [String(l.id), l]));

  const ensuredDates = new Set();
  const touchedDateIds = new Set();
  const scrapedEigIds = new Set();
  const taggedExistingIds = new Set();

  for (const raw of matched) {
    // 1) Tag a matching direct-house lot rather than duplicating it. Requires a
    // numeric guide + date so "Refer"/POA lots never match spuriously.
    if (raw.guidePrice != null && raw.auctionDate) {
      const d = extractDistrict(raw.address);
      const cands = (d && candidateIndex.get(`${raw.auctionDate}|${d}`)) || [];
      // EIG addresses are locality-only (auctioneer hidden), so match on guide
      // proximity (exact, or within 5%/£2.5k) and use address/locality overlap
      // to disambiguate when several direct lots share the date+district.
      let existing = null, bestScore = -1;
      for (const c of cands) {
        if (taggedExistingIds.has(String(c.id))) continue;
        const cg = Number(c.guidePrice), rg = Number(raw.guidePrice);
        const exact = cg === rg;
        const guideClose = exact || Math.abs(cg - rg) <= Math.max(2500, rg * 0.05);
        if (!guideClose) continue;
        const sim = addressSimilarity(raw.address, c.address);
        // Exact guide can merge on locality alone; a tolerated guide gap needs
        // some locality overlap so we don't merge two different cheap terraces.
        if (!exact && sim < 0.15) continue;
        const score = (exact ? 1 : 1 - Math.abs(cg - rg) / rg) + sim;
        if (score > bestScore) { bestScore = score; existing = c; }
      }
      if (existing) {
        taggedExistingIds.add(String(existing.id));
        const sources = Array.isArray(existing.sources) && existing.sources.length ? existing.sources : [houseIdForName(existing.houseName)];
        if (!sources.includes('eig')) {
          const updated = { ...existing, sources: [...sources, 'eig'], alsoOnEig: true, lastUpdatedAt: now };
          await d1PutAuctionLot(env, updated);
          summary.tagged++;
          matchedLotRecords.push(updated);
        }
        continue;
      }
    }

    // 2) No match — upsert as an EIG-sourced lot.
    const lotId = stableLotId('eig', raw);
    scrapedEigIds.add(lotId);
    const auctionDate = raw.auctionDate || null;
    const dateId = `eig-${auctionDate || 'tbc'}`;
    if (!ensuredDates.has(dateId)) {
      ensuredDates.add(dateId);
      const dRow = await env.CRM_DB.prepare('SELECT data FROM auction_dates WHERE id = ?').bind(String(dateId)).first();
      if (dRow) {
        await d1PutAuctionDate(env, { ...JSON.parse(dRow.data), lastScannedAt: now });
      } else {
        await d1PutAuctionDate(env, { id: dateId, houseId: 'eig', houseName: EIG_HOUSE_NAME, auctionDate, diaryUrl: `${EIG_BASE_URL}/search/property/south-yorkshire?view=1&order=0`, totalLots: 0, reviewedCount: 0, shortlistedCount: 0, rejectedCount: 0, watchingCount: 0, isNew: true, firstSeenAt: now, lastScannedAt: now });
      }
    }
    touchedDateIds.add(dateId);

    const existing = eigExistingById.get(lotId);
    if (!existing) {
      const newLot = {
        id: lotId, dateId, origin: 'scraped', status: 'unreviewed', isNew: true,
        guidePriceChanged: false, isWithdrawn: false, firstSeenAt: now, lastUpdatedAt: now,
        address: raw.address, guidePrice: raw.guidePrice, bedrooms: raw.bedrooms || 0,
        propertyType: raw.propertyType || 'Unknown', lotNumber: raw.lotNumber,
        auctionDate, auctionTime: '', houseName: EIG_HOUSE_NAME, houseId: 'eig', sources: ['eig'],
        lotUrl: raw.lotUrl || '', imageUrl: raw.imageUrl || null, notes: '',
      };
      await d1PutAuctionLot(env, newLot);
      summary.newLots++;
      matchedLotRecords.push(newLot);
      if (opts.onNewLot) { try { await opts.onNewLot(newLot); } catch {} }
    } else {
      const updatedLot = {
        ...existing,
        address: raw.address || existing.address,
        propertyType: raw.propertyType || existing.propertyType,
        bedrooms: raw.bedrooms || existing.bedrooms,
        lotNumber: raw.lotNumber || existing.lotNumber,
        lotUrl: raw.lotUrl || existing.lotUrl,
        imageUrl: raw.imageUrl || existing.imageUrl,
        auctionDate: auctionDate || existing.auctionDate,
        sources: Array.isArray(existing.sources) && existing.sources.includes('eig') ? existing.sources : ['eig'],
        isWithdrawn: false,
        lastUpdatedAt: now,
      };
      const priceChanged = raw.guidePrice != null && existing.guidePrice != null && Number(raw.guidePrice) !== Number(existing.guidePrice);
      if (priceChanged) {
        updatedLot.previousGuidePrice = existing.guidePrice;
        updatedLot.guidePrice = raw.guidePrice;
        updatedLot.guidePriceChanged = true;
        try {
          await d1InsertAlert(env, {
            id: `lotchange-${lotId}-${today}`,
            type: 'listing_change',
            title: `Listing changed: ${updatedLot.address || lotId}`,
            body: `${EIG_HOUSE_NAME} — guide ${Number(existing.guidePrice || 0).toLocaleString()} → ${Number(raw.guidePrice || 0).toLocaleString()}`,
            targetType: 'lot',
            targetId: lotId,
          });
        } catch {}
      } else if (raw.guidePrice != null && existing.guidePrice == null) {
        updatedLot.guidePrice = raw.guidePrice;
      }
      await d1PutAuctionLot(env, updatedLot);
      summary.updated++;
      matchedLotRecords.push(updatedLot);
    }
  }

  // Withdrawals — only within EIG dates we touched, and only when the scrape
  // actually returned lots, mirroring runLotScan's guard.
  if (matched.length > 0) {
    for (const dateId of touchedDateIds) {
      const dateLots = await d1GetAuctionLots(env, dateId);
      for (const lot of dateLots) {
        if (lot.origin !== 'scraped' || lot.isWithdrawn) continue;
        if (scrapedEigIds.has(String(lot.id))) continue;
        await d1PutAuctionLot(env, { ...lot, isWithdrawn: true, lastUpdatedAt: now });
        summary.withdrawn++;
        try {
          await d1InsertAlert(env, {
            id: `lotchange-${lot.id}-${today}`,
            type: 'listing_change',
            title: `Listing changed: ${lot.address || lot.id}`,
            body: `${EIG_HOUSE_NAME} — withdrawn`,
            targetType: 'lot',
            targetId: lot.id,
          });
        } catch {}
      }
    }
  }

  for (const dateId of touchedDateIds) {
    try { await recomputeAuctionDateCounts(env, dateId); } catch {}
  }

  return { success: true, results: [summary], lots: matchedLotRecords, scrapedAt: now };
}

// OTM's own scan pass: same tag-or-upsert shape as runEigScan, but OTM listings
// carry no auction event date (mostly rolling online-bidding sales, not a
// scheduled lot catalogue), so candidates are keyed on postcode district alone
// instead of date+district. To compensate for losing the date as a match
// signal, the address-similarity bar required to accept a match is raised
// versus EIG's (0.15) — 0.2 for an exact guide-price match, 0.35 for a
// tolerated guide gap — so two different cheap properties in the same
// district don't get wrongly merged into one lot. Never throws.
async function runOtmScan(env, settings, opts = {}) {
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const summary = { houseId: 'otm', name: OTM_HOUSE_NAME, lotsFound: 0, matched: 0, tagged: 0, newLots: 0, updated: 0, withdrawn: 0, error: null };
  const matchedLotRecords = [];

  const scrape = await scrapeOtmLots({});
  summary.lotsFound = scrape.lots.length;
  summary.error = scrape.error;

  // Same region/price/type filters the 6 houses and EIG use.
  let matched = scrape.lots.filter(l => matchesRegion(l.address, settings) && (l.guidePrice == null || l.guidePrice <= settings.maxGuidePrice));
  if (settings.propertyTypes === 'houses') matched = matched.filter(l => !isExcludedFromHouses(l.propertyType));
  summary.matched = matched.length;

  if (opts.dryRun) {
    return { success: true, results: [summary], lots: matched.slice(0, 100), scrapedAt: now, dryRun: true };
  }
  // A failed scrape that returned nothing must never withdraw the catalogue.
  if (scrape.error && !scrape.lots.length) {
    return { success: true, results: [summary], lots: [], scrapedAt: now };
  }

  // One read of every lot: direct-house/EIG lots become match candidates,
  // existing OTM lots feed the upsert + withdrawal detection.
  const allLots = await d1GetAuctionLots(env);
  const candidateIndex = new Map();
  for (const l of allLots) {
    if (l.houseName === OTM_HOUSE_NAME || l.isWithdrawn || l.guidePrice == null) continue;
    const d = extractDistrict(l.address);
    if (!d) continue;
    if (!candidateIndex.has(d)) candidateIndex.set(d, []);
    candidateIndex.get(d).push(l);
  }
  const otmExistingById = new Map(allLots.filter(l => l.houseName === OTM_HOUSE_NAME).map(l => [String(l.id), l]));

  const ensuredDates = new Set();
  const touchedDateIds = new Set();
  const scrapedOtmIds = new Set();
  const taggedExistingIds = new Set();

  for (const raw of matched) {
    // 1) Tag a matching existing lot rather than duplicating it. Requires a
    // numeric guide so "Refer"/POA lots never match spuriously.
    if (raw.guidePrice != null) {
      const d = extractDistrict(raw.address);
      const cands = (d && candidateIndex.get(d)) || [];
      let existing = null, bestScore = -1;
      for (const c of cands) {
        if (taggedExistingIds.has(String(c.id))) continue;
        const cg = Number(c.guidePrice), rg = Number(raw.guidePrice);
        const exact = cg === rg;
        const guideClose = exact || Math.abs(cg - rg) <= Math.max(2500, rg * 0.05);
        if (!guideClose) continue;
        const sim = addressSimilarity(raw.address, c.address);
        // No date signal available, so require more address overlap than EIG
        // does before accepting a match, even on an exact guide-price hit.
        if (exact && sim < 0.2) continue;
        if (!exact && sim < 0.35) continue;
        const score = (exact ? 1 : 1 - Math.abs(cg - rg) / rg) + sim;
        if (score > bestScore) { bestScore = score; existing = c; }
      }
      if (existing) {
        taggedExistingIds.add(String(existing.id));
        const sources = Array.isArray(existing.sources) && existing.sources.length ? existing.sources : [houseIdForName(existing.houseName)];
        if (!sources.includes('otm')) {
          const updated = { ...existing, sources: [...sources, 'otm'], alsoOnOtm: true, lastUpdatedAt: now };
          await d1PutAuctionLot(env, updated);
          summary.tagged++;
          matchedLotRecords.push(updated);
        }
        continue;
      }
    }

    // 2) No match — upsert as an OTM-sourced lot.
    const lotId = stableLotId('otm', raw);
    scrapedOtmIds.add(lotId);
    const auctionDate = raw.auctionDate || null;
    const dateId = `otm-${auctionDate || 'tbc'}`;
    if (!ensuredDates.has(dateId)) {
      ensuredDates.add(dateId);
      const dRow = await env.CRM_DB.prepare('SELECT data FROM auction_dates WHERE id = ?').bind(String(dateId)).first();
      if (dRow) {
        await d1PutAuctionDate(env, { ...JSON.parse(dRow.data), lastScannedAt: now });
      } else {
        await d1PutAuctionDate(env, { id: dateId, houseId: 'otm', houseName: OTM_HOUSE_NAME, auctionDate, diaryUrl: `${OTM_BASE_URL}/auction/property/south-yorkshire/`, totalLots: 0, reviewedCount: 0, shortlistedCount: 0, rejectedCount: 0, watchingCount: 0, isNew: true, firstSeenAt: now, lastScannedAt: now });
      }
    }
    touchedDateIds.add(dateId);

    const existing = otmExistingById.get(lotId);
    if (!existing) {
      const newLot = {
        id: lotId, dateId, origin: 'scraped', status: 'unreviewed', isNew: true,
        guidePriceChanged: false, isWithdrawn: false, firstSeenAt: now, lastUpdatedAt: now,
        address: raw.address, guidePrice: raw.guidePrice, bedrooms: raw.bedrooms || 0,
        propertyType: raw.propertyType || 'Unknown', lotNumber: raw.lotNumber,
        auctionDate, auctionTime: '', houseName: OTM_HOUSE_NAME, houseId: 'otm', sources: ['otm'],
        lotUrl: raw.lotUrl || '', imageUrl: raw.imageUrl || null, notes: '',
      };
      await d1PutAuctionLot(env, newLot);
      summary.newLots++;
      matchedLotRecords.push(newLot);
      if (opts.onNewLot) { try { await opts.onNewLot(newLot); } catch {} }
    } else {
      const updatedLot = {
        ...existing,
        address: raw.address || existing.address,
        propertyType: raw.propertyType || existing.propertyType,
        bedrooms: raw.bedrooms || existing.bedrooms,
        lotUrl: raw.lotUrl || existing.lotUrl,
        imageUrl: raw.imageUrl || existing.imageUrl,
        sources: Array.isArray(existing.sources) && existing.sources.includes('otm') ? existing.sources : ['otm'],
        isWithdrawn: false,
        lastUpdatedAt: now,
      };
      const priceChanged = raw.guidePrice != null && existing.guidePrice != null && Number(raw.guidePrice) !== Number(existing.guidePrice);
      if (priceChanged) {
        updatedLot.previousGuidePrice = existing.guidePrice;
        updatedLot.guidePrice = raw.guidePrice;
        updatedLot.guidePriceChanged = true;
        try {
          await d1InsertAlert(env, {
            id: `lotchange-${lotId}-${today}`,
            type: 'listing_change',
            title: `Listing changed: ${updatedLot.address || lotId}`,
            body: `${OTM_HOUSE_NAME} — guide ${Number(existing.guidePrice || 0).toLocaleString()} → ${Number(raw.guidePrice || 0).toLocaleString()}`,
            targetType: 'lot',
            targetId: lotId,
          });
        } catch {}
      } else if (raw.guidePrice != null && existing.guidePrice == null) {
        updatedLot.guidePrice = raw.guidePrice;
      }
      await d1PutAuctionLot(env, updatedLot);
      summary.updated++;
      matchedLotRecords.push(updatedLot);
    }
  }

  // Withdrawals — only within OTM dates we touched, and only when the scrape
  // actually returned lots, mirroring runEigScan's guard.
  if (matched.length > 0) {
    for (const dateId of touchedDateIds) {
      const dateLots = await d1GetAuctionLots(env, dateId);
      for (const lot of dateLots) {
        if (lot.origin !== 'scraped' || lot.isWithdrawn) continue;
        if (scrapedOtmIds.has(String(lot.id))) continue;
        await d1PutAuctionLot(env, { ...lot, isWithdrawn: true, lastUpdatedAt: now });
        summary.withdrawn++;
        try {
          await d1InsertAlert(env, {
            id: `lotchange-${lot.id}-${today}`,
            type: 'listing_change',
            title: `Listing changed: ${lot.address || lot.id}`,
            body: `${OTM_HOUSE_NAME} — withdrawn`,
            targetType: 'lot',
            targetId: lot.id,
          });
        } catch {}
      }
    }
  }

  for (const dateId of touchedDateIds) {
    try { await recomputeAuctionDateCounts(env, dateId); } catch {}
  }

  return { success: true, results: [summary], lots: matchedLotRecords, scrapedAt: now };
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

// ── Shared ArcGIS point-query helper (coal / radon / landfill) ───────────────
async function arcgisPointQuery(layerUrl, lat, lng, outFields, distanceM) {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: JSON.stringify({ x: lng, y: lat }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: outFields || '*',
    returnGeometry: 'false',
    f: 'json',
  });
  if (distanceM) { params.set('distance', String(distanceM)); params.set('units', 'esriSRUnit_Meter'); }
  const res = await fetch(`${layerUrl}/query?${params.toString()}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'ArcGIS query error');
  return (data.features || []).map(f => f.attributes);
}

// ── Coal mining legacy (Mining Remediation Authority open data, free) ────────
const COAL_ARCGIS = 'https://services-eu1.arcgis.com/Qn4lKcPDVHNivEyr/arcgis/rest/services';
async function connectorCoal(lat, lng) {
  const [field, high, highNear, low] = await Promise.allSettled([
    arcgisPointQuery(`${COAL_ARCGIS}/Coalfield_Consultation_Areas/FeatureServer/0`, lat, lng, 'TYPE'),
    arcgisPointQuery(`${COAL_ARCGIS}/DevelopmentHighRiskArea/FeatureServer/0`, lat, lng, 'FEATURE_TY'),
    arcgisPointQuery(`${COAL_ARCGIS}/DevelopmentHighRiskArea/FeatureServer/0`, lat, lng, 'FEATURE_TY', 500),
    arcgisPointQuery(`${COAL_ARCGIS}/DevelopmentLowRiskArea/FeatureServer/0`, lat, lng, 'FEATURE_TY'),
  ]);
  if (field.status !== 'fulfilled' && high.status !== 'fulfilled') throw new Error('Coal Authority services unreachable');
  const ok = r => (r.status === 'fulfilled' ? r.value : []);
  const inCoalfield = ok(field).length > 0;
  const highRisk = ok(high).length > 0;
  const highRiskWithin500m = ok(highNear).length;
  const lowRisk = ok(low).length > 0;
  return {
    inCoalfield,
    coalfieldType: ok(field)[0]?.TYPE || null,
    highRisk,
    highRiskWithin500m,
    lowRisk,
    riskLevel: highRisk ? 'High' : highRiskWithin500m > 0 ? 'Elevated' : inCoalfield ? 'Low' : 'None',
    note: highRisk
      ? 'In a Development High Risk Area — recorded coal mining features at/near surface; obtain a Coal Authority mining report before bidding'
      : highRiskWithin500m > 0
        ? `Development High Risk Area within 500m (${highRiskWithin500m} feature area${highRiskWithin500m > 1 ? 's' : ''})`
        : inCoalfield
          ? 'In the coalfield but no recorded high-risk features at this location'
          : 'Not in a coal mining reporting area',
  };
}

// ── Radon potential (UKHSA/BGS indicative atlas v3, free) ────────────────────
async function connectorRadon(lat, lng) {
  const rows = await arcgisPointQuery(
    'https://services3.arcgis.com/7bJVHfju2RXdGZa4/arcgis/rest/services/Radon_Indicative_Atlas_v3/FeatureServer/0',
    lat, lng, 'CLASS_MAX',
  );
  if (!rows.length) throw new Error('No radon atlas coverage at this location');
  const cls = rows[0].CLASS_MAX || 1;
  const BAND = { 1: 'less than 1%', 2: '1–3%', 3: '3–5%', 4: '5–10%', 5: '10–30%', 6: '30% or more' };
  return {
    radonClass: cls,
    homesAffectedBand: BAND[cls] || 'unknown',
    affectedArea: cls >= 2,
    testingAdvised: cls >= 3,
    note: cls >= 3
      ? `Radon affected area — class ${cls}/6, ${BAND[cls]} of homes above action level; testing advised`
      : cls === 2
        ? 'Marginal radon potential (1–3% of homes above action level)'
        : 'Low radon potential (below 1% of homes)',
  };
}

// ── Historic landfill proximity (Environment Agency, free) ───────────────────
async function connectorLandfill(lat, lng) {
  const base = 'https://environment.data.gov.uk/arcgis/rest/services/EA/HistoricLandfill/FeatureServer/0';
  const [onSiteR, nearR] = await Promise.allSettled([
    arcgisPointQuery(base, lat, lng, 'hld_ref,site_name', 50),
    arcgisPointQuery(base, lat, lng, 'hld_ref,site_name,last_input_date', 500),
  ]);
  if (onSiteR.status !== 'fulfilled' && nearR.status !== 'fulfilled') throw new Error('EA landfill service unreachable');
  const onSite = onSiteR.status === 'fulfilled' ? onSiteR.value : [];
  const near = nearR.status === 'fulfilled' ? nearR.value : [];
  return {
    onFormerLandfill: onSite.length > 0,
    sitesWithin500m: near.length,
    siteNames: [...new Set(near.map(s => s.site_name).filter(Boolean))].slice(0, 5),
    note: onSite.length > 0
      ? `On or within 50m of a historic landfill (${onSite[0].site_name || onSite[0].hld_ref}) — contamination/ground gas risk, expect lender scrutiny`
      : near.length > 0
        ? `${near.length} historic landfill site(s) within 500m`
        : 'No historic landfill within 500m',
  };
}

// ── Road/rail noise (Defra strategic noise mapping Round 3, free) ────────────
async function connectorNoise(lat, lng) {
  const d = 0.0015;
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  const getBands = async (slug, coll) => {
    const res = await fetch(
      `https://environment.data.gov.uk/spatialdata/${slug}/ogc/features/v1/collections/${coll}/items?bbox=${bbox}&limit=25&f=json`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) throw new Error(`Noise HTTP ${res.status}`);
    const data = await res.json();
    return (data.features || []).map(f => f.properties?.noiseclass).filter(Boolean);
  };
  const bandRank = c => (c.startsWith('>=75') ? 5 : parseInt(c) >= 70 ? 4 : parseInt(c) >= 65 ? 3 : parseInt(c) >= 60 ? 2 : 1);
  const [roadR, railR] = await Promise.allSettled([
    getBands('road-noise-lden-england-round-3', 'Road_Noise_Lden_England_Round_3'),
    getBands('rail-noise-lden-england-round-3', 'Rail_Noise_Lden_England_Round_3'),
  ]);
  if (roadR.status !== 'fulfilled' && railR.status !== 'fulfilled') throw new Error('Defra noise services unreachable');
  const top = arr => (arr.length ? [...arr].sort((a, b) => bandRank(b) - bandRank(a))[0] : null);
  const road = roadR.status === 'fulfilled' ? top(roadR.value) : null;
  const rail = railR.status === 'fulfilled' ? top(railR.value) : null;
  const worst = [road, rail].filter(Boolean).sort((a, b) => bandRank(b) - bandRank(a))[0] || null;
  return {
    roadNoiseBand: road,
    railNoiseBand: rail,
    quiet: !worst,
    highNoise: worst ? bandRank(worst) >= 3 : false,
    note: !worst
      ? 'No mapped road/rail noise above 55 dB Lden within ~150m'
      : `Mapped ${road && rail ? 'road and rail' : road ? 'road' : 'rail'} noise ${worst} dB Lden within ~150m (Defra 2017 mapping)`,
  };
}

// ── Live planning applications nearby (PlanIt, free) ─────────────────────────
async function connectorPlanIt(lat, lng) {
  const res = await fetch(
    `https://www.planit.org.uk/api/applics/json?krad=0.25&lat=${lat}&lng=${lng}&recent=548&pg_sz=20`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) throw new Error(`PlanIt HTTP ${res.status}`);
  const data = await res.json();
  const recs = data.records || [];
  const apps = recs.map(r => ({
    name: r.name || '',
    address: r.address || '',
    description: (r.description || '').slice(0, 160),
    type: r.app_type || '',
    size: r.app_size || '',
    state: r.app_state || '',
    decidedDate: r.decided_date || null,
    distanceKm: r.distance != null ? Math.round(r.distance * 100) / 100 : null,
    link: r.link || '',
  }));
  const count = s => apps.filter(a => a.state === s).length;
  return {
    totalNearby: data.total != null ? data.total : apps.length,
    permitted: count('Permitted'),
    rejected: count('Rejected'),
    undecided: count('Undecided'),
    withdrawn: count('Withdrawn'),
    apps: apps.slice(0, 8),
    note: apps.length === 0
      ? 'No planning applications within 250m in the last 18 months'
      : `${apps.length} planning application(s) within 250m in the last 18 months`,
  };
}

// ── Bank of England Bank Rate (IADB CSV, free; KV-cached 24h) ────────────────
async function connectorRates(env) {
  const CACHE_KEY = 'boe-bank-rate-cache';
  try {
    const cached = await env.SCRAPER_KV.get(CACHE_KEY, 'json');
    if (cached && Date.now() - cached.cachedAt < 24 * 3600 * 1000) return cached.data;
  } catch (e) {}
  const from = new Date(Date.now() - 400 * 24 * 3600 * 1000);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fromStr = `${String(from.getDate()).padStart(2, '0')}/${MON[from.getMonth()]}/${from.getFullYear()}`;
  // The IADB endpoint intermittently returns 500 — retry once before failing
  const boeUrl = `https://www.bankofengland.co.uk/boeapps/iadb/fromshowcolumns.asp?csv.x=yes&Datefrom=${fromStr}&Dateto=now&SeriesCodes=IUDBEDR&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`;
  let res = await fetch(boeUrl, { headers: { Accept: 'text/csv,*/*' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    await new Promise(r => setTimeout(r, 1500));
    res = await fetch(boeUrl, { headers: { Accept: 'text/csv,*/*' }, signal: AbortSignal.timeout(15000) });
  }
  if (!res.ok) throw new Error(`BoE HTTP ${res.status}`);
  const csv = await res.text();
  const rows = csv.trim().split('\n').slice(1)
    .map(l => { const [dt, v] = l.trim().split(','); return { date: dt, rate: parseFloat(v) }; })
    .filter(r => r.date && !isNaN(r.rate));
  if (!rows.length) throw new Error('No BoE rate data');
  const current = rows[rows.length - 1];
  const yearAgo = rows[0];
  const data = {
    baseRate: current.rate,
    asOf: current.date,
    baseRate12mAgo: yearAgo.rate,
    change12m: Math.round((current.rate - yearAgo.rate) * 100) / 100,
    trend: current.rate < yearAgo.rate ? 'falling' : current.rate > yearAgo.rate ? 'rising' : 'flat',
  };
  try { await env.SCRAPER_KV.put(CACHE_KEY, JSON.stringify({ cachedAt: Date.now(), data }), { expirationTtl: 48 * 3600 }); } catch (e) {}
  return data;
}

// ── Ofcom Connected Nations broadband coverage (free API key required) ───────
async function connectorBroadband(postcode, env) {
  if (!env.OFCOM_API_KEY) throw new Error('OFCOM_API_KEY not configured');
  const pc = postcode.replace(/\s+/g, '');
  const res = await fetch(
    `https://api-proxy.ofcom.org.uk/broadband/coverage/${encodeURIComponent(pc)}`,
    { headers: { 'Ofcom-API-Key': env.OFCOM_API_KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) throw new Error(`Ofcom HTTP ${res.status}`);
  const data = await res.json();
  const avail = (Array.isArray(data?.Availability) && data.Availability[0]) || (Array.isArray(data?.availability) && data.availability[0]) || data || {};
  const num = (...keys) => {
    for (const k of keys) {
      const v = avail[k];
      if (typeof v === 'number') return v;
      if (v != null && !isNaN(parseFloat(v))) return parseFloat(v);
    }
    return null;
  };
  const down = num('MaxPredictedDown', 'maxPredictedDown', 'MaxDown');
  return {
    maxDownMbps: down,
    maxUpMbps: num('MaxPredictedUp', 'maxPredictedUp', 'MaxUp'),
    ultrafastAvailable: down != null ? down >= 300 : null,
    superfastAvailable: down != null ? down >= 30 : null,
    note: down == null ? 'Ofcom response shape unrecognised — raw data not stored' : `Max predicted download ${down} Mbps`,
  };
}

// ── Area news & regeneration (Tavily web search, TAVILY_API_KEY required) ────
// Raw search results only — no LLM call — so it stays fast and quota-free.
async function connectorNews(postcode, laName, env) {
  if (!env.TAVILY_API_KEY) throw new Error('TAVILY_API_KEY not configured');
  const outcode = String(postcode || '').trim().split(/\s+/)[0];
  const area = laName || outcode;
  if (!area) throw new Error('No area to search news for');
  const items = await webSearch(`${area} regeneration development investment news`, env, 6);
  if (!items.length) throw new Error('No recent news found');
  return {
    area,
    items: items.map(r => ({ title: r.title, url: r.url, snippet: r.snippet, publishedDate: r.publishedDate })),
    note: `${items.length} recent news items for ${area}`,
  };
}

// ── UK House Price Index (Land Registry linked data, free, no auth) ──────────
// UK HPI is keyed by region SLUG (not the GSS code — the old
// `hpi/averagePrice.json?regionCode=<GSS>` form returns HTTP 400). The slug is
// derived from the local-authority name; `refPeriodStart` is a human date
// ('Sun, 01 Jan 1995') so it's parsed to ISO and sorted by refMonth desc.
async function connectorHPI(laCode, laName) {
  const slug = laName
    ? laName.toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : null;
  if (!slug) throw new Error('No LA name for HPI');
  const res = await fetch(
    `https://landregistry.data.gov.uk/data/ukhpi/region/${encodeURIComponent(slug)}/month.json?_pageSize=80&_sort=-refMonth`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) throw new Error(`HPI HTTP ${res.status}`);
  const data = await res.json();
  const items = (data.result?.items || [])
    .map(i => ({ date: i.refPeriodStart ? new Date(i.refPeriodStart).toISOString().slice(0, 10) : '', price: Number(i.averagePrice) || 0 }))
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
    area: laName || laCode,
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

// ── Open-Meteo weather forecast (free, keyless) — inspection/viewing planning ──
const WMO_CODE = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Thunderstorm w/ hail',
};
async function connectorWeather(lat, lng) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weathercode,windspeed_10m,precipitation` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max` +
    `&forecast_days=7&timezone=Europe%2FLondon`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();
  const cur = data.current || {};
  const dl = data.daily || {};
  const days = (dl.time || []).map((t, i) => {
    const code = dl.weathercode?.[i];
    const pop = dl.precipitation_probability_max?.[i];
    const wind = dl.windspeed_10m_max?.[i];
    return {
      date: t,
      summary: WMO_CODE[code] || 'Unknown',
      tempMax: dl.temperature_2m_max?.[i] != null ? Math.round(dl.temperature_2m_max[i]) : null,
      tempMin: dl.temperature_2m_min?.[i] != null ? Math.round(dl.temperature_2m_min[i]) : null,
      precipProb: pop != null ? pop : null,
      windMax: wind != null ? Math.round(wind) : null,
      // Dry, low-wind, daylight-friendly day for viewings / drone / roof work
      goodForInspection: (pop == null || pop <= 30) && (wind == null || wind <= 35) && ![61,63,65,66,67,71,73,75,80,81,82,85,86,95,96,99].includes(code),
    };
  });
  return {
    current: {
      temp: cur.temperature_2m != null ? Math.round(cur.temperature_2m) : null,
      summary: WMO_CODE[cur.weathercode] || 'Unknown',
      wind: cur.windspeed_10m != null ? Math.round(cur.windspeed_10m) : null,
      precipitation: cur.precipitation ?? null,
    },
    forecast: days,
    nextGoodInspectionDay: days.find(d => d.goodForInspection)?.date || null,
  };
}

// ── Open-Meteo air quality (free, keyless) — feeds Neighbourhood score ──
async function connectorAirQuality(lat, lng) {
  const res = await fetch(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
    `&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone&timezone=Europe%2FLondon`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`Open-Meteo AQ HTTP ${res.status}`);
  const data = await res.json();
  const cur = data.current || {};
  const aqi = cur.european_aqi;
  if (aqi == null) throw new Error('No air quality index');
  const label = aqi <= 20 ? 'Good' : aqi <= 40 ? 'Fair' : aqi <= 60 ? 'Moderate' : aqi <= 80 ? 'Poor' : aqi <= 100 ? 'Very poor' : 'Extremely poor';
  return {
    europeanAqi: Math.round(aqi),
    label,
    pm25: cur.pm2_5 != null ? Math.round(cur.pm2_5 * 10) / 10 : null,
    pm10: cur.pm10 != null ? Math.round(cur.pm10 * 10) / 10 : null,
    no2: cur.nitrogen_dioxide != null ? Math.round(cur.nitrogen_dioxide) : null,
    ozone: cur.ozone != null ? Math.round(cur.ozone) : null,
    // 0–100 where higher = cleaner, for the Neighbourhood composite
    qualityScore: Math.max(0, Math.min(100, Math.round(100 - aqi))),
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

// Merge RightMove Plus listings into the property's existing comps and
// Land Registry items. Backfill only — a field already populated on a comp
// is never overwritten. Each backfilled field is tagged in comp.fieldSources
// so the UI can show which source supplied it. Land Registry sold data wins
// over RightMove figures for price/date (LR is the actual sale record).
function mergeRightmoveListings(listings, comps, lrItems) {
  const RM = 'RightMove Plus';
  const LR = 'Land Registry';
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const shortKey = addr => {
    const tokens = norm(addr).split(' ').filter(Boolean);
    const num = tokens.find(t => /^\d+[a-z]?$/.test(t)) || '';
    const numIdx = tokens.indexOf(num);
    const prefix = numIdx > 0 ? tokens.slice(Math.max(0, numIdx - 1), numIdx).join(' ') : '';
    return `${prefix} ${num}`.trim();
  };
  const bestMatch = (addr, items, getAddr) => {
    if (!addr || !items?.length) return null;
    const aKey = shortKey(addr);
    let bestScore = 0.35;
    let best = null;
    for (const it of items) {
      const itAddr = getAddr(it);
      const score = addressSimilarity(addr, itAddr);
      const keyBonus = (aKey && shortKey(itAddr) === aKey) ? 0.2 : 0;
      if (score + keyBonus > bestScore) { bestScore = score + keyBonus; best = it; }
    }
    return best;
  };
  const blank = v => v == null || v === '';

  const enrichedComps = comps.map(c => ({ ...c }));
  const newComps = [];
  let enrichedCount = 0;

  for (const l of listings) {
    if (!l || blank(l.address)) continue;
    const lrHit = bestMatch(l.address, lrItems, it => it.address);
    const soldPrice = (lrHit?.price ?? l.soldPrice) ?? null;
    const soldDate = (lrHit?.date ?? l.soldDate) ?? null;
    const soldSrc = lrHit ? LR : RM;

    const compHit = bestMatch(l.address, enrichedComps, c => c.address);
    if (compHit) {
      const srcs = { ...(compHit.fieldSources || {}) };
      let touched = false;
      const fill = (field, value, src) => {
        if (blank(compHit[field]) && !blank(value)) { compHit[field] = value; srcs[field] = src; touched = true; }
      };
      fill('bedrooms', l.bedrooms, RM);
      fill('tenure', l.tenure, RM);
      fill('propertyType', l.propertyType, RM);
      fill('floorArea', l.floorArea, RM);
      fill('askingPrice', l.askingPrice, RM);
      if (blank(compHit.soldPrice) && blank(compHit.price)) fill('soldPrice', soldPrice, soldSrc);
      if (blank(compHit.soldDate) && blank(compHit.date)) fill('soldDate', soldDate, soldSrc);
      if (touched) { compHit.fieldSources = srcs; compHit.enriched = true; enrichedCount++; }
    } else {
      const srcs = {};
      ['bedrooms', 'tenure', 'propertyType', 'floorArea', 'askingPrice'].forEach(f => { if (!blank(l[f])) srcs[f] = RM; });
      if (!blank(soldPrice)) srcs.soldPrice = soldSrc;
      if (!blank(soldDate)) srcs.soldDate = soldSrc;
      newComps.push({
        id: crypto.randomUUID(),
        address: l.address,
        bedrooms: l.bedrooms ?? null,
        tenure: l.tenure ?? null,
        propertyType: l.propertyType ?? null,
        floorArea: l.floorArea ?? null,
        askingPrice: l.askingPrice ?? null,
        soldPrice,
        soldDate,
        source: RM,
        enriched: !!lrHit,
        fieldSources: srcs,
        addedAt: new Date().toISOString(),
      });
    }
  }
  return { enrichedComps, newComps, enrichedCount };
}

// ============================================================
// COMPOSITE SCORES — derived purely from connector data (no new API calls)
// Each score is 0–100. `invert:true` means higher = worse (risk scores).
// A score is null when no contributing connector returned data.
// ============================================================
function computeScores(connectors) {
  const d = k => (connectors?.[k]?.status === 'success' ? connectors[k].data : null);
  const police = d('police'), osm = d('osm'), flood = d('flood'), plan = d('planning'),
        imd = d('imd'), hpi = d('hpi'), lr = d('landRegistry'), tfl = d('tfl'),
        schl = d('schools'), epc = d('epc'), cens = d('census'), air = d('airQuality');

  const clamp = n => Math.max(0, Math.min(100, Math.round(n)));
  const band = s => s == null ? 'No data' : s >= 80 ? 'Excellent' : s >= 65 ? 'Strong' : s >= 50 ? 'Moderate' : s >= 35 ? 'Weak' : 'Poor';
  const riskBand = s => s == null ? 'No data' : s >= 70 ? 'High' : s >= 45 ? 'Moderate' : s >= 25 ? 'Low' : 'Minimal';
  // Weighted mean over the entries that actually have a value.
  const blend = entries => {
    const valid = entries.filter(e => e && e.v != null && !isNaN(e.v));
    if (!valid.length) return { score: null, factors: [], have: 0 };
    const tw = valid.reduce((s, e) => s + e.w, 0);
    const score = clamp(valid.reduce((s, e) => s + e.v * e.w, 0) / tw);
    const factors = valid
      .filter(e => e.label)
      .sort((a, b) => (b.v * b.w) - (a.v * a.w))
      .slice(0, 4)
      .map(e => e.label);
    return { score, factors, have: valid.length };
  };

  // ── Reusable normalised sub-signals (0–100, higher = better) ──
  const EPC_Q = { A: 100, B: 88, C: 72, D: 55, E: 38, F: 22, G: 8 };
  const epcRating = epc?.epcRating || epc?.best?.currentRating || null;
  const epcQ      = epcRating ? (EPC_Q[epcRating] ?? null) : null;

  const crimeQ = police?.riskScore != null ? clamp((10 - police.riskScore) / 9 * 100) : null;
  const amenityQ = osm?.amenityScore != null ? osm.amenityScore * 10 : null;
  const deprivQ = imd?.decile != null ? imd.decile * 10 : null;

  // Transport: TfL score in London, else OSM nearest-station proximity.
  let transportQ = null;
  if (tfl?.inLondon && tfl?.transportScore != null) transportQ = tfl.transportScore * 10;
  else if (osm?.nearestStationM != null) transportQ = osm.nearestStationM <= 500 ? 90 : osm.nearestStationM <= 1000 ? 72 : osm.nearestStationM <= 1600 ? 52 : 34;

  // Schools: best Ofsted rating nearby, nudged by how many are Outstanding/Good.
  let schoolsQ = null;
  if (schl?.schoolCount) {
    const baseByRating = { Outstanding: 92, Good: 74, 'Requires Improvement': 46, Inadequate: 22 };
    const base = baseByRating[schl.bestRating] ?? 55;
    const boost = Math.min(12, (schl.outstandingCount || 0) * 6 + (schl.goodCount || 0) * 2);
    schoolsQ = clamp(base + boost);
  }

  // Capital growth from official HPI (3yr) with LR price trend as a secondary signal.
  const growthQ = hpi?.growth3yr != null ? clamp(50 + hpi.growth3yr * 1.4)
    : (lr?.priceGrowth != null ? clamp(50 + lr.priceGrowth * 1.4) : null);

  const airQ = air?.qualityScore != null ? air.qualityScore : null;
  const parksQ = osm ? clamp(Math.min(3, (osm.parks?.length || 0)) / 3 * 100) : null;
  const healthQ = osm ? clamp(Math.min(3, (osm.gp?.length || 0) + (osm.hospitals?.length || 0)) / 3 * 100) : null;

  // Flood risk (higher = worse).
  let floodRisk = null;
  if (flood) floodRisk = flood.hasCurrentWarning ? 90 : flood.floodAreasNearby > 1 ? 60 : flood.floodAreasNearby === 1 ? 40 : 8;

  // ── 1. Investment Score — headline blend of return + area quality − risk ──
  const investment = blend([
    { v: growthQ,     w: 3, label: hpi?.growth3yr != null ? `${hpi.growth3yr >= 0 ? '+' : ''}${hpi.growth3yr}% 3yr HPI growth` : (lr?.priceGrowth != null ? `${lr.priceGrowth >= 0 ? '+' : ''}${lr.priceGrowth}% local price trend` : null) },
    { v: deprivQ,     w: 2, label: imd?.label ? `${imd.label} (IMD decile ${imd.decile})` : null },
    { v: crimeQ,      w: 2, label: police?.riskLabel ? `${police.riskLabel} crime` : null },
    { v: amenityQ,    w: 2, label: osm?.amenityLabel ? `${osm.amenityLabel} amenities` : null },
    { v: transportQ,  w: 1.5, label: transportQ != null ? 'Transport access' : null },
    { v: schoolsQ,    w: 1, label: schl?.bestRating ? `${schl.bestRating} school nearby` : null },
    { v: epcQ,        w: 1, label: epcRating ? `EPC ${epcRating}` : null },
    { v: floodRisk != null ? 100 - floodRisk : null, w: 1, label: flood && flood.floodAreasNearby === 0 ? 'No flood areas nearby' : null },
    { v: plan?.constraintCount != null ? clamp(100 - plan.constraintCount * 22) : null, w: 1, label: plan && plan.constraintCount === 0 ? 'No planning constraints' : null },
  ]);

  // ── 2. Neighbourhood Score — liveability (amenities, green, health, air, crime) ──
  const neighbourhood = blend([
    { v: amenityQ,   w: 3, label: osm?.amenityLabel ? `${osm.amenityLabel} amenities` : null },
    { v: parksQ,     w: 1.5, label: osm?.parks?.length ? `${osm.parks.length} park(s) nearby` : null },
    { v: healthQ,    w: 1.5, label: (osm?.gp?.length || osm?.hospitals?.length) ? 'GP / hospital access' : null },
    { v: crimeQ,     w: 2, label: police?.riskLabel ? `${police.riskLabel} crime` : null },
    { v: airQ,       w: 1.5, label: air?.label ? `${air.label} air quality` : null },
    { v: transportQ, w: 1.5, label: transportQ != null ? 'Transport access' : null },
    { v: schoolsQ,   w: 1, label: schl?.bestRating ? `${schl.bestRating} school nearby` : null },
  ]);

  // ── 3. Refurbishment Risk — higher = MORE work/risk (EPC, planning, flood) ──
  const refurbRisk = blend([
    { v: epcQ != null ? 100 - epcQ : null, w: 3, label: epcRating && ['E', 'F', 'G'].includes(epcRating) ? `Poor EPC (${epcRating})` : null },
    { v: epc?.energyFlags?.length ? clamp(epc.energyFlags.length * 25) : (epc ? 0 : null), w: 1.5, label: epc?.energyFlags?.length ? epc.energyFlags.join(', ') : null },
    { v: plan?.listedBuilding ? 100 : (plan?.constraintCount != null ? clamp(plan.constraintCount * 30) : null), w: 2.5, label: plan?.listedBuilding ? `Listed building${plan.listedBuildingGrade ? ` (Grade ${plan.listedBuildingGrade})` : ''}` : (plan?.conservationArea ? 'Conservation area' : null) },
    { v: floodRisk, w: 1.5, label: flood?.floodAreasNearby > 0 ? `${flood.floodAreasNearby} flood area(s) nearby` : null },
  ]);
  if (refurbRisk.score != null) refurbRisk.invert = true;

  // ── 4. Rental Demand — tenant pool, transport, employment, amenities ──
  const rentPct = cens?.tenure?.privateRentPct;
  const rentDemandFromTenure = rentPct != null ? clamp(30 + rentPct * 2) : null;
  const rentalDemand = blend([
    { v: rentDemandFromTenure, w: 2.5, label: rentPct != null ? `${rentPct}% private rented locally` : null },
    { v: cens?.population?.under35Pct != null ? clamp(cens.population.under35Pct * 2) : null, w: 1.5, label: cens?.population?.under35Pct != null ? `${cens.population.under35Pct}% under 35` : null },
    { v: cens?.employment?.employedPct != null ? cens.employment.employedPct : null, w: 1.5, label: cens?.employment?.employedPct != null ? `${cens.employment.employedPct}% employed` : null },
    { v: transportQ, w: 2, label: transportQ != null ? 'Transport access' : null },
    { v: amenityQ,   w: 1.5, label: osm?.amenityLabel ? `${osm.amenityLabel} amenities` : null },
    { v: schoolsQ,   w: 1, label: schl?.bestRating ? `${schl.bestRating} school nearby` : null },
  ]);

  // ── 5. Flip Potential — growth momentum, low friction, redevelopment upside ──
  const flipPotential = blend([
    { v: growthQ, w: 3, label: (hpi?.growth1yr != null || hpi?.growth3yr != null) ? `${hpi.growth1yr != null ? hpi.growth1yr : hpi.growth3yr}% recent growth` : null },
    { v: lr?.priceGrowth != null ? clamp(50 + lr.priceGrowth * 1.4) : null, w: 1.5, label: lr?.priceGrowth != null ? `${lr.priceGrowth >= 0 ? '+' : ''}${lr.priceGrowth}% postcode price trend` : null },
    { v: (plan?.brownfield || plan?.opportunityArea || plan?.enterpriseZone) ? 90 : null, w: 1, label: plan?.brownfield ? 'Brownfield / regen upside' : (plan?.opportunityArea ? 'Opportunity area' : null) },
    { v: plan?.constraintCount != null ? clamp(100 - plan.constraintCount * 22) : null, w: 1.5, label: plan && plan.constraintCount === 0 ? 'Low planning friction' : null },
    { v: deprivQ != null ? clamp(deprivQ * 0.7 + 30) : null, w: 1, label: null },
    { v: amenityQ, w: 1, label: osm?.amenityLabel ? `${osm.amenityLabel} amenities` : null },
  ]);

  const pack = (key, label, r, invert = false) => ({
    key, label,
    score: r.score,
    band: invert ? riskBand(r.score) : band(r.score),
    invert,
    factors: r.factors,
    coverage: r.have,
  });

  return {
    generatedAt: new Date().toISOString(),
    investment:    pack('investment', 'Investment Score', investment),
    neighbourhood: pack('neighbourhood', 'Neighbourhood Score', neighbourhood),
    refurbRisk:    pack('refurbRisk', 'Refurb Risk Score', refurbRisk, true),
    rentalDemand:  pack('rentalDemand', 'Rental Demand Score', rentalDemand),
    flipPotential: pack('flipPotential', 'Flip Potential Score', flipPotential),
  };
}

// ============================================================
// SEMANTIC SEARCH — Workers AI (toMarkdown + bge embeddings) + Vectorize
// All inert unless env.AI and env.VECTORIZE bindings are present.
// ============================================================
const SEARCHABLE_DOC = /\.(pdf|docx?|txt|md|html?|csv|xlsx?|pptx?|png|jpe?g|webp)$/i;

// Stable, ASCII-safe short hash for building Vectorize vector ids from R2 keys.
function shortHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function chunkText(text, size = 900, overlap = 150) {
  const clean = String(text || '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const chunks = [];
  let i = 0;
  while (i < clean.length && chunks.length < 80) {
    chunks.push(clean.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}

// Convert a document to text, chunk, embed, and upsert into Vectorize.
async function indexDocumentForSearch(env, { key, name, propertyId, userId, blob }) {
  if (!env.AI || !env.VECTORIZE) return { indexed: 0, reason: 'not-configured' };
  if (!SEARCHABLE_DOC.test(name || key || '')) return { indexed: 0, reason: 'unsupported-type' };
  try {
    const md = await env.AI.toMarkdown([{ name: name || 'document', blob }]);
    const text = (Array.isArray(md) ? md[0]?.data : md?.data) || '';
    const chunks = chunkText(text);
    if (!chunks.length) return { indexed: 0, reason: 'no-text' };

    const vectors = [];
    const idBase = shortHash(key);
    for (let i = 0; i < chunks.length; i += 50) {
      const batch = chunks.slice(i, i + 50);
      const emb = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: batch });
      const data = emb?.data || [];
      data.forEach((values, j) => {
        vectors.push({
          id: `${idBase}-${i + j}`,
          values,
          metadata: {
            userId: String(userId), propertyId: String(propertyId || 'unknown'),
            key, name: name || key, chunk: batch[j].slice(0, 900),
          },
        });
      });
    }
    if (vectors.length) await env.VECTORIZE.upsert(vectors);
    return { indexed: vectors.length };
  } catch (e) {
    console.error('indexDocumentForSearch failed:', e);
    return { indexed: 0, reason: e.message };
  }
}

// ============================================================
// AI PROVIDER CHAIN — multi-provider LLM insight generation
// ============================================================
// Tries providers in priority order (best-quality/paid first, guaranteed-free
// fallback last) so every AI-insight route works with zero secrets set, and
// upgrades automatically the moment a provider's secret is added — no route
// code needs to change. Only Anthropic has native strict JSON-schema output;
// the rest are asked for JSON via prompt (+ native JSON-mode where available)
// and parsed with parseJsonLoose.

function anyAiProviderConfigured(env) {
  return !!(env.ANTHROPIC_API_KEY || env.GROQ_API_KEY || env.GOOGLE_AI_API_KEY || env.OPENROUTER_API_KEY || env.AI);
}

function parseJsonLoose(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) s = fenced[1].trim();
  try { return JSON.parse(s); } catch {}
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  return null;
}

function schemaAsPromptInstructions(schema) {
  return `Respond with ONLY a single valid JSON object (no markdown fences, no commentary) matching this schema:\n${JSON.stringify(schema, null, 2)}`;
}

async function callAnthropic({ system, prompt, schema, env }) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
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
      system,
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: { type: 'json_schema', schema } },
    }),
  });
  if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw new Error('Anthropic declined the request');
  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock) throw new Error('Anthropic returned no content');
  return { text: textBlock.text, provider: 'anthropic' };
}

async function callGroq({ system, prompt, schema, env }) {
  if (!env.GROQ_API_KEY) return null;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${prompt}\n\n${schemaAsPromptInstructions(schema)}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    }),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned no content');
  return { text, provider: 'groq' };
}

async function callGemini({ system, prompt, schema, env }) {
  if (!env.GOOGLE_AI_API_KEY) return null;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GOOGLE_AI_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text).join('');
  if (!text) throw new Error('Gemini returned no content');
  return { text, provider: 'gemini' };
}

async function callOpenRouter({ system, prompt, schema, env }) {
  if (!env.OPENROUTER_API_KEY) return null;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: `${prompt}\n\n${schemaAsPromptInstructions(schema)}` },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned no content');
  return { text, provider: 'openrouter' };
}

async function callWorkersAI({ system, prompt, schema, env }) {
  if (!env.AI) return null;
  const res = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `${prompt}\n\n${schemaAsPromptInstructions(schema)}` },
    ],
  });
  const text = res?.response;
  if (!text) throw new Error('Workers AI returned no content');
  return { text, provider: 'workers-ai' };
}

// Shared framing appended to every AI-insight system prompt so the model
// reasons like a UK auction buyer, not a naive reader of the guide price.
const AUCTION_ANALYST_FRAMING = 'Critical auction context: a UK auction GUIDE PRICE is a marketing minimum set deliberately below expected value — it is NOT the likely purchase price, and lots routinely sell WELL ABOVE guide. Never treat the guide as the buy price; reason instead about a realistic hammer price and a disciplined maximum bid, and judge margin/profit against THAT, not against the guide. Where area auction stats (a guide-to-sold ratio) are supplied, use them to estimate how far above guide this lot is likely to go; otherwise assume a meaningful premium over guide and lower your confidence. Reason beyond the deal sheet: use the public and area signals provided (Land Registry sold comps, EPC, planning, flood, crime, local price trends, area auction stats) to infer what the figures imply and to surface what is missing — explicitly flag the blind spots and unknowns the investor should verify before bidding.';

// Reads the user's own Market Intel aggregates for the property's outcode so
// the AI can ground "sells above guide" in scraped auction data, not just
// general knowledge. Returns null when the outcode has no data (common for
// pre-auction lots with locality-only addresses) so callers degrade gracefully.
async function getAreaMarketStats(env, postcodeOrAddress) {
  try {
    const { outcode } = extractPostcodeParts(postcodeOrAddress);
    if (!outcode || !env.CRM_DB) return null;
    const row = await env.CRM_DB.prepare(
      `SELECT m.guide_to_sold_ratio, m.sold_confirmed, m.sample_size, m.price_median,
              s.score, s.confidence
       FROM mi_area_metrics m
       LEFT JOIN mi_area_scores s ON s.area_type = m.area_type AND s.area_id = m.area_id
         AND s.model_id = (SELECT id FROM mi_scoring_models WHERE is_default = 1 LIMIT 1)
       WHERE m.area_type = 'outcode' AND m.area_id = ? AND m.window = '24m'
       LIMIT 1`
    ).bind(outcode).first();
    if (!row || row.guide_to_sold_ratio == null) return null;
    return {
      outcode,
      guideToSoldRatio: row.guide_to_sold_ratio,
      soldConfirmed: row.sold_confirmed,
      sampleSize: row.sample_size,
      priceMedian: row.price_median,
      areaScore: row.score,
      areaConfidence: row.confidence,
    };
  } catch (err) {
    console.error('getAreaMarketStats failed:', err.message);
    return null;
  }
}

// One-line context string from getAreaMarketStats output (or a graceful
// fallback line when no stats exist) for injecting into AI prompt context.
function areaMarketStatsLine(stats) {
  if (!stats) {
    return 'Area auction stats (your Market Intel): none available for this outcode — rely on the general rule that lots sell above guide, and lower your confidence accordingly.';
  }
  const pctAbove = Math.round((stats.guideToSoldRatio - 1) * 100);
  const dir = pctAbove >= 0 ? `~${pctAbove}% above guide` : `~${Math.abs(pctAbove)}% below guide`;
  const score = stats.areaScore != null ? ` Area flip score ${Math.round(stats.areaScore)}/100 (confidence ${stats.areaConfidence ?? 'n/a'}).` : '';
  return `Area auction stats (your Market Intel, outcode ${stats.outcode}): guide-to-sold ratio ${stats.guideToSoldRatio.toFixed(2)} — the average lot sells ${dir} across ${stats.soldConfirmed ?? stats.sampleSize ?? 0} confirmed sales.${score} Use this as the local signal for how far above guide to expect.`;
}

const AI_PROVIDER_CHAIN = [callAnthropic, callGroq, callGemini, callOpenRouter, callWorkersAI];

// Tries each configured provider in priority order; validates the parsed JSON
// has every field in requiredFields before accepting it, so a provider that
// silently drops a field falls through to the next one instead of shipping
// incomplete data to the client.
async function generateInsight({ system, prompt, schema, requiredFields = [], env }) {
  let lastError = null;
  for (const call of AI_PROVIDER_CHAIN) {
    let outcome;
    try {
      outcome = await call({ system, prompt, schema, env });
    } catch (err) {
      lastError = err;
      console.error(`AI provider ${call.name} failed:`, err.message);
      continue;
    }
    if (!outcome) continue; // provider not configured
    const parsed = parseJsonLoose(outcome.text);
    if (!parsed || typeof parsed !== 'object') { lastError = new Error(`${outcome.provider} returned unparseable JSON`); continue; }
    const missing = requiredFields.filter(f => !(f in parsed));
    if (missing.length) { lastError = new Error(`${outcome.provider} response missing fields: ${missing.join(', ')}`); continue; }
    return { result: parsed, provider: outcome.provider };
  }
  throw lastError || new Error('No AI provider is configured — set at least one of ANTHROPIC_API_KEY, GROQ_API_KEY, GOOGLE_AI_API_KEY, OPENROUTER_API_KEY, or bind Workers AI');
}

// ============================================================
// WEB SEARCH — Tavily (LLM-oriented search, free tier)
// ============================================================
// Returns [] (not a throw) when TAVILY_API_KEY isn't set, so callers can
// degrade gracefully rather than fail the whole AI request over a missing
// optional secret.
async function webSearch(query, env, maxResults = 5) {
  if (!env.TAVILY_API_KEY || !query) return [];
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: env.TAVILY_API_KEY,
        query,
        search_depth: 'basic',
        max_results: maxResults,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) { console.error('Tavily search failed:', res.status, await res.text()); return []; }
    const data = await res.json();
    return (data.results || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || '',
      publishedDate: r.published_date || null,
    }));
  } catch (err) {
    console.error('Web search failed:', err.message);
    return [];
  }
}

// ============================================================
// MAIN WORKER EXPORT
// ============================================================

export default {
  // Cron handler — runs Wednesday 22:00 and Saturday 22:00 UTC
  async scheduled(event, env, ctx) {
    // Hourly cron only fires task reminders — the heavy scraping/alert jobs stay
    // on their twice-weekly schedule to avoid running them every hour.
    if (event.cron === '0 * * * *') {
      ctx.waitUntil(dispatchTaskReminders(env).catch(err => console.error('Task reminders failed:', err)));
      return;
    }
    if (event.cron === '7-57/10 * * * *') {
      // Market Intel scrape tick. Courtesy skip around the Wed/Sat 22:00
      // heavy scrape slot so the two never compete for account quotas.
      const d = new Date(event.scheduledTime);
      const nearHeavySlot = (d.getUTCDay() === 3 || d.getUTCDay() === 6)
        && ((d.getUTCHours() === 21 && d.getUTCMinutes() >= 55) || (d.getUTCHours() === 22 && d.getUTCMinutes() <= 30));
      if (!nearHeavySlot) {
        // Seed the weekly refresh if due (idle-only), then drain one job.
        ctx.waitUntil(
          maybeSeedWeeklyRefresh(env)
            .catch(err => console.error('Market weekly refresh seed failed:', err))
            .then(() => runMarketIntelTick(env))
            .catch(err => console.error('Market intel tick failed:', err))
        );
      }
      return;
    }
    ctx.waitUntil(Promise.all([
      runScrape(env),
      sendCountdownAlerts(env),
      generateAutoChaseAlerts(env).catch(err => console.error('Auto-chase alerts failed:', err)),
      runScheduledLotScan(env).catch(err => console.error('Lot scan failed:', err)),
      dispatchTaskReminders(env).catch(err => console.error('Task reminders failed:', err)),
    ]));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Routes are handled in handleApiRoutes(); wrapping the call here means a
    // malformed request.json() or any other unexpected throw anywhere below
    // returns a clean JSON error instead of a bare unhandled Worker exception.
    try {
      return await handleApiRoutes(request, env, url, ctx);
    } catch (err) {
      console.error('Unhandled worker error:', err);
      if (url.pathname.startsWith('/api/')) {
        return corsResponse({ success: false, message: 'Invalid request' }, 400);
      }
      throw err;
    }
  },
};

async function handleApiRoutes(request, env, url, ctx) {
    // --------------------------------------------------------
    // MARKET INTELLIGENCE — all /api/market/* routes live in
    // worker/marketIntel.js behind a single session check.
    // --------------------------------------------------------

    if (url.pathname.startsWith('/api/market/')) {
      return handleMarketIntelRoutes(request, env, url);
    }

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
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
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

    // POST /api/auth/extension-token — mint a long-lived token for the Chrome
    // extension. Requires an existing valid session (call this once from
    // Settings while logged into the CRM itself, then paste the returned
    // token into the extension). Uses the same session:{token} KV mechanism
    // as login, just with a much longer TTL and a source flag for auditing.
    if (url.pathname === '/api/auth/extension-token' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const token = generateToken();
      const sessionData = { userId: session.userId, email: session.email, role: session.role, allowedTabs: session.allowedTabs, source: 'extension' };
      await env.SCRAPER_KV.put(`session:${token}`, JSON.stringify(sessionData), { expirationTtl: 7776000 }); // 90 days
      return corsResponse({ success: true, token });
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
    // BANK HOLIDAYS — gov.uk (free, cached 24h). Optional ?date=YYYY-MM-DD
    // returns working-day info so the UI can warn on non-working due dates.
    // --------------------------------------------------------
    if (url.pathname === '/api/bank-holidays' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const division = url.searchParams.get('division') || 'england-and-wales';
      const bankHols = await getBankHolidays(env, division);
      const holidaySet = new Set(bankHols.dates || []);
      const titleByDate = {};
      for (const e of (bankHols.events || [])) titleByDate[e.date] = e.title;
      const date = url.searchParams.get('date');
      let dateInfo = null;
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const working = isWorkingDay(date, holidaySet);
        dateInfo = {
          date, isWorkingDay: working,
          reason: working ? null : (titleByDate[date] || 'weekend'),
          nextWorkingDay: working ? date : nextWorkingDay(date, holidaySet),
        };
      }
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = (bankHols.events || []).filter(e => e.date >= today).slice(0, 8);
      return corsResponse({ success: true, division, upcoming, dates: bankHols.dates || [], dateInfo });
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

    // GET /api/companies-house/detail?number= — profile + officers + charges + insolvency
    if (url.pathname === '/api/companies-house/detail' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const num = (url.searchParams.get('number') || '').trim();
      if (!num) return corsResponse({ success: false, message: 'Missing company number' }, 400);

      const apiKey = request.headers.get('X-CH-Key') || env.CH_API_KEY;
      if (!apiKey) return corsResponse({ success: false, message: 'No Companies House API key configured' }, 400);

      const chGet = async path => {
        const r = await fetch(`https://api.company-information.service.gov.uk${path}`, {
          headers: { 'Authorization': 'Basic ' + btoa(apiKey + ':') }, signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      };
      try {
        const enc = encodeURIComponent(num);
        const [profileR, officersR, chargesR, insolvencyR] = await Promise.allSettled([
          chGet(`/company/${enc}`),
          chGet(`/company/${enc}/officers?items_per_page=10`),
          chGet(`/company/${enc}/charges`),
          chGet(`/company/${enc}/insolvency`),
        ]);
        if (profileR.status !== 'fulfilled') {
          return corsResponse({ success: false, message: `Companies House profile error (${profileR.reason?.message || 'unreachable'})` }, 502);
        }
        const p = profileR.value;
        const officers = officersR.status === 'fulfilled' ? (officersR.value.items || []).map(o => ({
          name: o.name || '', role: o.officer_role || '', appointedOn: o.appointed_on || null, resignedOn: o.resigned_on || null,
        })) : [];
        const charges = chargesR.status === 'fulfilled' ? (chargesR.value.items || []).map(c => ({
          description: c.classification?.description || c.charge_code || '', status: c.status || '',
          createdOn: c.created_on || null, personsEntitled: (c.persons_entitled || []).map(pe => pe.name).slice(0, 3),
        })) : [];
        const insolvency = insolvencyR.status === 'fulfilled' ? (insolvencyR.value.cases || []).map(c => ({
          type: c.type || '', dates: (c.dates || []).map(d => `${d.type}: ${d.date}`).slice(0, 3),
        })) : [];
        return corsResponse({
          success: true,
          profile: {
            companyName: p.company_name || '', companyNumber: p.company_number || num,
            status: p.company_status || '', type: p.type || '', incorporatedOn: p.date_of_creation || null,
            registeredOffice: [p.registered_office_address?.address_line_1, p.registered_office_address?.locality, p.registered_office_address?.postal_code].filter(Boolean).join(', '),
            sicCodes: p.sic_codes || [],
            accountsOverdue: !!p.accounts?.overdue, confirmationOverdue: !!p.confirmation_statement?.overdue,
            hasInsolvencyHistory: !!p.has_insolvency_history, hasCharges: !!p.has_charges,
          },
          officers, charges, insolvency,
        });
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
          lmkKey: r['lmk-key'] || '',
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

    // POST /api/scrape-lot-result — best-effort parse of an auction lot's result
    // page (sold/unsold + price + bid count). Server-rendered pages only; JS-gated
    // or login-walled results return nulls and the caller falls back to manual entry.
    if (url.pathname === '/api/scrape-lot-result' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const { url: lotUrl } = await request.json();
      if (!lotUrl || !/^https?:\/\//i.test(lotUrl)) return corsResponse({ success: false, error: 'Invalid URL' }, 400);
      try {
        const res = await fetch(lotUrl, { headers: { 'User-Agent': SCRAPER_UA } });
        const html = await res.text();
        const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&pound;/gi, '£').replace(/\s+/g, ' ');
        let outcome = null;
        if (/withdrawn/i.test(text)) outcome = 'Withdrawn';
        else if (/\bunsold\b|not sold|did not sell|no sale|lot unsold/i.test(text)) outcome = 'Unsold';
        else if (/\bsold\b/i.test(text)) outcome = 'Sold';
        let salePrice = null;
        const priceMatch = text.match(/sold[^£]{0,40}£\s?([\d][\d,]{2,})/i)
          || text.match(/(?:sale price|result|hammer price|sold for|final bid)[^£]{0,20}£\s?([\d][\d,]{2,})/i);
        if (priceMatch) salePrice = parseInt(priceMatch[1].replace(/,/g, '')) || null;
        let bidCount = null;
        const bidMatch = text.match(/(\d+)\s*bids?\b/i);
        if (bidMatch) bidCount = parseInt(bidMatch[1]) || null;
        return corsResponse({ success: true, outcome, salePrice, bidCount, source: 'page' });
      } catch (err) {
        return corsResponse({ success: false, error: 'Could not fetch that URL. It may require login or block automated access.' }, 400);
      }
    }

    // --------------------------------------------------------
    // TELEGRAM LINKING (task reminders)
    // --------------------------------------------------------

    // POST /api/telegram/link — issue a one-time code the user sends to the bot
    if (url.pathname === '/api/telegram/link' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const code = bytesToHex(crypto.getRandomValues(new Uint8Array(4)));
      await env.SCRAPER_KV.put(`tg:link:${code}`, String(session.userId), { expirationTtl: 900 });
      return corsResponse({ success: true, code, botUsername: env.TELEGRAM_BOT_USERNAME || null });
    }

    // GET /api/telegram/status — is this user's Telegram connected?
    if (url.pathname === '/api/telegram/status' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const chatId = await env.SCRAPER_KV.get(`tg:chat:${session.userId}`);
      return corsResponse({ success: true, linked: !!chatId, botUsername: env.TELEGRAM_BOT_USERNAME || null });
    }

    // POST /api/telegram/unlink — disconnect
    if (url.pathname === '/api/telegram/unlink' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      await env.SCRAPER_KV.delete(`tg:chat:${session.userId}`);
      return corsResponse({ success: true });
    }

    // POST /api/telegram/webhook — called by Telegram; resolves the code → chat id
    if (url.pathname === '/api/telegram/webhook' && request.method === 'POST') {
      if (env.TELEGRAM_WEBHOOK_SECRET) {
        const sig = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (sig !== env.TELEGRAM_WEBHOOK_SECRET) return new Response('Forbidden', { status: 403 });
      }
      let update;
      try { update = await request.json(); } catch { return corsResponse({ ok: true }); }
      const msg = update && (update.message || update.edited_message);
      const chatId = msg && msg.chat && msg.chat.id;
      const text = ((msg && msg.text) || '').trim();
      if (chatId && text) {
        const m = /(?:\/start\s+)?([A-Za-z0-9]{4,16})/.exec(text);
        const code = m ? m[1] : null;
        const uid = code ? await env.SCRAPER_KV.get(`tg:link:${code}`) : null;
        if (uid) {
          await env.SCRAPER_KV.put(`tg:chat:${uid}`, String(chatId));
          await env.SCRAPER_KV.delete(`tg:link:${code}`);
          await sendTelegram(env, chatId, '✅ Connected to A&A Partners CRM. Task reminders will arrive here.');
        } else {
          // Only warn chats that are already linked (expired re-link attempts).
          // Unknown chats get silence so the bot looks dormant to strangers.
          let isLinked = false;
          try {
            const linked = await env.SCRAPER_KV.list({ prefix: 'tg:chat:' });
            for (const k of linked.keys) {
              if ((await env.SCRAPER_KV.get(k.name)) === String(chatId)) { isLinked = true; break; }
            }
          } catch (e) {}
          if (isLinked) {
            await sendTelegram(env, chatId, '⚠️ That code is invalid or has expired. Generate a fresh one in the CRM under Settings → Integrations → Telegram.');
          }
        }
      }
      return corsResponse({ ok: true });
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

      // When semantic search is configured, buffer the file once so it can be both
      // stored in R2 and passed to the indexer. Cap the in-memory buffer to keep the
      // Worker within its memory budget; larger files fall back to streaming (no index).
      const searchable = env.AI && env.VECTORIZE && SEARCHABLE_DOC.test(file.name) && file.size <= 20 * 1024 * 1024;
      if (searchable) {
        const buf = await file.arrayBuffer();
        await env.CRM_DOCS.put(key, buf, { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
        const blob = new Blob([buf], { type: file.type || 'application/octet-stream' });
        ctx.waitUntil(indexDocumentForSearch(env, { key, name: file.name, propertyId, userId: session.userId, blob }));
      } else {
        await env.CRM_DOCS.put(key, file.stream(), {
          httpMetadata: { contentType: file.type || 'application/octet-stream' },
        });
      }
      return corsResponse({ success: true, key, name: file.name });
    }

    // GET /api/documents/* — serve a file from R2 (auth required)
    if (url.pathname.startsWith('/api/documents/') && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return new Response('Unauthorized', { status: 401 });
      const docRateOk = await checkRateLimit(env, `docs:${session.userId}`, 120);
      if (!docRateOk) return new Response('Too many requests', { status: 429 });
      // R2 keys are stored with the literal filename (spaces, punctuation and
      // all), but url.pathname arrives percent-encoded (space -> %20), so a raw
      // slice would look up a key that doesn't exist and 404. Decode back to the
      // literal key; fall back to the raw slice if the sequence is malformed.
      const rawKey = url.pathname.slice('/api/documents/'.length);
      let key = rawKey;
      try { key = decodeURIComponent(rawKey); } catch {}
      const object = await env.CRM_DOCS.get(key);
      if (!object) return new Response('Not found', { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('Cache-Control', 'private, max-age=3600');
      headers.set('Content-Disposition', 'inline');
      return new Response(object.body, { headers });
    }

    // --------------------------------------------------------
    // SEMANTIC DOCUMENT SEARCH (Workers AI + Vectorize)
    // --------------------------------------------------------

    // POST /api/search/semantic — natural-language search over indexed documents
    if (url.pathname === '/api/search/semantic' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (!env.AI || !env.VECTORIZE) return corsResponse({ success: false, message: 'Semantic search not configured — add the AI and VECTORIZE bindings (see setup notes).' }, 400);
      const { query, propertyId, topK } = await request.json();
      if (!query || !query.trim()) return corsResponse({ success: false, message: 'Missing query' }, 400);
      try {
        const emb = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: [query.trim()] });
        const vector = emb?.data?.[0];
        if (!vector) return corsResponse({ success: false, message: 'Could not embed query' }, 502);
        const filter = { userId: String(session.userId) };
        if (propertyId) filter.propertyId = String(propertyId);
        const res = await env.VECTORIZE.query(vector, { topK: Math.min(topK || 10, 20), returnMetadata: 'all', filter });
        const seen = new Set();
        const matches = (res.matches || []).map(m => ({
          score: Math.round((m.score || 0) * 100) / 100,
          key: m.metadata?.key, name: m.metadata?.name,
          propertyId: m.metadata?.propertyId, snippet: m.metadata?.chunk,
        })).filter(m => {
          const dedup = `${m.key}::${m.snippet?.slice(0, 40)}`;
          if (seen.has(dedup)) return false; seen.add(dedup); return true;
        });
        return corsResponse({ success: true, matches });
      } catch (err) {
        return corsResponse({ success: false, message: `Search failed: ${err.message}` }, 502);
      }
    }

    // POST /api/search/reindex — backfill the search index for a property's documents
    if (url.pathname === '/api/search/reindex' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (!env.AI || !env.VECTORIZE) return corsResponse({ success: false, message: 'Semantic search not configured.' }, 400);
      const { propertyId } = await request.json();
      const prefix = propertyId ? `${session.userId}/${propertyId}/` : `${session.userId}/`;
      const listed = await env.CRM_DOCS.list({ prefix, limit: 200 });
      let indexed = 0, files = 0;
      for (const obj of (listed.objects || [])) {
        if (!SEARCHABLE_DOC.test(obj.key) || obj.size > 20 * 1024 * 1024) continue;
        const r2 = await env.CRM_DOCS.get(obj.key);
        if (!r2) continue;
        const blob = await r2.blob();
        const parts = obj.key.split('/');
        const name = parts[parts.length - 1];
        const pid = parts[1] || 'unknown';
        const r = await indexDocumentForSearch(env, { key: obj.key, name, propertyId: pid, userId: session.userId, blob });
        files++; indexed += r.indexed || 0;
      }
      return corsResponse({ success: true, files, chunks: indexed });
    }

    // --------------------------------------------------------
    // SOUTH YORKSHIRE AUCTION SCRAPER
    // --------------------------------------------------------
    if (url.pathname === '/api/scrape-auctions' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const MONTH_KEYWORDS = ['july', 'jul 2', 'jul 3'];
      const UA = SCRAPER_UA;

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
    // LOT-LEVEL AUCTION SCAN + SCAN SETTINGS
    // --------------------------------------------------------

    if (url.pathname === '/api/scan-settings' && request.method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const settings = await getScanSettings(env);
      return corsResponse({ success: true, settings });
    }

    if (url.pathname === '/api/scan-settings' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      const body = await request.json();
      const settings = {
        keywords: Array.isArray(body.keywords) && body.keywords.length ? body.keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean) : DEFAULT_SCAN_SETTINGS.keywords,
        postcodeAreas: Array.isArray(body.postcodeAreas) ? body.postcodeAreas.map(a => String(a).trim().toUpperCase()).filter(Boolean) : DEFAULT_SCAN_SETTINGS.postcodeAreas,
        maxGuidePrice: Number(body.maxGuidePrice) > 0 ? Number(body.maxGuidePrice) : DEFAULT_SCAN_SETTINGS.maxGuidePrice,
        propertyTypes: body.propertyTypes === 'houses' ? 'houses' : 'all',
      };
      await env.SCRAPER_KV.put('auction:scan-settings', JSON.stringify(settings));
      return corsResponse({ success: true, settings });
    }

    if (url.pathname === '/api/scrape-lots' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (!(await checkRateLimit(env, 'scrape-lots', 20))) return corsResponse({ success: false, message: 'Rate limit exceeded — try again in a minute' }, 429);
      const body = await request.json().catch(() => ({}));
      const base = await getScanSettings(env);
      const settings = {
        keywords: Array.isArray(body.keywords) && body.keywords.length ? body.keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean) : base.keywords,
        postcodeAreas: Array.isArray(body.postcodeAreas) ? body.postcodeAreas.map(a => String(a).trim().toUpperCase()).filter(Boolean) : base.postcodeAreas,
        maxGuidePrice: Number(body.maxGuidePrice) > 0 ? Number(body.maxGuidePrice) : base.maxGuidePrice,
        propertyTypes: body.propertyTypes != null ? (body.propertyTypes === 'houses' ? 'houses' : 'all') : base.propertyTypes,
      };

      // Debug escape hatch: run one house's scraper with no writes and return
      // parse diagnostics — the tuning loop for markup the dev box can't reach.
      if (body.debug) {
        const cfg = lotScraperConfigs().find(c => c.houseId === body.debug);
        if (!cfg) return corsResponse({ success: false, message: `Unknown house: ${body.debug}` }, 400);
        let debugBrowser;
        try {
          debugBrowser = await puppeteer.launch(env.BROWSER);
        } catch (launchErr) {
          return corsResponse({ success: false, message: `Browser launch failed: ${launchErr.message}` });
        }
        try {
          const res = await scrapeHouseLots(debugBrowser, cfg, { debug: true });
          return corsResponse({ success: true, house: cfg.houseId, lotsFound: res.lots.length, pagesFetched: res.pagesFetched, error: res.error, debug: res.debug, parsedLots: res.lots.slice(0, 20) });
        } finally {
          await debugBrowser.close();
        }
      }

      await ensureAuctionMigratedToD1(env);
      try {
        const result = body.house === 'eig'
          ? await runEigScan(env, settings, { dryRun: !!body.dryRun })
          : body.house === 'otm'
          ? await runOtmScan(env, settings, { dryRun: !!body.dryRun })
          : await runLotScan(env, settings, { dryRun: !!body.dryRun, houseId: body.house || null });
        return corsResponse(result);
      } catch (err) {
        return corsResponse({ success: false, message: `Lot scan failed: ${err.message}` });
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
      const laName   = addrData?.localAuthority || null;

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
            ).then(r => r.json()).then(async data => {
              const items=(data.rows||[]).map(r=>({
                address1: r.address1||'', address2: r.address2||'', address3: r.address3||'',
                address:[r.address1,r.address2,r.address3].filter(Boolean).join(', '),
                currentRating:r['current-energy-rating']||'', potentialRating:r['potential-energy-rating']||'',
                propertyType:r['property-type']||'', floorArea:r['total-floor-area']||'',
                habitableRooms: r['number-habitable-rooms'] ? Number(r['number-habitable-rooms']) : null,
                inspectionDate:r['inspection-date']||r['lodgement-date']||'',
                heatingType:r['main-fuel']||'', walls:r['walls-description']||'', windows:r['windows-description']||'',
                lmkKey:r['lmk-key']||'',
              }));
              const best=items[0];
              const flags=[
                best?.currentRating&&['E','F','G'].includes(best.currentRating)?`Low EPC rating (${best.currentRating})`:null,
                best?.heatingType?.toLowerCase().includes('electric')?'Electric heating':null,
                best?.windows?.toLowerCase().includes('single')?'Single glazing':null,
                best?.walls?.toLowerCase().includes('no insulation')?'Uninsulated walls':null,
              ].filter(Boolean);
              let recommendations = [];
              if (best?.lmkKey) {
                try {
                  const recRes = await fetch(
                    `https://epc.opendatacommunities.org/api/v1/domestic/recommendations/${encodeURIComponent(best.lmkKey)}`,
                    { headers: { 'Authorization':'Basic '+btoa(`${env.EPC_EMAIL}:${env.EPC_API_KEY}`), 'Accept':'application/json' }, signal: AbortSignal.timeout(8000) },
                  );
                  if (recRes.ok) {
                    const recData = await recRes.json();
                    recommendations = (recData.rows||[]).map(r=>({
                      code: r['improvement-item']||'', text: r['improvement-id-text']||r['improvement-summary-text']||'',
                      indicativeCost: r['indicative-cost']||'',
                    })).filter(r=>r.text).slice(0,10);
                  }
                } catch (e) {}
              }
              return { key:'epc', status:'success', data:{ items:items.slice(0,5), allItems:items, best, epcRating:best?.currentRating, potentialRating:best?.potentialRating, floorArea:best?.floorArea, heatingType:best?.heatingType, energyFlags:flags, recommendations }, source:'EPC Open Data' };
            }).catch(err => ({ key:'epc', status:'error', error:err.message, source:'EPC' }))
          );
        }

        // UK HPI — official area-level price growth (local authority)
        if (laCode) {
          tasks.push(
            connectorHPI(laCode, laName)
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
          connectorWeather(resolvedLat, resolvedLng).then(data=>({ key:'weather', status:'success', data, source:'Open-Meteo' })).catch(err=>({ key:'weather', status:'error', error:err.message, source:'Open-Meteo' })),
          connectorAirQuality(resolvedLat, resolvedLng).then(data=>({ key:'airQuality', status:'success', data, source:'Open-Meteo Air Quality' })).catch(err=>({ key:'airQuality', status:'error', error:err.message, source:'Open-Meteo Air Quality' })),
          connectorCoal(resolvedLat, resolvedLng).then(data=>({ key:'coal', status:'success', data, source:'Mining Remediation Authority' })).catch(err=>({ key:'coal', status:'error', error:err.message, source:'Mining Remediation Authority' })),
          connectorRadon(resolvedLat, resolvedLng).then(data=>({ key:'radon', status:'success', data, source:'UKHSA/BGS Radon Atlas' })).catch(err=>({ key:'radon', status:'error', error:err.message, source:'UKHSA/BGS Radon Atlas' })),
          connectorLandfill(resolvedLat, resolvedLng).then(data=>({ key:'landfill', status:'success', data, source:'EA Historic Landfill' })).catch(err=>({ key:'landfill', status:'error', error:err.message, source:'EA Historic Landfill' })),
          connectorNoise(resolvedLat, resolvedLng).then(data=>({ key:'noise', status:'success', data, source:'Defra Strategic Noise Mapping' })).catch(err=>({ key:'noise', status:'error', error:err.message, source:'Defra Strategic Noise Mapping' })),
          connectorPlanIt(resolvedLat, resolvedLng).then(data=>({ key:'planApps', status:'success', data, source:'PlanIt Planning Applications' })).catch(err=>({ key:'planApps', status:'error', error:err.message, source:'PlanIt' })),
        );
      }

      tasks.push(
        connectorRates(env).then(data=>({ key:'rates', status:'success', data, source:'Bank of England' })).catch(err=>({ key:'rates', status:'error', error:err.message, source:'Bank of England' })),
      );
      if (postcode && env.OFCOM_API_KEY) {
        tasks.push(
          connectorBroadband(postcode, env).then(data=>({ key:'broadband', status:'success', data, source:'Ofcom Connected Nations' })).catch(err=>({ key:'broadband', status:'error', error:err.message, source:'Ofcom Connected Nations' })),
        );
      }
      if (postcode && env.TAVILY_API_KEY) {
        tasks.push(
          connectorNews(postcode, laName, env).then(data=>({ key:'news', status:'success', data, source:'Web search (Tavily)' })).catch(err=>({ key:'news', status:'error', error:err.message, source:'Web search (Tavily)' })),
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

      // Composite scores derived from whatever connectors succeeded
      result.scores = computeScores(result.connectors);

      return corsResponse({ success: true, intelligence: result });
    }

    // POST /api/intelligence/duplicate-check
    if (url.pathname === '/api/intelligence/duplicate-check' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const body = await request.json();
      const { postcode, address, listingUrl } = body;
      let properties = body.properties;
      // The SPA sends its in-memory property list; external callers (the Chrome
      // extension) don't hold one, so load it server-side the same way
      // GET /api/crm-data does — D1 primary, KV merge fallback.
      if (!Array.isArray(properties)) {
        try {
          await ensureCrmMigratedToD1(env);
          properties = (await readCrmFromD1(env)).properties || [];
        } catch (err) {
          const userIds = (await env.SCRAPER_KV.get('crm:user-ids', 'json')) || [];
          const datasets = await Promise.all(userIds.map(id => env.SCRAPER_KV.get(`crm:user:${id}`, 'json')));
          properties = mergeUserData(datasets.filter(Boolean)).properties || [];
        }
      }
      if (!properties.length) return corsResponse({ success: true, matches: [] });

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
    // --------------------------------------------------------
    // AI — RightMove Plus report parse + comparable enrichment
    // Stateless by design: reads the stored doc from R2, extracts listings
    // via the LLM chain, matches them against the comps/LR items the client
    // sent, and returns the merged result. The SPA stays the single writer
    // of property state (avoids the /api/crm-data lost-update race).
    // --------------------------------------------------------
    if (url.pathname === '/api/ai/parse-rightmove' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (!env.AI) return corsResponse({ success: false, message: 'Document parsing unavailable — AI binding not configured' }, 400);
      if (!anyAiProviderConfigured(env)) {
        return corsResponse({ success: false, message: 'AI not configured — set at least one of: ANTHROPIC_API_KEY, GROQ_API_KEY, GOOGLE_AI_API_KEY, OPENROUTER_API_KEY' }, 400);
      }
      const aiRateOk = await checkRateLimit(env, `ai:${session.userId}`, 10);
      if (!aiRateOk) return corsResponse({ success: false, message: 'Too many AI requests — please wait a minute' }, 429);

      const { key, comps, lrItems } = await request.json();
      if (!key || typeof key !== 'string') return corsResponse({ success: false, message: 'Missing document key' }, 400);
      if (!key.startsWith(`${session.userId}/`)) return corsResponse({ success: false, message: 'Forbidden' }, 403);

      const obj = await env.CRM_DOCS.get(key);
      if (!obj) return corsResponse({ success: false, message: 'Document not found' }, 404);
      const blob = await obj.blob();
      const name = key.split('/').pop() || 'rightmove-plus.pdf';
      const md = await env.AI.toMarkdown([{ name, blob }]);
      const text = ((Array.isArray(md) ? md[0]?.data : md?.data) || '').slice(0, 40000);
      if (!text.trim()) return corsResponse({ success: false, message: 'Could not extract any text from the document' }, 422);

      const schema = {
        type: 'object',
        additionalProperties: false,
        required: ['listings'],
        properties: {
          listings: {
            type: 'array',
            description: 'Every distinct property listing found in the report',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['address'],
              properties: {
                address: { type: 'string', description: 'Full street address as printed, including house number/name and street' },
                bedrooms: { type: 'integer', description: 'Bedroom count if stated' },
                propertyType: { type: 'string', description: 'e.g. Detached, Semi-detached, Terraced, Flat' },
                tenure: { type: 'string', description: 'Freehold or Leasehold, only if stated' },
                floorArea: { type: 'number', description: 'Floor area in square metres, only if stated' },
                askingPrice: { type: 'number', description: 'Asking/listed/guide price in GBP as a plain number' },
                soldPrice: { type: 'number', description: 'Sold price in GBP, only if the report shows an actual sale record for this property' },
                soldDate: { type: 'string', description: 'Sale date as YYYY-MM-DD, only if a sale record is shown' },
              },
            },
          },
        },
      };

      try {
        const { result, provider } = await generateInsight({
          system: 'You extract structured comparable-property data from RightMove Plus reports for a UK auction investor. Extract every distinct property listing in the document. Use only values printed in the report — never guess, estimate, or invent; omit any field that is not stated. Prices are GBP plain numbers with no separators. Dates are YYYY-MM-DD. An asking/listed price is NOT a sold price — only report soldPrice when the document shows an actual sale.',
          prompt: `Extract every property listing from this RightMove Plus report:\n\n${text}`,
          schema,
          requiredFields: ['listings'],
          env,
        });
        const listings = Array.isArray(result.listings) ? result.listings : [];
        const { enrichedComps, newComps, enrichedCount } = mergeRightmoveListings(
          listings,
          Array.isArray(comps) ? comps : [],
          Array.isArray(lrItems) ? lrItems : []
        );
        return corsResponse({ success: true, listings, enrichedComps, newComps, enrichedCount, provider, parsedAt: new Date().toISOString() });
      } catch (err) {
        console.error('RightMove Plus parse failed:', err);
        return corsResponse({ success: false, message: 'Could not parse the RightMove Plus report' }, 502);
      }
    }

    if (url.pathname === '/api/ai/deal-review' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (!anyAiProviderConfigured(env)) {
        return corsResponse({ success: false, message: 'AI not configured — set at least one of: ANTHROPIC_API_KEY, GROQ_API_KEY, GOOGLE_AI_API_KEY, OPENROUTER_API_KEY' }, 400);
      }
      const aiRateOk = await checkRateLimit(env, `ai:${session.userId}`, 10);
      if (!aiRateOk) return corsResponse({ success: false, message: 'Too many AI requests — please wait a minute' }, 429);

      const { property } = await request.json();
      if (!property || !property.address) return corsResponse({ success: false, message: 'Missing property' }, 400);

      // Compact, bounded context — never ship whole blobs to the model
      const areaStats = await getAreaMarketStats(env, property.postcode || property.address);
      const clip = (obj) => JSON.stringify(obj ?? null).slice(0, 6000);
      const context = [
        `Address: ${property.address}${property.dealName ? ` (${property.dealName})` : ''}`,
        `Status: ${property.status || 'Sourced'} · Guide price: £${Number(property.guidePrice || 0).toLocaleString()} · Auction: ${property.auctionDate || 'unknown'}`,
        `Type: ${property.propertyType || 'unknown'} · Beds: ${property.bedrooms || 'unknown'}`,
        areaMarketStatsLine(areaStats),
        `Report analytics: ${clip(property.analytics)}`,
        `Area intelligence highlights: ${clip(property.intelligenceSummary)}`,
        `Refurb position: ${clip(property.refurbSummary)}`,
        `Comparables: ${clip(property.comparables)}`,
      ].join('\n');

      const schema = {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'riskFlags', 'strengths', 'dealScore', 'verdict', 'reportComparison'],
        properties: {
          summary: { type: 'string', description: '3-5 sentence plain-English assessment of this deal for a UK property flip investor' },
          riskFlags: { type: 'array', items: { type: 'string' }, description: 'Specific risks found in the data — thin margin, low comps, flood/planning/crime issues, missing information, over-guide pressure. Empty if genuinely none.' },
          strengths: { type: 'array', items: { type: 'string' }, description: 'Specific strengths of the deal grounded in the data.' },
          dealScore: { type: 'integer', description: 'Deal quality score from 0 (avoid at any price) to 100 (exceptional opportunity)' },
          verdict: { type: 'string', enum: ['strong_buy', 'buy', 'conditional', 'avoid'] },
          bidGuidance: { type: 'string', description: "One or two sentences on the realistic hammer price and a disciplined maximum bid for this lot, given the guide is a floor and lots sell above it. Reference the area guide-to-sold ratio when supplied." },
          blindSpots: { type: 'array', items: { type: 'string' }, description: 'Things NOT in the deal sheet that the investor should independently verify before bidding — e.g. tenure/lease, condition/structural, planning constraints, true local sold comps, service charges, vacant possession. Empty only if genuinely nothing is missing.' },
          reportComparison: {
            type: 'object',
            additionalProperties: false,
            required: ['agreement', 'note'],
            description: 'Your cross-check against the prior assessment report already in the analytics (its verdict, maxBid, netProfit, margin and GDV).',
            properties: {
              agreement: { type: 'string', enum: ['agree', 'partial', 'disagree'], description: "How well your view matches the report's conclusion. Use 'agree' if none was supplied." },
              note: { type: 'string', description: "1-2 sentences: where you agree or diverge from the report's figures/verdict and why. Empty string if no report figures were supplied to compare against." },
            },
          },
        },
      };

      try {
        const { result: review, provider } = await generateInsight({
          system: 'You are a UK property investment analyst reviewing auction flip deals for a small investment partnership in South Yorkshire. Be direct and specific: ground every claim in the numbers provided, flag what is missing, and never invent figures. Margins under 15% are tight for a flip; under 5% are usually not worth the risk. A prior assessment report may already have scored this deal — its verdict, maxBid, netProfit, margin and GDV are in the report analytics. Act as an independent second opinion: validate those figures against the comparables and area intelligence, and in reportComparison state clearly whether you agree, partly agree, or disagree with the report and why. Do not simply restate the report. ' + AUCTION_ANALYST_FRAMING,
          prompt: `Review this auction deal and score it. If report analytics are present, cross-check your conclusion against them.\n\n${context}`,
          schema,
          requiredFields: ['summary', 'riskFlags', 'strengths', 'dealScore', 'verdict'],
          env,
        });
        return corsResponse({ success: true, review, provider, reviewedAt: new Date().toISOString() });
      } catch (err) {
        console.error('AI deal review failed:', err);
        return corsResponse({ success: false, message: 'Could not complete AI review' }, 502);
      }
    }

    // --------------------------------------------------------
    // AI — deal analysis (live market comparison via web search)
    // --------------------------------------------------------
    if (url.pathname === '/api/ai/deal-analysis' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (!anyAiProviderConfigured(env)) {
        return corsResponse({ success: false, message: 'AI not configured — set at least one of: ANTHROPIC_API_KEY, GROQ_API_KEY, GOOGLE_AI_API_KEY, OPENROUTER_API_KEY' }, 400);
      }
      const aiRateOk = await checkRateLimit(env, `ai:${session.userId}`, 10);
      if (!aiRateOk) return corsResponse({ success: false, message: 'Too many AI requests — please wait a minute' }, 429);

      const { property } = await request.json();
      if (!property || !property.address) return corsResponse({ success: false, message: 'Missing property' }, 400);

      const searchQuery = `recent sold property prices near ${property.postcode || property.address}${property.propertyType ? ` ${property.propertyType}` : ''}`;
      const searchResults = await webSearch(searchQuery, env, 6);
      const areaStats = await getAreaMarketStats(env, property.postcode || property.address);

      const clip = (obj) => JSON.stringify(obj ?? null).slice(0, 4000);
      const context = [
        `Address: ${property.address}${property.dealName ? ` (${property.dealName})` : ''}`,
        `Guide price: £${Number(property.guidePrice || 0).toLocaleString()}`,
        areaMarketStatsLine(areaStats),
        `Analytics (GDV/margin/costs): ${clip(property.analytics)}`,
        searchResults.length
          ? `Live web search results for local market context:\n${searchResults.map((r, i) => `${i + 1}. ${r.title} — ${r.snippet} (${r.url})`).join('\n')}`
          : 'No live web search results were available — reason over the CRM data alone, and set positioning to "insufficient_data" and confidence to "low".',
      ].join('\n\n');

      const schema = {
        type: 'object',
        additionalProperties: false,
        required: ['marketSummary', 'comparables', 'positioning', 'confidence'],
        properties: {
          marketSummary: { type: 'string', description: '2-4 sentence assessment of this deal against current local market conditions' },
          comparables: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                address: { type: 'string' }, price: { type: 'string' }, date: { type: 'string' }, source: { type: 'string' },
              },
            },
            description: 'Comparable sold/listed properties grounded only in the provided search results — never invented. Empty if search results gave nothing usable.',
          },
          positioning: { type: 'string', enum: ['underpriced', 'fair', 'overpriced', 'insufficient_data'] },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How much live search data was actually available to ground this assessment' },
        },
      };

      try {
        const { result: analysis, provider } = await generateInsight({
          system: 'You are a UK property market analyst. Ground every claim in the search results and CRM data provided — never invent comparable prices or addresses. If search results are thin or absent, say so and lower your confidence rather than guessing. ' + AUCTION_ANALYST_FRAMING,
          prompt: `Assess this deal against current local market conditions.\n\n${context}`,
          schema,
          requiredFields: ['marketSummary', 'comparables', 'positioning', 'confidence'],
          env,
        });
        return corsResponse({ success: true, analysis, provider, generatedAt: new Date().toISOString() });
      } catch (err) {
        console.error('AI deal analysis failed:', err);
        return corsResponse({ success: false, message: 'Could not complete deal analysis' }, 502);
      }
    }

    // --------------------------------------------------------
    // AI — auction triage insight (on-demand, per lot)
    // --------------------------------------------------------
    if (url.pathname === '/api/ai/triage-insight' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);
      if (!anyAiProviderConfigured(env)) {
        return corsResponse({ success: false, message: 'AI not configured — set at least one of: ANTHROPIC_API_KEY, GROQ_API_KEY, GOOGLE_AI_API_KEY, OPENROUTER_API_KEY' }, 400);
      }
      const aiRateOk = await checkRateLimit(env, `ai:${session.userId}`, 10);
      if (!aiRateOk) return corsResponse({ success: false, message: 'Too many AI requests — please wait a minute' }, 429);

      const { lotId } = await request.json();
      if (!lotId) return corsResponse({ success: false, message: 'Missing lotId' }, 400);
      await ensureAuctionMigratedToD1(env);
      const lot = await d1GetAuctionLotById(env, lotId);
      if (!lot) return corsResponse({ success: false, message: 'Lot not found' }, 404);

      // Triage lots are pre-promotion — EIG addresses are locality-only and OTM
      // district-only, so a full street address is often unavailable here.
      const searchQuery = `recent sold property prices near ${lot.address || ''}${lot.propertyType ? ` ${lot.propertyType}` : ''}`.trim();
      const searchResults = lot.address ? await webSearch(searchQuery, env, 5) : [];
      const areaStats = lot.address ? await getAreaMarketStats(env, lot.address) : null;

      const context = [
        `Address/locality: ${lot.address || 'unknown'}`,
        `Guide price: £${Number(lot.guidePrice || 0).toLocaleString()}`,
        `Type: ${lot.propertyType || 'unknown'} · Beds: ${lot.bedrooms || 'unknown'}`,
        `Auction house: ${lot.houseName || 'unknown'} · Auction date: ${lot.auctionDate || 'unknown'}`,
        areaMarketStatsLine(areaStats),
        searchResults.length
          ? `Live web search results for local market context:\n${searchResults.map((r, i) => `${i + 1}. ${r.title} — ${r.snippet} (${r.url})`).join('\n')}`
          : 'No live web search results were available for this locality.',
      ].join('\n');

      const schema = {
        type: 'object',
        additionalProperties: false,
        required: ['flag', 'note', 'guidePriceAssessment'],
        properties: {
          flag: { type: 'string', enum: ['strong_interest', 'worth_reviewing', 'low_priority', 'insufficient_data'] },
          note: { type: 'string', description: '1-2 sentence rationale for the flag' },
          guidePriceAssessment: { type: 'string', enum: ['below_market', 'in_line', 'above_market', 'unknown'] },
        },
      };

      try {
        const { result: insight, provider } = await generateInsight({
          system: 'You are triaging UK property auction lots for a South Yorkshire flip investor, working from thin pre-auction data. Be conservative — only flag strong_interest when the lot looks genuinely favourable against the evidence given once a realistic above-guide sale price is assumed; use insufficient_data rather than guessing when evidence is thin. For guidePriceAssessment, judge the guide against the realistic hammer/market price (not against itself): below_market means the realistic sale price is well above guide. ' + AUCTION_ANALYST_FRAMING,
          prompt: `Triage this auction lot.\n\n${context}`,
          schema,
          requiredFields: ['flag', 'note', 'guidePriceAssessment'],
          env,
        });
        const updatedLot = {
          ...lot,
          aiFlag: insight.flag,
          aiNote: insight.note,
          aiGuideAssessment: insight.guidePriceAssessment,
          aiInsightProvider: provider,
          aiInsightGeneratedAt: new Date().toISOString(),
        };
        await d1PutAuctionLot(env, updatedLot);
        return corsResponse({ success: true, insight, provider, lot: updatedLot });
      } catch (err) {
        console.error('AI triage insight failed:', err);
        return corsResponse({ success: false, message: 'Could not complete triage insight' }, 502);
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

    // POST /api/properties/ingest — upsert a single property without touching
    // any other entity. Unlike POST /api/crm-data (which replaces the user's
    // entire blob and is only safe for the SPA, which always resends its full
    // in-memory state), this is for external callers — like the Chrome
    // extension — that only ever hold one property at a time.
    if (url.pathname === '/api/properties/ingest' && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const allowed = await checkRateLimit(env, `ingest:${session.userId}`, 20);
      if (!allowed) return corsResponse({ success: false, message: 'Too many requests — please slow down' }, 429);

      const property = await request.json();
      if (property?.id == null) return corsResponse({ success: false, message: 'property.id is required' }, 400);

      const userId = session.userId;
      const savedAt = new Date().toISOString();

      // Single-row D1 upsert, reusing the same per-row shape as syncUserBlobToD1.
      const def = D1_ENTITY_TABLES.properties;
      const extra = def.cols(property);
      const extraNames = Object.keys(extra);
      await env.CRM_DB.prepare(
        `INSERT OR REPLACE INTO ${def.table} (id, user_id, updated_at, deleted, data${extraNames.map(c => ', ' + c).join('')}) ` +
        `VALUES (?, ?, ?, ?, ?${', ?'.repeat(extraNames.length)})`
      ).bind(String(property.id), userId, savedAt, property.deleted ? 1 : 0, JSON.stringify(property), ...extraNames.map(c => extra[c])).run();

      // Read-modify-write the KV rollback blob so the D1-read-failure fallback
      // path (mergeUserData) stays consistent, without touching any other
      // entity key in the user's blob.
      const existingBlob = (await env.SCRAPER_KV.get(`crm:user:${userId}`, 'json')) || {};
      const existingProperties = Array.isArray(existingBlob.properties) ? existingBlob.properties : [];
      const idx = existingProperties.findIndex(p => p?.id === property.id);
      const updatedProperties = idx >= 0
        ? existingProperties.map((p, i) => i === idx ? property : p)
        : [...existingProperties, property];
      await env.SCRAPER_KV.put(`crm:user:${userId}`, JSON.stringify({ ...existingBlob, properties: updatedProperties, savedAt }));

      const userIds = (await env.SCRAPER_KV.get('crm:user-ids', 'json')) || [];
      if (!userIds.includes(userId)) {
        userIds.push(userId);
        await env.SCRAPER_KV.put('crm:user-ids', JSON.stringify(userIds));
      }

      return corsResponse({ success: true, property });
    }

    // POST /api/ingest/:entity — generic single-record upsert for external
    // callers (the Chrome extension). Identical mechanism to
    // /api/properties/ingest above, generalised to any capturable entity.
    // `entity` is allow-listed to the KV blob keys the extension may write.
    if (url.pathname.startsWith('/api/ingest/') && request.method === 'POST') {
      const session = await getSession(env, request);
      if (!session) return corsResponse({ success: false, message: 'Unauthorized' }, 401);

      const entity = url.pathname.slice('/api/ingest/'.length);
      const INGEST_ALLOWED = ['properties', 'contacts', 'companies', 'surveyors', 'globalNotes', 'tasks'];
      if (!INGEST_ALLOWED.includes(entity)) return corsResponse({ success: false, message: 'Unsupported entity' }, 400);

      const allowed = await checkRateLimit(env, `ingest:${session.userId}`, 20);
      if (!allowed) return corsResponse({ success: false, message: 'Too many requests — please slow down' }, 429);

      const record = await request.json();
      if (record?.id == null) return corsResponse({ success: false, message: 'record.id is required' }, 400);

      const userId = session.userId;
      const savedAt = new Date().toISOString();

      const def = D1_ENTITY_TABLES[entity];
      const extra = def.cols(record);
      const extraNames = Object.keys(extra);
      await env.CRM_DB.prepare(
        `INSERT OR REPLACE INTO ${def.table} (id, user_id, updated_at, deleted, data${extraNames.map(c => ', ' + c).join('')}) ` +
        `VALUES (?, ?, ?, ?, ?${', ?'.repeat(extraNames.length)})`
      ).bind(String(record.id), userId, savedAt, record.deleted ? 1 : 0, JSON.stringify(record), ...extraNames.map(c => extra[c])).run();

      const existingBlob = (await env.SCRAPER_KV.get(`crm:user:${userId}`, 'json')) || {};
      const existingRecords = Array.isArray(existingBlob[entity]) ? existingBlob[entity] : [];
      const idx = existingRecords.findIndex(r => r?.id === record.id);
      const updatedRecords = idx >= 0
        ? existingRecords.map((r, i) => i === idx ? record : r)
        : [...existingRecords, record];
      await env.SCRAPER_KV.put(`crm:user:${userId}`, JSON.stringify({ ...existingBlob, [entity]: updatedRecords, savedAt }));

      const userIds = (await env.SCRAPER_KV.get('crm:user-ids', 'json')) || [];
      if (!userIds.includes(userId)) {
        userIds.push(userId);
        await env.SCRAPER_KV.put('crm:user-ids', JSON.stringify(userIds));
      }

      return corsResponse({ success: true, entity, record });
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
