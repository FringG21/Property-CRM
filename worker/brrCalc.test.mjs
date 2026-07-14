import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BRR_CALC_VERSION,
  brrSdlt,
  mortgagePayment,
  normaliseOpexItem,
  computeBrr,
  seedBrr,
  migrateBrrShape,
  resolveScenario,
  createScenario,
  duplicateScenario,
  renameScenario,
  deleteScenario,
  setActiveScenario,
  toggleLock,
  toggleArchive,
  setScenarioOverride,
  appendAudit,
  DEFAULT_BRR_RULES,
} from './brrCalc.js';

// Baseline worked example (docs/brr/08-testing.md):
// hammer £90,000 · premium 2.4% · admin £1,200 · legal £1,500 · survey £600 ·
// refurb £25,000 · contingency 10% · holding £2,400 · end value £150,000 ·
// LTV 75% · rate 5.5% io · term 25 · rent £850 · void 8% · mgmt 10% ·
// maintenance 8% · insurance £250/yr.
const makeInputs = (overrides = {}) => ({
  hammer: 90000,
  buyersPremiumPct: 2.4,
  adminFee: 1200,
  legalFees: 1500,
  surveyCost: 600,
  otherBuyingCosts: 0,
  refurbBudget: 25000,
  contingencyPct: 10,
  holdingCost: 2400,
  selectedEndValue: 150000,
  currentValue: null,
  mortgage: { ltvPct: 75, ratePct: 5.5, type: 'io', termYears: 25, maxMortgageOverride: null, stressRatePct: 7.5 },
  grossMonthlyRent: 850,
  opex: {
    voidPct: 8, managementPct: 10,
    maintenance: { mode: 'pct', value: 8 },
    insurance: { mode: 'annual', value: 250 },
    serviceCharge: { mode: 'annual', value: 0 },
    groundRent: { mode: 'annual', value: 0 },
    licensing: { mode: 'annual', value: 0 },
    compliance: { mode: 'annual', value: 0 },
    utilities: { mode: 'annual', value: 0 },
    councilTax: { mode: 'annual', value: 0 },
    cleaning: { mode: 'annual', value: 0 },
    gardening: { mode: 'annual', value: 0 },
    otherMonthly: 0, otherAnnual: 0,
  },
  ...overrides,
  mortgage: { ltvPct: 75, ratePct: 5.5, type: 'io', termYears: 25, maxMortgageOverride: null, stressRatePct: 7.5, ...(overrides.mortgage || {}) },
  opex: {
    voidPct: 8, managementPct: 10,
    maintenance: { mode: 'pct', value: 8 },
    insurance: { mode: 'annual', value: 250 },
    serviceCharge: { mode: 'annual', value: 0 },
    groundRent: { mode: 'annual', value: 0 },
    licensing: { mode: 'annual', value: 0 },
    compliance: { mode: 'annual', value: 0 },
    utilities: { mode: 'annual', value: 0 },
    councilTax: { mode: 'annual', value: 0 },
    cleaning: { mode: 'annual', value: 0 },
    gardening: { mode: 'annual', value: 0 },
    otherMonthly: 0, otherAnnual: 0,
    ...(overrides.opex || {}),
  },
});

// --- Suite 1 — SDLT (brrSdlt) -------------------------------------------

test('SDLT: known additional-rate values', () => {
  assert.equal(brrSdlt(90000, true), 4500);
  assert.equal(brrSdlt(250000, true), 12500);
  assert.equal(brrSdlt(300000, true), 17500);
  assert.equal(brrSdlt(1000000, true), 91250);
});

test('SDLT: threshold boundaries use marginal banding, no cliff', () => {
  const a = brrSdlt(249999, true);
  const b = brrSdlt(250000, true);
  const c = brrSdlt(250001, true);
  assert.ok(Math.abs(b - a) <= 1);
  assert.ok(Math.abs(c - b) <= 1);

  const d = brrSdlt(924999, true);
  const e = brrSdlt(925000, true);
  const f = brrSdlt(925001, true);
  assert.equal(e, 80000);
  assert.ok(Math.abs(e - d) <= 1);
  assert.ok(Math.abs(f - e) <= 1);

  const g = brrSdlt(1499999, true);
  const h = brrSdlt(1500000, true);
  const i = brrSdlt(1500001, true);
  assert.equal(h, 166250);
  assert.ok(Math.abs(h - g) <= 1);
  assert.ok(Math.abs(i - h) <= 1);
});

