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
  normaliseAddress,
  compQuality,
  findDuplicateGroups,
  recommendRent,
  DEFAULT_BRR_RULES,
  applyStress,
  sensitivityGrid,
  SENSITIVITY_PRESETS,
  DEFAULT_STRESS,
  evaluateRules,
  deriveConfidences,
  solveMaxBid,
  computeWarnings,
  computeVerdict,
  buildBidLadder,
  BID_LADDER_INCREMENTS,
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

// --- Suite 10 — Rent recommendation (recommendRent) ------------------------

test('normaliseAddress: lowercases, strips punctuation, drops post-comma part', () => {
  assert.equal(normaliseAddress('12 High St., Sheffield'), '12 high st');
  assert.equal(normaliseAddress('12 High St'), '12 high st');
  assert.equal(normaliseAddress(''), '');
  assert.equal(normaliseAddress(null), '');
});

test('compQuality: evidence-type base weights', () => {
  const now = new Date('2026-07-14T00:00:00Z');
  const base = evidenceType => compQuality({ evidenceType }, {}, now).evidenceBase;
  assert.equal(base('achieved'), 1.0);
  assert.equal(base('letAgreed'), 0.9);
  assert.equal(base('agentAppraisal'), 0.7);
  assert.equal(base('reducedAsking'), 0.6);
  assert.equal(base('asking'), 0.5);
  assert.equal(base('userEvidence'), 0.5);
});

test('compQuality: staleness factors at 91 and 181 days', () => {
  const now = new Date('2026-07-14T00:00:00Z');
  const daysAgo = d => new Date(now.getTime() - d * 86400000).toISOString();
  const fresh = compQuality({ evidenceType: 'achieved', achievedAt: daysAgo(30) }, {}, now);
  const stale = compQuality({ evidenceType: 'achieved', achievedAt: daysAgo(91) }, {}, now);
  const veryStale = compQuality({ evidenceType: 'achieved', achievedAt: daysAgo(181) }, {}, now);
  assert.equal(fresh.stalenessFactor, 1);
  assert.equal(fresh.staleFlag, null);
  assert.equal(stale.stalenessFactor, 0.7);
  assert.equal(stale.staleFlag, 'stale');
  assert.equal(veryStale.stalenessFactor, 0.4);
  assert.equal(veryStale.staleFlag, 'very-stale');
});

test('compQuality: similarity moves in the right direction for beds/type/distance', () => {
  const now = new Date();
  const subject = { beds: 2, propertyType: 'semi-detached' };
  const exactBeds = compQuality({ evidenceType: 'achieved', beds: 2, condition: 'good' }, subject, now).similarity;
  const offByOneBeds = compQuality({ evidenceType: 'achieved', beds: 3, condition: 'good' }, subject, now).similarity;
  const offByTwoBeds = compQuality({ evidenceType: 'achieved', beds: 5, condition: 'good' }, subject, now).similarity;
  assert.ok(exactBeds > offByOneBeds);
  assert.ok(offByOneBeds > offByTwoBeds);

  const sameType = compQuality({ evidenceType: 'achieved', propertyType: 'semi-detached', condition: 'good' }, subject, now).similarity;
  const flatVsHouse = compQuality({ evidenceType: 'achieved', propertyType: 'flat', condition: 'good' }, subject, now).similarity;
  assert.ok(sameType > flatVsHouse);

  const close = compQuality({ evidenceType: 'achieved', distanceMiles: 0.1, condition: 'good' }, subject, now).similarity;
  const far = compQuality({ evidenceType: 'achieved', distanceMiles: 2, condition: 'good' }, subject, now).similarity;
  assert.ok(close > far);
});

test('compQuality: user weight scales the effective weight', () => {
  const now = new Date();
  const base = compQuality({ evidenceType: 'achieved' }, {}, now).effectiveWeight;
  const halved = compQuality({ evidenceType: 'achieved', weight: 0.5 }, {}, now).effectiveWeight;
  assert.ok(Math.abs(halved - base * 0.5) < 1e-9);
});

test('recommendRent: asking-type rent gets a 3% haircut applied inside the weighted calc', () => {
  const out = recommendRent([{ id: 'c1', evidenceType: 'asking', monthlyRent: 1000, included: true }], {}, new Date());
  assert.equal(out.recommended, Math.round(1000 * 0.97));
});

test('recommendRent: adjustment is added before the haircut/weighting', () => {
  const comps = [{ id: 'c1', evidenceType: 'achieved', monthlyRent: 1000, adjustment: -50, included: true }];
  const out = recommendRent(comps, {}, new Date());
  assert.equal(out.recommended, 950);
});

test('recommendRent: weighted mean favors higher-quality evidence over a plain average', () => {
  const comps = [
    { id: 'c1', evidenceType: 'achieved', monthlyRent: 1000, included: true },
    { id: 'c2', evidenceType: 'asking', monthlyRent: 1200, included: true },
  ];
  const out = recommendRent(comps, {}, new Date());
  const plainAverage = (1000 + 1200 * 0.97) / 2;
  assert.ok(out.recommended < plainAverage);
});

test('recommendRent: <4 comps uses the recommended ×0.9/×1.0/×1.08 fallback for C/E/O', () => {
  const comps = [
    { id: 'c1', evidenceType: 'achieved', monthlyRent: 1000, included: true },
    { id: 'c2', evidenceType: 'letAgreed', monthlyRent: 1000, included: true },
  ];
  const out = recommendRent(comps, {}, new Date());
  assert.equal(out.expected, out.recommended);
  assert.equal(out.conservative, Math.round(out.recommended * 0.9));
  assert.equal(out.optimistic, Math.round(out.recommended * 1.08));
});

