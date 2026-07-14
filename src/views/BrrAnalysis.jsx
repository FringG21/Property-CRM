import React, { useState, useEffect } from 'react';
import {
  seedBrr, migrateBrrShape, resolveScenario, computeBrr,
  createScenario, duplicateScenario, renameScenario, deleteScenario,
  setActiveScenario, toggleLock, toggleArchive, setScenarioOverride, appendAudit,
  compQuality, findDuplicateGroups, recommendRent,
} from '../../worker/brrCalc.js';

const pf = v => parseFloat(v) || 0;
const SQM_TO_SQFT = 10.7639;

const EVIDENCE_TYPE_OPTIONS = [
  ['achieved', 'Achieved (tenancy signed)'], ['letAgreed', 'Let agreed'],
  ['agentAppraisal', 'Agent appraisal'], ['reducedAsking', 'Reduced asking'],
  ['asking', 'Asking'], ['userEvidence', 'User evidence'],
];
const CONDITION_OPTIONS = [['', '—'], ['poor', 'Poor'], ['average', 'Average'], ['good', 'Good'], ['refurbished', 'Refurbished']];
const FURNISHED_OPTIONS = [['', '—'], ['furnished', 'Furnished'], ['unfurnished', 'Unfurnished'], ['part', 'Part-furnished']];
const BLANK_COMP = {
  address: '', postcode: '', distanceMiles: null, monthlyRent: null, evidenceType: 'asking',
  listedAt: null, letAgreedAt: null, achievedAt: null, propertyType: '', beds: null, baths: null,
  floorAreaSqm: null, condition: '', furnished: '', garden: null, parking: null, transportNote: '',
  source: '', evidenceUrl: '', adjustment: null, adjustmentReason: '', weight: 1, included: null, notes: '',
};

/** Reuses the existing staleChip visual convention (src/App.jsx:5669) — amber >90d, red >180d for rental evidence. */
function StaleChip({ staleFlag, ageDays }) {
  if (ageDays == null) return null;
  const cc = staleFlag === 'very-stale' ? { bg: '#fee2e2', fg: '#991b1b' } : staleFlag === 'stale' ? { bg: '#fef3c7', fg: '#92400e' } : { bg: '#1e293b', fg: '#64748b' };
  return <span title={staleFlag ? 'Stale — refresh before relying on this comp' : 'Evidence age'} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: cc.bg, color: cc.fg, whiteSpace: 'nowrap' }}>{staleFlag ? '⚠ ' : ''}{ageDays < 1 ? 'today' : `${ageDays}d old`}</span>;
}

/** Draft-until-blur number input — used for rent fields once a recommendation exists, so a
 * reason prompt fires once per edit instead of once per keystroke. */
function CommitOnBlurInput({ value, onCommit, width }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  useEffect(() => { setDraft(value == null ? '' : String(value)); }, [value]);
  return (
    <input
      type="number"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { const v = draft === '' ? null : parseFloat(draft); if (v !== value) onCommit(v); }}
      style={{ width: width || '110px', minHeight: '32px', fontSize: '14px', border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', background: '#0b1120', color: COLORS.text, padding: '4px 8px', fontFamily: 'inherit' }}
    />
  );
}

// BRR Analysis — phase 2: flexible scenarios. Full scenario engine (create/
// rename/duplicate/delete/lock/archive/set-active), sparse per-scenario
// overrides, comparison table, audit trail. Dark palette + inline styles
// matching the existing canvas cards (docs/brr/03-ux-screens.md).

const COLORS = {
  cardBg: '#0f172a', panelBg: '#1e293b', border: '#1e293b', borderLight: '#334155',
  text: '#f1f5f9', textMuted: '#94a3b8', textFaint: '#64748b',
  accent: '#7C3AED', good: '#059669', warn: '#d97706', warnText: '#fbbf24', bad: '#dc2626',
};

const fmtGbp = v => (v == null || Number.isNaN(v)) ? '—' : `£${Math.round(v).toLocaleString()}`;
const fmtPct = v => (v == null || Number.isNaN(v)) ? '—' : `${v.toFixed(1)}%`;

const SOURCE_BADGE = {
  manual: { l: 'Manual', bg: '#1e293b', fg: '#94a3b8' },
  report: { l: 'Report', fg: '#60a5fa', bg: '#0c2a3d' },
  listing: { l: 'Listing', fg: '#94a3b8', bg: '#1e293b' },
  external: { l: 'External', fg: '#94a3b8', bg: '#1e293b' },
  brrDefault: { l: 'BRR default', fg: '#a78bfa', bg: '#2e1065' },
  scenario: { l: 'Scenario', fg: '#4ade80', bg: '#052e16' },
};

function SourceBadge({ source }) {
  const meta = SOURCE_BADGE[source] || SOURCE_BADGE.brrDefault;
  return (
    <span style={{ fontSize: '9px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.04em', padding: '1px 5px', borderRadius: '3px', background: meta.bg, color: meta.fg, whiteSpace: 'nowrap' }}>{meta.l}</span>
  );
}

function Section({ title, expanded, onToggle, children }) {
  return (
    <div style={{ border: `0.5px solid ${COLORS.borderLight}`, borderRadius: '8px', marginBottom: '10px', overflow: 'hidden', background: COLORS.cardBg }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: COLORS.text, fontFamily: 'inherit' }}>
        <span style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', color: COLORS.textMuted }}>{title}</span>
        <span style={{ color: COLORS.textFaint, fontSize: '12px' }}>{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && <div style={{ padding: '4px 14px 14px' }}>{children}</div>}
    </div>
  );
}

function Row({ label, source, overridden, onReset, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: `0.5px solid ${COLORS.border}`, flexWrap: 'wrap' }}>
      <span style={{ fontSize: '12px', color: COLORS.textMuted, minWidth: '150px', flex: '1 1 150px' }}>{label}</span>
      {children}
      {source && <SourceBadge source={source} />}
      {overridden && <button onClick={onReset} title="Reset to inherited" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: '13px', padding: '2px 4px' }}>↺</button>}
    </div>
  );
}

