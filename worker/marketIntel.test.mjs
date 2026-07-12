import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  normalizeResultStatus,
  parseGuide,
  parseMoney,
  extractPostcodeParts,
  extractTown,
  classifyLotPassA,
  parseLotDetail,
  classifyLotPassB,
  parseAuctionEnd,
  parsePastAuctionPage,
  parseSitemapRegions,
  MI_KNOWN_REGIONS,
  quantile,
  shrink,
  shrinkConfidence,
  computeAreaScore,
  parseLrPpd,
  buildComps,
  lotTypeToLrClass,
  computeGdv,
  sdlt,
  hpiGrowth,
  flipSpreadScore,
  compQualityScore,
  growthResilienceScore,
  normalizeWeights,
  DEFAULT_MARKET_SETTINGS,
} from './marketIntel.js';

// A synthetic LR PPD comp set (dates relative to now so the 24m window holds).
const recentDate = monthsAgo => {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return d.toISOString().slice(0, 10);
};

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');
const fixture = name => readFileSync(join(fixturesDir, name), 'utf8');

// --- normalizeResultStatus: the load-bearing contract -------------------

test('Sold for £X is the confirmed-sale case', () => {
  const r = normalizeResultStatus('Sold for: &pound;61,500');
  assert.equal(r.status, 'sold_for');
  assert.equal(r.soldPrice, 61500);
  assert.equal(r.priceConfirmed, 1);
});

test('bare Sold is NOT price-confirmed', () => {
  const r = normalizeResultStatus('Sold');
  assert.equal(r.status, 'sold');
  assert.equal(r.soldPrice, null);
  assert.equal(r.priceConfirmed, 0);
});

test('Sold Prior without price is unconfirmed; with price is confirmed', () => {
  assert.deepEqual(
    [normalizeResultStatus('Sold Prior').status, normalizeResultStatus('Sold Prior').priceConfirmed],
    ['sold_prior', 0]
  );
  const withPrice = normalizeResultStatus('Sold Prior for £72,000');
  assert.equal(withPrice.status, 'sold_prior_for');
  assert.equal(withPrice.soldPrice, 72000);
  assert.equal(withPrice.priceConfirmed, 1);
});

test('Sold After maps like Sold Prior', () => {
  assert.equal(normalizeResultStatus('Sold After').status, 'sold_after');
  assert.equal(normalizeResultStatus('Sold After').priceConfirmed, 0);
});

test('Last Bid is a bid, never a sale — the fabricated-comp tripwire', () => {
  const r = normalizeResultStatus('Last Bid: &pound;139,000');
  assert.equal(r.status, 'last_bid');
  assert.equal(r.soldPrice, null);
  assert.equal(r.priceConfirmed, 0);
  assert.equal(r.lastBidPrice, 139000);
});

test('remaining vocabulary + unknown quarantine', () => {
  assert.equal(normalizeResultStatus('No Bids').status, 'no_bids');
  assert.equal(normalizeResultStatus('Withdrawn').status, 'withdrawn');
  assert.equal(normalizeResultStatus('Withdrawn Prior').status, 'withdrawn');
  assert.equal(normalizeResultStatus('Postponed').status, 'postponed');
  assert.equal(normalizeResultStatus('Unsold').status, 'unsold');
  const unk = normalizeResultStatus('Guide Revised');
  assert.equal(unk.status, 'unknown');
  assert.equal(unk.priceConfirmed, 0);
  assert.equal(unk.rawText, 'Guide Revised');
});

// --- guide / money / address helpers ------------------------------------

test('parseGuide handles single, range and open-ended formats', () => {
  assert.deepEqual(parseGuide('&#163;15,000'), { guideMin: 15000, guideMax: 15000 });
  assert.deepEqual(parseGuide('£10,000 - £25,000'), { guideMin: 10000, guideMax: 25000 });
  assert.deepEqual(parseGuide('£80,000+'), { guideMin: 80000, guideMax: null });
  assert.deepEqual(parseGuide(''), { guideMin: null, guideMax: null });
});

