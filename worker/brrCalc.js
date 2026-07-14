// BRR (Buy, Refurbish, Refinance, Rent) analysis — pure calculation module.
// No DOM, no bindings, no Date.now() inside formulas (timestamps are passed in).
// Mirrors the App.jsx flip-analysis conventions (calcSDLT, computeActuals) but
// is re-implemented here standalone per docs/brr/README.md decision #3.

export const BRR_CALC_VERSION = 1;

const pf = v => parseFloat(v) || 0;
const round = v => Math.round(v);
const round1 = v => Math.round(v * 10) / 10;
const round2 = v => Math.round(v * 100) / 100;

/**
 * @typedef {Object} OpexItem
 * @property {'pct'|'monthly'|'annual'} mode
 * @property {number} value
 */

/** Normalise an OpexItem to annual £. Negative values clamp to 0 (W-NEGOPEX). */
export function normaliseOpexItem(item, grossAnnualRent, warnings) {
  const mode = item && item.mode ? item.mode : 'annual';
  let value = pf(item && item.value);
  if (value < 0) {
    value = 0;
    if (warnings) warnings.push({ code: 'W-NEGOPEX', message: 'Negative operating-cost value clamped to 0' });
  }
  if (mode === 'pct') return grossAnnualRent * value / 100;
  if (mode === 'monthly') return value * 12;
  return value; // annual
}

/**
 * SDLT — numerically identical to App.jsx calcSDLT (src/App.jsx:2270-2283).
 * Bands: 0 / 250,000 / 925,000 / 1,500,000 / Infinity.
 * Additional-dwelling rates [5,10,15,17]%; standard [0,5,10,12]%.
 * @param {number} price
 * @param {boolean} [isAdditional]
 */
export function brrSdlt(price, isAdditional = true) {
  if (!price || price <= 0) return 0;
  const thresholds = [0, 250000, 925000, 1500000, Infinity];
  const rates = isAdditional ? [0.05, 0.10, 0.15, 0.17] : [0.00, 0.05, 0.10, 0.12];
  let tax = 0, remaining = price;
  for (let i = 0; i < rates.length; i++) {
    const bandSize = Math.min(remaining, thresholds[i + 1] - thresholds[i]);
    if (bandSize <= 0) break;
    tax += bandSize * rates[i];
    remaining -= bandSize;
    if (remaining <= 0) break;
  }
  return round(tax);
}

/**
 * Mortgage payment for a given principal/rate/type/term.
 * @param {{ principal:number, annualRatePct:number, type:'io'|'repayment', termYears:number }} args
 * @returns {{ monthly:number, annual:number }|null}
 */
export function mortgagePayment({ principal, annualRatePct, type, termYears }) {
  const p = pf(principal);
  const rate = pf(annualRatePct);
  const r = rate / 100 / 12;

  let rawMonthly;
  if (type === 'repayment') {
    const validTerm = Number.isInteger(termYears) && termYears >= 1 && termYears <= 40;
    if (!validTerm) return null;
    const n = termYears * 12;
    if (r === 0) {
      rawMonthly = p / n;
    } else {
      const factor = Math.pow(1 + r, n);
      rawMonthly = p * r * factor / (factor - 1);
    }
  } else {
    // interest-only
    rawMonthly = r === 0 ? 0 : p * (rate / 100) / 12;
  }
  const monthly = round2(rawMonthly);
  const annual = round2(monthly * 12);
  return { monthly, annual };
}

/** Seeded scenario definitions — offsets are concrete override values, never formulas. */
const SEED_SCENARIOS = [
  { name: 'Conservative', type: 'conservative', endValueSelected: 'conservative', rentSelected: 'conservative', ltvDelta: -5, rateDelta: 1, voidDelta: 4 },
  { name: 'Expected', type: 'expected', endValueSelected: 'expected', rentSelected: 'expected', ltvDelta: 0, rateDelta: 0, voidDelta: 0 },
  { name: 'Optimistic', type: 'optimistic', endValueSelected: 'optimistic', rentSelected: 'optimistic', ltvDelta: 0, rateDelta: -0.5, voidDelta: -3 },
  { name: 'Custom', type: 'custom', endValueSelected: 'expected', rentSelected: 'expected', ltvDelta: 0, rateDelta: 0, voidDelta: 0 },
];