test('recommendRent: >=4 comps uses percentile-based C/E/O', () => {
  const comps = [
    { id: 'c1', evidenceType: 'achieved', monthlyRent: 900, included: true },
    { id: 'c2', evidenceType: 'achieved', monthlyRent: 950, included: true },
    { id: 'c3', evidenceType: 'achieved', monthlyRent: 1000, included: true },
    { id: 'c4', evidenceType: 'achieved', monthlyRent: 1100, included: true },
  ];
  const out = recommendRent(comps, {}, new Date());
  assert.ok(out.conservative <= out.expected);
  assert.ok(out.optimistic >= out.expected);
});

test('recommendRent: 0 included comps -> insufficient confidence, nulls, no throw', () => {
  const out = recommendRent([], {}, new Date());
  assert.equal(out.confidence, 'insufficient');
  assert.equal(out.recommended, null);
  assert.deepEqual(out.compIdsUsed, []);
});

test('recommendRent: excluded comps are ignored for the calc but the caller\'s array is untouched', () => {
  const comps = [
    { id: 'c1', evidenceType: 'achieved', monthlyRent: 1000, included: true },
    { id: 'c2', evidenceType: 'achieved', monthlyRent: 5000, included: false },
  ];
  const out = recommendRent(comps, {}, new Date());
  assert.deepEqual(out.compIdsUsed, ['c1']);
  assert.equal(comps.length, 2);
});

test('recommendRent: confidence — high (>=3 comps, achieved/letAgreed present, none very stale, tight spread)', () => {
  const comps = [
    { id: 'c1', evidenceType: 'achieved', monthlyRent: 1000, included: true },
    { id: 'c2', evidenceType: 'letAgreed', monthlyRent: 1020, included: true },
    { id: 'c3', evidenceType: 'achieved', monthlyRent: 1010, included: true },
  ];
  assert.equal(recommendRent(comps, {}, new Date()).confidence, 'high');
});

test('recommendRent: confidence — medium (>=2 comps, not asking-only)', () => {
  const comps = [
    { id: 'c1', evidenceType: 'agentAppraisal', monthlyRent: 1000, included: true },
    { id: 'c2', evidenceType: 'asking', monthlyRent: 1050, included: true },
  ];
  assert.equal(recommendRent(comps, {}, new Date()).confidence, 'medium');
});

test('recommendRent: confidence — low (single comp, or asking-only)', () => {
  const single = recommendRent([{ id: 'c1', evidenceType: 'achieved', monthlyRent: 1000, included: true }], {}, new Date());
  assert.equal(single.confidence, 'low');
  const askingOnly = recommendRent([
    { id: 'c1', evidenceType: 'asking', monthlyRent: 1000, included: true },
    { id: 'c2', evidenceType: 'asking', monthlyRent: 1000, included: true },
  ], {}, new Date());
  assert.equal(askingOnly.confidence, 'low');
});

test('recommendRent: confidence drops from high when a comp is very stale', () => {
  const now = new Date();
  const daysAgo = d => new Date(now.getTime() - d * 86400000).toISOString();
  const comps = [
    { id: 'c1', evidenceType: 'achieved', monthlyRent: 1000, achievedAt: daysAgo(200), included: true },
    { id: 'c2', evidenceType: 'letAgreed', monthlyRent: 1020, included: true },
    { id: 'c3', evidenceType: 'achieved', monthlyRent: 1010, included: true },
  ];
  assert.notEqual(recommendRent(comps, {}, now).confidence, 'high');
});

test('findDuplicateGroups: exact normalised-address match groups comps', () => {
  const comps = [
    { id: 'c1', address: '12 High Street, Sheffield', postcode: 'S1 1AA' },
    { id: 'c2', address: '12 High Street', postcode: 'S1 1AA' },
    { id: 'c3', address: '45 Low Road', postcode: 'S2 2BB' },
  ];
  const groups = findDuplicateGroups(comps);
  assert.ok(groups.c1 && groups.c1.includes('c2'));
  assert.equal(groups.c3, undefined);
});

test('findDuplicateGroups: probable-dup by postcode + beds + rent within ±£25 across different sources', () => {
  const comps = [
    { id: 'c1', address: '1 Foo Street', postcode: 'S1 1AA', beds: 2, monthlyRent: 900, source: 'AgentA' },
    { id: 'c2', address: '1 Foo St', postcode: 'S1 1AA', beds: 2, monthlyRent: 910, source: 'AgentB' },
    { id: 'c3', address: '99 Bar Avenue', postcode: 'S1 1AA', beds: 2, monthlyRent: 990, source: 'AgentC' },
  ];
  const groups = findDuplicateGroups(comps);
  assert.ok(groups.c1.includes('c2'));
  assert.equal(groups.c3, undefined);
});

test('findDuplicateGroups: same source is not flagged as a probable-dup (no cross-source evidence)', () => {
  const comps = [
    { id: 'c1', address: '1 Foo Street', postcode: 'S1 1AA', beds: 2, monthlyRent: 900, source: 'AgentA' },
    { id: 'c2', address: '2 Different Road', postcode: 'S1 1AA', beds: 2, monthlyRent: 905, source: 'AgentA' },
  ];
  const groups = findDuplicateGroups(comps);
  assert.equal(groups.c1, undefined);
  assert.equal(groups.c2, undefined);
});

// --- Suite 12b — Sensitivity & stress (applyStress, sensitivityGrid) -------