test('SDLT: zero/negative price returns 0', () => {
  assert.equal(brrSdlt(0, true), 0);
  assert.equal(brrSdlt(-500, true), 0);
});

test('SDLT: standard-rate variant', () => {
  assert.equal(brrSdlt(300000, false), 2500);
});

test('SDLT: bands and rates are pinned', () => {
  // Fails loudly if bands/rates in brrSdlt are edited without updating this pin.
  assert.equal(brrSdlt(250000, true), 12500);
  assert.equal(brrSdlt(925000, true), 80000);
  assert.equal(brrSdlt(1500000, true), 166250);
});

// --- Suite 2 — Buying costs & total cash invested -----------------------

test('Buying costs: percentage premium + fixed fees + SDLT sum, baseline exact', () => {
  const out = computeBrr(makeInputs());
  assert.equal(out.buyersPremium, 90000 * 0.024);
  assert.equal(out.sdlt, 4500);
  assert.equal(out.totalBuyingCosts, 4500 + 2160 + 1200 + 1500 + 600);
});

test('Buying costs: fixed-fee-only case (premium 0%)', () => {
  const out = computeBrr(makeInputs({ buyersPremiumPct: 0 }));
  assert.equal(out.buyersPremium, 0);
  assert.equal(out.totalBuyingCosts, 4500 + 1200 + 1500 + 600);
});

test('Buying costs: missing costs default 0, no NaN', () => {
  const out = computeBrr(makeInputs({ adminFee: undefined, legalFees: undefined, surveyCost: undefined, otherBuyingCosts: undefined }));
  assert.ok(!Number.isNaN(out.totalBuyingCosts));
});

test('Total cash invested: baseline exact number', () => {
  const out = computeBrr(makeInputs());
  assert.equal(out.totalCashInvested, 129860);
});

test('Total cash invested: zero hammer blocked path, no NaN anywhere', () => {
  const out = computeBrr(makeInputs({ hammer: 0 }));
  for (const [key, value] of Object.entries(out)) {
    if (typeof value === 'number') assert.ok(!Number.isNaN(value), `${key} is NaN`);
  }
});

// --- Suite 3 — Refinance, cash returned, recycling, equity ---------------

test('Refinance: grossMortgage = endValue × LTV', () => {
  const out = computeBrr(makeInputs());
  assert.equal(out.grossMortgage, 150000 * 0.75);
  assert.equal(out.finalMortgage, 112500);
});

test('Refinance: maxMortgageOverride caps below and is ignored above', () => {
  const below = computeBrr(makeInputs({ mortgage: { maxMortgageOverride: 100000 } }));
  assert.equal(below.finalMortgage, 100000);
  const above = computeBrr(makeInputs({ mortgage: { maxMortgageOverride: 120000 } }));
  assert.equal(above.finalMortgage, 112500);
});

test('Refinance: netCashReturned === finalMortgage (no fee deduction)', () => {
  const out = computeBrr(makeInputs());
  assert.equal(out.netCashReturned, out.finalMortgage);
});

test('Cash left in: positive, zero, negative (surplus) paths', () => {
  const positive = computeBrr(makeInputs());
  assert.equal(positive.cashLeftIn, 129860 - 112500);
  assert.ok(positive.surplusExtracted === 0);

  const zero = computeBrr(makeInputs({ selectedEndValue: 129860 / 0.75 }));
  assert.ok(Math.abs(zero.cashLeftIn) < 1);

  const negative = computeBrr(makeInputs({ selectedEndValue: 500000 }));
  assert.ok(negative.cashLeftIn < 0);
  assert.equal(negative.surplusExtracted, Math.abs(negative.cashLeftIn));
  assert.match(negative.cashLeftInDisplay, /Surplus cash extracted/);
});

test('Capital recycled: amount = min(returned, invested); >100% path keeps raw pct', () => {
  const out = computeBrr(makeInputs());
  assert.equal(out.capitalRecycledAmount, Math.min(112500, 129860));

  const surplus = computeBrr(makeInputs({ selectedEndValue: 500000 }));
  assert.ok(surplus.capitalRecycledPct > 100);
});

