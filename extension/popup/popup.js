// Popup controller. Talks only to the background service worker (never the API
// directly). Renders a per-entity form pre-filled from the active page, checks
// for duplicates, saves a record in the exact shape the CRM expects, then offers
// post-save actions: area-intelligence enrichment, media capture, calendar push
// and one-flow relationship capture (agent + agency).

const $ = (id) => document.getElementById(id);
const send = (type, extra = {}) => new Promise((res) => chrome.runtime.sendMessage({ type, ...extra }, res));

const COMPANY_TYPES = ['Auction House', 'Solicitor', 'Surveyor', 'Builder', 'Estate Agent', 'Mortgage Broker', 'Letting Agent', 'Architect', 'Trade / Contractor', 'Other'];
const CONTACT_ROLES = ['Estate Agent', 'Solicitor', 'Surveyor', 'Builder', 'Mortgage Broker', 'Auctioneer', 'Vendor', 'Partner', 'Other'];
const NOTE_TYPES = ['Review', 'Call', 'Email', 'Meeting', 'Legal', 'Finance', 'Survey update', 'Flag', 'Task'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const TARGET_TYPES = ['Property', 'Contact', 'Company'];
const PIPELINE_STAGES = ['Sourced', 'Under Review', 'Bidding', 'Won', 'Lost', 'Refurb', 'For Sale', 'Completed'];

const TABS = [
  { key: 'property', label: 'Property' },
  { key: 'contact', label: 'Contact' },
  { key: 'company', label: 'Company' },
  { key: 'note', label: 'Note' },
  { key: 'task', label: 'Task' },
];

let extracted = null;
let lists = { companies: [], properties: [], contacts: [] };
let current = 'property';
let lastSaved = null; // { record, entity } — for post-save actions

init();
async function init() {
  const { connected } = await send('STATUS');
  setConn(connected);
  if (!connected) return showConnect();
  await showMain();
}

function setConn(ok) {
  const el = $('connState');
  el.classList.toggle('ok', ok);
  el.classList.toggle('off', !ok);
  el.textContent = '●';
}

function showConnect() {
  $('connect').classList.remove('hidden');
  $('main').classList.add('hidden');
  $('connectBtn').onclick = async () => {
    const token = $('tokenInput').value.trim();
    if (!token) return;
    $('connectBtn').disabled = true;
    $('connectErr').textContent = '';
    const { connected } = await send('SET_TOKEN', { token });
    $('connectBtn').disabled = false;
    if (connected) { setConn(true); $('connect').classList.add('hidden'); await showMain(); }
    else $('connectErr').textContent = 'That token was rejected. Generate a fresh one in CRM Settings.';
  };
}

async function showMain() {
  $('main').classList.remove('hidden');
  $('disconnect').onclick = async () => { await send('CLEAR_TOKEN'); setConn(false); $('main').classList.add('hidden'); showConnect(); };

  const [ex, cl] = await Promise.all([send('EXTRACT'), send('CRM_LISTS')]);
  extracted = ex || {};
  lists = cl || lists;

  current = defaultTab(extracted);
  renderTabs();
  renderForm();
  $('saveBtn').onclick = save;
}

function defaultTab(ex) {
  if (ex.selection && ex.selection.length > 1) return 'note';
  if (ex.kind === 'contact') return 'contact';
  if (ex.kind === 'company') return 'company';
  return 'property';
}

function renderTabs() {
  const wrap = $('typeTabs');
  wrap.innerHTML = '';
  for (const t of TABS) {
    const b = document.createElement('button');
    b.className = 'tab' + (t.key === current ? ' active' : '');
    b.textContent = t.label;
    b.type = 'button';
    b.onclick = () => { current = t.key; renderTabs(); renderForm(); };
    wrap.appendChild(b);
  }
}

function field(label, key, { type = 'text', value = '', options, full } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label'); l.textContent = label; wrap.appendChild(l);
  let input;
  if (type === 'select') {
    input = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      const [v, t] = Array.isArray(o) ? o : [o, o];
      opt.value = v; opt.textContent = t;
      if (String(v) === String(value)) opt.selected = true;
      input.appendChild(opt);
    }
  } else if (type === 'textarea') {
    input = document.createElement('textarea'); input.value = value || '';
  } else {
    input = document.createElement('input'); input.type = type; input.value = value == null ? '' : value;
  }
  input.dataset.key = key;
  wrap.appendChild(input);
  wrap._input = input;
  return wrap;
}

