// On-page due-diligence overlay. Declared as a content script on listing sites.
// Adds a floating "Area intel" button; on click it asks the background worker to
// run /api/intelligence/run for the page's postcode and renders a compact panel.
// Lazy: nothing is fetched until the user opens it.
(() => {
  if (window.__crmOverlayInjected) return;
  window.__crmOverlayInjected = true;

  const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
  const getPostcode = () => {
    const h1 = document.querySelector('h1');
    const m = ((h1 && h1.textContent) || '').match(POSTCODE_RE) || (document.body.innerText || '').match(POSTCODE_RE);
    return m ? `${m[1]} ${m[2]}`.toUpperCase() : '';
  };
  const looksLikeProperty = () =>
    /property|for-sale|to-rent|lot|auction|\/properties\//i.test(location.href) || !!getPostcode();

  if (!looksLikeProperty()) return;

  const btn = document.createElement('button');
  btn.textContent = '🏠 Area intel';
  Object.assign(btn.style, {
    position: 'fixed', bottom: '20px', right: '20px', zIndex: 2147483647,
    background: '#059669', color: '#fff', border: 'none', borderRadius: '999px',
    padding: '10px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0,0,0,.25)', fontFamily: 'sans-serif',
  });
  document.body.appendChild(btn);

  let panel = null;
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const gbp = (n) => (n ? '£' + Number(n).toLocaleString() : '—');

  // Best-effort one-line summary per connector (shapes vary; try common fields).
  function summarise(key, data) {
    if (!data) return 'No data';
    const d = data;
    switch (key) {
      case 'landRegistry': return `Avg ${gbp(d.avgPrice)} · ${d.priceGrowth != null ? d.priceGrowth + '% growth' : '—'} · ${d.salesCount || 0} sales`;
      case 'epc': return `${d.epcRating || d.best?.epcRating || '—'} rating${d.floorArea ? ' · ' + d.floorArea + ' m²' : ''}`;
      case 'flood': return d.riskLevel || d.summary || d.risk || 'Checked';
      case 'police': return (d.total != null ? d.total + ' crimes/month' : (d.count != null ? d.count + ' crimes' : 'Checked'));
      case 'planning': return (d.count != null ? d.count + ' applications' : (Array.isArray(d.items) ? d.items.length + ' applications' : 'Checked'));
      case 'schools': return (d.count != null ? d.count + ' schools nearby' : (Array.isArray(d.items) ? d.items.length + ' nearby' : 'Checked'));
      case 'hpi': return (d.annualGrowth != null ? d.annualGrowth + '% annual' : (d.avgPrice ? gbp(d.avgPrice) : 'Checked'));
      case 'imd': return (d.decile != null ? `Deprivation decile ${d.decile}/10` : 'Checked');
      case 'census': return d.population != null ? `${Number(d.population).toLocaleString()} residents` : 'Checked';
      case 'tfl': return (d.stops != null ? d.stops + ' transport stops' : 'Checked');
      case 'address': return d.localAuthority || d.ward || 'Resolved';
      default: return 'Checked';
    }
  }
  const LABELS = { address: 'Location', landRegistry: 'Land Registry', epc: 'EPC', flood: 'Flood risk', police: 'Crime', planning: 'Planning', schools: 'Schools', hpi: 'House prices', imd: 'Deprivation', census: 'Census', tfl: 'Transport', osm: 'Amenities' };

  function render(intel) {
    if (panel) panel.remove();
    panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed', bottom: '68px', right: '20px', zIndex: 2147483647, width: '320px',
      maxHeight: '70vh', overflowY: 'auto', background: '#fff', color: '#0f172a',
      border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,.25)',
      fontFamily: 'sans-serif', fontSize: '13px',
    });
    const connectors = (intel && intel.connectors) || {};
    const rows = Object.keys(LABELS).filter(k => connectors[k]).map(k => {
      const c = connectors[k];
      const ok = c.status === 'success';
      return `<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 12px;border-bottom:1px solid #f1f5f9">
        <span style="font-weight:600;color:#475569">${esc(LABELS[k])}</span>
        <span style="text-align:right;color:${ok ? '#0f172a' : '#94a3b8'}">${ok ? esc(summarise(k, c.data)) : '—'}</span>
      </div>`;
    }).join('');
    panel.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;border-radius:12px 12px 0 0">
        <strong>Area intelligence</strong>
        <span style="cursor:pointer;color:#94a3b8;font-size:16px" id="crm-ovl-x">✕</span>
       </div>${rows || '<div style="padding:14px;color:#64748b">No connector data.</div>'}`;
    document.body.appendChild(panel);
    panel.querySelector('#crm-ovl-x').onclick = () => { panel.remove(); panel = null; };
  }

  function loading(text) {
    if (panel) panel.remove();
    panel = document.createElement('div');
    Object.assign(panel.style, { position: 'fixed', bottom: '68px', right: '20px', zIndex: 2147483647, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', fontFamily: 'sans-serif', fontSize: '13px', color: '#64748b', boxShadow: '0 6px 20px rgba(0,0,0,.2)' });
    panel.textContent = text;
    document.body.appendChild(panel);
  }

  btn.onclick = () => {
    if (panel && panel.dataset && panel.dataset.done) { panel.remove(); panel = null; return; }
    const postcode = getPostcode();
    if (!postcode) { loading('No postcode found on this page.'); return; }
    loading('Running area intelligence…');
    chrome.runtime.sendMessage({ type: 'INTEL_RUN', postcode, address: (document.querySelector('h1') || {}).textContent || '' }, (res) => {
      if (chrome.runtime.lastError) { loading('Not connected — open the extension and paste your token.'); return; }
      if (!res || !res.success) { loading((res && res.message) || 'Intelligence failed.'); return; }
      render(res.intelligence);
      if (panel) panel.dataset.done = '1';
    });
  };
})();