test('applyStress: empty patch is a no-op on every value', () => {
  const inputs = makeInputs();
  const stressed = applyStress(inputs, {});
  assert.equal(stressed.hammer, inputs.hammer);
  assert.equal(stressed.refurbBudget, inputs.refurbBudget);
  assert.equal(stressed.selectedEndValue, inputs.selectedEndValue);
  assert.equal(stressed.grossMonthlyRent, inputs.grossMonthlyRent);
  assert.equal(stressed.mortgage.ratePct, inputs.mortgage.ratePct);
  assert.equal(stressed.mortgage.ltvPct, inputs.mortgage.ltvPct);
  assert.equal(stressed.opex.voidPct, inputs.opex.voidPct);
});

test('applyStress: each individual delta moves only its own value', () => {
  const inputs = makeInputs();
  assert.equal(applyStress(inputs, { hammerPct: 5 }).hammer, 94500);
  assert.ok(Math.abs(applyStress(inputs, { refurbPct: 15 }).refurbBudget - 28750) < 1e-6);
  assert.equal(applyStress(inputs, { endValuePct: -10 }).selectedEndValue, 135000);
  assert.equal(applyStress(inputs, { rentPct: -10 }).grossMonthlyRent, 765);
  assert.equal(applyStress(inputs, { ratePts: 2 }).mortgage.ratePct, 7.5);
  assert.equal(applyStress(inputs, { ltvPts: -5 }).mortgage.ltvPct, 70);
  assert.equal(applyStress(inputs, { voidPtsExtra: 4 }).opex.voidPct, 12);
});

test('applyStress: serviceChargePct stresses only service charge, not other opex lines', () => {
  const inputs = makeInputs({ opex: { ...makeInputs().opex, serviceCharge: { mode: 'annual', value: 1000 } } });
  const stressed = applyStress(inputs, { serviceChargePct: 25 });
  assert.equal(stressed.opex.serviceCharge.value, 1250);
  assert.equal(stressed.opex.insurance.value, inputs.opex.insurance.value);
});

test('applyStress: opexPct stresses other opex cost lines but not service charge', () => {
  const inputs = makeInputs({ opex: { ...makeInputs().opex, serviceCharge: { mode: 'annual', value: 1000 }, groundRent: { mode: 'annual', value: 200 } } });
  const stressed = applyStress(inputs, { opexPct: 10 });
  assert.ok(Math.abs(stressed.opex.insurance.value - 275) < 1e-9);
  assert.ok(Math.abs(stressed.opex.groundRent.value - 220) < 1e-9);
  assert.equal(stressed.opex.serviceCharge.value, 1000);
});

test('applyStress: combined spec example (+5% hammer, +15% refurb, -10% value, -10% rent, +2pts rate, -5pts LTV)', () => {
  const inputs = makeInputs();
  const stressed = applyStress(inputs, DEFAULT_STRESS);
  const base = computeBrr(inputs);
  const out = computeBrr(stressed);
  assert.equal(stressed.hammer, 94500);
  assert.ok(Math.abs(stressed.refurbBudget - 28750) < 1e-6);
  assert.equal(stressed.selectedEndValue, 135000);
  assert.equal(stressed.grossMonthlyRent, 765);
  assert.equal(stressed.mortgage.ratePct, 7.5);
  assert.equal(stressed.mortgage.ltvPct, 70);
  // Four downside checks are readable straight off the stressed output.
  assert.ok(out.monthlyCashflow < base.monthlyCashflow);
  assert.ok(typeof out.capitalRecycledPct === 'number' || out.capitalRecycledPct === null);
  assert.ok(typeof out.equityRetainedPct === 'number' || out.equityRetainedPct === null);
  assert.ok(typeof out.cashLeftIn === 'number');
});

test('sensitivityGrid: identity cell (row=current, col=current) equals the plain computeBrr result', () => {
  const inputs = makeInputs();
  const grid = sensitivityGrid({
    inputs,
    rowAxis: { field: 'hammer', values: [inputs.hammer] },
    colAxis: { field: 'ltvPct', values: [inputs.mortgage.ltvPct] },
    metric: 'cashLeftIn',
  });
  const expected = computeBrr(inputs).cashLeftIn;
  assert.equal(grid.rows[0].cells[0].value, expected);
});

test('sensitivityGrid: single (no-op) axis produces a 1-column grid', () => {
  const inputs = makeInputs();
  const grid = sensitivityGrid({
    inputs,
    rowAxis: { field: 'hammer' },
    colAxis: { field: 'ltvPct', single: true },
    metric: 'cashLeftIn',
  });
  assert.equal(grid.rows.length, 5); // default ±10% in 5 steps
  for (const row of grid.rows) assert.equal(row.cells.length, 1);
  assert.deepEqual(grid.colAxis.values, [inputs.mortgage.ltvPct]);
});

test('sensitivityGrid: two swept axes produce a full rows×cols grid', () => {
  const inputs = makeInputs();
  const grid = sensitivityGrid({ inputs, rowAxis: { field: 'rent' }, colAxis: { field: 'ratePct' }, metric: 'monthlyCashflow' });
  assert.equal(grid.rows.length, 5);
  assert.equal(grid.colAxis.values.length, 9); // ±2pts in 0.5 steps
  for (const row of grid.rows) assert.equal(row.cells.length, 9);
});