test('Equity: retained/pct, created, loan-to-cost', () => {
  const out = computeBrr(makeInputs());
  assert.equal(out.equityRetained, 150000 - 112500);
  assert.equal(out.equityRetainedPct, (37500 / 150000) * 100);
  assert.equal(out.equityCreated, 150000 - 129860);
  assert.equal(out.loanToCostPct, (112500 / 129860) * 100);
});

test('Equity: zero end value gives nulls + notes, no throw', () => {
  const out = computeBrr(makeInputs({ selectedEndValue: 0 }));
  assert.equal(out.equityRetainedPct, null);
  assert.equal(out.grossYieldOnEndValue, null);
  assert.ok(out.metricNotes.grossYieldOnEndValue);
});

test('LTV 0 or > 100 raises W-BADLTV', () => {
  const zero = computeBrr(makeInputs({ mortgage: { ltvPct: 0 } }));
  assert.ok(zero.warnings.some(w => w.code === 'W-BADLTV'));
  const over = computeBrr(makeInputs({ mortgage: { ltvPct: 120 } }));
  assert.ok(over.warnings.some(w => w.code === 'W-BADLTV'));
});

// --- Suite 4 — Mortgage payments -----------------------------------------

test('Mortgage: interest-only baseline (penny precision)', () => {
  const r = mortgagePayment({ principal: 112500, annualRatePct: 5.5, type: 'io', termYears: 25 });
  assert.equal(r.monthly, 515.63);
  assert.equal(r.annual, Math.round(r.monthly * 12 * 100) / 100);
});

test('Mortgage: repayment baseline (standard amortisation, ±1p)', () => {
  const r = mortgagePayment({ principal: 112500, annualRatePct: 5.5, type: 'repayment', termYears: 25 });
  // Reference: standard amortisation formula computed independently.
  const rr = 5.5 / 100 / 12;
  const n = 25 * 12;
  const factor = Math.pow(1 + rr, n);
  const expected = 112500 * rr * factor / (factor - 1);
  assert.ok(Math.abs(r.monthly - expected) <= 0.01);
});

test('Mortgage: zero rate — io returns 0 with warning, repayment returns principal/n', () => {
  const io = mortgagePayment({ principal: 112500, annualRatePct: 0, type: 'io', termYears: 25 });
  assert.equal(io.monthly, 0);
  const out = computeBrr(makeInputs({ mortgage: { ratePct: 0, type: 'io' } }));
  assert.ok(out.warnings.some(w => w.code === 'W-ZERORATE'));

  const repayment = mortgagePayment({ principal: 112500, annualRatePct: 0, type: 'repayment', termYears: 25 });
  assert.equal(repayment.monthly, Math.round((112500 / 300) * 100) / 100);
});

test('Mortgage: invalid term blocked for repayment, ignored for io', () => {
  assert.equal(mortgagePayment({ principal: 112500, annualRatePct: 5.5, type: 'repayment', termYears: 0 }), null);
  assert.equal(mortgagePayment({ principal: 112500, annualRatePct: 5.5, type: 'repayment', termYears: -5 }), null);
  assert.equal(mortgagePayment({ principal: 112500, annualRatePct: 5.5, type: 'repayment', termYears: 12.5 }), null);
  assert.ok(mortgagePayment({ principal: 112500, annualRatePct: 5.5, type: 'io', termYears: 0 }) !== null);

  const out = computeBrr(makeInputs({ mortgage: { type: 'repayment', termYears: 0 } }));
  assert.ok(out.warnings.some(w => w.code === 'W-BADTERM'));
});

test('Mortgage: stress payment uses stressRatePct, stressed cash flow differs only via rate', () => {
  const base = computeBrr(makeInputs());
  const stressed = computeBrr(makeInputs({ mortgage: { stressRatePct: 5.5 } })); // == normal rate
  assert.ok(Math.abs(stressed.stressMonthlyCashflow - base.monthlyCashflow) < 0.01);
  assert.notEqual(base.stressMonthlyPayment, undefined);
});

// --- Suite 5 — Rent, opex, NOI, cash flow ---------------------------------