function checkbox(id, label, checked) {
  const wrap = document.createElement('label');
  wrap.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:#334155;cursor:pointer;font-weight:500;text-transform:none;letter-spacing:0';
  const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = checked; cb.style.width = 'auto';
  wrap.appendChild(cb); wrap.appendChild(document.createTextNode(label));
  return wrap;
}

function renderForm() {
  const form = $('form');
  form.innerHTML = '';
  $('badge').classList.add('hidden');
  $('status').textContent = '';
  $('saveBtn').classList.remove('hidden');
  $('saveBtn').disabled = false;
  $('saveBtn').textContent = 'Save to CRM';
  const f = extracted.fields || {};

  if (current === 'property') {
    form.appendChild(field('Address', 'address', { value: f.address }));
    form.appendChild(field('Deal name', 'dealName', { value: f.dealName || (f.address || '').split(',')[0] }));
    const row = document.createElement('div'); row.className = 'row';
    row.appendChild(field('Guide price (£)', 'guidePrice', { type: 'number', value: f.guidePrice ?? '' }));
    row.appendChild(field('Bedrooms', 'bedrooms', { type: 'number', value: f.bedrooms ?? '' }));
    form.appendChild(row);
    const row2 = document.createElement('div'); row2.className = 'row';
    row2.appendChild(field('Postcode', 'postcode', { value: f.postcode }));
    row2.appendChild(field('Auction date', 'auctionDate', { value: f.auctionDate }));
    form.appendChild(row2);
    const row3 = document.createElement('div'); row3.className = 'row';
    row3.appendChild(field('Stage', 'status', { type: 'select', value: 'Sourced', options: PIPELINE_STAGES }));
    row3.appendChild(field('Type', 'propertyType', { value: f.propertyType || 'Residential' }));
    form.appendChild(row3);
    form.appendChild(field('Listing URL', 'listingUrl', { value: f.listingUrl || extracted.url }));
    form.appendChild(field('Source', 'source', { value: f.source || extracted.host }));

    const opts = document.createElement('div');
    opts.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:4px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px';
    opts.appendChild(checkbox('optEnrich', 'Run area intelligence on save', true));
    const hasMedia = extracted.media && (extracted.media.images?.length || extracted.media.floorplan || extracted.media.pdfs?.length);
    opts.appendChild(checkbox('optMedia', 'Attach page media (screenshot, photos, floorplan, legal pack)', !!hasMedia));
    form.appendChild(opts);

    const intelBtn = document.createElement('button');
    intelBtn.type = 'button'; intelBtn.className = 'link'; intelBtn.style.color = '#059669'; intelBtn.textContent = '🔍 Preview area intel';
    intelBtn.onclick = previewIntel;
    form.appendChild(intelBtn);

    runPropertyDup();
  } else if (current === 'contact') {
    form.appendChild(field('Name', 'name', { value: f.name }));
    form.appendChild(field('Role', 'role', { type: 'select', value: f.role || 'Other', options: CONTACT_ROLES }));
    const row = document.createElement('div'); row.className = 'row';
    row.appendChild(field('Email', 'email', { type: 'email', value: f.email }));
    row.appendChild(field('Phone', 'phone', { value: f.phone }));
    form.appendChild(row);
    form.appendChild(field('Job title', 'jobTitle', { value: f.jobTitle }));
    form.appendChild(field('LinkedIn', 'linkedin', { value: f.linkedin }));
    form.appendChild(field('Link to company', 'companyId', { type: 'select', value: '', options: [['', '— none —'], ...lists.companies.map(c => [String(c.id), c.name || '(unnamed)'])] }));
    contactDupBadge(f.email);
  } else if (current === 'company') {
    form.appendChild(field('Name', 'name', { value: f.name }));
    const typeField = field('Type', 'type', { type: 'select', value: f.type || 'Other', options: COMPANY_TYPES });
    form.appendChild(typeField);
    const row = document.createElement('div'); row.className = 'row';
    row.appendChild(field('Phone', 'phone', { value: f.phone }));
    row.appendChild(field('City', 'city', { value: f.city }));
    form.appendChild(row);
    form.appendChild(field('Website', 'website', { value: f.website }));
    if (f.companyNumber) form.appendChild(field('Company number', 'companyNumber', { value: f.companyNumber }));
    if (f.registeredAddress) form.appendChild(field('Registered address', 'registeredAddress', { value: f.registeredAddress }));
    const builderBox = document.createElement('div');
    form.appendChild(builderBox);
    const renderBuilder = (t) => {
      builderBox.innerHTML = '';
      if (t === 'Builder' || t === 'Trade / Contractor') {
        builderBox.appendChild(field('Trade specialisms', 'tradeSpecialisms', { value: '' }));
        const r = document.createElement('div'); r.className = 'row';
        r.appendChild(field('Day rate', 'dayRate', { value: '' }));
        r.appendChild(field('Lead time', 'leadTime', { value: '' }));
        builderBox.appendChild(r);
        builderBox.appendChild(field('Labour type', 'labourType', { value: '' }));
      }
    };
    renderBuilder(f.type || 'Other');
    typeField._input.addEventListener('change', (e) => renderBuilder(e.target.value));
    companyDupBadge(f.name);
  } else if (current === 'note') {
    const noteText = extracted.selection || f.note || f.text || '';
    form.appendChild(field('Note', 'text', { type: 'textarea', value: noteText }));
    form.appendChild(field('Type', 'noteType', { type: 'select', value: 'Review', options: NOTE_TYPES }));
    appendTargetPickers(form, 'targetType', 'targetId', TARGET_TYPES, true);
  } else if (current === 'task') {
    const t = f.title || extracted.title || (extracted.selection || '').slice(0, 90);
    form.appendChild(field('Title', 'title', { value: t }));
    const row = document.createElement('div'); row.className = 'row';
    row.appendChild(field('Due date', 'due', { type: 'date', value: '' }));
    row.appendChild(field('Priority', 'priority', { type: 'select', value: 'Medium', options: PRIORITIES }));
    form.appendChild(row);
    form.appendChild(field('Notes', 'notes', { type: 'textarea', value: extracted.selection ? '' : (f.note || '') }));
    appendTargetPickers(form, 'linkedType', 'linkedId', ['', ...TARGET_TYPES], false);
  }
}

