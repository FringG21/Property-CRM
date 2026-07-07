// Background service worker — the ONLY part of the extension that talks to the
// CRM API. Routing every request through here means Chrome (MV3) treats them as
// privileged cross-origin requests via host_permissions, so no CORS handling is
// needed on the worker. The pairing token never leaves this context.
import { extractFromPage } from './content/extract.js';

const API_BASE = 'https://property-crm.aa-investment-partners.workers.dev';

async function getToken() {
  const { crmToken } = await chrome.storage.local.get('crmToken');
  return crmToken || '';
}

async function api(path, { method = 'GET', body } = {}) {
  const token = await getToken();
  if (!token) return { ok: false, status: 401, data: { message: 'Not connected — paste a token first.' } };
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, data: { message: 'Network error — is the CRM reachable?' } };
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  return { ok: res.ok, status: res.status, data };
}

// Multipart upload to R2 via the worker. Returns { key, name } or null.
async function uploadFile(propertyId, fileKey, blob, filename, contentType) {
  const token = await getToken();
  if (!token) return null;
  const fd = new FormData();
  fd.append('file', new File([blob], filename, { type: contentType || blob.type || 'application/octet-stream' }));
  fd.append('propertyId', String(propertyId));
  fd.append('fileKey', fileKey);
  try {
    const res = await fetch(`${API_BASE}/api/documents/upload`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
    const data = await res.json();
    return data.success ? { key: data.key, name: data.name } : null;
  } catch (e) { return null; }
}

// ---- CRM list cache (for linking, dedupe, badges, omnibox) ------------------
let crmCache = { at: 0, data: null };
async function getCrmLists() {
  if (crmCache.data && Date.now() - crmCache.at < 120000) return crmCache.data;
  const { ok, data } = await api('/api/crm-data');
  if (!ok || !data.success) return { companies: [], properties: [], contacts: [] };
  const d = data.data || {};
  const lists = {
    companies: (d.companies || []).filter(c => !c.deleted).map(c => ({ id: c.id, name: c.name, type: c.type })),
    properties: (d.properties || []).filter(p => !p.deleted).map(p => ({ id: p.id, address: p.address, dealName: p.dealName, status: p.status, listingUrl: p.listingUrl, postcode: p.postcode })),
    contacts: (d.contacts || []).filter(c => !c.deleted).map(c => ({ id: c.id, name: c.name, email: c.email })),
  };
  crmCache = { at: Date.now(), data: lists };
  return lists;
}

// ---- intelligence merge (ported from src/App.jsx runPropertyIntelligence) ---
function mergeIntelligence(prop, intel) {
  const c = intel.connectors || {};
  const addrData = c.address && c.address.data;
  const epcData = c.epc && c.epc.data;
  const lrData = c.landRegistry && c.landRegistry.data;
  const u = {};
  if (addrData) {
    if (!prop.lat && addrData.lat) u.lat = addrData.lat;
    if (!prop.lng && addrData.lng) u.lng = addrData.lng;
    if (!prop.localAuthority && addrData.localAuthority) u.localAuthority = addrData.localAuthority;
    if (!prop.ward && addrData.ward) u.ward = addrData.ward;
    if (!prop.region && addrData.region) u.region = addrData.region;
    if (!prop.postcode && addrData.postcode) u.postcode = addrData.postcode;
  }
  if (epcData && epcData.best) {
    if (!prop.epcRating && epcData.epcRating) u.epcRating = epcData.epcRating;
    if (!prop.floorArea && epcData.floorArea) u.floorArea = epcData.floorArea;
  }
  if (lrData && lrData.items && lrData.items.length) {
    const exist = prop.comparables || [];
    const existIds = new Set(exist.filter(x => x.fromIntelligence).map(x => x.id));
    const newComps = lrData.items.slice(0, 12).map(it => ({
      id: `lr-${it.date}-${(it.address || '').replace(/\s/g, '')}`,
      address: [it.address, it.town].filter(Boolean).join(', '),
      soldDate: it.date, soldPrice: it.price, bedrooms: 0,
      source: 'Land Registry', notes: it.propertyType || '', fromIntelligence: true,
    })).filter(x => !existIds.has(x.id));
    if (newComps.length) u.comparables = [...exist, ...newComps];
  }
  u.intelligence = { ...(prop.intelligence || {}), ...intel, lastRun: new Date().toISOString() };
  return u;
}

async function runIntelligence(postcode, address) {
  const pc = (postcode || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!pc) return { success: false, message: 'No postcode' };
  const { ok, data } = await api('/api/intelligence/run', { method: 'POST', body: { postcode: pc, address: address || '' } });
  return ok ? data : { success: false, message: (data && data.message) || 'Intelligence failed' };
}

async function extractActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return { error: 'No active tab.' };
  if (/^(chrome|edge|about|chrome-extension):/i.test(tab.url || '')) {
    return { kind: 'generic', fields: {}, url: tab.url || '', title: tab.title || '', host: '', selection: '', restricted: true, tabId: tab.id };
  }
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractFromPage });
    const out = (res && res.result) ? res.result : { error: 'Nothing extracted.' };
    out.tabId = tab.id; out.windowId = tab.windowId;
    return out;
  } catch (e) {
    return { error: `Could not read this page (${e.message}).` };
  }
}