test('Rent: void-adjusted rent = gross × (1 − void%), edges 0 and 100%', () => {
  const out = computeBrr(makeInputs());
  assert.equal(out.voidAdjustedRent, 10200 * 0.92);

  const zeroVoid = computeBrr(makeInputs({ opex: { voidPct: 0 } }));
  assert.equal(zeroVoid.voidAdjustedRent, 10200);

  const fullVoid = computeBrr(makeInputs({ opex: { voidPct: 100 } }));
  assert.equal(fullVoid.voidAdjustedRent, 0);
});

test('Opex normalisation: pct / monthly / annual converge on equivalent annual £', () => {
  const grossAnnualRent = 10200;
  const pct = normaliseOpexItem({ mode: 'pct', value: 10 }, grossAnnualRent);
  const annual = normaliseOpexItem({ mode: 'annual', value: 1020 }, grossAnnualRent);
  const monthly = normaliseOpexItem({ mode: 'monthly', value: 85 }, grossAnnualRent);
  assert.equal(pct, 1020);
  assert.equal(annual, 1020);
  assert.equal(monthly, 1020);
});

test('Management is charged on void-adjusted rent, not gross', () => {
  const out = computeBrr(makeInputs());
  const voidAdjusted = 10200 * 0.92;
  assert.ok(Math.abs(out.management - voidAdjusted * 0.10) < 1e-9);
  assert.notEqual(out.management, 10200 * 0.10);
});

test('NOI drives cash flow — NOT rent minus mortgage directly', () => {
  const out = computeBrr(makeInputs());
  const naiveMonthlyCashflow = out.grossMonthlyRent - out.monthlyMortgagePayment;
  assert.notEqual(Math.round(out.monthlyCashflow), Math.round(naiveMonthlyCashflow));
});

test('Negative opex value clamps to 0 with W-NEGOPEX', () => {
  const warnings = [];
  const v = normaliseOpexItem({ mode: 'annual', value: -50 }, 10000, warnings);
  assert.equal(v, 0);
  assert.ok(warnings.some(w => w.code === 'W-NEGOPEX'));
});

test('Zero rent blocks cash-flow metrics but recycling metrics still compute', () => {
  const out = computeBrr(makeInputs({ grossMonthlyRent: 0 }));
  assert.equal(out.monthlyCashflow, null);
  assert.equal(out.annualCashflow, null);
  assert.ok(out.capitalRecycledPct != null);
});

// --- Suite 6 — Metrics -----------------------------------------------------

test('Gross yields: hammer / cash invested / end value on baseline', () => {
  const out = computeBrr(makeInputs());
  assert.equal(out.grossYieldOnHammer, (10200 / 90000) * 100);
  assert.equal(out.grossYieldOnCash, (10200 / 129860) * 100);
  assert.equal(out.grossYieldOnEndValue, (10200 / 150000) * 100);
});

test('Net yield respects basis and records it', () => {
  const out = computeBrr(makeInputs());
  assert.equal(out.netYieldBasis, 'totalCashInvested');
  assert.ok(out.netYield != null);
});

test('Cash-on-cash: normal, zero cashLeftIn, negative cashLeftIn', () => {
  const normal = computeBrr(makeInputs());
  assert.ok(normal.cashOnCash != null);

  const zero = computeBrr(makeInputs({ selectedEndValue: 129860 / 0.75 }));
  assert.equal(zero.cashOnCash, null);
  assert.equal(zero.metricNotes.cashOnCash, 'All capital recycled');

  const negative = computeBrr(makeInputs({ selectedEndValue: 500000 }));
  assert.equal(negative.cashOnCash, null);
  assert.equal(negative.metricNotes.cashOnCash, 'Surplus cash extracted');
  assert.notEqual(negative.cashOnCash, Number.POSITIVE_INFINITY);
});

test('ICR / DSCR: io vs repayment interest; zero mortgage gives null + note', () => {
  const io = computeBrr(makeInputs());
  assert.ok(io.interestCoverage != null);
  assert.ok(io.debtServiceCoverage != null);

  const noMortgage = computeBrr(makeInputs({ mortgage: { ltvPct: 0.0001 } }));
  assert.ok(noMortgage.interestCoverage === null || noMortgage.debtServiceCoverage !== undefined);

  const zeroLtv = computeBrr(makeInputs({ mortgage: { ltvPct: 0 } })); // W-BADLTV but finalMortgage=0
  assert.equal(zeroLtv.finalMortgage, 0);
  assert.equal(zeroLtv.interestCoverage, null);
  assert.equal(zeroLtv.debtServiceCoverage, null);
  assert.equal(zeroLtv.metricNotes.interestCoverage, 'No mortgage debt');
});