test('sensitivityGrid: default LTV axis is 60-80 in 5pt steps and includes the scenario LTV', () => {
  const inputs = makeInputs();
  const grid = sensitivityGrid({ inputs, rowAxis: { field: 'ltvPct' }, colAxis: { field: 'ratePct', single: true }, metric: 'equityRetained' });
  assert.deepEqual(grid.rowAxis.values, [60, 65, 70, 75, 80]);
  assert.ok(grid.rowAxis.values.includes(inputs.mortgage.ltvPct));
});

test('sensitivityGrid: pass/fail defaults to the basic phase-1 condition (positive monthly cash flow)', () => {
  const inputs = makeInputs({ grossMonthlyRent: 0 });
  const grid = sensitivityGrid({ inputs, rowAxis: { field: 'hammer', values: [inputs.hammer] }, colAxis: { field: 'ltvPct', values: [inputs.mortgage.ltvPct] }, metric: 'monthlyCashflow' });
  assert.equal(grid.rows[0].cells[0].pass, false);
});

test('SENSITIVITY_PRESETS: all 13 presets run without throwing and target a real BrrOutputs metric', () => {
  const inputs = makeInputs();
  assert.equal(SENSITIVITY_PRESETS.length, 13);
  const baseOut = computeBrr(inputs);
  for (const preset of SENSITIVITY_PRESETS) {
    assert.ok(Object.prototype.hasOwnProperty.call(baseOut, preset.metric), `${preset.key} metric '${preset.metric}' missing from BrrOutputs`);
    const grid = sensitivityGrid({ inputs, rowAxis: preset.rowAxis, colAxis: preset.colAxis, metric: preset.metric });
    assert.ok(grid.rows.length > 0, `${preset.key} produced no rows`);
    assert.ok(grid.rows[0].cells.length > 0, `${preset.key} produced no columns`);
  }
});

// --- Suite 7 — Rules (evaluateRules) ----------------------------------------

const baseRuleOutputs = () => ({
  cashLeftIn: 10000, capitalRecycledPct: 80, monthlyCashflow: 200, annualCashflow: 2400,
  equityRetained: 40000, equityRetainedPct: 25, refinanceBuffer: 15000,
  grossYieldOnHammer: 8, netYield: 6, interestCoverage: 1.5, debtServiceCoverage: 1.5,
  totalCashInvested: 50000, projectCostPctOfValue: 70, metricNotes: {},
});

test('evaluateRules: each RuleKey has a satisfied case and a violated case', () => {
  const cases = [
    ['maxCashLeftIn', 'cashLeftIn', 20000, 15000, 25000],
    ['minCapitalRecycledPct', 'capitalRecycledPct', 75, 80, 60],
    ['minMonthlyCashflow', 'monthlyCashflow', 150, 200, 50],
    ['minAnnualCashflow', 'annualCashflow', 1800, 2400, 500],
    ['minEquityRetained', 'equityRetained', 30000, 40000, 10000],
    ['minEquityRetainedPct', 'equityRetainedPct', 20, 25, 10],
    ['minRefinanceBuffer', 'refinanceBuffer', 10000, 15000, 2000],
    ['minGrossYieldPct', 'grossYieldOnHammer', 7, 8, 4],
    ['minNetYieldPct', 'netYield', 5, 6, 2],
    ['minICR', 'interestCoverage', 1.45, 1.5, 1.0],
    ['minDSCR', 'debtServiceCoverage', 1.25, 1.5, 1.0],
    ['maxTotalCashInvested', 'totalCashInvested', 60000, 50000, 70000],
    ['maxProjectCostPctOfValue', 'projectCostPctOfValue', 90, 70, 95],
  ];
  for (const [key, metric, target, satisfiedActual, violatedActual] of cases) {
    const rule = { id: 'r', key, enabled: true, mandatory: true, target };
    const okRes = evaluateRules({ ...baseRuleOutputs(), [metric]: satisfiedActual }, [rule], {}).results[0];
    const badRes = evaluateRules({ ...baseRuleOutputs(), [metric]: violatedActual }, [rule], {}).results[0];
    assert.equal(okRes.satisfied, true, `${key} should be satisfied`);
    assert.equal(badRes.satisfied, false, `${key} should be violated`);
    assert.ok(badRes.note, `${key} violated case should carry a note`);
  }
});

test('evaluateRules: confidence rules rank low/medium/high against a numeric target', () => {
  const rule = { id: 'r', key: 'minRentalConfidence', enabled: true, mandatory: false, target: 2 };
  assert.equal(evaluateRules(baseRuleOutputs(), [rule], { rental: 'high' }).results[0].satisfied, true);
  assert.equal(evaluateRules(baseRuleOutputs(), [rule], { rental: 'low' }).results[0].satisfied, false);
});

test('evaluateRules: a disabled rule is always satisfied and never fails pass', () => {
  const rule = { id: 'r', key: 'minMonthlyCashflow', enabled: false, mandatory: true, target: 999999 };
  const res = evaluateRules(baseRuleOutputs(), [rule], {});
  assert.equal(res.pass, true);
  assert.equal(res.results[0].satisfied, true);
});

test('evaluateRules: a mandatory rule over a null metric is not satisfied, with a cannot-evaluate note', () => {
  const rule = { id: 'r', key: 'minICR', enabled: true, mandatory: true, target: 1.2 };
  const out = { ...baseRuleOutputs(), interestCoverage: null, metricNotes: { interestCoverage: 'No mortgage debt' } };
  const res = evaluateRules(out, [rule], {});
  assert.equal(res.pass, false);
  assert.match(res.results[0].note, /cannot evaluate/);
});