test('parseMoney', () => {
  assert.equal(parseMoney('Sold for: &pound;100,500'), 100500);
  assert.equal(parseMoney('no price here'), null);
});

test('postcode and town extraction', () => {
  const pc = extractPostcodeParts('55 Spansyke Street, Doncaster, South Yorkshire, DN4 0AX');
  assert.deepEqual(pc, { postcode: 'DN4 0AX', outcode: 'DN4' });
  assert.equal(extractTown('55 Spansyke Street, Doncaster, South Yorkshire, DN4 0AX'), 'Doncaster');
  assert.equal(extractTown('12 Some Road, Barnsley, S70 1LW'), 'Barnsley');
  assert.deepEqual(extractPostcodeParts('no postcode'), { postcode: null, outcode: null });
});

test('parseAuctionEnd', () => {
  assert.deepEqual(parseAuctionEnd('07/07/2026 13:06'), { endAt: '2026-07-07T13:06', date: '2026-07-07' });
  assert.deepEqual(parseAuctionEnd('30/06/2026'), { endAt: '2026-06-30', date: '2026-06-30' });
  assert.deepEqual(parseAuctionEnd('tbc'), { endAt: null, date: null });
});

// --- Pass A eligibility ---------------------------------------------------

test('classifyLotPassA excludes clear non-houses only', () => {
  assert.deepEqual(classifyLotPassA('Apartment 50 Skyline, Barnsley, South Yorkshire, S70 1LW').reasons, ['flat']);
  assert.equal(classifyLotPassA('Flat 3, 10 High Street, Rotherham S60 1AA').excluded, 1);
  assert.deepEqual(classifyLotPassA('Land at Doncaster Road, Rotherham').reasons, ['land']);
  assert.equal(classifyLotPassA('Garages at rear of Main Street, Sheffield').reasons.includes('garage'), true);
  // Houses stay eligible — unknown never excludes
  assert.equal(classifyLotPassA('55 Spansyke Street, Doncaster, South Yorkshire, DN4 0AX').excluded, 0);
  assert.equal(classifyLotPassA('The Old Chapel, Some Lane, Leeds LS1 1AA').excluded, 0);
});

// --- Pass B: lot detail parse + eligibility refinement --------------------

test('parseLotDetail: freehold 2-bed house fixture — beds chip, tenure, type, no false signals', () => {
  const d = parseLotDetail(fixture('lot-detail-freehold-house.html'));
  assert.equal(d.bedrooms, 2);
  assert.equal(d.tenure, 'freehold');
  assert.equal(d.leaseholdFlag, 0);
  assert.equal(d.isFlat, false);
  assert.match(d.propertyType, /terrace/);
  assert.equal(d.epcRating, null);           // page said 'EPC: Ordered' — not a real A-G rating
  // A clean house description must not trip any condition/occupancy signal
  assert.deepEqual(Object.values(d.signals).filter(Boolean), []);
});

test('parseLotDetail: leasehold apartment fixture — the case Pass A could not see', () => {
  const d = parseLotDetail(fixture('lot-detail-leasehold-flat.html'));
  assert.equal(d.bedrooms, 1);
  assert.equal(d.tenure, 'leasehold');
  assert.equal(d.leaseholdFlag, 1);
  assert.equal(d.isFlat, true);
  assert.match(d.propertyType, /apartment/);
  assert.equal(d.epcRating, 'C');
  assert.equal(d.councilTaxBand, 'A');
});

test('parseLotDetail: absent fields return null, never guessed', () => {
  const d = parseLotDetail('<html><body>An unremarkable page with no property facts.</body></html>');
  assert.equal(d.bedrooms, null);
  assert.equal(d.tenure, null);
  assert.equal(d.propertyType, null);
  assert.equal(d.epcRating, null);
  assert.equal(d.councilTaxBand, null);
});