const DEFAULT_MORTGAGE = { ltvPct: 75, ratePct: 5.5, type: 'io', termYears: 25, maxMortgageOverride: null, minEquityRetainPct: null, stressRatePct: 7.5, refinanceDate: null };
const DEFAULT_OPEX = {
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
};

export const DEFAULT_BRR_RULES = [
  { id: 'rule_maxCashLeftIn', key: 'maxCashLeftIn', enabled: true, mandatory: true, target: 20000 },
  { id: 'rule_minCapitalRecycledPct', key: 'minCapitalRecycledPct', enabled: true, mandatory: false, target: 75 },
  { id: 'rule_minMonthlyCashflow', key: 'minMonthlyCashflow', enabled: true, mandatory: true, target: 150 },
  { id: 'rule_minDSCR', key: 'minDSCR', enabled: true, mandatory: false, target: 1.25 },
  { id: 'rule_minAnnualCashflow', key: 'minAnnualCashflow', enabled: false, mandatory: false, target: 1800 },
  { id: 'rule_minEquityRetained', key: 'minEquityRetained', enabled: false, mandatory: false, target: 30000 },
  { id: 'rule_minEquityRetainedPct', key: 'minEquityRetainedPct', enabled: false, mandatory: false, target: 20 },
  { id: 'rule_minRefinanceBuffer', key: 'minRefinanceBuffer', enabled: false, mandatory: false, target: 10000 },
  { id: 'rule_minGrossYieldPct', key: 'minGrossYieldPct', enabled: false, mandatory: false, target: 7 },
  { id: 'rule_minNetYieldPct', key: 'minNetYieldPct', enabled: false, mandatory: false, target: 5 },
  { id: 'rule_minICR', key: 'minICR', enabled: false, mandatory: false, target: 1.45 },
  { id: 'rule_maxTotalCashInvested', key: 'maxTotalCashInvested', enabled: false, mandatory: false, target: 60000 },
  { id: 'rule_maxProjectCostPctOfValue', key: 'maxProjectCostPctOfValue', enabled: false, mandatory: false, target: 90 },
  { id: 'rule_minRentalConfidence', key: 'minRentalConfidence', enabled: false, mandatory: false, target: 0 },
  { id: 'rule_minValuationConfidence', key: 'minValuationConfidence', enabled: false, mandatory: false, target: 0 },
];

const DEFAULT_STRESS = { hammerPct: 5, refurbPct: 15, endValuePct: -10, rentPct: -10, ratePts: 2, ltvPts: -5, serviceChargePct: 25, opexPct: 10, voidPtsExtra: 4 };

function uuid() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Seeding writes the offsets as concrete override values, never formulas (01-data-model.md). */
function buildSeedOverrides(seed, mortgageDefaults) {
  if (seed.type === 'conservative') {
    return {
      endValue: { selected: 'conservative' },
      rent: { selected: 'conservative' },
      mortgage: { ltvPct: pf(mortgageDefaults.ltvPct) + seed.ltvDelta, ratePct: pf(mortgageDefaults.ratePct) + seed.rateDelta },
      opex: { voidPct: DEFAULT_OPEX.voidPct + seed.voidDelta },
    };
  }
  if (seed.type === 'optimistic') {
    return {
      endValue: { selected: 'optimistic' },
      rent: { selected: 'optimistic' },
      mortgage: { ratePct: pf(mortgageDefaults.ratePct) + seed.rateDelta },
      opex: { voidPct: DEFAULT_OPEX.voidPct + seed.voidDelta },
    };
  }
  return {}; // 'expected' and 'custom' start as plain clones of the BRR defaults
}

function buildScenario(seed, mortgageDefaults, now) {
  return {
    id: `bsc_${uuid()}`,
    name: seed.name,
    type: seed.type,
    priceBasis: 'guide',
    assumedHammerPrice: null,
    locked: false,
    archived: false,
    includeInComparison: true,
    createdAt: now,
    updatedAt: now,
    overrides: buildSeedOverrides(seed, mortgageDefaults),
  };
}

/**
 * Build the initial property.brr shape: four seeded scenarios (Conservative,
 * Expected, Optimistic, Custom), empty rentalComps/rules seeded from
 * DEFAULT_BRR_RULES/snapshots/audit.
 * @param {object} property
 */