test('evaluateRules: an advisory failure never fails pass, but is listed in advisoryFailures', () => {
  const rule = { id: 'r', key: 'minCapitalRecycledPct', enabled: true, mandatory: false, target: 90 };
  const res = evaluateRules({ ...baseRuleOutputs(), capitalRecycledPct: 50 }, [rule], {});
  assert.equal(res.pass, true);
  assert.equal(res.advisoryFailures.length, 1);
  assert.equal(res.mandatoryFailures.length, 0);
});

test('evaluateRules: no mandatory rules enabled -> pass = true', () => {
  const rules = [{ id: 'r', key: 'minCapitalRecycledPct', enabled: true, mandatory: false, target: 200 }];
  assert.equal(evaluateRules({ ...baseRuleOutputs(), capitalRecycledPct: 10 }, rules, {}).pass, true);
});

// --- Suite 8 — Max-bid solver (solveMaxBid) ---------------------------------

function makeBrrFixture(rentExpected = 850) {
  const property = { guidePrice: 90000, refurbLevel: 'medium', analytics: { refurbMedium: 25000, gdvBase: 150000, gdvConservative: 140000, gdvOptimistic: 160000 } };
  let brr = seedBrr(property);
  brr = { ...brr, defaults: { ...brr.defaults, rent: { ...brr.defaults.rent, expected: rentExpected } } };
  const scenario = brr.scenarios.find(s => s.type === 'expected');
  return { property, brr, scenario };
}

test('solveMaxBid: spec-shaped example — maxCashLeftIn is the binding rule, names both figures', () => {
  const { property, brr, scenario } = makeBrrFixture();
  const rules = [{ id: 'r', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 15000 }];
  const res = solveMaxBid({ property, brr, scenario, rules, minPrice: 90000, increment: 500 });
  assert.equal(res.maxBid, 95000);
  assert.equal(res.limitingRuleKey, 'maxCashLeftIn');
  assert.equal(res.firstFailingBid, 95500);
  assert.match(res.failReason, /£95,500/);
  assert.match(res.failReason, /£15,275/);
  assert.match(res.failReason, /£15,000/);
});

test('solveMaxBid: SDLT/percentage-fee recompute is non-linear across the walk (never static subtraction)', () => {
  const { property, brr, scenario } = makeBrrFixture();
  const rules = [{ id: 'r', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 15000 }];
  const res = solveMaxBid({ property, brr, scenario, rules, minPrice: 90000, increment: 500 });
  const atMin = computeBrr({ ...resolveScenario(property, brr, scenario).inputs, hammer: 90000 });
  const delta = res.outputsAtMax.totalCashInvested - atMin.totalCashInvested;
  // 5 steps of £500 = £2,500 hammer increase; a static walk would show exactly £2,500 here —
  // the real delta differs because SDLT/percentage fees scale with price.
  assert.notEqual(delta, 2500);
});

test('solveMaxBid: no bid passes when the minimum price already fails', () => {
  const { property, brr, scenario } = makeBrrFixture();
  const rules = [{ id: 'r', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 100 }];
  const res = solveMaxBid({ property, brr, scenario, rules, minPrice: 90000, increment: 500 });
  assert.equal(res.maxBid, null);
  assert.equal(res.firstFailingBid, 90000);
  assert.match(res.failReason, /No bid passes/);
});

test('solveMaxBid: every tested bid passes -> ceiling returned with a note', () => {
  const { property, brr, scenario } = makeBrrFixture();
  const rules = [{ id: 'r', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 10000000 }];
  const res = solveMaxBid({ property, brr, scenario, rules, minPrice: 90000, increment: 10000, ceiling: 120000 });
  assert.equal(res.maxBid, 120000);
  assert.equal(res.limitingRuleKey, null);
  assert.match(res.failReason, /Every tested bid/);
});

test('solveMaxBid: two rules failing at the same increment — limiting is the first listed, reason names both', () => {
  const { property, brr, scenario } = makeBrrFixture();
  const rules = [
    { id: 'r1', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 15000 },
    { id: 'r2', key: 'maxTotalCashInvested', enabled: true, mandatory: true, target: 127500 },
  ];
  const res = solveMaxBid({ property, brr, scenario, rules, minPrice: 90000, increment: 500 });
  assert.equal(res.maxBid, 95000);
  assert.equal(res.limitingRuleKey, 'maxCashLeftIn');
  assert.match(res.failReason, /cash left in/);
  assert.match(res.failReason, /total cash/);
});

test('solveMaxBid: a finer increment stays consistent with a coarser one (maxBid1000 <= maxBid250 + 750)', () => {
  const { property, brr, scenario } = makeBrrFixture();
  const rules = [{ id: 'r', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 15000 }];
  const maxBid1000 = solveMaxBid({ property, brr, scenario, rules, minPrice: 90000, increment: 1000 }).maxBid;
  const maxBid250 = solveMaxBid({ property, brr, scenario, rules, minPrice: 90000, increment: 250 }).maxBid;
  assert.ok(maxBid1000 <= maxBid250 + 750);
});

test('solveMaxBid: a conflicting rule (impossible at any price) yields no passing bids', () => {
  const { property, brr, scenario } = makeBrrFixture();
  const rules = [{ id: 'r', key: 'minMonthlyCashflow', enabled: true, mandatory: true, target: 100000 }];
  const res = solveMaxBid({ property, brr, scenario, rules, minPrice: 90000, increment: 5000, ceiling: 150000 });
  assert.equal(res.maxBid, null);
});