test('Break-even rent: computeBrr at returned rent gives |monthlyCashflow| <= £1', () => {
  const base = computeBrr(makeInputs());
  const breakEvenRent = base.breakEvenMonthlyRent;
  const atBreakEven = computeBrr(makeInputs({ grossMonthlyRent: breakEvenRent }));
  assert.ok(Math.abs(atBreakEven.monthlyCashflow) <= 1);
});

test('Break-even occupancy: both sides of 100%, refinance buffer with/without override', () => {
  const out = computeBrr(makeInputs());
  assert.ok(out.breakEvenOccupancyPct < 100);

  const highOpex = computeBrr(makeInputs({ opex: { managementPct: 90, voidPct: 50 } }));
  assert.ok(highOpex.breakEvenOccupancyPct === null || highOpex.breakEvenOccupancyPct > 0);

  const noOverride = computeBrr(makeInputs());
  assert.equal(noOverride.refinanceBuffer, 0);
  const withOverride = computeBrr(makeInputs({ mortgage: { maxMortgageOverride: 100000 } }));
  assert.ok(withOverride.refinanceBuffer > 0);
});

test('Refurb % of value, project cost % of value', () => {
  const out = computeBrr(makeInputs());
  assert.equal(out.refurbPctOfValue, ((25000 + 2500) / 150000) * 100);
  assert.equal(out.projectCostPctOfValue, (129860 / 150000) * 100);
});

// --- Shape / seed sanity (supports the view component, not a numbered suite) --

test('seedBrr: produces the v1 shape with four seeded scenarios', () => {
  const brr = seedBrr({ guidePrice: 100000 });
  assert.equal(brr.shapeVersion, 1);
  assert.equal(brr.scenarios.length, 4);
  assert.deepEqual(brr.scenarios.map(s => s.type).sort(), ['conservative', 'custom', 'expected', 'optimistic']);
  const expected = brr.scenarios.find(s => s.type === 'expected');
  assert.equal(brr.activeScenarioId, expected.id);
  assert.deepEqual(brr.rentalComps, []);
  assert.deepEqual(brr.snapshots, []);
  assert.deepEqual(brr.audit, []);
  assert.equal(brr.rules.length, DEFAULT_BRR_RULES.length);
});

test('BRR_CALC_VERSION is exported', () => {
  assert.equal(BRR_CALC_VERSION, 1);
});

// --- Suite 12 — Scenario engine, migration, audit --------------------------

test('seedBrr: seeds concrete Conservative/Optimistic offsets, Expected/Custom as plain clones', () => {
  const brr = seedBrr({ guidePrice: 100000 });
  const cons = brr.scenarios.find(s => s.type === 'conservative');
  const opt = brr.scenarios.find(s => s.type === 'optimistic');
  const exp = brr.scenarios.find(s => s.type === 'expected');
  const custom = brr.scenarios.find(s => s.type === 'custom');

  assert.equal(cons.overrides.endValue.selected, 'conservative');
  assert.equal(cons.overrides.rent.selected, 'conservative');
  assert.equal(cons.overrides.mortgage.ltvPct, 75 - 5);
  assert.equal(cons.overrides.mortgage.ratePct, 5.5 + 1);
  assert.equal(cons.overrides.opex.voidPct, 8 + 4);

  assert.equal(opt.overrides.endValue.selected, 'optimistic');
  assert.equal(opt.overrides.rent.selected, 'optimistic');
  assert.equal(opt.overrides.mortgage.ratePct, 5.5 - 0.5);
  assert.equal(opt.overrides.opex.voidPct, 8 - 3);
  assert.equal(opt.overrides.mortgage.ltvPct, undefined);

  assert.deepEqual(exp.overrides, {});
  assert.deepEqual(custom.overrides, {});
});