export function seedBrr(property) {
  const now = new Date().toISOString();
  const scenarios = SEED_SCENARIOS.map(seed => buildScenario(seed, DEFAULT_MORTGAGE, now));
  const expected = scenarios.find(s => s.type === 'expected');
  return {
    shapeVersion: 1,
    activeScenarioId: expected.id,
    defaults: {
      endValue: { conservative: null, expected: null, optimistic: null, custom: null, selected: 'expected', confidence: null, overrideReason: null, notes: null },
      mortgage: { ...DEFAULT_MORTGAGE },
      rent: { conservative: null, expected: null, optimistic: null, custom: null, selected: 'expected', confidence: null, overrideReason: null, notes: null },
      opex: { ...DEFAULT_OPEX },
    },
    scenarios,
    rentalComps: [],
    rentRecommendation: null,
    rules: DEFAULT_BRR_RULES.map(r => ({ ...r })),
    bidLadder: { startBid: null, endBid: null, increment: 1000 },
    stress: { ...DEFAULT_STRESS },
    confirmed: null,
    snapshots: [],
    audit: [],
  };
}

/**
 * Upgrade a phase-1 single-scenario `property.brr` (or any object missing
 * seeded scenario types) to carry all four seeded types, without touching or
 * losing any existing scenario's overrides/id/audit history.
 * @param {object} brr
 */
export function migrateBrrShape(brr) {
  if (!brr || !Array.isArray(brr.scenarios)) return brr;
  const existingTypes = new Set(brr.scenarios.map(s => s.type));
  const missing = SEED_SCENARIOS.filter(seed => !existingTypes.has(seed.type));
  if (missing.length === 0) return brr;
  const now = new Date().toISOString();
  const mortgageDefaults = (brr.defaults && brr.defaults.mortgage) || DEFAULT_MORTGAGE;
  const added = missing.map(seed => buildScenario(seed, mortgageDefaults, now));
  return { ...brr, scenarios: [...brr.scenarios, ...added] };
}

function deepMergeOverride(base, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = { ...(base && typeof base === 'object' ? base : {}) };
  for (const key of Object.keys(patch)) {
    out[key] = deepMergeOverride(out[key], patch[key]);
  }
  return out;
}

function findScenario(brr, id) {
  return (brr.scenarios || []).find(s => s.id === id) || null;
}

/**
 * Create a new scenario (default type 'custom', empty overrides).
 * @returns {{ brr: object, scenario: object }}
 */
export function createScenario(brr, type = 'custom', name) {
  const now = new Date().toISOString();
  const sameType = brr.scenarios.filter(s => s.type === type).length;
  const label = name || `${type.charAt(0).toUpperCase()}${type.slice(1)}${sameType ? ` ${sameType + 1}` : ''}`;
  const scenario = { id: `bsc_${uuid()}`, name: label, type, priceBasis: 'guide', assumedHammerPrice: null, locked: false, archived: false, includeInComparison: true, createdAt: now, updatedAt: now, overrides: {} };
  return { brr: { ...brr, scenarios: [...brr.scenarios, scenario] }, scenario };
}

/**
 * Duplicate an existing scenario (deep-copy overrides, new id, unlocked).
 * @returns {{ brr: object, scenario: object|null, error: string|null }}
 */
export function duplicateScenario(brr, id) {
  const src = findScenario(brr, id);
  if (!src) return { brr, scenario: null, error: 'Scenario not found' };
  const now = new Date().toISOString();
  const scenario = { ...src, id: `bsc_${uuid()}`, name: `${src.name} (copy)`, locked: false, createdAt: now, updatedAt: now, overrides: JSON.parse(JSON.stringify(src.overrides || {})) };
  return { brr: { ...brr, scenarios: [...brr.scenarios, scenario] }, scenario, error: null };
}

/** @returns {{ brr: object, error: string|null }} */
export function renameScenario(brr, id, name) {
  const scenario = findScenario(brr, id);
  if (!scenario) return { brr, error: 'Scenario not found' };
  if (scenario.locked) return { brr, error: 'Scenario is locked' };
  const nextScenarios = brr.scenarios.map(s => s.id === id ? { ...s, name, updatedAt: new Date().toISOString() } : s);
  return { brr: { ...brr, scenarios: nextScenarios }, error: null };
}