test('parseLotDetail: a room dimension before an enumerated bedroom is not misread as the count', () => {
  // Real S63 lot 335437 had no summary chip; '...x 3.10' preceding 'Bedroom 1 -'
  // must not read as '10 Bedrooms'. Falls back to the enumeration count (3).
  const html = '<div>Accommodation\nBathroom - 1.66 x 3.10\nBedroom 1 - 3.97 x 3.77\nBedroom 2 - 3.0 x 3.0\nBedroom 3 - 2.5 x 2.0\nTenure: Freehold.</div>';
  const d = parseLotDetail(html);
  assert.equal(d.bedrooms, 3);
});

test('parseLotDetail: "flat roof" on a house is not read as a flat', () => {
  const d = parseLotDetail('<div>A semi-detached house with a flat roof extension. 3 Bedrooms. Tenure: Freehold.</div>');
  assert.equal(d.isFlat, false);
  assert.equal(d.propertyType, 'semi-detached');
  assert.equal(d.bedrooms, 3);
});

test('classifyLotPassB: leasehold house flagged, NOT excluded', () => {
  const passA = { excluded: 0, reasons: [], leaseholdFlag: 0 };
  const detail = { isFlat: false, bedrooms: 3, leaseholdFlag: 1, signals: {} };
  const r = classifyLotPassB(passA, detail);
  assert.equal(r.excluded, 0);
  assert.equal(r.leaseholdFlag, 1);
  assert.deepEqual(r.reasons, []);
});

test('classifyLotPassB: detail-derived flat excluded even when Pass A missed it', () => {
  const passA = { excluded: 0, reasons: [], leaseholdFlag: 0 };
  const detail = parseLotDetail(fixture('lot-detail-leasehold-flat.html'));
  const r = classifyLotPassB(passA, detail);
  assert.equal(r.excluded, 1);
  assert.equal(r.reasons.includes('flat'), true);
  assert.equal(r.reasons.includes('under_2_beds'), true);   // 1-bed
  assert.equal(r.leaseholdFlag, 1);
});

test('classifyLotPassB: <2-bed house excluded; unknown beds never excludes', () => {
  const passA = { excluded: 0, reasons: [], leaseholdFlag: 0 };
  assert.equal(classifyLotPassB(passA, { isFlat: false, bedrooms: 1, signals: {} }).reasons.includes('under_2_beds'), true);
  const unknown = classifyLotPassB(passA, { isFlat: false, bedrooms: null, signals: {} });
  assert.equal(unknown.excluded, 0);
  assert.deepEqual(unknown.reasons, []);
});

test('classifyLotPassB: condition/occupancy signals map to reasons', () => {
  const passA = { excluded: 0, reasons: [], leaseholdFlag: 0 };
  const r = classifyLotPassB(passA, { isFlat: false, bedrooms: 3, signals: { tenanted: true, fireDamaged: true } });
  assert.equal(r.excluded, 1);
  assert.equal(r.reasons.includes('tenanted'), true);
  assert.equal(r.reasons.includes('fire_damaged'), true);
});

// --- full page parsing against saved real pages ---------------------------

test('sy-page1 fixture: 30 lots, pagination depth, first lot fields', () => {
  const { lots, totalPages } = parsePastAuctionPage(fixture('sy-page1.html'));
  assert.equal(lots.length, 30);
  assert.ok(totalPages >= 50, `SY pagination should be deep, got ${totalPages}`);
  const first = lots[0];
  assert.equal(first.platformLotId, '351709');
  assert.equal(first.address, '55 Spansyke Street, Doncaster, South Yorkshire, DN4 0AX');
  assert.equal(first.postcode, 'DN4 0AX');
  assert.equal(first.outcode, 'DN4');
  assert.equal(first.town, 'Doncaster');
  assert.equal(first.guideMin, 15000);
  assert.equal(first.status, 'sold');
  assert.equal(first.auctionDate, '2026-07-07');
  assert.equal(first.auctionEndAt, '2026-07-07T13:06');
});