function NumInput({ value, onChange, width, min }) {
  return (
    <input
      type="number"
      value={value == null ? '' : value}
      min={min}
      onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
      style={{ width: width || '110px', minHeight: '32px', fontSize: '14px', border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', background: '#0b1120', color: COLORS.text, padding: '4px 8px', fontFamily: 'inherit' }}
    />
  );
}

function Select({ value, onChange, options, style }) {
  return (
    <select value={value} onChange={onChange} style={{ minHeight: '32px', fontSize: '13px', background: '#0b1120', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px', ...style }}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function KpiTile({ label, value, valueColor, isMobile }) {
  return (
    <div style={{ padding: '8px 10px', background: '#0b1120', border: `0.5px solid ${COLORS.border}`, borderRadius: '8px', minHeight: '44px' }}>
      <div style={{ fontSize: '10px', color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: '600', color: valueColor || COLORS.text }}>{value}</div>
    </div>
  );
}

function computeVerdict(out) {
  const cashflow = out.monthlyCashflow;
  const recycled = out.capitalRecycledPct;
  if (cashflow == null) {
    return { label: 'Insufficient data', color: COLORS.textFaint, explanation: 'Set a rent figure to compute cash flow.' };
  }
  if (cashflow > 0 && recycled != null && recycled >= 50) {
    return {
      label: 'Cash-flowing BRR', color: COLORS.good,
      explanation: `Produces ${fmtGbp(cashflow)}/mo cash flow and recycles ${fmtPct(recycled)} of capital invested.`,
    };
  }
  if (cashflow >= 0) {
    return {
      label: 'Marginal', color: COLORS.warn,
      explanation: `Cash flow is ${fmtGbp(cashflow)}/mo but only ${recycled != null ? fmtPct(recycled) : '—'} of capital is recycled at refinance.`,
    };
  }
  return {
    label: 'Negative cash flow', color: COLORS.bad,
    explanation: `Cash flow is ${fmtGbp(cashflow)}/mo — this scenario loses money every month at the assumed rent and mortgage terms.`,
  };
}

const PRICE_BASIS_OPTIONS = [
  ['guide', 'Guide price'], ['currentBid', 'Current auction bid'],
  ['target', 'Target purchase price'], ['stretch', 'Stretch purchase price'],
];
const PRICE_BASIS_LABEL = { guide: 'Guide', currentBid: 'Current bid', target: 'Target', stretch: 'Stretch', assumed: 'Assumed', maxBrrBid: 'Max BRR bid', confirmed: 'Confirmed' };

const COMPARISON_COLUMNS = [
  { k: 'name', l: 'Scenario' },
  { k: 'hammer', l: 'Assumed hammer', fmt: fmtGbp },
  { k: 'refurbPlusContingency', l: 'Refurb + contingency', fmt: fmtGbp },
  { k: 'totalBuyingCosts', l: 'Total buying costs', fmt: fmtGbp },
  { k: 'totalCashInvested', l: 'Total cash invested', fmt: fmtGbp, lowerBetter: true },
  { k: 'endValue', l: 'End value', fmt: fmtGbp },
  { k: 'ltvPct', l: 'LTV', fmt: fmtPct },
  { k: 'ratePct', l: 'Rate', fmt: fmtPct },
  { k: 'finalMortgage', l: 'Mortgage', fmt: fmtGbp },
  { k: 'netCashReturned', l: 'Cash returned', fmt: fmtGbp },
  { k: 'cashLeftIn', l: 'Cash left in', fmt: fmtGbp, lowerBetter: true },
  { k: 'capitalRecycledPct', l: 'Recycled %', fmt: fmtPct, higherBetter: true },
  { k: 'surplusExtracted', l: 'Surplus', fmt: fmtGbp },
  { k: 'equityRetained', l: 'Equity retained', fmt: fmtGbp, higherBetter: true },
  { k: 'grossMonthlyRent', l: 'Rent', fmt: fmtGbp },
  { k: 'monthlyMortgagePayment', l: 'Mortgage payment', fmt: fmtGbp },
  { k: 'monthlyCashflow', l: 'Monthly cash flow', fmt: fmtGbp, higherBetter: true },
  { k: 'stressMonthlyCashflow', l: 'Stressed cash flow', fmt: fmtGbp, higherBetter: true },
  { k: 'grossYieldOnHammer', l: 'Gross yield', fmt: fmtPct, higherBetter: true },
  { k: 'netYield', l: 'Net yield', fmt: fmtPct, higherBetter: true },
  { k: 'maxBidResult', l: 'Max-bid result', fmt: v => v || '—' },
  { k: 'valuationConfidence', l: 'Valuation confidence', fmt: v => v || '—' },
  { k: 'rentalConfidence', l: 'Rental confidence', fmt: v => v || '—' },
  { k: 'verdict', l: 'Verdict', fmt: v => v || '—' },
];

export default function BrrAnalysis({ property, updateFieldInView, addBid, logTimeline, isMobile, isTablet, userName }) {
  const [expanded, setExpanded] = useState({ price: true, costs: false, endValue: false, mortgage: false, rent: false, opex: false, comps: false, comparison: false, audit: false });
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [compDraft, setCompDraft] = useState(null);
  const [editingCompId, setEditingCompId] = useState(null);
  const toggle = key => setExpanded(e => ({ ...e, [key]: !e[key] }));

  if (!property) return null;

  if (!property.brr) {
    const seeded = seedBrr(property);
    updateFieldInView('brr', seeded);
    return <div style={{ padding: '20px', color: COLORS.textMuted, fontSize: '13px' }}>Setting up BRR analysis…</div>;
  }

  if (property.brr.scenarios.length < 4) {
    const migrated = migrateBrrShape(property.brr);
    updateFieldInView('brr', migrated);
    return <div style={{ padding: '20px', color: COLORS.textMuted, fontSize: '13px' }}>Upgrading BRR analysis…</div>;
  }

  const brr = property.brr;
  const scenario = brr.scenarios.find(s => s.id === brr.activeScenarioId) || brr.scenarios[0];
  const nowIso = () => new Date().toISOString();
  const stamp = (b, patch) => appendAudit(b, { at: nowIso(), user: userName || 'You', ...patch });

  // Every mutation funnels through exactly one App-level write per action:
  // logTimeline() for coarse scenario events (also lands on the Timeline tab),
  // updateFieldInView('brr', …) for quiet per-field edits.
  const applyOverride = (path, value, opts = {}) => {
    let workingBrr = brr;
    let sc = scenario;
    let timelineDetail = null;
    if (sc.locked) {
      if (!window.confirm('Scenario is locked — unlock and edit?')) return;
      workingBrr = toggleLock(workingBrr, sc.id);
      workingBrr = stamp(workingBrr, { scenarioId: sc.id, field: 'locked', prev: true, next: false, reason: null });
      sc = workingBrr.scenarios.find(s => s.id === sc.id);
      timelineDetail = `Scenario unlocked: ${sc.name}`;
    }
    let reason = null;
    if (opts.requireReason) {
      reason = window.prompt('This rent has a recommended value from your comps — reason for overriding it:', '');
      if (!reason) return;
    }
    const before = sc.overrides;
    const result = setScenarioOverride(workingBrr, sc.id, path, value);
    if (result.error) return;
    workingBrr = stamp(result.brr, { scenarioId: sc.id, field: path, prev: before, next: value, reason });
    if (timelineDetail && logTimeline) logTimeline(workingBrr, timelineDetail);
    else updateFieldInView('brr', workingBrr);
  };

  const applyScenarioField = (fields) => {
    let workingBrr = brr;
    let sc = scenario;
    let timelineDetail = null;
    if (sc.locked) {
      if (!window.confirm('Scenario is locked — unlock and edit?')) return;
      workingBrr = toggleLock(workingBrr, sc.id);
      workingBrr = stamp(workingBrr, { scenarioId: sc.id, field: 'locked', prev: true, next: false, reason: null });
      sc = workingBrr.scenarios.find(s => s.id === sc.id);
      timelineDetail = `Scenario unlocked: ${sc.name}`;
    }
    const nextScenario = { ...sc, ...fields, updatedAt: nowIso() };
    const nextScenarios = workingBrr.scenarios.map(s => s.id === sc.id ? nextScenario : s);
    workingBrr = { ...workingBrr, scenarios: nextScenarios };
    if (timelineDetail && logTimeline) logTimeline(workingBrr, timelineDetail);
    else updateFieldInView('brr', workingBrr);
  };

  const patchOverrides = patch => Object.entries(patch).forEach(([k, v]) => applyOverride(k, v));
  const patchDeepOverride = (group, patch, opts) => applyOverride(group, { ...(scenario.overrides[group] || {}), ...patch }, opts);
  const resetOverride = key => {
    const next = { ...scenario.overrides };
    delete next[key];
    applyScenarioField({ overrides: next });
  };
  const setAssumedHammer = value => applyScenarioField({ assumedHammerPrice: value, priceBasis: value != null ? 'assumed' : scenario.priceBasis });
  const setPriceBasis = basis => applyScenarioField({ priceBasis: basis, assumedHammerPrice: null });

  // Scenario manager actions — coarse, always logged to the property Timeline.
  const doSetActive = id => updateFieldInView('brr', setActiveScenario(brr, id));
  const doCreate = () => {
    const { brr: next, scenario: created } = createScenario(brr, 'custom');
    const withAudit = stamp(next, { scenarioId: created.id, field: 'scenario', prev: null, next: created.name, reason: null });
    logTimeline(withAudit, `Scenario created: ${created.name}`);
  };
  const doDuplicate = id => {
    const src = brr.scenarios.find(s => s.id === id);
    const { brr: next, scenario: dup, error } = duplicateScenario(brr, id);
    if (error) return;
    const withAudit = stamp(next, { scenarioId: dup.id, field: 'scenario', prev: null, next: dup.name, reason: null });
    logTimeline(withAudit, `Scenario duplicated from ${src.name}: ${dup.name}`);
  };
  const startRename = s => { setRenamingId(s.id); setRenameDraft(s.name); };
  const commitRename = () => {
    const { brr: next, error } = renameScenario(brr, renamingId, renameDraft.trim() || 'Untitled');
    setRenamingId(null);
    if (error) { window.alert(error); return; }
    updateFieldInView('brr', next);
  };
  const doDelete = id => {
    const target = brr.scenarios.find(s => s.id === id);
    if (!window.confirm(`Delete scenario "${target.name}"? This cannot be undone.`)) return;
    const { brr: next, error } = deleteScenario(brr, id);
    if (error) { window.alert(error); return; }
    const withAudit = stamp(next, { scenarioId: id, field: 'scenario', prev: target.name, next: null, reason: null });
    logTimeline(withAudit, `Scenario deleted: ${target.name}`);
  };
  const doToggleLock = id => {
    const target = brr.scenarios.find(s => s.id === id);
    const next = toggleLock(brr, id);
    const withAudit = stamp(next, { scenarioId: id, field: 'locked', prev: target.locked, next: !target.locked, reason: null });
    logTimeline(withAudit, `Scenario ${!target.locked ? 'locked' : 'unlocked'}: ${target.name}`);
  };
  const doToggleArchive = id => {
    const target = brr.scenarios.find(s => s.id === id);
    const next = toggleArchive(brr, id);
    const withAudit = stamp(next, { scenarioId: id, field: 'archived', prev: target.archived, next: !target.archived, reason: null });
    updateFieldInView('brr', withAudit);
  };
  const doToggleIncludeInComparison = id => {
    const target = brr.scenarios.find(s => s.id === id);
    applyScenarioFieldFor(id, { includeInComparison: !target.includeInComparison });
  };
  function applyScenarioFieldFor(id, fields) {
    const nextScenarios = brr.scenarios.map(s => s.id === id ? { ...s, ...fields, updatedAt: nowIso() } : s);
    updateFieldInView('brr', { ...brr, scenarios: nextScenarios });
  }

  // --- Rental comparables (section 6) ---------------------------------------
  const an = property.analytics || {};
  const subject = {
    beds: parseInt(property.beds, 10) || null,
    propertyType: property.propertyType || null,
    floorAreaSqm: parseFloat(property.floorArea) || parseFloat(an.floorArea) || null,
    garden: null, parking: null, furnished: null,
  };
  const rentalComps = brr.rentalComps || [];
  const dupGroups = findDuplicateGroups(rentalComps);

  const recomputeAndCommit = (nextRentalComps, auditPatch) => {
    const rec = recommendRent(nextRentalComps, subject, new Date());
    let workingBrr = { ...brr, rentalComps: nextRentalComps, rentRecommendation: rec };
    if (auditPatch) workingBrr = stamp(workingBrr, auditPatch);
    updateFieldInView('brr', workingBrr);
  };

  const saveComp = (draft, editingId) => {
    if (!draft.address || !draft.address.trim()) { window.alert('Address is required.'); return false; }
    if (!(pf(draft.monthlyRent) > 0)) { window.alert('Monthly rent is required.'); return false; }
    if (pf(draft.adjustment) !== 0 && !draft.adjustmentReason) { window.alert('A reason is required when setting an adjustment.'); return false; }
    const isNew = !editingId;
    const now = nowIso();
    const compId = editingId || `rc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    let nextComp = { ...draft, id: compId, createdAt: isNew ? now : draft.createdAt, addedBy: isNew ? (userName || 'You') : draft.addedBy };
    let nextComps;
    if (isNew) {
      nextComps = [...rentalComps, nextComp];
      if (nextComp.included == null) {
        const groups = findDuplicateGroups(nextComps);
        const group = groups[compId];
        const groupHasIncluded = group && group.some(id => id !== compId && (nextComps.find(c => c.id === id) || {}).included !== false);
        nextComp = { ...nextComp, included: !groupHasIncluded };
        nextComps = nextComps.map(c => c.id === compId ? nextComp : c);
      }
    } else {
      nextComps = rentalComps.map(c => c.id === compId ? nextComp : c);
    }
    recomputeAndCommit(nextComps, { scenarioId: null, field: 'rentalComps', prev: isNew ? null : editingId, next: nextComp.address, reason: null });
    return true;
  };
  const deleteComp = id => {
    const target = rentalComps.find(c => c.id === id);
    if (!window.confirm(`Delete this comparable (${target.address})? This cannot be undone.`)) return;
    recomputeAndCommit(rentalComps.filter(c => c.id !== id), { scenarioId: null, field: 'rentalComps', prev: target.address, next: null, reason: null });
  };
  const toggleIncludeComp = id => {
    const target = rentalComps.find(c => c.id === id);
    const nextComps = rentalComps.map(c => c.id === id ? { ...c, included: c.included === false } : c);
    recomputeAndCommit(nextComps, { scenarioId: null, field: 'rentalComp.included', prev: target.included !== false, next: target.included === false, reason: null });
  };
  const useRecommended = () => {
    const rec = brr.rentRecommendation;
    if (!rec || rec.recommended == null) return;
    const nextRent = { ...brr.defaults.rent, conservative: rec.conservative, expected: rec.expected, optimistic: rec.optimistic };
    const nextBrr = stamp({ ...brr, defaults: { ...brr.defaults, rent: nextRent } }, { scenarioId: null, field: 'defaults.rent', prev: brr.defaults.rent, next: nextRent, reason: null });
    updateFieldInView('brr', nextBrr);
  };

  const includedComps = rentalComps.filter(c => c.included !== false);
  const rentWarnings = {
    noComps: includedComps.length === 0,
    askingOnly: includedComps.length > 0 && includedComps.every(c => c.evidenceType === 'asking'),
    allStale: includedComps.length > 0 && includedComps.every(c => compQuality(c, subject, new Date()).staleFlag != null),
  };

  const { inputs: resolved, sources } = resolveScenario(property, brr, scenario);
  const out = computeBrr(resolved);
  const verdict = computeVerdict(out);
  const blocked = resolved.hammer <= 0;
  const rec = brr.rentRecommendation;
  rentWarnings.rentHigh = !!(rec && rec.optimistic != null && resolved.grossMonthlyRent > rec.optimistic * 1.05);

  const priceBasisLabel = scenario.assumedHammerPrice != null ? 'Assumed' : (PRICE_BASIS_LABEL[scenario.priceBasis] || 'Guide');
  const nonArchived = brr.scenarios.filter(s => !s.archived);

  const kpis = [
    { l: 'Assumed hammer', v: blocked ? '—' : fmtGbp(resolved.hammer) },
    { l: 'Max BRR bid', v: '—' },
    { l: 'Bidding headroom', v: '—' },
    { l: 'Total cash invested', v: blocked ? '—' : fmtGbp(out.totalCashInvested) },
    { l: 'End value', v: fmtGbp(resolved.selectedEndValue) },
    { l: 'Refinance mortgage', v: fmtGbp(out.finalMortgage) },
    { l: 'Cash returned', v: fmtGbp(out.netCashReturned) },
    { l: 'Cash left in', v: out.cashLeftIn > 0 ? fmtGbp(out.cashLeftIn) : (out.cashLeftIn === 0 ? 'All recycled' : `Surplus £${Math.round(out.surplusExtracted).toLocaleString()}`), c: out.cashLeftIn > 0 ? COLORS.warnText : COLORS.good },
    { l: 'Capital recycled', v: fmtPct(out.capitalRecycledPct), c: out.capitalRecycledPct != null && out.capitalRecycledPct >= 100 ? COLORS.good : undefined },
    { l: 'Equity retained', v: fmtGbp(out.equityRetained) },
    { l: 'Monthly rent', v: fmtGbp(resolved.grossMonthlyRent) },
    { l: 'Mortgage payment', v: fmtGbp(out.monthlyMortgagePayment) + '/mo' },
    { l: 'Monthly cash flow', v: out.monthlyCashflow == null ? '—' : fmtGbp(out.monthlyCashflow) + '/mo', c: out.monthlyCashflow == null ? undefined : out.monthlyCashflow >= 0 ? COLORS.good : COLORS.bad },
    { l: 'Stressed cash flow', v: out.stressMonthlyCashflow == null ? '—' : fmtGbp(out.stressMonthlyCashflow) + '/mo', c: out.stressMonthlyCashflow != null && out.stressMonthlyCashflow < 0 ? COLORS.bad : undefined },
    { l: 'Gross yield', v: fmtPct(out.grossYieldOnHammer) },
    { l: 'Net yield', v: fmtPct(out.netYield) },
    { l: 'Rental confidence', v: brr.defaults.rent.confidence || '—' },
    { l: 'Valuation confidence', v: brr.defaults.endValue.confidence || '—' },
    { l: 'Limiting rule', v: '—' },
  ];

  const opex = resolved.opex;
  const opexItems = [
    ['maintenance', 'Maintenance'], ['insurance', 'Insurance'], ['serviceCharge', 'Service charge'],
    ['groundRent', 'Ground rent'], ['licensing', 'Licensing'], ['compliance', 'Compliance'],
    ['utilities', 'Utilities'], ['councilTax', 'Council tax'], ['cleaning', 'Cleaning'], ['gardening', 'Gardening'],
  ];

  // Comparison table rows: resolve + compute every included, non-archived scenario.
  const comparisonRows = nonArchived.filter(s => s.includeInComparison).map(s => {
    const r = resolveScenario(property, brr, s);
    const o = computeBrr(r.inputs);
    const v = computeVerdict(o);
    return {
      id: s.id, name: s.name, locked: s.locked,
      hammer: r.inputs.hammer,
      refurbPlusContingency: r.inputs.refurbBudget + (r.inputs.refurbBudget * r.inputs.contingencyPct / 100),
      totalBuyingCosts: o.totalBuyingCosts,
      totalCashInvested: o.totalCashInvested,
      endValue: r.inputs.selectedEndValue,
      ltvPct: r.inputs.mortgage.ltvPct,
      ratePct: r.inputs.mortgage.ratePct,
      finalMortgage: o.finalMortgage,
      netCashReturned: o.netCashReturned,
      cashLeftIn: o.cashLeftIn > 0 ? o.cashLeftIn : 0,
      capitalRecycledPct: o.capitalRecycledPct,
      surplusExtracted: o.surplusExtracted,
      equityRetained: o.equityRetained,
      grossMonthlyRent: r.inputs.grossMonthlyRent,
      monthlyMortgagePayment: o.monthlyMortgagePayment,
      monthlyCashflow: o.monthlyCashflow,
      stressMonthlyCashflow: o.stressMonthlyCashflow,
      grossYieldOnHammer: o.grossYieldOnHammer,
      netYield: o.netYield,
      maxBidResult: null,
      valuationConfidence: brr.defaults.endValue.confidence,
      rentalConfidence: brr.defaults.rent.confidence,
      verdict: v.label,
    };
  });
  const bestWorst = {};
  if (comparisonRows.length >= 2) {
    for (const col of COMPARISON_COLUMNS) {
      if (!col.higherBetter && !col.lowerBetter) continue;
      const values = comparisonRows.map(r => r[col.k]).filter(v => v != null && !Number.isNaN(v));
      if (values.length < 2) continue;
      const best = col.higherBetter ? Math.max(...values) : Math.min(...values);
      const worst = col.higherBetter ? Math.min(...values) : Math.max(...values);
      bestWorst[col.k] = { best, worst };
    }
  }

  const auditEntries = brr.audit || [];
  const auditVisible = auditEntries.slice(0, auditPage * 20);

  return (
    <div style={{ padding: isMobile ? '10px' : '16px 20px', background: '#0b1120' }}>
      {/* Sticky summary dashboard */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: COLORS.cardBg, border: `0.5px solid ${COLORS.borderLight}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
          {isMobile ? (
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', flex: '1 1 100%' }}>
              {nonArchived.map(s => (
                <button key={s.id} onClick={() => doSetActive(s.id)} style={{ flexShrink: 0, fontSize: '12px', fontWeight: '600', padding: '6px 12px', minHeight: '32px', borderRadius: '14px', border: `1px solid ${s.id === scenario.id ? COLORS.accent : COLORS.borderLight}`, background: s.id === scenario.id ? COLORS.accent : 'transparent', color: s.id === scenario.id ? '#fff' : COLORS.textMuted, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {s.name}{s.locked ? ' 🔒' : ''}
                </button>
              ))}
            </div>
          ) : (
            <select value={scenario.id} onChange={e => doSetActive(e.target.value)} style={{ minHeight: '32px', fontSize: '13px', fontWeight: '600', background: '#0b1120', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 10px' }}>
              {nonArchived.map(s => <option key={s.id} value={s.id}>{s.name}{s.locked ? ' 🔒' : ''}</option>)}
            </select>
          )}
          <span style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.04em', padding: '2px 7px', borderRadius: '10px', background: scenario.priceBasis === 'confirmed' ? '#052e16' : '#1e293b', color: scenario.priceBasis === 'confirmed' ? '#4ade80' : '#a78bfa' }}>
            {priceBasisLabel} price {scenario.priceBasis === 'confirmed' ? '🔒' : ''}
          </span>
          <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 9px', borderRadius: '10px', background: `${verdict.color}22`, color: verdict.color, border: `1px solid ${verdict.color}` }}>{verdict.label}</span>
        </div>
        <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '12px' }}>{verdict.explanation}</div>
        {blocked && (
          <div style={{ fontSize: '12px', color: COLORS.warnText, background: '#3a2a06', border: '0.5px solid #d97706', borderRadius: '6px', padding: '8px 10px', marginBottom: '12px' }}>
            No hammer price set — set a guide price or an assumed hammer to calculate.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '8px' }}>
          {kpis.map(k => <KpiTile key={k.l} label={k.l} value={k.v} valueColor={k.c} isMobile={isMobile} />)}
        </div>
      </div>

      {/* Section 1 — Purchase-price scenario + manager */}
      <Section title="1. Purchase-price scenario" expanded={expanded.price} onToggle={() => toggle('price')}>
        <Row label="Price basis">
          <Select value={scenario.priceBasis} onChange={e => setPriceBasis(e.target.value)} options={PRICE_BASIS_OPTIONS} />
        </Row>
        <Row label="Assumed hammer price override" source={scenario.assumedHammerPrice != null ? 'scenario' : null} overridden={scenario.assumedHammerPrice != null} onReset={() => setAssumedHammer(null)}>
          <NumInput value={scenario.assumedHammerPrice} onChange={setAssumedHammer} />
        </Row>
        <Row label="Effective hammer used in calc" source={sources.hammer}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: COLORS.text }}>{fmtGbp(resolved.hammer)}</span>
        </Row>

        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `0.5px solid ${COLORS.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', color: COLORS.textFaint }}>Scenario manager</span>
            <button onClick={doCreate} style={{ fontSize: '11px', fontWeight: '600', color: COLORS.accent, background: 'transparent', border: `1px solid ${COLORS.accent}`, borderRadius: '6px', padding: '5px 10px', minHeight: '32px', cursor: 'pointer' }}>+ New scenario</button>
          </div>
          {brr.scenarios.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', padding: '7px 0', borderBottom: `0.5px solid ${COLORS.border}`, opacity: s.archived ? 0.5 : 1 }}>
              {renamingId === s.id ? (
                <input autoFocus value={renameDraft} onChange={e => setRenameDraft(e.target.value)} onBlur={commitRename} onKeyDown={e => e.key === 'Enter' && commitRename()} style={{ minHeight: '32px', fontSize: '13px', background: '#0b1120', color: COLORS.text, border: `1px solid ${COLORS.accent}`, borderRadius: '6px', padding: '4px 8px', flex: '1 1 140px' }} />
              ) : (
                <button onClick={() => doSetActive(s.id)} style={{ flex: '1 1 140px', textAlign: 'left', fontSize: '13px', fontWeight: s.id === scenario.id ? '700' : '400', color: s.id === scenario.id ? COLORS.text : COLORS.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
                  {s.id === scenario.id ? '● ' : '○ '}{s.name} <span style={{ fontSize: '10px', color: COLORS.textFaint }}>({s.type})</span>{s.locked ? ' 🔒' : ''}{s.archived ? ' (archived)' : ''}
                </button>
              )}
              <button onClick={() => startRename(s)} title="Rename" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textFaint, fontSize: '13px', padding: '4px' }}>✏️</button>
              <button onClick={() => doDuplicate(s.id)} title="Duplicate" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textFaint, fontSize: '13px', padding: '4px' }}>⧉</button>
              <button onClick={() => doToggleLock(s.id)} title={s.locked ? 'Unlock' : 'Lock'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.locked ? COLORS.warnText : COLORS.textFaint, fontSize: '13px', padding: '4px' }}>{s.locked ? '🔒' : '🔓'}</button>
              <button onClick={() => doToggleArchive(s.id)} title={s.archived ? 'Unarchive' : 'Archive'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.textFaint, fontSize: '13px', padding: '4px' }}>{s.archived ? '📤' : '📥'}</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: COLORS.textFaint }}>
                <input type="checkbox" checked={s.includeInComparison} onChange={() => doToggleIncludeInComparison(s.id)} /> Compare
              </label>
              <button onClick={() => doDelete(s.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.bad, fontSize: '13px', padding: '4px' }}>🗑</button>
            </div>
          ))}
        </div>
      </Section>

      {/* Section 2 — Purchase & refurb costs */}
      <Section title="2. Purchase & refurb costs" expanded={expanded.costs} onToggle={() => toggle('costs')}>
        <Row label="Buyer's premium %" source={sources.buyersPremiumPct} overridden={scenario.overrides.buyersPremiumPct != null} onReset={() => resetOverride('buyersPremiumPct')}>
          <NumInput value={resolved.buyersPremiumPct} onChange={v => patchOverrides({ buyersPremiumPct: v })} />
        </Row>
        <Row label="Admin fee" source={sources.adminFee} overridden={scenario.overrides.adminFee != null} onReset={() => resetOverride('adminFee')}>
          <NumInput value={resolved.adminFee} onChange={v => patchOverrides({ adminFee: v })} />
        </Row>
        <Row label="Legal fees" source={sources.legalFees} overridden={scenario.overrides.legalFees != null} onReset={() => resetOverride('legalFees')}>
          <NumInput value={resolved.legalFees} onChange={v => patchOverrides({ legalFees: v })} />
        </Row>
        <Row label="Survey cost" source={sources.surveyCost} overridden={scenario.overrides.surveyCost != null} onReset={() => resetOverride('surveyCost')}>
          <NumInput value={resolved.surveyCost} onChange={v => patchOverrides({ surveyCost: v })} />
        </Row>
        <Row label="SDLT (computed)">
          <span style={{ fontSize: '13px', color: COLORS.text }}>{fmtGbp(out.sdlt)}</span>
        </Row>
        <Row label="Refurb budget" source={sources.refurbBudget} overridden={scenario.overrides.refurbBudget != null} onReset={() => resetOverride('refurbBudget')}>
          <NumInput value={resolved.refurbBudget} onChange={v => patchOverrides({ refurbBudget: v })} />
        </Row>
        <Row label="Contingency %" source={sources.contingencyPct} overridden={scenario.overrides.contingencyPct != null} onReset={() => resetOverride('contingencyPct')}>
          <NumInput value={resolved.contingencyPct} onChange={v => patchOverrides({ contingencyPct: v })} />
        </Row>
        <Row label="Holding cost (£ total)" source={sources.holdingCost} overridden={scenario.overrides.holdingCost != null} onReset={() => resetOverride('holdingCost')}>
          <NumInput value={resolved.holdingCost} onChange={v => patchOverrides({ holdingCost: v })} />
        </Row>
      </Section>

      {/* Section 3 — End-value assumptions */}
      <Section title="3. End-value assumptions" expanded={expanded.endValue} onToggle={() => toggle('endValue')}>
        <Row label="Conservative">
          <NumInput value={resolved.endValue.conservative} onChange={v => patchDeepOverride('endValue', { conservative: v })} />
        </Row>
        <Row label="Expected">
          <NumInput value={resolved.endValue.expected} onChange={v => patchDeepOverride('endValue', { expected: v })} />
        </Row>
        <Row label="Optimistic">
          <NumInput value={resolved.endValue.optimistic} onChange={v => patchDeepOverride('endValue', { optimistic: v })} />
        </Row>
        <Row label="Custom">
          <NumInput value={resolved.endValue.custom} onChange={v => patchDeepOverride('endValue', { custom: v })} />
        </Row>
        <Row label="Selected basis">
          <Select value={resolved.endValue.selected} onChange={e => patchDeepOverride('endValue', { selected: e.target.value })} options={[['conservative', 'Conservative'], ['expected', 'Expected'], ['optimistic', 'Optimistic'], ['custom', 'Custom']]} />
        </Row>
      </Section>

      {/* Section 4 — Mortgage assumptions */}
      <Section title="4. Mortgage assumptions" expanded={expanded.mortgage} onToggle={() => toggle('mortgage')}>
        <Row label="LTV %">
          <NumInput value={resolved.mortgage.ltvPct} onChange={v => patchDeepOverride('mortgage', { ltvPct: v })} />
        </Row>
        <Row label="Rate %">
          <NumInput value={resolved.mortgage.ratePct} onChange={v => patchDeepOverride('mortgage', { ratePct: v })} />
        </Row>
        <Row label="Type">
          <Select value={resolved.mortgage.type} onChange={e => patchDeepOverride('mortgage', { type: e.target.value })} options={[['io', 'Interest-only'], ['repayment', 'Repayment']]} />
        </Row>
        <Row label="Term (years)">
          <NumInput value={resolved.mortgage.termYears} onChange={v => patchDeepOverride('mortgage', { termYears: v })} />
        </Row>
        <Row label="Max mortgage override">
          <NumInput value={resolved.mortgage.maxMortgageOverride} onChange={v => patchDeepOverride('mortgage', { maxMortgageOverride: v })} />
        </Row>
        <Row label="Stress rate %">
          <NumInput value={resolved.mortgage.stressRatePct} onChange={v => patchDeepOverride('mortgage', { stressRatePct: v })} />
        </Row>
      </Section>

      {/* Section 5 — Rental assumptions */}
      <Section title="5. Rental assumptions" expanded={expanded.rent} onToggle={() => toggle('rent')}>
        {rec && (
          <div style={{ fontSize: '11px', color: COLORS.textFaint, marginBottom: '8px' }}>
            A recommendation exists from your comps — editing these fields will ask for a reason.
          </div>
        )}
        {(() => {
          const RentInput = rec ? CommitOnBlurInput : NumInput;
          const commitRent = (key, v) => patchDeepOverride('rent', { [key]: v }, { requireReason: !!rec });
          return (
            <>
              <Row label="Conservative">
                <RentInput value={resolved.rent.conservative} onChange={v => commitRent('conservative', v)} onCommit={v => commitRent('conservative', v)} />
              </Row>
              <Row label="Expected">
                <RentInput value={resolved.rent.expected} onChange={v => commitRent('expected', v)} onCommit={v => commitRent('expected', v)} />
              </Row>
              <Row label="Optimistic">
                <RentInput value={resolved.rent.optimistic} onChange={v => commitRent('optimistic', v)} onCommit={v => commitRent('optimistic', v)} />
              </Row>
              <Row label="Custom">
                <RentInput value={resolved.rent.custom} onChange={v => commitRent('custom', v)} onCommit={v => commitRent('custom', v)} />
              </Row>
            </>
          );
        })()}
        <Row label="Selected basis">
          <Select value={resolved.rent.selected} onChange={e => patchDeepOverride('rent', { selected: e.target.value })} options={[['conservative', 'Conservative'], ['expected', 'Expected'], ['optimistic', 'Optimistic'], ['custom', 'Custom']]} />
        </Row>
      </Section>

      {/* Section 6 — Rental comparables */}
      <Section title="6. Rental comparables" expanded={expanded.comps} onToggle={() => toggle('comps')}>
        {(rentWarnings.noComps || rentWarnings.askingOnly || rentWarnings.allStale || rentWarnings.rentHigh) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
            {rentWarnings.noComps && <span style={{ fontSize: '11px', color: COLORS.warnText }}>⚠ No rental comparables added yet.</span>}
            {rentWarnings.askingOnly && <span style={{ fontSize: '11px', color: COLORS.warnText }}>⚠ Evidence is asking-only — rents discounted 3% in the calc.</span>}
            {rentWarnings.allStale && <span style={{ fontSize: '11px', color: COLORS.warnText }}>⚠ All included comps are stale (&gt;90 days old).</span>}
            {rentWarnings.rentHigh && <span style={{ fontSize: '11px', color: COLORS.bad }}>⚠ Selected rent is more than 5% above the optimistic evidence estimate.</span>}
          </div>
        )}

        {rec && (
          <div style={{ border: `0.5px solid ${COLORS.borderLight}`, borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', background: '#0b1120' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: COLORS.textMuted }}>Conservative <strong style={{ color: COLORS.text }}>{fmtGbp(rec.conservative)}</strong></span>
                <span style={{ fontSize: '12px', color: COLORS.textMuted }}>Recommended <strong style={{ color: COLORS.accent }}>{fmtGbp(rec.recommended)}</strong></span>
                <span style={{ fontSize: '12px', color: COLORS.textMuted }}>Optimistic <strong style={{ color: COLORS.text }}>{fmtGbp(rec.optimistic)}</strong></span>
                <span style={{ fontSize: '11px', color: COLORS.textFaint, textTransform: 'uppercase' }}>Confidence: {rec.confidence}</span>
              </div>
              <button onClick={useRecommended} disabled={rec.recommended == null} style={{ fontSize: '11px', fontWeight: '600', color: rec.recommended == null ? COLORS.textFaint : COLORS.accent, background: 'transparent', border: `1px solid ${rec.recommended == null ? COLORS.borderLight : COLORS.accent}`, borderRadius: '6px', padding: '6px 10px', minHeight: '32px', cursor: rec.recommended == null ? 'not-allowed' : 'pointer' }}>Use recommended</button>
            </div>
          </div>
        )}

        {!compDraft ? (
          <button onClick={() => { setEditingCompId(null); setCompDraft({ ...BLANK_COMP }); }} style={{ fontSize: '11px', fontWeight: '600', color: COLORS.accent, background: 'transparent', border: `1px solid ${COLORS.accent}`, borderRadius: '6px', padding: '6px 10px', minHeight: '32px', cursor: 'pointer', marginBottom: '10px' }}>+ Add comparable</button>
        ) : (
          <div style={{ border: `1px solid ${COLORS.accent}`, borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', background: '#0b1120' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Address
                <input value={compDraft.address} onChange={e => setCompDraft({ ...compDraft, address: e.target.value })} style={{ minHeight: '32px', fontSize: '13px', background: '#1e293b', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Postcode
                <input value={compDraft.postcode || ''} onChange={e => setCompDraft({ ...compDraft, postcode: e.target.value })} style={{ minHeight: '32px', fontSize: '13px', background: '#1e293b', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Monthly rent (£)
                <NumInput value={compDraft.monthlyRent} onChange={v => setCompDraft({ ...compDraft, monthlyRent: v })} width="100%" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Evidence type
                <Select value={compDraft.evidenceType} onChange={e => setCompDraft({ ...compDraft, evidenceType: e.target.value })} options={EVIDENCE_TYPE_OPTIONS} style={{ width: '100%' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Listed date
                <input type="date" value={(compDraft.listedAt || '').slice(0, 10)} onChange={e => setCompDraft({ ...compDraft, listedAt: e.target.value || null })} style={{ minHeight: '32px', fontSize: '13px', background: '#1e293b', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Let-agreed date
                <input type="date" value={(compDraft.letAgreedAt || '').slice(0, 10)} onChange={e => setCompDraft({ ...compDraft, letAgreedAt: e.target.value || null })} style={{ minHeight: '32px', fontSize: '13px', background: '#1e293b', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Achieved date
                <input type="date" value={(compDraft.achievedAt || '').slice(0, 10)} onChange={e => setCompDraft({ ...compDraft, achievedAt: e.target.value || null })} style={{ minHeight: '32px', fontSize: '13px', background: '#1e293b', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Property type
                <input value={compDraft.propertyType || ''} onChange={e => setCompDraft({ ...compDraft, propertyType: e.target.value })} style={{ minHeight: '32px', fontSize: '13px', background: '#1e293b', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Beds
                <NumInput value={compDraft.beds} onChange={v => setCompDraft({ ...compDraft, beds: v })} width="100%" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Baths
                <NumInput value={compDraft.baths} onChange={v => setCompDraft({ ...compDraft, baths: v })} width="100%" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Floor area (sqm)
                <NumInput value={compDraft.floorAreaSqm} onChange={v => setCompDraft({ ...compDraft, floorAreaSqm: v })} width="100%" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Distance (miles)
                <NumInput value={compDraft.distanceMiles} onChange={v => setCompDraft({ ...compDraft, distanceMiles: v })} width="100%" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Condition
                <Select value={compDraft.condition || ''} onChange={e => setCompDraft({ ...compDraft, condition: e.target.value })} options={CONDITION_OPTIONS} style={{ width: '100%' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Furnished
                <Select value={compDraft.furnished || ''} onChange={e => setCompDraft({ ...compDraft, furnished: e.target.value })} options={FURNISHED_OPTIONS} style={{ width: '100%' }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: COLORS.textFaint, minHeight: '44px' }}>
                <input type="checkbox" checked={!!compDraft.garden} onChange={e => setCompDraft({ ...compDraft, garden: e.target.checked })} /> Garden
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: COLORS.textFaint, minHeight: '44px' }}>
                <input type="checkbox" checked={!!compDraft.parking} onChange={e => setCompDraft({ ...compDraft, parking: e.target.checked })} /> Parking
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Transport note
                <input value={compDraft.transportNote || ''} onChange={e => setCompDraft({ ...compDraft, transportNote: e.target.value })} style={{ minHeight: '32px', fontSize: '13px', background: '#1e293b', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Source (agent/portal)
                <input value={compDraft.source || ''} onChange={e => setCompDraft({ ...compDraft, source: e.target.value })} style={{ minHeight: '32px', fontSize: '13px', background: '#1e293b', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Evidence URL
                <input value={compDraft.evidenceUrl || ''} onChange={e => setCompDraft({ ...compDraft, evidenceUrl: e.target.value })} style={{ minHeight: '32px', fontSize: '13px', background: '#1e293b', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Adjustment (£/month, +/−)
                <NumInput value={compDraft.adjustment} onChange={v => setCompDraft({ ...compDraft, adjustment: v })} width="100%" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Adjustment reason {pf(compDraft.adjustment) !== 0 && <span style={{ color: COLORS.bad }}>(required)</span>}
                <input value={compDraft.adjustmentReason || ''} onChange={e => setCompDraft({ ...compDraft, adjustmentReason: e.target.value })} style={{ minHeight: '32px', fontSize: '13px', background: '#1e293b', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint }}>Weight (0–1)
                <input type="range" min="0" max="1" step="0.05" value={compDraft.weight == null ? 1 : compDraft.weight} onChange={e => setCompDraft({ ...compDraft, weight: parseFloat(e.target.value) })} style={{ minHeight: '32px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px', color: COLORS.textFaint, gridColumn: isMobile ? 'auto' : '1 / -1' }}>Notes
                <textarea value={compDraft.notes || ''} onChange={e => setCompDraft({ ...compDraft, notes: e.target.value })} rows={2} style={{ fontSize: '13px', background: '#1e293b', color: COLORS.text, border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '4px 8px', fontFamily: 'inherit', resize: 'vertical' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button onClick={() => { if (saveComp(compDraft, editingCompId)) { setCompDraft(null); setEditingCompId(null); } }} style={{ fontSize: '12px', fontWeight: '600', color: '#fff', background: COLORS.accent, border: 'none', borderRadius: '6px', padding: '8px 14px', minHeight: '44px', cursor: 'pointer' }}>Save</button>
              <button onClick={() => { setCompDraft(null); setEditingCompId(null); }} style={{ fontSize: '12px', color: COLORS.textMuted, background: 'transparent', border: `1px solid ${COLORS.borderLight}`, borderRadius: '6px', padding: '8px 14px', minHeight: '44px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        )}

        {rentalComps.length === 0 ? (
          <div style={{ fontSize: '12px', color: COLORS.textFaint }}>No rental comparables added yet.</div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rentalComps.map(c => {
              const q = compQuality(c, subject, new Date());
              const isDup = !!dupGroups[c.id];
              return (
                <div key={c.id} style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: '8px', padding: '10px', opacity: c.included === false ? 0.5 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.text }}>{c.address}</div>
                      <div style={{ fontSize: '11px', color: COLORS.textFaint }}>{c.postcode} · {EVIDENCE_TYPE_OPTIONS.find(([k]) => k === c.evidenceType)?.[1] || c.evidenceType}</div>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: COLORS.text }}>{fmtGbp(pf(c.monthlyRent) + pf(c.adjustment))}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                    <StaleChip staleFlag={q.staleFlag} ageDays={q.ageDays} />
                    {isDup && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: '#2e1065', color: '#c4b5fd' }}>possible duplicate</span>}
                    {c.beds != null && <span style={{ fontSize: '10px', color: COLORS.textFaint }}>{fmtGbp(pf(c.monthlyRent) / c.beds)}/bed</span>}
                    {c.floorAreaSqm > 0 && <span style={{ fontSize: '10px', color: COLORS.textFaint }}>{fmtGbp(pf(c.monthlyRent) / (c.floorAreaSqm * SQM_TO_SQFT))}/sqft</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: COLORS.textFaint }}>
                      <input type="checkbox" checked={c.included !== false} onChange={() => toggleIncludeComp(c.id)} /> Include
                    </label>
                    <button onClick={() => { setEditingCompId(c.id); setCompDraft({ ...c }); }} style={{ fontSize: '11px', color: COLORS.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                    <button onClick={() => deleteComp(c.id)} style={{ fontSize: '11px', color: COLORS.bad, background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="crm-table-wrap" style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '11px', minWidth: '100%' }}>
              <thead>
                <tr>
                  {['Address', 'Evidence', 'Rent', '£/bed', '£/sqft', 'Condition', 'Weight', 'Age', 'Include', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textFaint, textTransform: 'uppercase', fontSize: '9px', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: `1px solid ${COLORS.borderLight}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rentalComps.map(c => {
                  const q = compQuality(c, subject, new Date());
                  const isDup = !!dupGroups[c.id];
                  const effectiveRent = pf(c.monthlyRent) + pf(c.adjustment);
                  return (
                    <tr key={c.id} style={{ opacity: c.included === false ? 0.5 : 1 }}>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.text }}>
                        {c.address}
                        {isDup && <span style={{ marginLeft: '6px', fontSize: '9px', padding: '1px 5px', borderRadius: '8px', background: '#2e1065', color: '#c4b5fd' }}>possible duplicate</span>}
                      </td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.textMuted, whiteSpace: 'nowrap' }}>{EVIDENCE_TYPE_OPTIONS.find(([k]) => k === c.evidenceType)?.[1] || c.evidenceType}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.text, fontWeight: '600' }}>{fmtGbp(effectiveRent)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.textMuted }}>{c.beds ? fmtGbp(effectiveRent / c.beds) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.textMuted }}>{c.floorAreaSqm > 0 ? fmtGbp(effectiveRent / (c.floorAreaSqm * SQM_TO_SQFT)) : '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.textMuted }}>{c.condition || '—'}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.textMuted }}>{q.effectiveWeight.toFixed(2)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}` }}><StaleChip staleFlag={q.staleFlag} ageDays={q.ageDays} /></td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}` }}>
                        <input type="checkbox" checked={c.included !== false} onChange={() => toggleIncludeComp(c.id)} />
                      </td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, whiteSpace: 'nowrap' }}>
                        <button onClick={() => { setEditingCompId(c.id); setCompDraft({ ...c }); }} style={{ fontSize: '11px', color: COLORS.accent, background: 'none', border: 'none', cursor: 'pointer', marginRight: '6px' }}>Edit</button>
                        <button onClick={() => deleteComp(c.id)} style={{ fontSize: '11px', color: COLORS.bad, background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Section 7 — Operating costs */}
      <Section title="7. Operating costs" expanded={expanded.opex} onToggle={() => toggle('opex')}>
        <Row label="Void %">
          <NumInput value={opex.voidPct} onChange={v => patchDeepOverride('opex', { voidPct: v })} />
        </Row>
        <Row label="Management %">
          <NumInput value={opex.managementPct} onChange={v => patchDeepOverride('opex', { managementPct: v })} />
        </Row>
        {opexItems.map(([key, label]) => {
          const item = opex[key] || { mode: 'annual', value: 0 };
          return (
            <Row key={key} label={label}>
              <Select value={item.mode} onChange={e => patchDeepOverride('opex', { [key]: { ...item, mode: e.target.value } })} options={[['pct', '% of rent'], ['monthly', '£/month'], ['annual', '£/year']]} style={{ fontSize: '12px', padding: '4px 6px' }} />
              <NumInput width="90px" value={item.value} onChange={v => patchDeepOverride('opex', { [key]: { ...item, value: v == null ? 0 : v } })} />
            </Row>
          );
        })}
        <Row label="Other (£/month)">
          <NumInput value={opex.otherMonthly} onChange={v => patchDeepOverride('opex', { otherMonthly: v == null ? 0 : v })} />
        </Row>
        <Row label="Other (£/year)">
          <NumInput value={opex.otherAnnual} onChange={v => patchDeepOverride('opex', { otherAnnual: v == null ? 0 : v })} />
        </Row>
      </Section>

      {/* Section 8 — Scenario comparison table */}
      <Section title="8. Scenario comparison" expanded={expanded.comparison} onToggle={() => toggle('comparison')}>
        {comparisonRows.length === 0 ? (
          <div style={{ fontSize: '12px', color: COLORS.textFaint }}>No scenarios marked "Compare" above.</div>
        ) : (
          <div className="crm-table-wrap" style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '11px', minWidth: isMobile ? '900px' : '100%' }}>
              <thead>
                <tr>
                  {COMPARISON_COLUMNS.map((col, i) => (
                    <th key={col.k} style={{ position: i === 0 ? 'sticky' : 'static', left: i === 0 ? 0 : undefined, background: COLORS.cardBg, textAlign: 'left', padding: '6px 10px', color: COLORS.textFaint, textTransform: 'uppercase', fontSize: '9px', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: `1px solid ${COLORS.borderLight}` }}>{col.l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(row => (
                  <tr key={row.id}>
                    {COMPARISON_COLUMNS.map((col, i) => {
                      const raw = row[col.k];
                      const bw = bestWorst[col.k];
                      let tint;
                      if (bw && raw != null) {
                        if (raw === bw.best) tint = COLORS.good;
                        else if (raw === bw.worst) tint = COLORS.bad;
                      }
                      return (
                        <td key={col.k} style={{ position: i === 0 ? 'sticky' : 'static', left: i === 0 ? 0 : undefined, background: i === 0 ? COLORS.cardBg : 'transparent', padding: '6px 10px', color: tint || COLORS.text, fontWeight: i === 0 ? '600' : '400', whiteSpace: 'nowrap', borderBottom: `0.5px solid ${COLORS.border}` }}>
                          {col.k === 'name' ? `${row.name}${row.locked ? ' 🔒' : ''}` : (col.fmt ? col.fmt(raw) : raw)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Section 15 — Audit history */}
      <Section title="15. Audit history" expanded={expanded.audit} onToggle={() => toggle('audit')}>
        {auditEntries.length === 0 ? (
          <div style={{ fontSize: '12px', color: COLORS.textFaint }}>No changes recorded yet.</div>
        ) : (
          <>
            {auditVisible.map(entry => (
              <div key={entry.id} style={{ padding: '6px 0', borderBottom: `0.5px solid ${COLORS.border}`, fontSize: '11px', color: COLORS.textMuted }}>
                <span style={{ color: COLORS.textFaint }}>{new Date(entry.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                {' — '}<strong style={{ color: COLORS.text }}>{entry.user}</strong>{' changed '}
                <span style={{ color: COLORS.accent }}>{entry.field}</span>
                {entry.reason ? ` (${entry.reason})` : ''}
              </div>
            ))}
            {auditEntries.length > auditVisible.length && (
              <button onClick={() => setAuditPage(p => p + 1)} style={{ marginTop: '8px', fontSize: '11px', color: COLORS.accent, background: 'transparent', border: `1px solid ${COLORS.accent}`, borderRadius: '6px', padding: '5px 10px', minHeight: '32px', cursor: 'pointer' }}>Show more</button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