function appendTargetPickers(form, typeKey, idKey, typeOptions, required) {
  const typeOpts = typeOptions.map(o => o === '' ? ['', '— unlinked —'] : [o, o]);
  const tf = field(required ? 'Attach to' : 'Link to (optional)', typeKey, { type: 'select', value: required ? 'Property' : '', options: typeOpts });
  form.appendChild(tf);
  const idWrap = document.createElement('div');
  form.appendChild(idWrap);
  const fill = (tt) => {
    idWrap.innerHTML = '';
    if (!tt) return;
    const src = tt === 'Property' ? lists.properties : tt === 'Contact' ? lists.contacts : lists.companies;
    const opts = [['', '— select —'], ...src.map(r => [String(r.id), r.dealName || r.address || r.name || r.email || `#${r.id}`])];
    idWrap.appendChild(field(`${tt}`, idKey, { type: 'select', value: '', options: opts }));
  };
  fill(required ? 'Property' : '');
  tf._input.addEventListener('change', (e) => fill(e.target.value));
}

// ---- dedupe & intel preview -------------------------------------------------
async function runPropertyDup() {
  const f = extracted.fields || {};
  if (!f.address && !f.postcode) return;
  const badge = $('badge');
  badge.className = 'badge loading'; badge.textContent = 'Checking for duplicates…'; badge.classList.remove('hidden');
  const data = await send('DUP_CHECK', { payload: { postcode: f.postcode, address: f.address, listingUrl: f.listingUrl || extracted.url } });
  const m = (data && data.matches) || [];
  if (m.length) { badge.className = 'badge dup'; badge.textContent = `⚠ Already in CRM: ${m[0].address || 'a property'} (${m[0].status || 'unknown'}, ${m[0].confidence}%)`; }
  else { badge.className = 'badge new'; badge.textContent = '✓ New — not in your pipeline'; }
}