// Best-effort: fetch an asset URL and upload to R2. Cross-origin CDNs without a
// host permission will fail the fetch — we simply skip those.
async function grabAndUpload(propertyId, fileKey, assetUrl, filename) {
  try {
    const r = await fetch(assetUrl);
    if (!r.ok) return null;
    const blob = await r.blob();
    if (!blob.size || blob.size > 25 * 1024 * 1024) return null;
    return await uploadFile(propertyId, fileKey, blob, filename, blob.type);
  } catch (e) { return null; }
}

async function captureAndUpload(windowId, propertyId) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    const blob = await (await fetch(dataUrl)).blob();
    return await uploadFile(propertyId, `ext_screenshot_${Date.now()}`, blob, 'listing-screenshot.png', 'image/png');
  } catch (e) { return null; }
}

// ---- message router ---------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'STATUS': {
        sendResponse({ connected: !!(await getToken()) });
        break;
      }
      case 'SET_TOKEN': {
        await chrome.storage.local.set({ crmToken: (msg.token || '').trim() });
        crmCache = { at: 0, data: null };
        const { ok, status } = await api('/api/crm-data');
        sendResponse({ connected: ok, status });
        break;
      }
      case 'CLEAR_TOKEN': {
        await chrome.storage.local.remove('crmToken');
        crmCache = { at: 0, data: null };
        sendResponse({ connected: false });
        break;
      }
      case 'EXTRACT': { sendResponse(await extractActiveTab()); break; }
      case 'CRM_LISTS': { sendResponse(await getCrmLists()); break; }
      case 'DUP_CHECK': {
        const { ok, data } = await api('/api/intelligence/duplicate-check', { method: 'POST', body: msg.payload });
        sendResponse(ok ? data : { success: false, matches: [] });
        break;
      }
      case 'INTEL_RUN': {
        sendResponse(await runIntelligence(msg.postcode, msg.address));
        break;
      }
      case 'INGEST': {
        const { ok, status, data } = await api(`/api/ingest/${msg.entity}`, { method: 'POST', body: msg.record });
        crmCache = { at: 0, data: null };
        sendResponse({ ok, status, data });
        break;
      }
      case 'ENRICH': {
        // Run area intelligence for a just-saved property, merge, re-ingest.
        const prop = msg.property;
        const pc = prop.postcode || '';
        const intel = await runIntelligence(pc, prop.address);
        if (!intel.success) { sendResponse({ ok: false, message: intel.message }); break; }
        const merged = { ...prop, ...mergeIntelligence(prop, intel.intelligence) };
        const { ok, data } = await api('/api/ingest/properties', { method: 'POST', body: merged });
        crmCache = { at: 0, data: null };
        const succeeded = Object.values(intel.intelligence.connectors || {}).filter(v => v.status === 'success').length;
        // Return the enriched record so the caller re-ingests media ON TOP of it
        // instead of clobbering the enrichment with the pre-enrich property.
        sendResponse({ ok: ok && data.success, connectors: succeeded, property: merged });
        break;
      }
      case 'UPLOAD_MEDIA': {
        const { propertyId, windowId, media } = msg;
        const files = {};
        const shot = await captureAndUpload(windowId, propertyId);
        if (shot) files[`ext_screenshot_${Date.now()}`] = { name: shot.name, type: 'image', key: shot.key };
        if (media) {
          if (media.floorplan) { const r = await grabAndUpload(propertyId, 'ext_floorplan', media.floorplan, 'floorplan.jpg'); if (r) files['ext_floorplan'] = { name: r.name, type: 'image', key: r.key }; }
          if (media.epcImage) { const r = await grabAndUpload(propertyId, 'ext_epc', media.epcImage, 'epc.jpg'); if (r) files['ext_epc'] = { name: r.name, type: 'image', key: r.key }; }
          let n = 0;
          for (const img of (media.images || []).slice(0, 8)) { const r = await grabAndUpload(propertyId, `ext_photo_${n}`, img, `photo-${n + 1}.jpg`); if (r) files[`ext_photo_${n}`] = { name: r.name, type: 'image', key: r.key }; n++; }
          let p = 0;
          for (const pdf of (media.pdfs || []).slice(0, 4)) { const r = await grabAndUpload(propertyId, `ext_legalpack_${p}`, pdf.url, `${(pdf.label || 'legal-pack').replace(/[^\w.-]+/g, '-')}.pdf`); if (r) files[`ext_legalpack_${p}`] = { name: r.name, type: 'pdf', key: r.key }; p++; }
        }
        sendResponse({ ok: Object.keys(files).length > 0, files });
        break;
      }
      case 'CALENDAR_EVENT': {
        const provider = msg.provider === 'microsoft' ? 'microsoft' : 'google';
        const { ok, data } = await api(`/api/calendar/${provider}/event`, { method: 'POST', body: msg.event });
        sendResponse({ ok: ok && data.success, data });
        break;
      }
      default:
        sendResponse({ error: 'Unknown message' });
    }
  })();
  return true; // async
});