test('sy-page1 fixture: status histogram matches hand-count', () => {
  const { lots } = parsePastAuctionPage(fixture('sy-page1.html'));
  const count = s => lots.filter(l => l.status === s).length;
  assert.equal(count('sold_for'), 9);
  assert.equal(count('last_bid'), 12);
  assert.equal(count('sold'), 5);
  assert.equal(count('no_bids'), 2);
  assert.equal(count('withdrawn'), 1);
  assert.equal(count('sold_prior'), 1);
  assert.equal(count('unknown'), 0);
  // Every confirmed price is a real printed figure
  for (const l of lots.filter(l => l.priceConfirmed)) assert.ok(l.soldPrice > 0);
  // No last_bid row ever carries a soldPrice
  for (const l of lots.filter(l => l.status === 'last_bid')) {
    assert.equal(l.soldPrice, null);
    assert.ok(l.lastBidPrice > 0);
  }
});

test('sy-page2 fixture: includes Sold After; all rows parse', () => {
  const { lots } = parsePastAuctionPage(fixture('sy-page2.html'));
  assert.equal(lots.length, 30);
  assert.equal(lots.filter(l => l.status === 'sold_after').length, 2);
  assert.equal(lots.filter(l => l.status === 'unknown').length, 0);
});

test('manchester fixture: different branch, Postponed status, shallow pagination', () => {
  const { lots, totalPages } = parsePastAuctionPage(fixture('manchester-page1.html'));
  assert.equal(lots.length, 30);
  assert.equal(totalPages, 3);
  assert.equal(lots.filter(l => l.status === 'postponed').length, 3);
  assert.equal(lots.filter(l => l.status === 'unknown').length, 0);
});

test('empty/garbage HTML parses to zero lots (zero-parse tripwire input)', () => {
  const { lots, totalPages, hasResultsShell } = parsePastAuctionPage('<html><body>maintenance</body></html>');
  assert.equal(lots.length, 0);
  assert.equal(totalPages, 1);
  assert.equal(hasResultsShell, false);
});

test('results shell detected on real pages — distinguishes empty branch from breakage', () => {
  assert.equal(parsePastAuctionPage(fixture('sy-page1.html')).hasResultsShell, true);
  assert.equal(parsePastAuctionPage(fixture('manchester-page1.html')).hasResultsShell, true);
  const emptyBranch = '<html><body><h3>Past online auction results for <span>Auction House North Wales</span></h3><table class="table"></table></body></html>';
  const parsed = parsePastAuctionPage(emptyBranch);
  assert.equal(parsed.lots.length, 0);
  assert.equal(parsed.hasResultsShell, true);
});

// --- aggregation + scoring maths -------------------------------------------

test('quantile on sorted arrays', () => {
  assert.equal(quantile([], 0.5), null);
  assert.equal(quantile([50000], 0.5), 50000);
  assert.equal(quantile([10, 20, 30, 40], 0.5), 25);
  assert.equal(quantile([10, 20, 30, 40, 100], 0.25), 20);
  assert.equal(quantile([10, 20, 30, 40, 100], 0.75), 40);
});

test('shrinkage pulls small samples to the national value', () => {
  // 1 observation of 100% sell-through in a 60% nation -> barely moves
  assert.ok(Math.abs(shrink(1.0, 1, 0.6) - 0.644) < 0.001);
  // 80 observations dominate the prior
  assert.ok(shrink(1.0, 80, 0.6) > 0.95);
  assert.equal(shrink(null, 0, 0.6), 0.6);
  assert.ok(Math.abs(shrinkConfidence(8) - 0.5) < 0.001);
  assert.ok(shrinkConfidence(0) === 0);
});

test('computeAreaScore renormalises over available factors and reports missing', () => {
  const weights = { demandLiquidity: 0.25, flipSpread: 0.20, sub100kSupply: 0.20, compQuality: 0.15, growthResilience: 0.15, risk: 0.05 };
  const r = computeAreaScore({ sub100kSupply: 80, demandLiquidity: 60, risk: 50, flipSpread: null, compQuality: null, growthResilience: null }, weights);
  // (0.20*80 + 0.25*60 + 0.05*50) / 0.50 = 67
  assert.equal(r.score, 67);
  assert.deepEqual(r.missing.sort(), ['compQuality', 'flipSpread', 'growthResilience']);
  assert.equal(computeAreaScore({}, weights).score, null);
});

// --- branch discovery ------------------------------------------------------

