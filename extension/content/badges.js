// Injects "In CRM" badges on listing links that are already in the pipeline.
// Declared as a content script on the listing sites. Matches each property
// anchor's href against the cached CRM property list (by listingUrl).
(() => {
  if (window.__crmBadgesInjected) return;
  window.__crmBadgesInjected = true;

  const LINK_SELECTORS = 'a[href*="/properties/"], a[href*="/property-for-sale/"], a[href*="/for-sale/details/"], a[href*="/details/"], a[href*="/lot/"], a[href*="/auction/"]';

  let props = [];
  const norm = (u) => (u || '').split('#')[0].split('?')[0].replace(/\/$/, '').toLowerCase();

  function matchFor(href) {
    const h = norm(href);
    if (!h) return null;
    return props.find(p => {
      const lu = norm(p.listingUrl);
      return lu && (lu === h || lu.includes(h) || h.includes(lu));
    });
  }

  function badge(status) {
    const b = document.createElement('span');
    b.className = 'crm-inpipe-badge';
    b.textContent = `● In CRM${status ? ' · ' + status : ''}`;
    Object.assign(b.style, {
      display: 'inline-block', background: '#dcfce7', color: '#166534', fontWeight: '700',
      fontSize: '11px', padding: '2px 7px', borderRadius: '999px', marginLeft: '6px',
      fontFamily: 'sans-serif', verticalAlign: 'middle', whiteSpace: 'nowrap',
    });
    return b;
  }

  function tag() {
    if (!props.length) return;
    for (const a of document.querySelectorAll(LINK_SELECTORS)) {
      if (a.dataset.crmBadged) continue;
      const m = matchFor(a.href);
      if (!m) continue;
      a.dataset.crmBadged = '1';
      const card = a.closest('article, li, div[data-testid], .propertyCard, .l-searchResult') || a;
      const target = card.querySelector('h2, h3, address, [class*="price" i]') || a;
      try { target.appendChild(badge(m.status)); } catch (e) { /* detached node */ }
    }
    // Whole-page banner if the current listing itself is in the pipeline.
    if (!window.__crmPageBadged) {
      const self = matchFor(location.href);
      if (self) {
        window.__crmPageBadged = true;
        const h1 = document.querySelector('h1');
        if (h1) h1.appendChild(badge(self.status));
      }
    }
  }

  chrome.runtime.sendMessage({ type: 'CRM_LISTS' }, (res) => {
    if (chrome.runtime.lastError || !res) return;
    props = res.properties || [];
    tag();
    // Search results load lazily — re-tag as the DOM changes (throttled).
    let pending = null;
    const obs = new MutationObserver(() => { if (pending) return; pending = setTimeout(() => { pending = null; tag(); }, 600); });
    obs.observe(document.body, { childList: true, subtree: true });
  });
})();