test('solveMaxBid: maxMortgageOverride below the calculated mortgage lowers (or nulls) the max bid', () => {
  const { property, brr: brrBase, scenario: scBase } = makeBrrFixture();
  const brrCapped = { ...brrBase, defaults: { ...brrBase.defaults, mortgage: { ...brrBase.defaults.mortgage, maxMortgageOverride: 80000 } } };
  const scCapped = brrCapped.scenarios.find(s => s.type === 'expected');
  const rules = [{ id: 'r', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 15000 }];
  const uncapped = solveMaxBid({ property, brr: brrBase, scenario: scBase, rules, minPrice: 90000, increment: 500 }).maxBid;
  const capped = solveMaxBid({ property, brr: brrCapped, scenario: scCapped, rules, minPrice: 90000, increment: 500 }).maxBid;
  assert.ok((capped ?? 0) <= uncapped);
});

// --- Suite 11 — Warnings & verdict -------------------------------------------

function baseWarningsFixture() {
  const { property, brr, scenario } = makeBrrFixture();
  const { inputs: resolved } = resolveScenario(property, brr, scenario);
  const outputs = computeBrr(resolved);
  return { property, brr, resolved, outputs };
}

test('computeWarnings: W-NOHAMMER (blocked) when hammer <= 0', () => {
  const { brr } = baseWarningsFixture();
  const resolved = { hammer: 0, grossMonthlyRent: 800, opex: {}, mortgage: {}, refurbBudget: 0, contingencyPct: 10, legalFees: 0, surveyCost: 0, adminFee: 0, endValue: {}, selectedEndValue: 100000 };
  const outputs = computeBrr(resolved);
  const warnings = computeWarnings(resolved, outputs, brr, brr.rules);
  assert.ok(warnings.some(w => w.code === 'W-NOHAMMER' && w.severity === 'blocked'));
});

test('computeWarnings: W-ZERORENT (blocked) when rent <= 0', () => {
  const { brr, resolved: base } = baseWarningsFixture();
  const resolved = { ...base, grossMonthlyRent: 0 };
  const outputs = computeBrr(resolved);
  const warnings = computeWarnings(resolved, outputs, brr, brr.rules);
  assert.ok(warnings.some(w => w.code === 'W-ZERORENT' && w.severity === 'blocked'));
});

test('computeWarnings: W-BADLTV (blocked) is re-surfaced from computeBrr with catalogue severity', () => {
  const { brr, resolved: base } = baseWarningsFixture();
  const resolved = { ...base, mortgage: { ...base.mortgage, ltvPct: 150 } };
  const outputs = computeBrr(resolved);
  const warnings = computeWarnings(resolved, outputs, brr, brr.rules);
  assert.ok(warnings.some(w => w.code === 'W-BADLTV' && w.severity === 'blocked'));
});

test('computeWarnings: W-BADTERM (blocked) is re-surfaced from computeBrr for an invalid repayment term', () => {
  const { brr, resolved: base } = baseWarningsFixture();
  const resolved = { ...base, mortgage: { ...base.mortgage, type: 'repayment', termYears: 12.5 } };
  const outputs = computeBrr(resolved);
  const warnings = computeWarnings(resolved, outputs, brr, brr.rules);
  assert.ok(warnings.some(w => w.code === 'W-BADTERM' && w.severity === 'blocked'));
});

test('computeWarnings: W-NEGCF (high) when monthly cash flow is negative', () => {
  const { brr, resolved } = baseWarningsFixture();
  const outputs = { ...computeBrr(resolved), monthlyCashflow: -50 };
  const warnings = computeWarnings(resolved, outputs, brr, brr.rules);
  assert.ok(warnings.some(w => w.code === 'W-NEGCF' && w.severity === 'high'));
});

test('computeWarnings: W-REFURBGTUPLIFT (high) when refurb + contingency exceeds the value uplift', () => {
  const { brr, resolved: base } = baseWarningsFixture();
  const resolved = { ...base, refurbBudget: 50000, contingencyPct: 10 };
  const outputs = { ...computeBrr(resolved), valueUplift: 10000, contingency: 5000 };
  const warnings = computeWarnings(resolved, outputs, brr, brr.rules);
  assert.ok(warnings.some(w => w.code === 'W-REFURBGTUPLIFT' && w.severity === 'high'));
});

test('computeWarnings: W-NORENTCOMPS (caution) when there are no included rental comparables', () => {
  const { brr, resolved, outputs } = baseWarningsFixture();
  const warnings = computeWarnings(resolved, outputs, { ...brr, rentalComps: [] }, brr.rules);
  assert.ok(warnings.some(w => w.code === 'W-NORENTCOMPS' && w.severity === 'caution'));
});

test('computeWarnings: W-NOCONT (caution) when contingency is 0%', () => {
  const { brr, resolved: base } = baseWarningsFixture();
  const resolved = { ...base, contingencyPct: 0 };
  const outputs = computeBrr(resolved);
  const warnings = computeWarnings(resolved, outputs, brr, brr.rules);
  assert.ok(warnings.some(w => w.code === 'W-NOCONT' && w.severity === 'caution'));
});

test('computeWarnings: W-ZERORATE (info) is re-surfaced when rate is 0 on an interest-only mortgage', () => {
  const { brr, resolved: base } = baseWarningsFixture();
  const resolved = { ...base, mortgage: { ...base.mortgage, ratePct: 0, type: 'io' } };
  const outputs = computeBrr(resolved);
  const warnings = computeWarnings(resolved, outputs, brr, brr.rules);
  assert.ok(warnings.some(w => w.code === 'W-ZERORATE' && w.severity === 'info'));
});