/** Refuses to delete the last remaining scenario; reassigns active if needed. */
export function deleteScenario(brr, id) {
  if (brr.scenarios.length <= 1) return { brr, error: 'Cannot delete the last remaining scenario' };
  const nextScenarios = brr.scenarios.filter(s => s.id !== id);
  let activeScenarioId = brr.activeScenarioId;
  if (activeScenarioId === id) activeScenarioId = nextScenarios[0].id;
  return { brr: { ...brr, scenarios: nextScenarios, activeScenarioId }, error: null };
}

export function setActiveScenario(brr, id) {
  if (!findScenario(brr, id)) return brr;
  return { ...brr, activeScenarioId: id };
}

export function toggleLock(brr, id) {
  const nextScenarios = brr.scenarios.map(s => s.id === id ? { ...s, locked: !s.locked, updatedAt: new Date().toISOString() } : s);
  return { ...brr, scenarios: nextScenarios };
}

/** Archiving the active scenario falls back the active id to the first non-archived one. */
export function toggleArchive(brr, id) {
  const scenario = findScenario(brr, id);
  if (!scenario) return brr;
  const archived = !scenario.archived;
  const nextScenarios = brr.scenarios.map(s => s.id === id ? { ...s, archived, updatedAt: new Date().toISOString() } : s);
  let activeScenarioId = brr.activeScenarioId;
  if (archived && activeScenarioId === id) {
    const fallback = nextScenarios.find(s => !s.archived);
    if (fallback) activeScenarioId = fallback.id;
  }
  return { ...brr, scenarios: nextScenarios, activeScenarioId };
}

/**
 * Deep-sparse merge a value into a scenario's overrides at a dot-notation path
 * (e.g. 'mortgage.ltvPct' or 'refurbBudget'). Refuses when the scenario is locked.
 * @returns {{ brr: object, error: string|null }}
 */
export function setScenarioOverride(brr, id, path, value) {
  const scenario = findScenario(brr, id);
  if (!scenario) return { brr, error: 'Scenario not found' };
  if (scenario.locked) return { brr, error: 'Scenario is locked' };
  const keys = path.split('.');
  const patch = keys.reduceRight((acc, key) => ({ [key]: acc }), value);
  const nextOverrides = deepMergeOverride(scenario.overrides, patch);
  const nextScenario = { ...scenario, overrides: nextOverrides, updatedAt: new Date().toISOString() };
  const nextScenarios = brr.scenarios.map(s => s.id === id ? nextScenario : s);
  return { brr: { ...brr, scenarios: nextScenarios }, error: null };
}

/** Appends a BrrAuditEntry (newest first), capped at 200. `entry.at` must be supplied by the caller. */
export function appendAudit(brr, entry) {
  const full = { id: `baud_${uuid()}`, ...entry };
  const audit = [full, ...(brr.audit || [])].slice(0, 200);
  return { ...brr, audit };
}

/**
 * Resolve a scenario's effective inputs against inheritance precedence:
 * scenario override → brr default → property manual value → report (analytics)
 * → listing → external. Returns { inputs, sources }.
 * @param {object} property
 * @param {object} brr
 * @param {object} scenario
 */