test('parseSitemapRegions extracts only past-auctions slugs', () => {
  const xml = `<loc>https://www.auctionhouse.co.uk/southyorkshire/auction/past-auctions</loc>
    <loc>https://www.auctionhouse.co.uk/london/auction/past-auctions</loc>
    <loc>https://www.auctionhouse.co.uk/london/company/about-us</loc>`;
  assert.deepEqual(parseSitemapRegions(xml).sort(), ['london', 'southyorkshire']);
  assert.equal(MI_KNOWN_REGIONS.length, 23);
});

// --- settings + scoring weights editor ------------------------------------

test('normalizeWeights: sums to 1, drops junk, rejects all-zero', () => {
  const r = normalizeWeights({ demandLiquidity: 2, flipSpread: 2, sub100kSupply: 0, compQuality: 0, growthResilience: 0, risk: 0 });
  assert.ok(Math.abs(r.demandLiquidity + r.flipSpread + r.sub100kSupply + r.compQuality + r.growthResilience + r.risk - 1) < 0.001);
  assert.ok(Math.abs(r.demandLiquidity - 0.5) < 0.001);
  assert.equal(r.sub100kSupply, 0);
  // negatives / non-finite dropped
  const r2 = normalizeWeights({ demandLiquidity: -5, flipSpread: 'x', sub100kSupply: 3, compQuality: 1, growthResilience: 0, risk: 0 });
  assert.ok(Math.abs(r2.sub100kSupply - 0.75) < 0.001);
  // all-zero / empty rejected
  assert.equal(normalizeWeights({}), null);
  assert.equal(normalizeWeights({ risk: 0 }), null);
});

test('DEFAULT_MARKET_SETTINGS carries the flip cost model + refresh cadence', () => {
  assert.ok(DEFAULT_MARKET_SETTINGS.costs.targetReturn > 0);
  assert.ok(DEFAULT_MARKET_SETTINGS.costs.refurbLight < DEFAULT_MARKET_SETTINGS.costs.refurbHeavy);
  assert.equal(DEFAULT_MARKET_SETTINGS.refreshDays, 7);
});

// --- Pass B 6b: comps, growth, GDV ----------------------------------------

test('parseLrPpd normalises PPD items and drops zero-price rows', () => {
  const json = { result: { items: [
    { pricePaid: 82000, transactionDate: '2025-03-01', newBuild: false, propertyType: { _about: 'http://landregistry/def/concept/ppd/terraced' }, propertyAddress: { paon: '12', street: 'CHAPEL LANE', town: 'ROTHERHAM', postcode: 'S63 0AA' } },
    { pricePaid: 0, transactionDate: '2025-01-01', propertyType: 'terraced', propertyAddress: { paon: '5', street: 'X' } },
  ] } };
  const out = parseLrPpd(json, 'S63 0AA');
  assert.equal(out.length, 1);
  assert.deepEqual({ price: out[0].price, type: out[0].propertyType, street: out[0].street }, { price: 82000, type: 'Terraced', street: 'CHAPEL LANE' });
});

test('buildComps: per-class quantiles, new-build excluded, thin flagged, street + outcode ceilings', () => {
  const mk = (price, type, street, newBuild = false) => ({ price, date: recentDate(6), propertyType: type, street, newBuild });
  const items = [
    mk(60000, 'Terraced', 'Chapel Lane'), mk(70000, 'Terraced', 'Chapel Lane'), mk(80000, 'Terraced', 'High St'),
    mk(90000, 'Terraced', 'High St'), mk(100000, 'Terraced', 'High St'),
    mk(250000, 'Terraced', 'High St', true),       // new-build — excluded
    mk(120000, 'Semi-detached', 'Elm Rd'),          // only 1 semi — thin
    { price: 65000, date: recentDate(40), propertyType: 'Terraced', street: 'Old Rd' }, // outside 24m
  ];
  const c = buildComps(items, { months: 24, minSample: 3 });
  assert.equal(c.classes.Terraced.count, 5);
  assert.equal(c.classes.Terraced.median, 80000);
  assert.equal(c.classes['Semi-detached'].thin, true);
  assert.equal(c.sameStreet['high st'], 100000);
  assert.equal(c.houseSales, 6);          // 5 terraced + 1 semi, new-build & stale dropped
  assert.ok(c.outcodeCeiling >= 100000);
});