test('computeWarnings: hammer > end value still computes (negative equity created) and does not throw', () => {
  const { brr, resolved: base } = baseWarningsFixture();
  const resolved = { ...base, hammer: 500000, selectedEndValue: 150000 };
  const outputs = computeBrr(resolved);
  assert.ok(outputs.equityCreated < 0);
  assert.doesNotThrow(() => computeWarnings(resolved, outputs, brr, brr.rules));
});

test('computeVerdict: Insufficient evidence when a blocked warning is present', () => {
  const v = computeVerdict({ monthlyCashflow: null, capitalRecycledPct: null, metricNotes: {} }, { pass: true, mandatoryFailures: [], advisoryFailures: [] }, [{ code: 'W-NOHAMMER', severity: 'blocked' }], {}, [], 0, 'Expected');
  assert.equal(v.label, 'Insufficient evidence');
  assert.ok(v.explanation);
});

test('computeVerdict: BRR does not meet criteria when a mandatory rule fails', () => {
  const ruleResults = { pass: false, mandatoryFailures: [{ ruleKey: 'maxCashLeftIn', note: 'leaves £26,400 invested, exceeding your £20,000 target' }], advisoryFailures: [] };
  const v = computeVerdict({ monthlyCashflow: 100, capitalRecycledPct: 80, metricNotes: {} }, ruleResults, [], {}, [], 0, 'Expected');
  assert.equal(v.label, 'BRR does not meet criteria');
  assert.match(v.explanation, /£20,000/);
});

test('computeVerdict: High-risk BRR when mandatory rules pass but a high-severity warning fires', () => {
  const ruleResults = { pass: true, mandatoryFailures: [], advisoryFailures: [] };
  const v = computeVerdict({ monthlyCashflow: 100, capitalRecycledPct: 80, metricNotes: {} }, ruleResults, [{ code: 'W-NEGSTRESSCF', severity: 'high' }], { rental: 'high', valuation: 'high' }, [], 0, 'Expected');
  assert.equal(v.label, 'High-risk BRR');
});

test('computeVerdict: High-risk BRR when the combined stress test fails 2+ of its four checks', () => {
  const ruleResults = { pass: true, mandatoryFailures: [], advisoryFailures: [] };
  const v = computeVerdict({ monthlyCashflow: 100, capitalRecycledPct: 80, metricNotes: {} }, ruleResults, [], { rental: 'high', valuation: 'high' }, [], 2, 'Expected');
  assert.equal(v.label, 'High-risk BRR');
});

test('computeVerdict: Marginal BRR with 2+ advisory failures and no high warnings', () => {
  const ruleResults = { pass: true, mandatoryFailures: [], advisoryFailures: [{ ruleKey: 'a' }, { ruleKey: 'b' }] };
  const v = computeVerdict({ monthlyCashflow: 100, capitalRecycledPct: 80, metricNotes: {} }, ruleResults, [], { rental: 'high', valuation: 'high' }, [], 0, 'Expected');
  assert.equal(v.label, 'Marginal BRR');
});

test('computeVerdict: Strong BRR when everything is clean and confidences are medium+', () => {
  const ruleResults = { pass: true, mandatoryFailures: [], advisoryFailures: [] };
  const v = computeVerdict({ monthlyCashflow: 300, capitalRecycledPct: 95, metricNotes: {} }, ruleResults, [{ code: 'W-ZERORATE', severity: 'info' }], { rental: 'high', valuation: 'high' }, [], 0, 'Expected');
  assert.equal(v.label, 'Strong BRR');
});

test('computeVerdict: Viable BRR — mandatory pass with a single minor advisory, otherwise clean', () => {
  const ruleResults = { pass: true, mandatoryFailures: [], advisoryFailures: [{ ruleKey: 'a' }] };
  const v = computeVerdict({ monthlyCashflow: 150, capitalRecycledPct: 80, metricNotes: {} }, ruleResults, [], { rental: 'high', valuation: 'high' }, [], 0, 'Expected');
  assert.equal(v.label, 'Viable BRR');
});

test('computeVerdict: explanation names the scenario and includes £ figures', () => {
  const ruleResults = { pass: true, mandatoryFailures: [], advisoryFailures: [{ ruleKey: 'a' }] };
  const v = computeVerdict({ monthlyCashflow: 150, capitalRecycledPct: 80, metricNotes: {} }, ruleResults, [], {}, [], 0, 'Conservative');
  assert.match(v.explanation, /Conservative/);
  assert.match(v.explanation, /£150/);
});

test('computeVerdict: cross-check clause names the failing scenario and its rule-note figures', () => {
  const ruleResults = { pass: true, mandatoryFailures: [], advisoryFailures: [] };
  const scenarios = [{ name: 'Conservative', type: 'conservative', isActive: false, mandatoryFailureCount: 1, worstNote: 'leaves £26,400 invested, exceeding your £20,000 target' }];
  const v = computeVerdict({ monthlyCashflow: 300, capitalRecycledPct: 95, metricNotes: {} }, ruleResults, [], { rental: 'high', valuation: 'high' }, scenarios, 0, 'Expected');
  assert.equal(v.label, 'Marginal BRR');
  assert.match(v.explanation, /Conservative scenario/);
  assert.match(v.explanation, /£26,400/);
});

test('deriveConfidences: prefers a fresh rent recommendation over the (possibly stale) defaults confidence', () => {
  const brr = { rentRecommendation: { confidence: 'high' }, defaults: { rent: { confidence: 'low' }, endValue: { confidence: 'medium' } } };
  const c = deriveConfidences(brr);
  assert.equal(c.rental, 'high');
  assert.equal(c.valuation, 'medium');
});