export function resolveScenario(property, brr, scenario) {
  const an = (property && property.analytics) || {};
  const dc = (property && property.dealCalc) || {};
  const defaults = (brr && brr.defaults) || {};
  const ov = (scenario && scenario.overrides) || {};
  const sources = {};

  // Effective hammer price
  let hammer = 0;
  if (scenario.assumedHammerPrice != null) {
    hammer = pf(scenario.assumedHammerPrice);
    sources.hammer = 'scenario';
  } else if (scenario.priceBasis === 'maxBrrBid') {
    // Solver arrives in phase 5 — accept the enum value now, resolve to guide with a note.
    hammer = pf(property && property.guidePrice);
    sources.hammer = 'listing';
    sources.hammerNote = 'Max BRR bid solver not available until phase 5 — using guide price';
  } else {
    const basis = scenario.priceBasis;
    const basisMap = {
      guide: pf(property && property.guidePrice),
      currentBid: pf(brr && brr.currentAuctionBid),
      target: pf(an.targetBid),
      stretch: pf(an.stretchBid),
      confirmed: pf(property && property.hammerPrice),
    };
    if (basis && basisMap[basis]) {
      hammer = basisMap[basis];
      sources.hammer = basis === 'guide' ? 'listing' : 'manual';
    } else {
      hammer = pf(property && property.guidePrice);
      sources.hammer = 'listing';
    }
  }

  // Purchase-cost fields
  const buyersPremiumPct = ov.buyersPremiumPct != null ? ov.buyersPremiumPct : (dc.buyersPremium != null ? pf(dc.buyersPremium) : pf(an.buyersPremium ? (an.buyersPremium / (hammer || 1)) * 100 : 0));
  sources.buyersPremiumPct = ov.buyersPremiumPct != null ? 'scenario' : (dc.buyersPremium != null ? 'manual' : 'report');
  const adminFee = ov.adminFee != null ? pf(ov.adminFee) : pf(dc.adminFee);
  sources.adminFee = ov.adminFee != null ? 'scenario' : 'manual';
  const legalFees = ov.legalFees != null ? pf(ov.legalFees) : pf(dc.legalFees);
  sources.legalFees = ov.legalFees != null ? 'scenario' : 'manual';
  const surveyCost = ov.surveyCost != null ? pf(ov.surveyCost) : pf(dc.surveyCost);
  sources.surveyCost = ov.surveyCost != null ? 'scenario' : 'manual';
  const otherBuyingCosts = ov.otherBuyingCosts != null ? pf(ov.otherBuyingCosts) : 0;
  sources.otherBuyingCosts = ov.otherBuyingCosts != null ? 'scenario' : 'manual';

  const refurbLevel = (property && property.refurbLevel) || 'medium';
  const refurbFromAnalytics = pf(refurbLevel === 'light' ? an.refurbLight : refurbLevel === 'heavy' ? an.refurbHeavy : an.refurbMedium) || pf(an.worksTotal);
  const refurbBudget = ov.refurbBudget != null ? pf(ov.refurbBudget) : (dc.refurbCost != null ? pf(dc.refurbCost) : refurbFromAnalytics);
  sources.refurbBudget = ov.refurbBudget != null ? 'scenario' : (dc.refurbCost != null ? 'manual' : 'report');

  const contingencyPct = ov.contingencyPct != null ? pf(ov.contingencyPct) : (dc.contingencyPct != null ? pf(dc.contingencyPct) : 10);
  sources.contingencyPct = ov.contingencyPct != null ? 'scenario' : (dc.contingencyPct != null ? 'manual' : 'brrDefault');

  const holdingFromDealCalc = (pf(dc.holdingMonths) || 0) * (pf(dc.holdingMonthlyCost) || 0);
  const holdingCost = ov.holdingCost != null ? pf(ov.holdingCost) : (holdingFromDealCalc || pf(an.holdingTotal));
  sources.holdingCost = ov.holdingCost != null ? 'scenario' : (holdingFromDealCalc ? 'manual' : 'report');

  // End value
  const endValueDefaults = defaults.endValue || {};
  const endValueOv = ov.endValue || {};
  const endValue = {
    conservative: endValueOv.conservative != null ? pf(endValueOv.conservative) : (endValueDefaults.conservative != null ? pf(endValueDefaults.conservative) : pf(an.gdvConservative)),
    expected: endValueOv.expected != null ? pf(endValueOv.expected) : (endValueDefaults.expected != null ? pf(endValueDefaults.expected) : pf(an.gdvBase)),
    optimistic: endValueOv.optimistic != null ? pf(endValueOv.optimistic) : (endValueDefaults.optimistic != null ? pf(endValueDefaults.optimistic) : pf(an.gdvOptimistic)),
    custom: endValueOv.custom != null ? pf(endValueOv.custom) : pf(endValueDefaults.custom),
    selected: endValueOv.selected || endValueDefaults.selected || 'expected',
  };
  sources.endValue = endValueOv.selected || endValueOv[endValue.selected] != null ? 'scenario' : (endValueDefaults[endValue.selected] != null ? 'brrDefault' : 'report');
  const selectedEndValue = pf(endValue[endValue.selected]);

  // Mortgage
  const mortgageDefaults = defaults.mortgage || DEFAULT_MORTGAGE;
  const mortgageOv = ov.mortgage || {};
  const mortgage = { ...mortgageDefaults, ...mortgageOv };
  sources.mortgage = Object.keys(mortgageOv).length ? 'scenario' : 'brrDefault';

  // Rent
  const rentDefaults = defaults.rent || {};
  const rentOv = ov.rent || {};
  const rent = {
    conservative: rentOv.conservative != null ? pf(rentOv.conservative) : pf(rentDefaults.conservative),
    expected: rentOv.expected != null ? pf(rentOv.expected) : pf(rentDefaults.expected),
    optimistic: rentOv.optimistic != null ? pf(rentOv.optimistic) : pf(rentDefaults.optimistic),
    custom: rentOv.custom != null ? pf(rentOv.custom) : pf(rentDefaults.custom),
    selected: rentOv.selected || rentDefaults.selected || 'expected',
  };
  sources.rent = Object.keys(rentOv).length ? 'scenario' : 'brrDefault';
  const grossMonthlyRent = pf(rent[rent.selected]);

  // Opex
  const opexDefaults = defaults.opex || DEFAULT_OPEX;
  const opexOv = ov.opex || {};
  const opex = { ...opexDefaults, ...opexOv };
  if (opex.serviceCharge && opex.serviceCharge.value === 0 && property && property.serviceCharge) {
    opex.serviceCharge = { mode: 'annual', value: pf(property.serviceCharge) };
  }
  if (opex.groundRent && opex.groundRent.value === 0 && property && property.groundRent) {
    opex.groundRent = { mode: 'annual', value: pf(property.groundRent) };
  }
  sources.opex = Object.keys(opexOv).length ? 'scenario' : 'brrDefault';

  const currentValue = pf(property && property.currentValue) || pf(an.gdvBase) || null;

  return {
    inputs: {
      hammer, buyersPremiumPct, adminFee, legalFees, surveyCost, otherBuyingCosts,
      refurbBudget, contingencyPct, holdingCost,
      endValue, selectedEndValue, currentValue,
      mortgage, rent, grossMonthlyRent, opex,
    },
    sources,
  };
}

