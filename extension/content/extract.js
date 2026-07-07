// Self-contained page extractor.
//
// IMPORTANT: this whole function is serialised and injected into the target
// page via chrome.scripting.executeScript({ func: extractFromPage }). It must
// NOT reference anything outside its own body (no imports, no outer-scope
// variables) — every helper lives nested inside. It returns a plain object:
//   { kind: 'property'|'contact'|'company'|'generic', fields: {...}, media?,
//     selection, url, title, host }
export function extractFromPage() {
  const url = location.href;
  const host = location.hostname.replace(/^www\./, '');
  const title = document.title || '';
  const selection = (window.getSelection && window.getSelection().toString().trim()) || '';
  const bodyText = document.body ? document.body.innerText : '';

  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const q = (sel) => document.querySelector(sel);
  const qa = (sel) => Array.from(document.querySelectorAll(sel));
  const text = (el) => (el && el.textContent ? el.textContent.trim() : '');
  const meta = (name) => {
    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
    return el ? el.getAttribute('content') || '' : '';
  };
  const abs = (u) => { try { return new URL(u, location.href).href; } catch (e) { return ''; } };

  const priceRe = /£\s?([\d][\d,]{2,})/;
  const postcodeRe = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
  const phoneRe = /(?:\+44\s?\d|0\d)(?:[\d\s-]){7,11}\d/;
  const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  const firstMatch = (re, s) => { const m = (s || '').match(re); return m ? m[0].trim() : ''; };
  const parsePrice = (s) => { const m = (s || '').match(priceRe); return m ? Number(m[1].replace(/,/g, '')) : null; };
  const normPostcode = (s) => { const m = (s || '').match(postcodeRe); return m ? `${m[1]} ${m[2]}`.toUpperCase() : ''; };

  // Strip marketing boilerplate so an address is left, not an og:title.
  function cleanAddress(s) {
    let a = clean(s);
    a = a.replace(/\s*[-|–]\s*(Rightmove|Zoopla|OnTheMarket|PrimeLocation|Auction House|SDL[^,]*|Allsop|Pugh[^,]*|Mark Jenkinson[^,]*|McHugh[^,]*)\s*$/i, '');
    a = a.replace(/^\s*(?:for sale|to let|sold|under offer)\s*[:\-]?\s*/i, '');
    a = a.replace(/^\s*\d+\s*(?:bed(?:room)?s?)?\s*(?:detached|semi-detached|semi|terraced|end[- ]terrace|mid[- ]terrace|link[- ]detached|town|end of terrace)?\s*(?:house|flat|apartment|maisonette|bungalow|cottage|studio|property|land|plot|home)?\s+(?:for sale|to let|to rent|for auction)\s+(?:in|at|on|,)\s+/i, '');
    a = a.replace(/\s*[-|–]\s*Property for sale.*$/i, '');
    a = a.replace(/\s+for sale\s*$/i, '');
    return clean(a);
  }

  function jsonLd() {
    const out = [];
    for (const s of qa('script[type="application/ld+json"]')) {
      try {
        const d = JSON.parse(s.textContent);
        Array.isArray(d) ? out.push(...d) : (d['@graph'] ? out.push(...d['@graph']) : out.push(d));
      } catch (e) { /* ignore malformed blocks */ }
    }
    return out;
  }

  function guessType(s) {
    const t = (s || '').toLowerCase();
    if (/\bdetached\b/.test(t) && !/semi-detached/.test(t)) return 'Detached house';
    if (/semi-detached/.test(t)) return 'Semi-detached house';
    if (/terrace/.test(t)) return 'Terraced house';
    if (/flat|apartment|maisonette/.test(t)) return 'Flat / Apartment';
    if (/bungalow/.test(t)) return 'Bungalow';
    if (/\bland\b|plot/.test(t)) return 'Land';
    if (/commercial|retail|office|industrial/.test(t)) return 'Commercial';
    return '';
  }

  function beds(s) { const m = (s || '').match(/(\d+)\s*bed/i); return m ? Number(m[1]) : null; }
  function auctionDate(s) {
    const m = (s || '').match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})/i)
      || (s || '').match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    return m ? m[0] : '';
  }

  // Site-specific address element, with generic fallbacks. Rightmove/Zoopla
  // render client-side; these selectors are the address heading, not the
  // marketing og:title. Multiple candidates so a markup change degrades, not breaks.
  function addressFromDom(siteHost) {
    const sels = [];
    if (/rightmove/.test(siteHost)) sels.push('h1[itemprop="streetAddress"]', 'article h1', 'h1');
    else if (/zoopla/.test(siteHost)) sels.push('[data-testid="address-label"]', '[data-testid="listing-details-address"]', 'h1');
    else sels.push('h1.address', '[class*="address" i] h1', 'h1'); // auction houses vary
    for (const sel of sels) {
      const el = q(sel);
      const t = clean(text(el));
      if (t && t.length > 4 && !/^for sale$/i.test(t)) return cleanAddress(t);
    }
    return '';
  }

  function collectMedia() {
    const imgs = new Set();
    for (const im of qa('img')) {
      const src = im.currentSrc || im.src || '';
      const big = (im.naturalWidth || im.width || 0) > 300;
      if (/\.(jpe?g|png|webp)(\?|$)/i.test(src) && big) imgs.add(abs(src));
    }
    const og = meta('og:image'); if (og) imgs.add(abs(og));
    let floorplan = '', epcImage = '';
    for (const im of qa('img')) {
      const s = `${im.alt || ''} ${im.src || ''}`;
      if (!floorplan && /floor.?plan/i.test(s)) floorplan = abs(im.currentSrc || im.src);
      if (!epcImage && /\bepc\b|energy.?(performance|rating|efficiency)/i.test(s)) epcImage = abs(im.currentSrc || im.src);
    }
    const pdfs = [];
    for (const a of qa('a[href]')) {
      const h = a.href || '';
      const label = clean(text(a));
      if (/\.pdf(\?|$)/i.test(h) || /legal.?pack|special.?condition|auction.?pack/i.test(label)) {
        pdfs.push({ url: abs(h), label: label.slice(0, 60) || 'PDF' });
      }
    }
    return { images: Array.from(imgs).slice(0, 24), floorplan, epcImage, pdfs: pdfs.slice(0, 8) };
  }

  // ---- property sources -------------------------------------------------
  function fromStructured() {
    const ld = jsonLd();
    const res = ld.find(d => /Residence|Apartment|House|Place|Product|Offer/i.test(d['@type'] || ''));
    let address = '', price = null, bedrooms = null, pc = '';
    if (res) {
      const a = res.address || (res.itemOffered && res.itemOffered.address);
      if (a && typeof a === 'object') {
        address = clean([a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(', '));
        pc = normPostcode(a.postalCode || '');
      }
      const offer = res.offers || res;
      if (offer && offer.price) price = Number(String(offer.price).replace(/[^\d.]/g, '')) || null;
      if (res.numberOfBedrooms || res.numberOfRooms) bedrooms = Number(res.numberOfBedrooms || res.numberOfRooms) || null;
    }
    return { address, price, bedrooms, pc };
  }

  // Best-effort listing agent/agency for relationship capture.
  function extractAgent() {
    const tel = q('a[href^="tel:"]');
    const phone = tel ? (tel.getAttribute('href') || '').replace(/^tel:/, '').trim() : firstMatch(phoneRe, bodyText);
    let name = '';
    const cand = q('[data-testid="agent-name"], [class*="agent-name" i], [class*="branch" i] h2, [data-testid*="agent" i] h2, [class*="agent" i] h3');
    if (cand) name = clean(text(cand));
    return { name, phone };
  }

  function property(source) {
    const s = fromStructured();
    const ogTitle = meta('og:title');
    const ogDesc = meta('og:description');
    // Address preference: site DOM heading → JSON-LD → cleaned og:title → cleaned h1.
    const address = addressFromDom(host) || s.address || cleanAddress(ogTitle) || cleanAddress(text(q('h1')));
    const price = s.price ?? (parsePrice(meta('product:price:amount')) || parsePrice(ogTitle) || parsePrice(bodyText));
    const bedrooms = s.bedrooms ?? (beds(ogTitle) || beds(ogDesc) || beds(bodyText));
    const pc = s.pc || normPostcode(address) || normPostcode(bodyText);
    return {
      kind: 'property',
      fields: {
        address,
        dealName: (address || '').split(',')[0].trim(),
        guidePrice: price,
        bedrooms,
        postcode: pc,
        propertyType: guessType(`${ogTitle} ${ogDesc} ${bodyText.slice(0, 4000)}`),
        auctionDate: auctionDate(bodyText),
        listingUrl: url,
        source,
      },
      media: collectMedia(),
      agent: extractAgent(),
    };
  }

  // ---- people / companies ----------------------------------------------
  function linkedin() {
    const name = clean(text(q('h1')));
    const headline = clean(text(q('.text-body-medium.break-words')) || meta('og:description'));
    let jobTitle = headline, company = '';
    const atM = headline.match(/^(.*?)\s+at\s+(.+?)$/i);
    if (atM) { jobTitle = clean(atM[1]); company = clean(atM[2]); }
    if (!company) {
      const exp = q('[aria-label="Current company"], [data-field="experience_company_logo"]');
      company = clean(text(exp));
    }
    return { kind: 'contact', fields: { name, jobTitle, company, email: '', phone: firstMatch(phoneRe, bodyText), linkedin: url.split('?')[0], role: '' } };
  }

  function companiesHouse() {
    const name = clean(text(q('h1')).replace(/\s*\(\d{6,8}\)\s*$/, ''));
    const number = clean(text(q('#company-number')) || (title.match(/\b(\d{6,8}|[A-Z]{2}\d{6})\b/) || [])[0] || '');
    let address = '';
    for (const dt of qa('dt')) {
      if (/registered office address/i.test(text(dt))) { address = clean(text(dt.nextElementSibling)); break; }
    }
    if (!address) address = clean(text(q('#company-registered-office-address')));
    return { kind: 'company', fields: { name, type: '', website: '', phone: '', city: '', companyNumber: number, registeredAddress: address, postcode: normPostcode(address) } };
  }

  function gmail() {
    const senderEl = q('.gD') || q('span[email]') || q('[data-hovercard-id]');
    const name = clean(senderEl ? (senderEl.getAttribute('name') || text(senderEl)) : '');
    const email = clean(senderEl ? (senderEl.getAttribute('email') || senderEl.getAttribute('data-hovercard-id') || firstMatch(emailRe, text(senderEl))) : firstMatch(emailRe, bodyText));
    const subject = clean(text(q('h2.hP')) || title.replace(/ - .*$/, ''));
    if (selection || !email) return { kind: 'generic', fields: { title: subject, note: selection, sourceUrl: url } };
    return { kind: 'contact', fields: { name, email, phone: firstMatch(phoneRe, bodyText), jobTitle: '', company: '', role: '', origin: 'Email', note: subject ? `Re: ${subject}` : '', linkedin: '' } };
  }

  function generic() {
    const s = fromStructured();
    if (s.price != null || s.pc || /property|for sale|to let|bedroom|guide price|auction/i.test(bodyText.slice(0, 3000))) {
      const address = addressFromDom(host) || s.address || cleanAddress(meta('og:title')) || cleanAddress(text(q('h1')));
      return {
        kind: 'property',
        fields: { address, dealName: (address || '').split(',')[0].trim(), guidePrice: s.price, bedrooms: s.bedrooms, postcode: s.pc || normPostcode(address), propertyType: guessType(bodyText.slice(0, 4000)), auctionDate: auctionDate(bodyText), listingUrl: url, source: host },
        media: collectMedia(),
      };
    }
    return {
      kind: 'company',
      fields: {
        name: clean(meta('og:site_name') || text(q('h1')) || title),
        website: `${location.protocol}//${location.hostname}`,
        phone: firstMatch(phoneRe, bodyText),
        type: '', city: '', companyNumber: '', registeredAddress: '', postcode: '',
        email: firstMatch(emailRe, bodyText),
      },
    };
  }

  // ---- dispatch ---------------------------------------------------------
  let result;
  if (/rightmove\.co\.uk$/.test(host)) result = property('Rightmove');
  else if (/zoopla\.co\.uk$/.test(host)) result = property('Zoopla');
  else if (/(auctionhouse\.co\.uk|sdlauctions\.co\.uk|markjenkinson\.co\.uk|pugh-auctions\.com|allsop\.co\.uk|mchughandco\.com)$/.test(host)) result = property('Auction');
  else if (/linkedin\.com$/.test(host)) result = linkedin();
  else if (/company-information\.service\.gov\.uk$/.test(host)) result = companiesHouse();
  else if (/mail\.google\.com$/.test(host)) result = gmail();
  else result = generic();

  return Object.assign({ selection, url, title, host }, result);
}