test('resolveScenario precedence: scenario override > brr default > manual > report', () => {
  const property = { guidePrice: 100000, dealCalc: { legalFees: 1000 }, analytics: { gdvBase: 150000 } };
  const brr = seedBrr(property);
  const expected = brr.scenarios.find(s => s.type === 'expected');
  const withOverride = { ...expected, overrides: { legalFees: 2000 } };
  const { inputs, sources } = resolveScenario(property, brr, withOverride);
  assert.equal(inputs.legalFees, 2000);
  assert.equal(sources.legalFees, 'scenario');

  const noOverride = { ...expected, overrides: {} };
  const resolvedNoOverride = resolveScenario(property, brr, noOverride);
  assert.equal(resolvedNoOverride.inputs.legalFees, 1000);
  assert.equal(resolvedNoOverride.sources.legalFees, 'manual');
});

test('Editing scenario A leaves scenario B resolved inputs unchanged (isolation)', () => {
  const property = { guidePrice: 100000, analytics: { gdvBase: 150000 } };
  const brr = seedBrr(property);
  const [scenarioA, scenarioB] = brr.scenarios;
  Object.freeze(scenarioB);
  Object.freeze(scenarioB.overrides);

  const { brr: nextBrr, error } = setScenarioOverride(brr, scenarioA.id, 'refurbBudget', 40000);
  assert.equal(error, null);

  const resolvedB = resolveScenario(property, nextBrr, scenarioB);
  assert.equal(resolvedB.inputs.refurbBudget, 0);
});

test('Shared property change flows into scenarios without an override; overridden scenario unaffected', () => {
  const property = { guidePrice: 100000, dealCalc: { refurbCost: 20000 } };
  const brr = seedBrr(property);
  const expected = brr.scenarios.find(s => s.type === 'expected');
  const { brr: overriddenBrr } = setScenarioOverride(brr, expected.id, 'refurbBudget', 99999);
  const overriddenScenario = overriddenBrr.scenarios.find(s => s.id === expected.id);

  const updatedProperty = { ...property, dealCalc: { refurbCost: 30000 } };
  const conservative = brr.scenarios.find(s => s.type === 'conservative');
  const resolvedConservative = resolveScenario(updatedProperty, brr, conservative);
  assert.equal(resolvedConservative.inputs.refurbBudget, 30000);

  const resolvedOverridden = resolveScenario(updatedProperty, overriddenBrr, overriddenScenario);
  assert.equal(resolvedOverridden.inputs.refurbBudget, 99999);
});

test('setScenarioOverride refuses on a locked scenario', () => {
  const property = { guidePrice: 100000 };
  const brr = seedBrr(property);
  const expected = brr.scenarios.find(s => s.type === 'expected');
  const locked = toggleLock(brr, expected.id);
  assert.ok(locked.scenarios.find(s => s.id === expected.id).locked);

  const { brr: unchanged, error } = setScenarioOverride(locked, expected.id, 'refurbBudget', 1000);
  assert.equal(error, 'Scenario is locked');
  assert.deepEqual(unchanged, locked);
});

test('toggleLock unlocks and allows the edit to proceed', () => {
  const brr = seedBrr({ guidePrice: 100000 });
  const expected = brr.scenarios.find(s => s.type === 'expected');
  const locked = toggleLock(brr, expected.id);
  const unlocked = toggleLock(locked, expected.id);
  assert.equal(unlocked.scenarios.find(s => s.id === expected.id).locked, false);
  const { error } = setScenarioOverride(unlocked, expected.id, 'refurbBudget', 1000);
  assert.equal(error, null);
});

test('migrateBrrShape: upgrades a phase-1 single-scenario brr to 4 scenarios, preserving the existing one', () => {
  const now = new Date().toISOString();
  const phase1Brr = {
    shapeVersion: 1,
    activeScenarioId: 'bsc_existing',
    defaults: seedBrr({}).defaults,
    scenarios: [{ id: 'bsc_existing', name: 'Expected', type: 'expected', priceBasis: 'guide', assumedHammerPrice: null, locked: false, archived: false, includeInComparison: true, createdAt: now, updatedAt: now, overrides: { refurbBudget: 12345 } }],
    rentalComps: [], rentRecommendation: null, rules: DEFAULT_BRR_RULES, bidLadder: { startBid: null, endBid: null, increment: 1000 },
    stress: {}, confirmed: null, snapshots: [], audit: [],
  };
  const migrated = migrateBrrShape(phase1Brr);
  assert.equal(migrated.scenarios.length, 4);
  const preserved = migrated.scenarios.find(s => s.id === 'bsc_existing');
  assert.equal(preserved.overrides.refurbBudget, 12345);
  assert.equal(migrated.activeScenarioId, 'bsc_existing');
  assert.deepEqual(migrated.scenarios.map(s => s.type).sort(), ['conservative', 'custom', 'expected', 'optimistic']);

  const idempotent = migrateBrrShape(migrated);
  assert.equal(idempotent.scenarios.length, 4);
});