/**
 * @typedef {Object} BrrOutputs
 */

/**
 * Run the full calculation pipeline (02-calculations.md §§1-13) over resolved inputs.
 * @param {ReturnType<typeof resolveScenario>['inputs']} resolved
 */
export function computeBrr(resolved) {
  const warnings = [];
  const metricNotes = {};
  const {
    mortgage, currentValue, opex,
  } = resolved;
  const hammer = pf(resolved.hammer);
  const buyersPremiumPct = pf(resolved.buyersPremiumPct);
  const adminFee = pf(resolved.adminFee);
  const legalFees = pf(resolved.legalFees);
  const surveyCost = pf(resolved.surveyCost);
  const otherBuyingCosts = pf(resolved.otherBuyingCosts);
  const refurbBudget = pf(resolved.refurbBudget);
  const contingencyPct = pf(resolved.contingencyPct);
  const holdingCost = pf(resolved.holdingCost);
  const endValue = pf(resolved.selectedEndValue);
  const grossMonthlyRent = pf(resolved.grossMonthlyRent);

  // 1. SDLT
  const sdlt = brrSdlt(hammer, true);

  // 2. Buying costs
  const buyersPremium = hammer * buyersPremiumPct / 100;
  const totalBuyingCosts = sdlt + buyersPremium + adminFee + legalFees + surveyCost + otherBuyingCosts;

  // 3. Total cash invested
  const contingency = refurbBudget * contingencyPct / 100;
  const totalCashInvested = hammer + totalBuyingCosts + refurbBudget + contingency + holdingCost;

  // 4. Value uplift
  const valueUplift = currentValue != null ? endValue - currentValue : null;
  if (currentValue == null) warnings.push({ code: 'W-NOVAL', message: 'Current value unknown' });
  const netValueUplift = endValue - totalCashInvested;

  // 5. Refinance mortgage
  const ltvPct = pf(mortgage.ltvPct);
  if (ltvPct <= 0 || ltvPct > 100) warnings.push({ code: 'W-BADLTV', message: 'LTV must be between 0 and 100' });
  const grossMortgage = endValue * ltvPct / 100;
  const finalMortgage = mortgage.maxMortgageOverride != null ? Math.min(grossMortgage, pf(mortgage.maxMortgageOverride)) : grossMortgage;

  // 6. Net cash returned
  const netCashReturned = finalMortgage;

  // 7. Cash left in
  const cashLeftIn = totalCashInvested - netCashReturned;
  let cashLeftInDisplay, surplusExtracted = 0;
  if (cashLeftIn > 0) {
    cashLeftInDisplay = `Cash remaining invested: £${round(cashLeftIn).toLocaleString ? round(cashLeftIn).toLocaleString() : round(cashLeftIn)}`;
  } else if (cashLeftIn === 0) {
    cashLeftInDisplay = 'All original capital recycled';
  } else {
    surplusExtracted = Math.abs(cashLeftIn);
    cashLeftInDisplay = `Surplus cash extracted above original investment: £${round(surplusExtracted)}`;
  }
  const cashLeftInForCoC = Math.max(0, cashLeftIn);

  // 8. Capital recycled
  const capitalRecycledAmount = Math.min(netCashReturned, totalCashInvested);
  const capitalRecycledPct = totalCashInvested > 0 ? (netCashReturned / totalCashInvested) * 100 : null;

  // 9. Equity
  const equityRetained = endValue - finalMortgage;
  const equityRetainedPct = endValue > 0 ? (equityRetained / endValue) * 100 : null;
  const equityCreated = endValue - totalCashInvested;
  const loanToCostPct = totalCashInvested > 0 ? (finalMortgage / totalCashInvested) * 100 : null;

  // 10. Mortgage payments
  const mortgageResult = mortgagePayment({ principal: finalMortgage, annualRatePct: mortgage.ratePct, type: mortgage.type, termYears: mortgage.termYears });
  if (mortgageResult === null) warnings.push({ code: 'W-BADTERM', message: 'Invalid mortgage term for repayment type' });
  if (pf(mortgage.ratePct) === 0 && mortgage.type === 'io') warnings.push({ code: 'W-ZERORATE', message: 'Zero interest rate on interest-only mortgage' });
  const monthlyMortgagePayment = mortgageResult ? mortgageResult.monthly : 0;
  const annualMortgagePayment = mortgageResult ? mortgageResult.annual : 0;

  const stressRatePct = mortgage.stressRatePct != null ? mortgage.stressRatePct : pf(mortgage.ratePct) + 2;
  const stressMortgageResult = mortgagePayment({ principal: finalMortgage, annualRatePct: stressRatePct, type: mortgage.type, termYears: mortgage.termYears });
  const stressMonthlyPayment = stressMortgageResult ? stressMortgageResult.monthly : 0;

  // 11. Rent & operating costs
  const grossAnnualRent = grossMonthlyRent * 12;
  const voidPct = pf(opex.voidPct);
  const voidAllowance = grossAnnualRent * voidPct / 100;
  const voidAdjustedRent = grossAnnualRent - voidAllowance;
  const managementPct = pf(opex.managementPct);
  const management = voidAdjustedRent * managementPct / 100;
  const otherOpexKeys = ['maintenance', 'insurance', 'serviceCharge', 'groundRent', 'licensing', 'compliance', 'utilities', 'councilTax', 'cleaning', 'gardening'];
  let otherOpexAnnual = 0;
  for (const key of otherOpexKeys) {
    otherOpexAnnual += normaliseOpexItem(opex[key], grossAnnualRent, warnings);
  }
  otherOpexAnnual += pf(opex.otherMonthly) * 12 + pf(opex.otherAnnual);
  const opexAnnual = management + otherOpexAnnual;
  const netOperatingIncome = voidAdjustedRent - opexAnnual;
  const monthlyCashflowBlocked = grossMonthlyRent <= 0;
  const monthlyCashflow = netOperatingIncome / 12 - monthlyMortgagePayment;
  const annualCashflow = netOperatingIncome - annualMortgagePayment;
  const stressMonthlyCashflow = netOperatingIncome / 12 - stressMonthlyPayment;
  const stressAnnualCashflow = netOperatingIncome - (stressMonthlyPayment * 12);

  // 12. Performance metrics
  const grossYieldOnHammer = hammer > 0 ? (grossAnnualRent / hammer) * 100 : (metricNotes.grossYieldOnHammer = 'No hammer price', null);
  const grossYieldOnCash = totalCashInvested > 0 ? (grossAnnualRent / totalCashInvested) * 100 : (metricNotes.grossYieldOnCash = 'No cash invested', null);
  const grossYieldOnEndValue = endValue > 0 ? (grossAnnualRent / endValue) * 100 : (metricNotes.grossYieldOnEndValue = 'No end value', null);
  const netYieldBasis = 'totalCashInvested';
  const netYieldBasisValue = totalCashInvested;
  const netYield = netYieldBasisValue > 0 ? (netOperatingIncome / netYieldBasisValue) * 100 : (metricNotes.netYield = 'No basis value', null);

  let cashOnCash = null;
  if (cashLeftIn <= 0) {
    metricNotes.cashOnCash = cashLeftIn === 0 ? 'All capital recycled' : 'Surplus cash extracted';
  } else {
    cashOnCash = (annualCashflow / cashLeftIn) * 100;
  }

  const annualMortgageInterest = mortgage.type === 'io' ? annualMortgagePayment : finalMortgage * pf(mortgage.ratePct) / 100;
  let interestCoverage = null;
  if (finalMortgage <= 0 || annualMortgageInterest <= 0) {
    metricNotes.interestCoverage = 'No mortgage debt';
  } else {
    interestCoverage = netOperatingIncome / annualMortgageInterest;
  }
  let debtServiceCoverage = null;
  if (finalMortgage <= 0 || annualMortgagePayment <= 0) {
    metricNotes.debtServiceCoverage = 'No mortgage debt';
  } else {
    debtServiceCoverage = netOperatingIncome / annualMortgagePayment;
  }

  const refurbPctOfValue = endValue > 0 ? ((refurbBudget + contingency) / endValue) * 100 : (metricNotes.refurbPctOfValue = 'No end value', null);
  const projectCostPctOfValue = endValue > 0 ? (totalCashInvested / endValue) * 100 : (metricNotes.projectCostPctOfValue = 'No end value', null);

  // 13. Break-evens & refinance buffer
  // Solved numerically (bisection) rather than closed-form: opex items can be
  // pct-of-rent on either the gross or void-adjusted base, so a single algebraic
  // inverse would only hold for one specific opex composition.
  const cashflowAtRent = r => {
    const annualRent = r * 12;
    const vAdjusted = annualRent * (1 - voidPct / 100);
    const mgmt = vAdjusted * managementPct / 100;
    let other = 0;
    for (const key of otherOpexKeys) other += normaliseOpexItem(opex[key], annualRent);
    other += pf(opex.otherMonthly) * 12 + pf(opex.otherAnnual);
    const noi = vAdjusted - (mgmt + other);
    return noi / 12 - monthlyMortgagePayment;
  };
  let breakEvenMonthlyRent = null;
  if (voidPct < 100 && managementPct < 100) {
    let lo = 0, hi = Math.max(grossMonthlyRent, 1000) * 10 + 10000;
    if (cashflowAtRent(hi) >= 0) {
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (cashflowAtRent(mid) < 0) lo = mid; else hi = mid;
      }
      breakEvenMonthlyRent = hi;
    }
  }

  const requiredAnnualIncome = annualMortgagePayment + opexAnnual;
  const breakEvenOccupancyPct = grossAnnualRent > 0 ? (requiredAnnualIncome / grossAnnualRent) * 100 : null;
  if (breakEvenOccupancyPct != null && breakEvenOccupancyPct > 100) warnings.push({ code: 'W-OCC100', message: 'Break-even occupancy exceeds 100%' });

  const minValueToSupportMortgage = ltvPct > 0 ? finalMortgage / (ltvPct / 100) : 0;
  const refinanceBuffer = endValue - minValueToSupportMortgage;

  return {
    sdlt, buyersPremium, totalBuyingCosts,
    contingency, totalCashInvested,
    valueUplift, netValueUplift,
    grossMortgage, finalMortgage,
    netCashReturned,
    cashLeftIn, cashLeftInDisplay, surplusExtracted, cashLeftInForCoC,
    capitalRecycledAmount, capitalRecycledPct,
    equityRetained, equityRetainedPct, equityCreated, loanToCostPct,
    monthlyMortgagePayment, annualMortgagePayment,
    stressMonthlyPayment, stressMonthlyCashflow, stressAnnualCashflow,
    grossAnnualRent, grossMonthlyRent, voidAllowance, voidAdjustedRent,
    management, opexAnnual, netOperatingIncome,
    monthlyCashflow: monthlyCashflowBlocked ? null : monthlyCashflow,
    annualCashflow: monthlyCashflowBlocked ? null : annualCashflow,
    grossYieldOnHammer, grossYieldOnCash, grossYieldOnEndValue,
    netYield, netYieldBasis,
    cashOnCash, interestCoverage, debtServiceCoverage,
    refurbPctOfValue, projectCostPctOfValue,
    breakEvenMonthlyRent, breakEvenOccupancyPct, refinanceBuffer,
    metricNotes, warnings,
  };
}