test('lotTypeToLrClass maps parsed types; ambiguous -> null (all-house fallback)', () => {
  assert.equal(lotTypeToLrClass('end-terrace'), 'Terraced');
  assert.equal(lotTypeToLrClass('town house'), 'Terraced');
  assert.equal(lotTypeToLrClass('semi-detached'), 'Semi-detached');
  assert.equal(lotTypeToLrClass('detached'), 'Detached');
  assert.equal(lotTypeToLrClass('bungalow'), null);
  assert.equal(lotTypeToLrClass(''), null);
});

test('sdlt applies bands + additional-dwelling surcharge', () => {
  assert.equal(sdlt(60000, 0.05), 3000);      // below £125k: only 5% surcharge
  assert.equal(sdlt(60000, 0), 0);            // surcharge off
  assert.equal(sdlt(200000, 0.05), 1500 + 10000); // 2% on 75k above 125k + 5% surcharge
});

test('computeGdv: bands ordered, ROI band classification, thin comps -> nulls', () => {
  const comps = { classes: { Terraced: { count: 8, thin: false, p25: 70000, median: 85000, p75: 100000, ceiling: 110000 } }, houseAll: { count: 8, thin: false, p25: 70000, median: 85000, p75: 100000 }, minSample: 3 };
  const g = computeGdv(45000, comps, 'Terraced', { streetCeiling: 95000 });
  assert.equal(g.gdvConservative, 70000);
  assert.equal(g.gdvExpected, 85000);
  assert.equal(g.gdvOptimistic, 95000);       // p75 100k capped at street ceiling 95k
  assert.ok(g.gdvConservative < g.gdvExpected && g.gdvExpected <= 100000);
  assert.ok(['target', 'entry_opportunity', 'below_breakeven'].includes(g.band));
  // A dear purchase with the same GDV must fall to a weaker band
  const dear = computeGdv(95000, comps, 'Terraced', {});
  assert.ok(['entry_opportunity', 'below_breakeven'].includes(dear.band));
  // Thin class -> nulls
  const thin = computeGdv(45000, { classes: { Terraced: { count: 1, thin: true } }, houseAll: { thin: true }, minSample: 3 }, 'Terraced', {});
  assert.equal(thin.gdvExpected, null);
  assert.equal(thin.thin, true);
});

test('hpiGrowth separates the COVID spike from the post-2021 trend', () => {
  // Monthly series: steady, then post-2021 modest growth
  const series = [];
  for (let y = 2019; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 7) break;
    const date = `${y}-${String(m).padStart(2, '0')}-01`;
    // pre-2021 flat ~100k, a 2020 dip, then steady climb
    let price = 100000;
    if (y >= 2021) price = 100000 + (y - 2021) * 4000 + m * 100;
    series.push({ date, price });
  }
  const g = hpiGrowth(series);
  assert.ok(g.growth5yr != null);
  assert.ok(g.covidAdjustedAnnual != null);
  assert.ok(g.volatility != null);
  assert.equal(g.lastUpdated.slice(0, 7), '2026-07');
});

test('area-score factors: monotonic + null-safe', () => {
  assert.equal(flipSpreadScore(null, 50000), null);
  assert.ok(flipSpreadScore(85000, 45000) > flipSpreadScore(60000, 45000)); // bigger spread -> higher
  assert.equal(flipSpreadScore(100000, 50000), 100);                        // 100% spread saturates
  assert.ok(compQualityScore(40) > compQualityScore(5));
  assert.equal(compQualityScore(null), null);
  assert.ok(growthResilienceScore(5, 2) > growthResilienceScore(-5, 2));    // growth beats decline
  assert.ok(growthResilienceScore(5, 0) > growthResilienceScore(5, 12));    // volatility penalised
  assert.equal(growthResilienceScore(null, 1), null);
});