// ---- omnibox: type "crm <query>" in the address bar -------------------------
chrome.omnibox && chrome.omnibox.setDefaultSuggestion({ description: 'Search your Property CRM — properties, contacts, companies' });

chrome.omnibox && chrome.omnibox.onInputChanged.addListener(async (input, suggest) => {
  const q = (input || '').trim().toLowerCase();
  if (q.length < 2) return;
  const lists = await getCrmLists();
  const out = [];
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  for (const p of lists.properties) {
    const label = p.dealName || p.address || '';
    if (label.toLowerCase().includes(q)) out.push({ content: `property:${p.id}`, description: `🏠 ${esc(label)} — ${esc(p.status || '')}` });
  }
  for (const c of lists.contacts) if ((c.name || '').toLowerCase().includes(q)) out.push({ content: `contact:${c.id}`, description: `👤 ${esc(c.name)} ${esc(c.email ? '· ' + c.email : '')}` });
  for (const co of lists.companies) if ((co.name || '').toLowerCase().includes(q)) out.push({ content: `company:${co.id}`, description: `🏢 ${esc(co.name)} — ${esc(co.type || '')}` });
  suggest(out.slice(0, 8));
});

chrome.omnibox && chrome.omnibox.onInputEntered.addListener((input) => {
  // The CRM SPA has no per-record deep-link route, so open the app; the query
  // primes the user to search once inside.
  const q = encodeURIComponent(String(input).replace(/^(property|contact|company):/, ''));
  chrome.tabs.create({ url: `${API_BASE}/?q=${q}` });
});