function contactDupBadge(email) {
  if (!email) return;
  const hit = lists.contacts.find(c => (c.email || '').toLowerCase() === email.toLowerCase());
  const badge = $('badge'); badge.classList.remove('hidden');
  if (hit) { badge.className = 'badge dup'; badge.textContent = `⚠ Contact with this email exists: ${hit.name || email}`; }
  else { badge.className = 'badge new'; badge.textContent = '✓ New contact'; }
}

function companyDupBadge(name) {
  if (!name) return;
  const hit = lists.companies.find(c => (c.name || '').trim().toLowerCase() === name.trim().toLowerCase());
  const badge = $('badge'); badge.classList.remove('hidden');
  if (hit) { badge.className = 'badge dup'; badge.textContent = `⚠ Company "${hit.name}" already exists`; }
  else { badge.className = 'badge new'; badge.textContent = '✓ New company'; }
}

async function previewIntel() {
  const pc = formValues().postcode || (extracted.fields || {}).postcode;
  if (!pc) return status('Add a postcode to preview area intel.', false);
  status('Running area intelligence…', true);
  const res = await send('INTEL_RUN', { postcode: pc, address: formValues().address || '' });
  if (!res || !res.success) return status((res && res.message) || 'Intelligence failed.', false);
  const c = (res.intelligence && res.intelligence.connectors) || {};
  const lr = c.landRegistry && c.landRegistry.data;
  const bits = [];
  if (lr) bits.push(`LR avg £${Number(lr.avgPrice || 0).toLocaleString()} (${lr.salesCount || 0} sales)`);
  const ok = Object.values(c).filter(v => v.status === 'success').length;
  status(`✓ ${ok} connectors ran. ${bits.join(' · ')}`, true);
}

// ---- save + post-save actions -----------------------------------------------
function formValues() {
  const out = {};
  for (const el of $('form').querySelectorAll('[data-key]')) out[el.dataset.key] = el.value;
  return out;
}
function origId(src, strId) {
  const rec = src.find(r => String(r.id) === String(strId));
  return rec ? rec.id : (isNaN(Number(strId)) ? strId : Number(strId));
}
function labelFor(k) { return (TABS.find(t => t.key === k) || {}).label || 'Record'; }
function status(msg, ok) { const el = $('status'); el.textContent = msg; el.className = 'status ' + (ok ? 'ok' : 'bad'); }
function toISODate(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(String(s).replace(/(\d+)(st|nd|rd|th)/gi, '$1'));
  return isNaN(d) ? '' : d.toISOString().slice(0, 10);
}