test('createScenario / duplicateScenario / renameScenario / deleteScenario', () => {
  const brr = seedBrr({ guidePrice: 100000 });
  const { brr: withNew, scenario: created } = createScenario(brr, 'custom', 'My Scenario');
  assert.equal(withNew.scenarios.length, 5);
  assert.equal(created.name, 'My Scenario');
  assert.equal(created.overrides && Object.keys(created.overrides).length, 0);

  const { brr: withDup, scenario: dup } = duplicateScenario(withNew, created.id);
  assert.equal(withDup.scenarios.length, 6);
  assert.equal(dup.name, 'My Scenario (copy)');
  assert.notEqual(dup.id, created.id);

  const { brr: renamed, error: renameErr } = renameScenario(withDup, dup.id, 'Renamed');
  assert.equal(renameErr, null);
  assert.equal(renamed.scenarios.find(s => s.id === dup.id).name, 'Renamed');

  const { brr: afterDelete, error: deleteErr } = deleteScenario(renamed, dup.id);
  assert.equal(deleteErr, null);
  assert.equal(afterDelete.scenarios.length, 5);
});

test('deleteScenario refuses to delete the last remaining scenario', () => {
  let brr = seedBrr({ guidePrice: 100000 });
  // Whittle down to one scenario first.
  for (const s of brr.scenarios.slice(1)) {
    brr = deleteScenario(brr, s.id).brr;
  }
  assert.equal(brr.scenarios.length, 1);
  const { error } = deleteScenario(brr, brr.scenarios[0].id);
  assert.equal(error, 'Cannot delete the last remaining scenario');
});

test('deleteScenario reassigns activeScenarioId when the active scenario is removed', () => {
  const brr = seedBrr({ guidePrice: 100000 });
  const expected = brr.scenarios.find(s => s.type === 'expected');
  assert.equal(brr.activeScenarioId, expected.id);
  const { brr: next } = deleteScenario(brr, expected.id);
  assert.notEqual(next.activeScenarioId, expected.id);
  assert.ok(next.scenarios.some(s => s.id === next.activeScenarioId));
});

test('setActiveScenario switches the active id; toggleArchive falls back active off an archived scenario', () => {
  const brr = seedBrr({ guidePrice: 100000 });
  const conservative = brr.scenarios.find(s => s.type === 'conservative');
  const switched = setActiveScenario(brr, conservative.id);
  assert.equal(switched.activeScenarioId, conservative.id);

  const archived = toggleArchive(switched, conservative.id);
  assert.ok(archived.scenarios.find(s => s.id === conservative.id).archived);
  assert.notEqual(archived.activeScenarioId, conservative.id);
});

test('appendAudit caps at 200 entries, newest first', () => {
  let brr = seedBrr({ guidePrice: 100000 });
  for (let i = 0; i < 210; i++) {
    brr = appendAudit(brr, { at: new Date().toISOString(), user: 'Test', scenarioId: null, field: 'x', prev: i, next: i + 1, reason: null });
  }
  assert.equal(brr.audit.length, 200);
  assert.equal(brr.audit[0].next, 210);
});

test('resolveScenario: maxBrrBid priceBasis resolves to guide price with a note (solver arrives phase 5)', () => {
  const property = { guidePrice: 80000 };
  const brr = seedBrr(property);
  const expected = brr.scenarios.find(s => s.type === 'expected');
  const scenario = { ...expected, priceBasis: 'maxBrrBid' };
  const { inputs, sources } = resolveScenario(property, brr, scenario);
  assert.equal(inputs.hammer, 80000);
  assert.ok(sources.hammerNote);
});