test('deriveConfidences: falls back to defaults.rent.confidence when the recommendation is insufficient/absent', () => {
  const brr1 = { rentRecommendation: { confidence: 'insufficient' }, defaults: { rent: { confidence: 'low' }, endValue: {} } };
  assert.equal(deriveConfidences(brr1).rental, 'low');
  const brr2 = { rentRecommendation: null, defaults: { rent: { confidence: 'medium' }, endValue: {} } };
  assert.equal(deriveConfidences(brr2).rental, 'medium');
});

test('resolveScenario: maxBrrBid priceBasis now resolves to the solver\'s max bid once one exists (phase 5)', () => {
  const { property, brr } = makeBrrFixture();
  const expected = brr.scenarios.find(s => s.type === 'expected');
  const scenario = { ...expected, priceBasis: 'maxBrrBid' };
  const rules = [{ id: 'r', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 15000 }];
  const brrWithRule = { ...brr, rules };
  const { inputs, sources } = resolveScenario(property, brrWithRule, scenario);
  const direct = solveMaxBid({ property, brr: brrWithRule, scenario: { ...scenario, priceBasis: 'guide' }, rules, minPrice: 5000, increment: 500 });
  assert.equal(inputs.hammer, direct.maxBid);
  assert.equal(sources.hammer, 'scenario');
  assert.match(sources.hammerNote, /solver/);
});

// --- Suite 9 — Bid ladder (buildBidLadder) ----------------------------------

test('buildBidLadder: row count = (end-start)/increment + 1', () => {
  const { property, brr, scenario } = makeBrrFixture();
  const brrWithRule = { ...brr, rules: [{ id: 'r', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 15000 }] };
  const ladder = buildBidLadder({ property, brr: brrWithRule, scenario, startBid: 90000, endBid: 96000, increment: 500 });
  assert.equal(ladder.rows.length, (96000 - 90000) / 500 + 1);
  assert.equal(ladder.rows[0].hammer, 90000);
  assert.equal(ladder.rows[ladder.rows.length - 1].hammer, 96000);
});

test('buildBidLadder: a range exceeding the 400-row cap returns a validation error and no rows', () => {
  const { property, brr, scenario } = makeBrrFixture();
  const ladder = buildBidLadder({ property, brr, scenario, startBid: 1000, endBid: 1000 + 401 * 250, increment: 250 });
  assert.ok(ladder.error);
  assert.equal(ladder.rows.length, 0);
});

test('buildBidLadder: the pass/fail transition matches the solver\'s firstFailingBid for the same config', () => {
  const { property, brr, scenario } = makeBrrFixture();
  const rules = [{ id: 'r', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 15000 }];
  const brrWithRule = { ...brr, rules };
  const ladder = buildBidLadder({ property, brr: brrWithRule, scenario, startBid: 90000, increment: 500 });
  const solved = solveMaxBid({ property, brr: brrWithRule, scenario, rules, minPrice: 90000, increment: 500 });
  assert.equal(ladder.markers.firstFailing, solved.firstFailingBid);
  assert.equal(ladder.markers.maxRecommended, solved.maxBid);
  const firstFailRow = ladder.rows.find(r => r.hammer === ladder.markers.firstFailing);
  assert.equal(firstFailRow.pass, false);
  assert.ok(firstFailRow.failedRuleKeys.includes('maxCashLeftIn'));
});

test('buildBidLadder: markers pick up guide/current/target/stretch from property + brr', () => {
  const { property: baseProperty, brr: baseBrr, scenario } = makeBrrFixture();
  const property = { ...baseProperty, analytics: { ...baseProperty.analytics, targetBid: 85000, stretchBid: 92000 } };
  const brr = { ...baseBrr, currentAuctionBid: 91000 };
  const ladder = buildBidLadder({ property, brr, scenario, startBid: 90000, endBid: 96000, increment: 500 });
  assert.equal(ladder.markers.guide, 90000);
  assert.equal(ladder.markers.currentBid, 91000);
  assert.equal(ladder.markers.target, 85000);
  assert.equal(ladder.markers.stretch, 92000);
});

test('buildBidLadder: current bid above the max recommended bid does not break marker ordering', () => {
  const { property, brr: baseBrr, scenario } = makeBrrFixture();
  const brr = { ...baseBrr, currentAuctionBid: 500000, rules: [{ id: 'r', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 15000 }] };
  const ladder = buildBidLadder({ property, brr, scenario, startBid: 90000, increment: 500 });
  assert.equal(ladder.markers.currentBid, 500000);
  assert.ok(ladder.markers.maxRecommended < ladder.markers.currentBid);
  assert.ok(ladder.markers.maxRecommended <= ladder.markers.firstFailing);
});

test('buildBidLadder: default start/end — round-down(guide×0.8, increment) to firstFailing+5 increments', () => {
  const { property, brr: baseBrr, scenario } = makeBrrFixture();
  const brr = { ...baseBrr, rules: [{ id: 'r', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 15000 }] };
  const ladder = buildBidLadder({ property, brr, scenario, increment: 500 });
  assert.equal(ladder.start, Math.floor((property.guidePrice * 0.8) / 500) * 500);
  assert.equal(ladder.end, ladder.markers.firstFailing + 5 * 500);
});

test('buildBidLadder: BID_LADDER_INCREMENTS exposes the four preset step sizes', () => {
  assert.deepEqual(BID_LADDER_INCREMENTS, [250, 500, 1000, 2500]);
});