async function save() {
  const v = formValues();
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];
  let entity, record;

  if (current === 'property') {
    if (!v.address) return status('Address is required.', false);
    entity = 'properties';
    record = {
      id: now, address: v.address, dealName: v.dealName || (v.address || '').split(',')[0].trim(),
      guidePrice: Number(v.guidePrice) || 0, auctionDate: v.auctionDate || '', auctionTime: '',
      bedrooms: Number(v.bedrooms) || 0, postcode: v.postcode || '', sourcePlatform: v.source || 'Extension',
      listingUrl: v.listingUrl || '', status: v.status || 'Sourced', propertyType: v.propertyType || 'Residential',
      maxBid: 0, isStrongBid: false, isConsideration: false, planningToBid: false, notesList: [], files: {}, comparables: [],
      checklist: { legalReviewed: false, financeApproved: false, costsPriced: false },
      activityLog: [{ id: now + 1, type: 'created', detail: `Added from ${v.source || 'browser extension'}`, user: 'Extension', at: new Date().toISOString() }],
      dataSource: 'extension',
    };
  } else if (current === 'contact') {
    if (!v.name) return status('Name is required.', false);
    entity = 'contacts';
    record = { id: now, name: v.name, email: v.email || '', jobTitle: v.jobTitle || '', phone: v.phone || '', officePhone: '', linkedin: v.linkedin || '', companyId: v.companyId ? origId(lists.companies, v.companyId) : null, role: v.role || 'Other', origin: (extracted.fields && extracted.fields.origin) || 'Extension', owner: 'Extension', lastActivity: today };
  } else if (current === 'company') {
    if (!v.name) return status('Name is required.', false);
    entity = 'companies';
    record = { id: now, name: v.name, website: v.website || '--', type: v.type || 'Other', city: v.city || '--', phone: v.phone || '', buyersPremium: '', adminFee: '', owner: 'Extension', createdDate: today, costItems: [] };
    if (v.companyNumber) record.companyNumber = v.companyNumber;
    if (v.registeredAddress) record.registeredAddress = v.registeredAddress;
    if (v.type === 'Builder' || v.type === 'Trade / Contractor') { record.tradeSpecialisms = v.tradeSpecialisms || ''; record.dayRate = v.dayRate || ''; record.leadTime = v.leadTime || ''; record.labourType = v.labourType || ''; }
  } else if (current === 'note') {
    if (!v.text) return status('Note text is required.', false);
    if (!v.targetId) return status('Choose what to attach this note to.', false);
    const src = v.targetType === 'Property' ? lists.properties : v.targetType === 'Contact' ? lists.contacts : lists.companies;
    entity = 'globalNotes';
    record = { id: now, targetType: v.targetType, targetId: origId(src, v.targetId), text: v.text, type: v.noteType || 'Review', author: 'Extension', date: today, bookmarked: false, done: false };
  } else if (current === 'task') {
    if (!v.title) return status('Title is required.', false);
    entity = 'tasks';
    let linkedName = '', linkedId = null;
    if (v.linkedType && v.linkedId) {
      const src = v.linkedType === 'Property' ? lists.properties : v.linkedType === 'Contact' ? lists.contacts : lists.companies;
      const rec = src.find(r => String(r.id) === String(v.linkedId));
      linkedId = rec ? rec.id : null; linkedName = rec ? (rec.dealName || rec.address || rec.name || rec.email || '') : '';
    }
    record = { id: now, title: v.title, dueDate: v.due || '', priority: v.priority || 'Medium', status: 'not_started', linkedType: v.linkedType || '', linkedId, linkedName, notes: v.notes || '', assignee: 'Extension', createdDate: today, createdBy: 'Extension', waitingOn: '', subtasks: [], comments: [], reminders: [], activityLog: [{ id: now + 1, type: 'created', detail: 'Task created from browser extension', user: 'Extension', at: new Date().toISOString() }] };
  }

  $('saveBtn').disabled = true;
  status('Saving…', true);
  const res = await send('INGEST', { entity, record });
  if (!(res && res.ok && res.data && res.data.success)) {
    $('saveBtn').disabled = false;
    return status((res && res.data && res.data.message) || 'Save failed — check your connection.', false);
  }
  lastSaved = { entity, record };

  if (current === 'property') return propertyPostSave(record);
  status(`Saved ✓ ${labelFor(current)} added to your CRM.`, true);
  setTimeout(() => window.close(), 900);
}

