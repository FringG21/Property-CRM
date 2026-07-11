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
  parseAuctionEnd,
  parsePastAuctionPage,
  parseSitemapRegions,
  MI_KNOWN_REGIONS,
} from './marketIntel.js';

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
  const { lots, totalPages } = parsePastAuctionPage('<html><body>maintenance</body></html>');
  assert.equal(lots.length, 0);
  assert.equal(totalPages, 1);
});

// --- branch discovery ------------------------------------------------------

test('parseSitemapRegions extracts only past-auctions slugs', () => {
  const xml = `<loc>https://www.auctionhouse.co.uk/southyorkshire/auction/past-auctions</loc>
    <loc>https://www.auctionhouse.co.uk/london/auction/past-auctions</loc>
    <loc>https://www.auctionhouse.co.uk/london/company/about-us</loc>`;
  assert.deepEqual(parseSitemapRegions(xml).sort(), ['london', 'southyorkshire']);
  assert.equal(MI_KNOWN_REGIONS.length, 23);
});