async function propertyPostSave(record) {
  status('Saved ✓ property added to pipeline.', true);
  const enrich = $('optEnrich') && $('optEnrich').checked;
  const media = $('optMedia') && $('optMedia').checked;
  // Carry the freshest server-side version forward so each step composes on the
  // last instead of overwriting it (enrichment must survive the media re-ingest).
  let base = record;

  if (enrich && record.postcode) {
    status('Saved ✓ · running area intelligence…', true);
    const r = await send('ENRICH', { property: base });
    if (r && r.ok) { if (r.property) base = r.property; status(`Saved ✓ · enriched (${r.connectors} connectors).`, true); }
  }
  if (media && extracted.media) {
    status(($('status').textContent || 'Saved ✓') + ' · attaching media…', true);
    const r = await send('UPLOAD_MEDIA', { propertyId: base.id, windowId: extracted.windowId, media: extracted.media });
    if (r && r.ok) {
      base = { ...base, files: { ...(base.files || {}), ...r.files } };
      await send('INGEST', { entity: 'properties', record: base });
      status(($('status').textContent || 'Saved ✓') + ` · ${Object.keys(r.files).length} docs.`, true);
    }
  }
  lastSaved.record = base;
  renderPostSaveActions(base);
}

function renderPostSaveActions(record) {
  $('saveBtn').classList.add('hidden');
  const form = $('form');
  form.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px';

  if (record.auctionDate && toISODate(record.auctionDate)) {
    const b = actionBtn('📅 Add auction date to calendar', async () => {
      b.disabled = true; b.textContent = 'Adding…';
      const event = { title: `Auction: ${record.dealName || record.address}`, date: toISODate(record.auctionDate), description: record.listingUrl || '', location: record.address || '' };
      let r = await send('CALENDAR_EVENT', { provider: 'google', event });
      if (!(r && r.ok)) r = await send('CALENDAR_EVENT', { provider: 'microsoft', event });
      b.textContent = (r && r.ok) ? '📅 Added to calendar ✓' : 'Calendar not connected — connect in CRM Settings';
    });
    wrap.appendChild(b);
  }

  const agent = extracted.agent;
  if (agent && (agent.name || agent.phone)) {
    const b = actionBtn(`👤 Also add agent${agent.name ? ' (' + agent.name + ')' : ''} + agency`, async () => {
      b.disabled = true; b.textContent = 'Adding…';
      const t = Date.now();
      const company = { id: t, name: agent.name || 'Listing agent', website: '--', type: 'Estate Agent', city: '--', phone: agent.phone || '', buyersPremium: '', adminFee: '', owner: 'Extension', createdDate: new Date().toISOString().split('T')[0], costItems: [] };
      const cr = await send('INGEST', { entity: 'companies', record: company });
      const contact = { id: t + 1, name: agent.name || 'Listing agent', email: '', jobTitle: 'Estate Agent', phone: agent.phone || '', officePhone: '', linkedin: '', companyId: company.id, role: 'Estate Agent', origin: 'Listing', owner: 'Extension', lastActivity: new Date().toISOString().split('T')[0] };
      const cc = await send('INGEST', { entity: 'contacts', record: contact });
      b.textContent = (cr && cr.ok && cc && cc.ok) ? '👤 Agent + agency added ✓' : 'Could not add agent';
    });
    wrap.appendChild(b);
  }

  wrap.appendChild(actionBtn('＋ Capture another', () => { lastSaved = null; showMain(); }));
  wrap.appendChild(actionBtn('Close', () => window.close(), true));
  form.appendChild(wrap);
}

function actionBtn(label, onClick, subtle) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label;
  b.style.cssText = subtle
    ? 'width:100%;padding:9px;background:#fff;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer'
    : 'width:100%;padding:10px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer';
  b.onclick = onClick;
  return b;
}
