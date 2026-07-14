import React, { useState, useEffect } from 'react';
import {
  seedBrr, migrateBrrShape, resolveScenario, computeBrr,
  createScenario, duplicateScenario, renameScenario, deleteScenario,
  setActiveScenario, toggleLock, toggleArchive, setScenarioOverride, appendAudit,
  compQuality, findDuplicateGroups, recommendRent,
  applyStress, sensitivityGrid, SENSITIVITY_PRESETS, DEFAULT_STRESS,
  evaluateRules, deriveConfidences, solveMaxBid, computeWarnings, computeVerdict,
  DEFAULT_BRR_RULES, BRR_CALC_VERSION,
  buildBidLadder, BID_LADDER_INCREMENTS,
  confirmHammer, varianceReport,
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
const STRESS_FIELD_META = [
  ['hammerPct', 'Hammer price', '%'], ['refurbPct', 'Refurb budget', '%'], ['endValuePct', 'End value', '%'],
  ['rentPct', 'Rent', '%'], ['ratePts', 'Mortgage rate', 'pts'], ['ltvPts', 'LTV', 'pts'],
  ['serviceChargePct', 'Service charge', '%'], ['opexPct', 'Other opex', '%'], ['voidPtsExtra', 'Void %', 'pts'],
];
const RULE_META = {
  maxCashLeftIn: { label: 'Max cash left in', unit: '£' },
  minCapitalRecycledPct: { label: 'Min capital recycled', unit: '%' },
  minMonthlyCashflow: { label: 'Min monthly cash flow', unit: '£' },
  minAnnualCashflow: { label: 'Min annual cash flow', unit: '£' },
  minEquityRetained: { label: 'Min equity retained', unit: '£' },
  minEquityRetainedPct: { label: 'Min equity retained', unit: '%' },
  minRefinanceBuffer: { label: 'Min refinance buffer', unit: '£' },
  minGrossYieldPct: { label: 'Min gross yield', unit: '%' },
  minNetYieldPct: { label: 'Min net yield', unit: '%' },
  minICR: { label: 'Min interest cover', unit: '×' },
  minDSCR: { label: 'Min debt-service cover', unit: '×' },
  maxTotalCashInvested: { label: 'Max total cash invested', unit: '£' },
  maxProjectCostPctOfValue: { label: 'Max project cost % of value', unit: '%' },
  minRentalConfidence: { label: 'Min rental confidence', unit: 'rank' },
  minValuationConfidence: { label: 'Min valuation confidence', unit: 'rank' },
};
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

const AXIS_FIELD_META = {
  hammer: { label: 'Hammer price', fmt: v => fmtGbp(v) },
  endValue: { label: 'End value', fmt: v => fmtGbp(v) },
  rent: { label: 'Monthly rent', fmt: v => fmtGbp(v) },
  ratePct: { label: 'Mortgage rate', fmt: v => fmtPct(v) },
  ltvPct: { label: 'LTV', fmt: v => fmtPct(v) },
  refurbBudget: { label: 'Refurb budget', fmt: v => fmtGbp(v) },
  opexScale: { label: 'Opex scale', fmt: v => `${v > 0 ? '+' : ''}${v}%` },
};
const SENS_METRIC_META = {
  cashLeftIn: { label: 'Cash left in', fmt: fmtGbp },
  capitalRecycledPct: { label: 'Capital recycled %', fmt: fmtPct },
  totalCashInvested: { label: 'Total cash invested', fmt: fmtGbp },
  equityRetained: { label: 'Equity retained', fmt: fmtGbp },
  monthlyCashflow: { label: 'Monthly cash flow', fmt: fmtGbp },
  netCashReturned: { label: 'Cash returned', fmt: fmtGbp },
};

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

const LADDER_MARKER_ICONS = { guide: '📋', currentBid: '📍', target: '🎯', stretch: '🔺', lastPassing: '✅', firstFailing: '⛔', maxRecommended: '👑' };
const LADDER_DESKTOP_COLS = [
  ['hammer', 'Hammer', fmtGbp], ['sdlt', 'SDLT', fmtGbp], ['auctionFees', 'Premium', fmtGbp], ['totalBuyingCosts', 'Buying costs', fmtGbp],
  ['totalCashInvested', 'Total cash', fmtGbp], ['mortgage', 'Mortgage', fmtGbp], ['cashReturned', 'Returned', fmtGbp],
  ['cashLeftIn', 'Cash left in', fmtGbp], ['capitalRecycledPct', 'Recycled', fmtPct], ['equityRetained', 'Equity', fmtGbp],
  ['grossYield', 'Gross yield', fmtPct], ['netYield', 'Net yield', fmtPct], ['monthlyPayment', 'Mtg pmt', fmtGbp],
  ['monthlyCashflow', 'Cash flow', fmtGbp], ['stressMonthlyCashflow', 'Stressed CF', fmtGbp],
];
const LADDER_MOBILE_COLS = [
  ['hammer', 'Hammer', fmtGbp], ['totalCashInvested', 'Cash in', fmtGbp], ['cashReturned', 'Returned', fmtGbp],
  ['cashLeftIn', 'Left in', fmtGbp], ['capitalRecycledPct', 'Recycled', fmtPct], ['monthlyCashflow', 'Cash flow', fmtGbp],
];

/** 04-rules-solver-ladder.md §Bid ladder: pass rows normal, first-fail row tinted, later fails dimmed. */
function BidLadderTable({ ladder, isMobile }) {
  const markersByHammer = {};
  Object.entries(ladder.markers).forEach(([key, val]) => {
    if (val == null) return;
    (markersByHammer[val] = markersByHammer[val] || []).push(key);
  });
  const cols = isMobile ? LADDER_MOBILE_COLS : LADDER_DESKTOP_COLS;
  let passedFirstFail = false;
  return (
    <div className="crm-table-wrap" style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '11px', minWidth: isMobile ? '760px' : '100%' }}>
        <thead>
          <tr>
            <th style={{ padding: '6px 6px', borderBottom: `1px solid ${COLORS.borderLight}` }} />
            {cols.map(([k, l]) => <th key={k} style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textFaint, textTransform: 'uppercase', fontSize: '9px', letterSpacing: '.04em', whiteSpace: 'nowrap', borderBottom: `1px solid ${COLORS.borderLight}` }}>{l}</th>)}
            <th style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textFaint, textTransform: 'uppercase', fontSize: '9px', letterSpacing: '.04em', borderBottom: `1px solid ${COLORS.borderLight}` }}>Result</th>
          </tr>
        </thead>
        <tbody>
          {ladder.rows.map(row => {
            const isFirstFail = row.hammer === ladder.markers.firstFailing;
            if (isFirstFail) passedFirstFail = true;
            const rowMarkers = markersByHammer[row.hammer] || [];
            const bg = isFirstFail ? '#3f0d0d' : (!row.pass && passedFirstFail ? '#1e0a0a' : 'transparent');
            return (
              <tr key={row.hammer} style={{ background: bg, opacity: !row.pass && passedFirstFail && !isFirstFail ? 0.6 : 1 }}>
                <td style={{ padding: '6px 6px', borderBottom: `0.5px solid ${COLORS.border}`, whiteSpace: 'nowrap' }}>
                  {rowMarkers.map(m => <span key={m} title={m}>{LADDER_MARKER_ICONS[m]}</span>)}
                </td>
                {cols.map(([k, , fmt]) => (
                  <td key={k} style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.text, whiteSpace: 'nowrap' }}>{fmt(row[k])}</td>
                ))}
                <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, whiteSpace: 'nowrap' }}>
                  {row.pass
                    ? <span style={{ color: COLORS.good }}>✓ Pass</span>
                    : <span style={{ color: COLORS.bad }} title={row.failNote || ''}>✗ {row.failedRuleKeys.map(k => (RULE_META[k] || {}).label || k).join(', ')}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const VERDICT_COLOR = {
  'Strong BRR': COLORS.good, 'Viable BRR': COLORS.good, 'Marginal BRR': COLORS.warn,
  'High-risk BRR': COLORS.bad, 'BRR does not meet criteria': COLORS.bad, 'Insufficient evidence': COLORS.textFaint,
};
const withVerdictColor = v => ({ ...v, color: VERDICT_COLOR[v.label] || COLORS.textFaint });

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
  const [expanded, setExpanded] = useState({ price: true, costs: false, endValue: false, mortgage: false, rent: false, opex: false, comps: false, comparison: false, sensitivity: false, stress: false, rules: false, maxbid: true, ladder: false, audit: false });
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [auditPage, setAuditPage] = useState(1);
  const [compDraft, setCompDraft] = useState(null);
  const [editingCompId, setEditingCompId] = useState(null);
  const [sensPresetKey, setSensPresetKey] = useState(SENSITIVITY_PRESETS[0].key);
  const [sensCustomRow, setSensCustomRow] = useState('hammer');
  const [sensCustomCol, setSensCustomCol] = useState('ratePct');
  const [sensCustomMetric, setSensCustomMetric] = useState('cashLeftIn');
  const [sensCell, setSensCell] = useState(null);
  const [solverMinPrice, setSolverMinPrice] = useState(null);
  const [solverIncrement, setSolverIncrement] = useState(500);
  const [bidIncrement, setBidIncrement] = useState(500);
  const [ladderStart, setLadderStart] = useState(null);
  const [ladderEnd, setLadderEnd] = useState(null);
  const [ladderFullScreen, setLadderFullScreen] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [confirmHammerDraft, setConfirmHammerDraft] = useState(null);
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
  // Once confirmed, pre-auction (non-'actual') scenarios are historical — warn before editing
  // rather than silently letting the forecast drift after the fact (06 §Confirmed hammer price).
  const confirmHistoricalEdit = () => {
    if (brr.confirmed && scenario.type !== 'actual') {
      return window.confirm('This is a historical pre-auction scenario — editing it won\'t affect your actual purchase. Duplicate it instead, or continue editing anyway?');
    }
    return true;
  };

  const applyOverride = (path, value, opts = {}) => {
    if (!confirmHistoricalEdit()) return;
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
    if (!confirmHistoricalEdit()) return;
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
  const blocked = resolved.hammer <= 0;
  const rec = brr.rentRecommendation;
  rentWarnings.rentHigh = !!(rec && rec.optimistic != null && resolved.grossMonthlyRent > rec.optimistic * 1.05);

  const priceBasisLabel = scenario.assumedHammerPrice != null ? 'Assumed' : (PRICE_BASIS_LABEL[scenario.priceBasis] || 'Guide');
  const nonArchived = brr.scenarios.filter(s => !s.archived);

  // --- Stress testing (section 10) — combined config drives the dashboard's
  // "Stressed cash flow" KPI, the comparison table, and (below) the verdict's
  // stress-fail count (phase 1's stress payment only stressed the mortgage rate;
  // this replaces that for display purposes).
  const stressConfig = brr.stress || DEFAULT_STRESS;
  const stressedOut = computeBrr(applyStress(resolved, stressConfig));
  const patchStress = patch => {
    const nextStress = { ...stressConfig, ...patch };
    updateFieldInView('brr', stamp({ ...brr, stress: nextStress }, { scenarioId: null, field: 'stress', prev: stressConfig, next: nextStress, reason: null }));
  };
  const ruleTarget = (key, fallback) => {
    const r = (brr.rules || []).find(x => x.key === key);
    return r ? r.target : fallback;
  };
  const combinedChecks = [
    { label: 'Positive cash flow', pass: stressedOut.monthlyCashflow != null && stressedOut.monthlyCashflow > 0, value: stressedOut.monthlyCashflow == null ? '—' : `${fmtGbp(stressedOut.monthlyCashflow)}/mo` },
    { label: `Capital recycled ≥ ${ruleTarget('minCapitalRecycledPct', 75)}%`, pass: stressedOut.capitalRecycledPct != null && stressedOut.capitalRecycledPct >= ruleTarget('minCapitalRecycledPct', 75), value: fmtPct(stressedOut.capitalRecycledPct) },
    { label: `Equity retained ≥ ${ruleTarget('minEquityRetainedPct', 20)}%`, pass: stressedOut.equityRetainedPct != null && stressedOut.equityRetainedPct >= ruleTarget('minEquityRetainedPct', 20), value: fmtPct(stressedOut.equityRetainedPct) },
    { label: `Cash left in ≤ ${fmtGbp(ruleTarget('maxCashLeftIn', 20000))}`, pass: stressedOut.cashLeftIn <= ruleTarget('maxCashLeftIn', 20000), value: fmtGbp(stressedOut.cashLeftIn) },
  ];
  const stressFailCount = combinedChecks.filter(c => !c.pass).length;

  // --- Rules, warnings & verdict (sections 11, 14; dashboard verdict pill) ---
  const confidences = deriveConfidences(brr);
  const ruleResults = evaluateRules(out, brr.rules, confidences);
  const warnings = computeWarnings(resolved, out, brr, brr.rules, property);
  const otherScenarioSummaries = nonArchived
    .filter(s => s.id !== scenario.id && s.type !== 'actual')
    .map(s => {
      const r = resolveScenario(property, brr, s);
      const o = computeBrr(r.inputs);
      const re = evaluateRules(o, brr.rules, confidences);
      const worst = re.mandatoryFailures[0] || re.advisoryFailures[0];
      return { name: s.name, type: s.type, isActive: false, mandatoryFailureCount: re.mandatoryFailures.length, worstNote: worst ? worst.note : null };
    });
  const verdict = withVerdictColor(computeVerdict(out, ruleResults, warnings, confidences, otherScenarioSummaries, stressFailCount, scenario.name));
  const warningsBySeverity = { blocked: [], high: [], caution: [], info: [] };
  warnings.forEach(w => { (warningsBySeverity[w.severity] || warningsBySeverity.info).push(w); });
  const cautionPlusWarnings = [...warningsBySeverity.blocked, ...warningsBySeverity.high, ...warningsBySeverity.caution];

  // --- Max-bid solver (section 12; dashboard "Max BRR bid"/"headroom"/"limiting rule") —
  // runs live in local component state; nothing persists until "Save result".
  const effectiveMinPrice = solverMinPrice != null ? solverMinPrice : Math.max(5000, Math.round((pf(property.guidePrice) * 0.5) / 100) * 100);
  const solverRules = brr.rules;
  // Runs on every render (dashboard KPIs are always visible) — cap the walk to ~200 steps
  // so it stays cheap; solveMaxBid's own £2M default ceiling would be thousands of steps.
  const solverCeiling = Math.min(2000000, effectiveMinPrice + 200 * solverIncrement);
  const maxBidResult = blocked ? null : solveMaxBid({ property, brr, scenario, rules: solverRules, minPrice: effectiveMinPrice, increment: solverIncrement, ceiling: solverCeiling });
  const currentAuctionBid = pf(brr.currentAuctionBid);
  const biddingHeadroom = maxBidResult && maxBidResult.maxBid != null ? maxBidResult.maxBid - currentAuctionBid : null;
  const stressedAtMaxBid = maxBidResult && maxBidResult.maxBid != null ? computeBrr(applyStress({ ...resolved, hammer: maxBidResult.maxBid }, stressConfig)) : null;
  const limitingRuleLabel = maxBidResult
    ? (maxBidResult.limitingRuleKey ? (RULE_META[maxBidResult.limitingRuleKey] || {}).label || maxBidResult.limitingRuleKey : (maxBidResult.maxBid != null ? 'None — every tested bid passes' : 'No bid passes your rules'))
    : '—';

  // --- Bid ladder (section 13) — full-range table, only computed while visible.
  const ladder = expanded.ladder ? buildBidLadder({ property, brr, scenario, rules: brr.rules, startBid: ladderStart, endBid: ladderEnd, increment: bidIncrement }) : null;

  // --- Live Auction mode (06-live-auction-and-confirmed.md) ------------------
  // Simplified mirror of src/App.jsx:3517's bid-day condition (not the full
  // normaliseStatus legacy mapping — just enough for an "auto-suggest" nicety).
  const auctionDateObj = property.auctionDate ? new Date(property.auctionDate) : null;
  const daysLeft = auctionDateObj ? Math.ceil((auctionDateObj - new Date()) / 86400000) : null;
  const bidDayCondition = daysLeft !== null && daysLeft <= 0 && !['Won', 'Lost', 'Refurb', 'For Sale', 'Completed', 'Not Proceeding'].includes(property.status);
  const nextBid = pf(brr.nextBid);
  const nextBidOut = nextBid > 0 ? computeBrr({ ...resolved, hammer: nextBid }) : null;
  const nextBidRuleEval = nextBidOut ? evaluateRules(nextBidOut, brr.rules, confidences) : null;
  let liveState = 'Safe';
  if (!maxBidResult || maxBidResult.maxBid == null) {
    liveState = 'Do not bid';
  } else {
    const max = maxBidResult.maxBid;
    const doNotBid = (nextBid > 0 && nextBid > max) || (nextBidRuleEval && !nextBidRuleEval.pass);
    const limitReached = currentAuctionBid === max || nextBid === max;
    if (doNotBid) liveState = 'Do not bid';
    else if (limitReached) liveState = 'Limit reached';
    else if (currentAuctionBid > max * 0.9) liveState = 'Caution';
    else liveState = 'Safe';
  }
  const LIVE_STATE_META = {
    Safe: { bg: '#052e16', border: COLORS.good, fg: '#4ade80' },
    Caution: { bg: '#3a2a06', border: COLORS.warn, fg: COLORS.warnText },
    'Limit reached': { bg: '#0b1120', border: COLORS.bad, fg: COLORS.bad },
    'Do not bid': { bg: '#3f0d0d', border: COLORS.bad, fg: '#fca5a5' },
  };
  const setCurrentBid = v => {
    const nextBrr = stamp({ ...brr, currentAuctionBid: v }, { scenarioId: null, field: 'currentAuctionBid', prev: brr.currentAuctionBid, next: v, reason: null });
    updateFieldInView('brr', nextBrr);
  };
  const setNextBidValue = v => updateFieldInView('brr', { ...brr, nextBid: v });
  const bumpNextBid = () => setNextBidValue((pf(brr.currentAuctionBid) || 0) + bidIncrement);
  const logCurrentBid = () => {
    const amount = nextBid > 0 ? nextBid : currentAuctionBid;
    if (!(amount > 0)) return;
    if (addBid) addBid(amount, 'BRR live auction');
    setCurrentBid(amount);
    setNextBidValue(null);
  };

  const saveSnapshot = (kind) => {
    const snap = {
      id: `bsnap_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      kind, calcVersion: BRR_CALC_VERSION, scenarioId: scenario.id, scenarioName: scenario.name,
      at: nowIso(), user: userName || 'You',
      inputs: resolved, outputs: out, maxBid: kind === 'maxBid' ? maxBidResult : null,
      warnings, verdict,
    };
    const nextBrr = stamp({ ...brr, snapshots: [...(brr.snapshots || []), snap] }, { scenarioId: scenario.id, field: 'snapshot', prev: null, next: kind, reason: null });
    logTimeline(nextBrr, `${kind === 'maxBid' ? 'Max-bid result' : 'Pre-auction review'} snapshot saved: ${scenario.name}`);
  };

  // --- Confirmed hammer price & forecast vs actual (06-live-auction-and-confirmed.md) ----
  const wonOrHammerSet = (property.bidOutcome && property.bidOutcome.result === 'won') || !!property.hammerPrice;
  const showConfirmCard = !brr.confirmed && wonOrHammerSet;
  const hammerMismatch = !!(brr.confirmed && property.hammerPrice != null && pf(property.hammerPrice) !== pf(brr.confirmed.hammerPrice));
  const preSnapshot = brr.confirmed ? (brr.snapshots || []).find(s => s.id === brr.confirmed.preAuctionSnapshotId) : null;
  const varianceRows = brr.confirmed ? varianceReport(preSnapshot, out, verdict) : [];
  const targetBidVal = pf(property.analytics && property.analytics.targetBid);
  const hammerVsTargetDelta = brr.confirmed && targetBidVal > 0 ? resolved.hammer - targetBidVal : null;
  const hammerVsTargetPct = hammerVsTargetDelta != null && targetBidVal > 0 ? (hammerVsTargetDelta / targetBidVal) * 100 : null;
  const preAuctionMaxBid = brr.confirmed ? brr.confirmed.preAuctionMaxBid : null;
  const hammerVsMaxDelta = brr.confirmed && preAuctionMaxBid != null ? resolved.hammer - preAuctionMaxBid : null;
  const overMax = hammerVsMaxDelta != null && hammerVsMaxDelta > 0;

  const doConfirmHammer = () => {
    const price = pf(confirmHammerDraft != null ? confirmHammerDraft : property.hammerPrice) || resolved.hammer;
    if (!(price > 0)) { window.alert('Enter a hammer price to confirm.'); return; }
    if (!property.hammerPrice) {
      // Two-step to avoid a stale-closure clobber: updateFieldInView('hammerPrice',…) and
      // logTimeline(nextBrr,…) both read the same currentViewProperty snapshot in App.jsx —
      // calling both in one handler would silently drop one write. Setting hammerPrice first
      // and asking for a second click lets the property prop refresh in between.
      updateFieldInView('hammerPrice', price);
      window.alert('Hammer price set on the property. Click "Confirm hammer price" again to lock in the actual-purchase scenario.');
      return;
    }
    const at = nowIso();
    const snapshotPayload = { inputs: resolved, outputs: out, warnings, verdict };
    const nextBrr = confirmHammer(brr, { hammerPrice: price, activeScenario: scenario, snapshot: snapshotPayload, solverResult: maxBidResult, user: userName || 'You', at });
    logTimeline(nextBrr, `Hammer price confirmed at ${fmtGbp(price)} — actual-purchase scenario created`);
  };

  // --- Investment rules (section 11) editing ----------------------------------
  const patchRule = (key, patch) => {
    const before = brr.rules.find(r => r.key === key);
    const nextRules = brr.rules.map(r => r.key === key ? { ...r, ...patch } : r);
    const nextBrr = stamp({ ...brr, rules: nextRules }, { scenarioId: null, field: `rule.${key}`, prev: before, next: { ...before, ...patch }, reason: null });
    updateFieldInView('brr', nextBrr);
  };
  const resetRule = key => {
    const def = DEFAULT_BRR_RULES.find(r => r.key === key);
    if (def) patchRule(key, { enabled: def.enabled, mandatory: def.mandatory, target: def.target });
  };

  // --- Sensitivity grids (section 9) — derived on demand, never persisted;
  // pass/fail now uses the enabled investment rules (was the basic phase-1
  // condition) via the (out) => boolean hook sensitivityGrid was built for.
  const activeSens = sensPresetKey === 'custom'
    ? { rowAxis: { field: sensCustomRow }, colAxis: { field: sensCustomCol }, metric: sensCustomMetric }
    : SENSITIVITY_PRESETS.find(p => p.key === sensPresetKey) || SENSITIVITY_PRESETS[0];
  const sensRulesFn = o => evaluateRules(o, brr.rules, confidences).pass;
  const sensGrid = blocked ? null : sensitivityGrid({ inputs: resolved, rowAxis: activeSens.rowAxis, colAxis: activeSens.colAxis, metric: activeSens.metric, rules: sensRulesFn });
  const axisCurrentValue = field => {
    switch (field) {
      case 'hammer': return resolved.hammer;
      case 'endValue': return resolved.selectedEndValue;
      case 'rent': return resolved.grossMonthlyRent;
      case 'ratePct': return resolved.mortgage.ratePct;
      case 'ltvPct': return resolved.mortgage.ltvPct;
      case 'refurbBudget': return resolved.refurbBudget;
      case 'opexScale': return 0;
      default: return 0;
    }
  };

  const kpis = [
    { l: 'Assumed hammer', v: blocked ? '—' : fmtGbp(resolved.hammer) },
    { l: 'Max BRR bid', v: maxBidResult && maxBidResult.maxBid != null ? fmtGbp(maxBidResult.maxBid) : (maxBidResult ? 'No bid passes' : '—') },
    { l: 'Bidding headroom', v: biddingHeadroom == null ? '—' : fmtGbp(biddingHeadroom), c: biddingHeadroom != null && biddingHeadroom < 0 ? COLORS.bad : undefined },
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
    { l: 'Stressed cash flow', v: stressedOut.monthlyCashflow == null ? '—' : fmtGbp(stressedOut.monthlyCashflow) + '/mo', c: stressedOut.monthlyCashflow != null && stressedOut.monthlyCashflow < 0 ? COLORS.bad : undefined },
    { l: 'Gross yield', v: fmtPct(out.grossYieldOnHammer) },
    { l: 'Net yield', v: fmtPct(out.netYield) },
    { l: 'Rental confidence', v: confidences.rental || '—' },
    { l: 'Valuation confidence', v: confidences.valuation || '—' },
    { l: 'Limiting rule', v: limitingRuleLabel },
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
    const re = evaluateRules(o, brr.rules, confidences);
    const rowWarnings = computeWarnings(r.inputs, o, brr, brr.rules, property);
    const stressedO = computeBrr(applyStress(r.inputs, stressConfig));
    const rowStressFailCount = [
      stressedO.monthlyCashflow != null && stressedO.monthlyCashflow > 0,
      stressedO.capitalRecycledPct != null && stressedO.capitalRecycledPct >= ruleTarget('minCapitalRecycledPct', 75),
      stressedO.equityRetainedPct != null && stressedO.equityRetainedPct >= ruleTarget('minEquityRetainedPct', 20),
      stressedO.cashLeftIn <= ruleTarget('maxCashLeftIn', 20000),
    ].filter(p => !p).length;
    const v = withVerdictColor(computeVerdict(o, re, rowWarnings, confidences, [], rowStressFailCount, s.name));
    // Solver is expensive (walks the full price range) — only run it for rows actually on screen.
    const rowMaxBid = expanded.comparison && r.inputs.hammer > 0 ? solveMaxBid({ property, brr, scenario: s, rules: brr.rules, minPrice: effectiveMinPrice, increment: solverIncrement, ceiling: solverCeiling }) : null;
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
      stressMonthlyCashflow: stressedO.monthlyCashflow,
      grossYieldOnHammer: o.grossYieldOnHammer,
      netYield: o.netYield,
      maxBidResult: rowMaxBid ? (rowMaxBid.maxBid != null ? fmtGbp(rowMaxBid.maxBid) : 'No bid passes') : null,
      valuationConfidence: confidences.valuation,
      rentalConfidence: confidences.rental,
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
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {!liveMode && bidDayCondition && (
              <button onClick={() => setLiveMode(true)} style={{ fontSize: '11px', fontWeight: '700', color: '#fff', background: COLORS.bad, border: 'none', borderRadius: '14px', padding: '6px 12px', minHeight: '32px', cursor: 'pointer', animation: 'brrPulse 1.6s ease-in-out infinite' }}>
                <style>{'@keyframes brrPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }'}</style>
                🔴 Bid day — go live
              </button>
            )}
            {!liveMode && <button onClick={() => saveSnapshot('review')} style={{ fontSize: '11px', fontWeight: '600', color: COLORS.accent, background: 'transparent', border: `1px solid ${COLORS.accent}`, borderRadius: '6px', padding: '5px 10px', minHeight: '32px', cursor: 'pointer' }}>Save pre-auction snapshot</button>}
            <button onClick={() => setLiveMode(m => !m)} style={{ fontSize: '11px', fontWeight: '600', color: liveMode ? '#fff' : COLORS.textMuted, background: liveMode ? COLORS.accent : 'transparent', border: `1px solid ${liveMode ? COLORS.accent : COLORS.borderLight}`, borderRadius: '6px', padding: '5px 10px', minHeight: '32px', cursor: 'pointer' }}>{liveMode ? '✕ Exit Live Auction' : 'Live Auction mode'}</button>
          </div>
        </div>
        <div style={{ fontSize: '12px', color: COLORS.textMuted, marginBottom: '12px' }}>{verdict.explanation}</div>
        {blocked && (
          <div style={{ fontSize: '12px', color: COLORS.warnText, background: '#3a2a06', border: '0.5px solid #d97706', borderRadius: '6px', padding: '8px 10px', marginBottom: '12px' }}>
            No hammer price set — set a guide price or an assumed hammer to calculate.
          </div>
        )}
        {showConfirmCard && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '12px', color: '#4ade80', background: '#052e16', border: '0.5px solid #059669', borderRadius: '6px', padding: '10px', marginBottom: '12px' }}>
            <span>🏆 Property won — confirm the hammer price to lock in the actual-purchase scenario.</span>
            <NumInput value={confirmHammerDraft != null ? confirmHammerDraft : property.hammerPrice} onChange={setConfirmHammerDraft} width="110px" />
            <button onClick={doConfirmHammer} style={{ fontSize: '11px', fontWeight: '600', color: '#fff', background: COLORS.good, border: 'none', borderRadius: '6px', padding: '6px 12px', minHeight: '32px', cursor: 'pointer' }}>Confirm hammer price</button>
          </div>
        )}
        {cautionPlusWarnings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '12px', padding: '8px 10px', background: '#1e1005', border: '0.5px solid #7c2d12', borderRadius: '6px' }}>
            {cautionPlusWarnings.slice(0, 4).map((w, i) => (
              <span key={`${w.code}_${i}`} style={{ fontSize: '11px', color: w.severity === 'blocked' || w.severity === 'high' ? '#fca5a5' : COLORS.warnText }}>⚠ {w.message}</span>
            ))}
            {cautionPlusWarnings.length > 4 && <span style={{ fontSize: '11px', color: COLORS.textFaint }}>+{cautionPlusWarnings.length - 4} more — see section 14</span>}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '8px' }}>
          {kpis.map(k => <KpiTile key={k.l} label={k.l} value={k.v} valueColor={k.c} isMobile={isMobile} />)}
        </div>
      </div>

      {liveMode ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Live Auction — state banner */}
        <div style={{ border: `2px solid ${LIVE_STATE_META[liveState].border}`, borderRadius: '10px', padding: '14px 16px', background: LIVE_STATE_META[liveState].bg, textAlign: 'center' }}>
          <div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '800', color: LIVE_STATE_META[liveState].fg, letterSpacing: '.02em' }}>{liveState.toUpperCase()}</div>
          {maxBidResult && maxBidResult.maxBid == null && <div style={{ fontSize: '11px', color: COLORS.textFaint, marginTop: '4px' }}>No bid passes your mandatory rules under this scenario.</div>}
        </div>

        {/* Numbers row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px' }}>
          <KpiTile label="Current bid" value={currentAuctionBid > 0 ? fmtGbp(currentAuctionBid) : '—'} isMobile={isMobile} />
          <KpiTile label="Next bid" value={nextBid > 0 ? fmtGbp(nextBid) : '—'} isMobile={isMobile} />
          <KpiTile label="Max BRR bid" value={maxBidResult && maxBidResult.maxBid != null ? fmtGbp(maxBidResult.maxBid) : '—'} isMobile={isMobile} />
          <KpiTile label="Headroom" value={biddingHeadroom == null ? '—' : fmtGbp(Math.max(0, biddingHeadroom))} valueColor={biddingHeadroom != null && biddingHeadroom <= 0 ? COLORS.bad : undefined} isMobile={isMobile} />
        </div>

        {/* Quick facts — recomputed at hammer = next bid */}
        <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', color: COLORS.textFaint }}>At next bid</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '8px' }}>
          <KpiTile label="Total cash required" value={nextBidOut ? fmtGbp(nextBidOut.totalCashInvested) : '—'} isMobile={isMobile} />
          <KpiTile label="Cash left in" value={nextBidOut ? (nextBidOut.cashLeftIn > 0 ? fmtGbp(nextBidOut.cashLeftIn) : 'Recycled') : '—'} isMobile={isMobile} />
          <KpiTile label="Capital recycled" value={nextBidOut ? fmtPct(nextBidOut.capitalRecycledPct) : '—'} isMobile={isMobile} />
          <KpiTile label="Equity retained" value={nextBidOut ? fmtGbp(nextBidOut.equityRetained) : '—'} isMobile={isMobile} />
          <KpiTile label="Expected cash flow" value={nextBidOut && nextBidOut.monthlyCashflow != null ? fmtGbp(nextBidOut.monthlyCashflow) + '/mo' : '—'} isMobile={isMobile} />
          <KpiTile label="Limiting rule" value={nextBidRuleEval && !nextBidRuleEval.pass ? ((RULE_META[nextBidRuleEval.mandatoryFailures[0].ruleKey] || {}).label || nextBidRuleEval.mandatoryFailures[0].ruleKey) : '—'} isMobile={isMobile} />
        </div>

        {cautionPlusWarnings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '8px 10px', background: '#1e1005', border: '0.5px solid #7c2d12', borderRadius: '6px' }}>
            {cautionPlusWarnings.slice(0, 3).map((w, i) => <span key={`${w.code}_${i}`} style={{ fontSize: '11px', color: w.severity === 'blocked' || w.severity === 'high' ? '#fca5a5' : COLORS.warnText }}>⚠ {w.message}</span>)}
          </div>
        )}

        {/* Controls — bottom half, one-handed */}
        <div style={{ borderTop: `0.5px solid ${COLORS.border}`, paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
            {nonArchived.map(s => (
              <button key={s.id} onClick={() => doSetActive(s.id)} style={{ flexShrink: 0, fontSize: '12px', fontWeight: '600', padding: '8px 14px', minHeight: '44px', borderRadius: '14px', border: `1px solid ${s.id === scenario.id ? COLORS.accent : COLORS.borderLight}`, background: s.id === scenario.id ? COLORS.accent : 'transparent', color: s.id === scenario.id ? '#fff' : COLORS.textMuted, cursor: 'pointer', whiteSpace: 'nowrap' }}>{s.name}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: COLORS.textFaint }}>Current bid (£)
              <NumInput value={brr.currentAuctionBid} onChange={setCurrentBid} width="100%" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: COLORS.textFaint }}>Next bid (£)
              <NumInput value={brr.nextBid} onChange={setNextBidValue} width="100%" />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: COLORS.textFaint }}>Increment</span>
            <Select value={bidIncrement} onChange={e => setBidIncrement(parseInt(e.target.value, 10))} options={BID_LADDER_INCREMENTS.map(v => [v, fmtGbp(v)])} />
          </div>
          <button onClick={bumpNextBid} style={{ fontSize: '18px', fontWeight: '700', color: '#fff', background: COLORS.accent, border: 'none', borderRadius: '10px', padding: '16px', minHeight: '56px', cursor: 'pointer' }}>+{fmtGbp(bidIncrement)}</button>
          <button onClick={logCurrentBid} style={{ fontSize: '15px', fontWeight: '700', color: '#fff', background: COLORS.good, border: 'none', borderRadius: '10px', padding: '14px', minHeight: '52px', cursor: 'pointer' }}>Log bid</button>
        </div>
      </div>
      ) : (
      <>
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

      {/* Section 9 — Sensitivity analysis */}
      <Section title="9. Sensitivity analysis" expanded={expanded.sensitivity} onToggle={() => toggle('sensitivity')}>
        {blocked ? (
          <div style={{ fontSize: '12px', color: COLORS.textFaint }}>Set a hammer price to run sensitivity grids.</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <Select value={sensPresetKey} onChange={e => { setSensPresetKey(e.target.value); setSensCell(null); }} options={[...SENSITIVITY_PRESETS.map(p => [p.key, p.label]), ['custom', 'Custom…']]} />
              {sensPresetKey === 'custom' && (
                <>
                  <Select value={sensCustomRow} onChange={e => { setSensCustomRow(e.target.value); setSensCell(null); }} options={Object.entries(AXIS_FIELD_META).map(([k, m]) => [k, `Row: ${m.label}`])} />
                  <Select value={sensCustomCol} onChange={e => { setSensCustomCol(e.target.value); setSensCell(null); }} options={Object.entries(AXIS_FIELD_META).map(([k, m]) => [k, `Col: ${m.label}`])} />
                  <Select value={sensCustomMetric} onChange={e => { setSensCustomMetric(e.target.value); setSensCell(null); }} options={Object.entries(SENS_METRIC_META).map(([k, m]) => [k, m.label])} />
                </>
              )}
            </div>
            <div style={{ fontSize: '11px', color: COLORS.textFaint, marginBottom: '8px' }}>
              Rows: {AXIS_FIELD_META[activeSens.rowAxis.field].label} · Columns: {AXIS_FIELD_META[activeSens.colAxis.field].label} · Cell: {SENS_METRIC_META[activeSens.metric].label}. Tap a cell for detail. Green = positive cash flow, red = negative; purple outline = current scenario.
            </div>
            {sensGrid && (
              <div className="crm-table-wrap" style={{ overflowX: 'auto', maxWidth: '100%' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: COLORS.cardBg, padding: '6px 8px', borderBottom: `1px solid ${COLORS.borderLight}` }} />
                      {sensGrid.colAxis.values.slice(0, isMobile ? 5 : sensGrid.colAxis.values.length).map((cv, ci) => (
                        <th key={ci} style={{ padding: '6px 8px', color: COLORS.textFaint, fontSize: '10px', whiteSpace: 'nowrap', borderBottom: `1px solid ${COLORS.borderLight}` }}>{AXIS_FIELD_META[sensGrid.colAxis.field].fmt(cv)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensGrid.rows.map((row, ri) => (
                      <tr key={ri}>
                        <td style={{ position: 'sticky', left: 0, background: COLORS.cardBg, padding: '6px 8px', color: COLORS.textFaint, fontSize: '10px', fontWeight: '600', whiteSpace: 'nowrap', borderBottom: `0.5px solid ${COLORS.border}` }}>{AXIS_FIELD_META[sensGrid.rowAxis.field].fmt(row.rowValue)}</td>
                        {row.cells.slice(0, isMobile ? 5 : row.cells.length).map((cell, ci) => {
                          const isCurrent = Math.abs(cell.rowValue - axisCurrentValue(sensGrid.rowAxis.field)) < 0.01 && Math.abs(cell.colValue - axisCurrentValue(sensGrid.colAxis.field)) < 0.01;
                          return (
                            <td key={ci} onClick={() => setSensCell({ ...cell, rowField: sensGrid.rowAxis.field, colField: sensGrid.colAxis.field, metric: sensGrid.metric })}
                              style={{ padding: '6px 8px', textAlign: 'right', color: COLORS.text, background: cell.pass ? '#052e1b' : '#3f0d0d', outline: isCurrent ? `2px solid ${COLORS.accent}` : 'none', outlineOffset: '-2px', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: `0.5px solid ${COLORS.border}` }}>
                              {SENS_METRIC_META[sensGrid.metric].fmt(cell.value)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {sensCell && (
              <div style={{ marginTop: '10px', border: `1px solid ${COLORS.accent}`, borderRadius: '8px', padding: '10px 12px', background: '#0b1120' }}>
                <div style={{ fontSize: '11px', color: COLORS.textFaint, marginBottom: '6px' }}>
                  {AXIS_FIELD_META[sensCell.rowField].label}: <strong style={{ color: COLORS.text }}>{AXIS_FIELD_META[sensCell.rowField].fmt(sensCell.rowValue)}</strong>
                  {' · '}{AXIS_FIELD_META[sensCell.colField].label}: <strong style={{ color: COLORS.text }}>{AXIS_FIELD_META[sensCell.colField].fmt(sensCell.colValue)}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '6px' }}>
                  <KpiTile label="Total cash invested" value={fmtGbp(sensCell.out.totalCashInvested)} isMobile={isMobile} />
                  <KpiTile label="Cash left in" value={sensCell.out.cashLeftIn > 0 ? fmtGbp(sensCell.out.cashLeftIn) : 'Recycled'} isMobile={isMobile} />
                  <KpiTile label="Capital recycled" value={fmtPct(sensCell.out.capitalRecycledPct)} isMobile={isMobile} />
                  <KpiTile label="Equity retained" value={fmtGbp(sensCell.out.equityRetained)} isMobile={isMobile} />
                  <KpiTile label="Monthly cash flow" value={sensCell.out.monthlyCashflow == null ? '—' : fmtGbp(sensCell.out.monthlyCashflow) + '/mo'} isMobile={isMobile} />
                  <KpiTile label="Gross yield" value={fmtPct(sensCell.out.grossYieldOnHammer)} isMobile={isMobile} />
                  <KpiTile label="Net yield" value={fmtPct(sensCell.out.netYield)} isMobile={isMobile} />
                  <KpiTile label="Cash returned" value={fmtGbp(sensCell.out.netCashReturned)} isMobile={isMobile} />
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      {/* Section 10 — Stress testing */}
      <Section title="10. Stress testing" expanded={expanded.stress} onToggle={() => toggle('stress')}>
        <div style={{ fontSize: '11px', color: COLORS.textFaint, marginBottom: '8px' }}>Editable downside deltas — combined applies all of them together.</div>
        {STRESS_FIELD_META.map(([key, label, unit]) => (
          <Row key={key} label={`${label} (${unit === 'pts' ? 'pts' : '%'})`}>
            <NumInput value={stressConfig[key]} onChange={v => patchStress({ [key]: v == null ? 0 : v })} />
          </Row>
        ))}

        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `0.5px solid ${COLORS.border}` }}>
          <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', color: COLORS.textFaint, marginBottom: '8px' }}>Individual stresses</div>
          {STRESS_FIELD_META.map(([key, label, unit]) => {
            const delta = stressConfig[key];
            if (!delta) return null;
            const individualOut = computeBrr(applyStress(resolved, { [key]: delta }));
            const pass = individualOut.monthlyCashflow != null && individualOut.monthlyCashflow > 0;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderBottom: `0.5px solid ${COLORS.border}`, fontSize: '12px' }}>
                <span style={{ color: COLORS.textMuted }}>{label} {delta > 0 ? '+' : ''}{delta}{unit === 'pts' ? 'pts' : '%'}</span>
                <span style={{ color: pass ? COLORS.good : COLORS.bad, fontWeight: '600' }}>
                  {pass ? '✓' : '✗'} {individualOut.monthlyCashflow == null ? '—' : `${fmtGbp(individualOut.monthlyCashflow)}/mo`}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `0.5px solid ${COLORS.border}` }}>
          <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', color: COLORS.textFaint, marginBottom: '8px' }}>Combined downside</div>
          {combinedChecks.map(c => (
            <div key={c.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderBottom: `0.5px solid ${COLORS.border}`, fontSize: '12px' }}>
              <span style={{ color: COLORS.textMuted }}>{c.label}</span>
              <span style={{ color: c.pass ? COLORS.good : COLORS.bad, fontWeight: '600' }}>{c.pass ? '✓' : '✗'} {c.value}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Section 11 — Investment rules */}
      <Section title="11. Investment rules" expanded={expanded.rules} onToggle={() => toggle('rules')}>
        {(brr.rules || []).map(rule => {
          const meta = RULE_META[rule.key] || { label: rule.key, unit: '' };
          const result = (ruleResults.results || []).find(r => r.ruleKey === rule.key);
          return (
            <div key={rule.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '7px 0', borderBottom: `0.5px solid ${COLORS.border}`, opacity: rule.enabled ? 1 : 0.5 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', minHeight: '32px' }}>
                <input type="checkbox" checked={rule.enabled} onChange={e => patchRule(rule.key, { enabled: e.target.checked })} />
              </label>
              <span style={{ fontSize: '12px', color: COLORS.textMuted, minWidth: '170px', flex: '1 1 170px' }}>{meta.label}</span>
              <Select value={rule.mandatory ? 'mandatory' : 'advisory'} onChange={e => patchRule(rule.key, { mandatory: e.target.value === 'mandatory' })} options={[['mandatory', 'Mandatory'], ['advisory', 'Advisory']]} />
              <NumInput width="100px" value={rule.target} onChange={v => patchRule(rule.key, { target: v == null ? 0 : v })} />
              <span style={{ fontSize: '11px', color: COLORS.textFaint, minWidth: '20px' }}>{meta.unit}</span>
              {rule.enabled && result && (
                <span style={{ fontSize: '11px', fontWeight: '600', color: result.satisfied ? COLORS.good : COLORS.bad }}>{result.satisfied ? '✓ pass' : '✗ fail'}</span>
              )}
              <button onClick={() => resetRule(rule.key)} title="Reset to default" style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.accent, fontSize: '13px', padding: '2px 4px' }}>↺</button>
            </div>
          );
        })}
        <div style={{ fontSize: '11px', color: COLORS.textFaint, marginTop: '10px' }}>
          {ruleResults.pass ? 'All enabled mandatory rules pass on this scenario.' : `${ruleResults.mandatoryFailures.length} mandatory rule(s) failing.`}
          {ruleResults.advisoryFailures.length > 0 && ` ${ruleResults.advisoryFailures.length} advisory rule(s) failing.`}
        </div>
      </Section>

      {/* Section 12 — Maximum-bid calculator / Forecast vs actual (once confirmed) */}
      <Section title={brr.confirmed ? '12. Forecast vs actual' : '12. Maximum-bid calculator'} expanded={expanded.maxbid} onToggle={() => toggle('maxbid')}>
        {brr.confirmed ? (
          <>
            {hammerMismatch && (
              <div style={{ fontSize: '12px', color: COLORS.warnText, background: '#3a2a06', border: '0.5px solid #d97706', borderRadius: '6px', padding: '8px 10px', marginBottom: '12px' }}>
                ⚠ Confirmed at {fmtGbp(brr.confirmed.hammerPrice)}, but the property's hammer price is {fmtGbp(pf(property.hammerPrice))} — not overwritten. Reconcile manually if this is wrong.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <KpiTile label="Hammer vs target bid" value={hammerVsTargetDelta == null ? '—' : `${hammerVsTargetDelta >= 0 ? '+' : ''}${fmtGbp(hammerVsTargetDelta)} (${hammerVsTargetPct.toFixed(1)}%)`} valueColor={hammerVsTargetDelta != null ? (hammerVsTargetDelta > 0 ? COLORS.warn : COLORS.good) : undefined} isMobile={isMobile} />
              <KpiTile label="Hammer vs preserved max bid" value={preAuctionMaxBid == null ? '—' : `${hammerVsMaxDelta >= 0 ? '+' : ''}${fmtGbp(hammerVsMaxDelta)}`} valueColor={preAuctionMaxBid != null ? (overMax ? COLORS.bad : COLORS.good) : undefined} isMobile={isMobile} />
            </div>
            {overMax && (
              <div style={{ fontSize: '12px', color: COLORS.bad, marginBottom: '12px' }}>⚠ W-OVERMAX — confirmed hammer exceeds your preserved pre-auction max bid ({fmtGbp(preAuctionMaxBid)}) by {fmtGbp(hammerVsMaxDelta)}.</div>
            )}
            <div className="crm-table-wrap" style={{ overflowX: 'auto', maxWidth: '100%', marginBottom: '14px' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '11px', minWidth: '100%' }}>
                <thead>
                  <tr>
                    {['Metric', 'Forecast', 'Actual', 'Δ'].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: COLORS.textFaint, textTransform: 'uppercase', fontSize: '9px', letterSpacing: '.04em', borderBottom: `1px solid ${COLORS.borderLight}` }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {varianceRows.map(r => (
                    <tr key={r.key}>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.textMuted }}>{r.label}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.text }}>{r.unit === 'text' ? (r.forecast || '—') : r.unit === 'pct' ? fmtPct(r.forecast) : fmtGbp(r.forecast)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: COLORS.text, fontWeight: '600' }}>{r.unit === 'text' ? (r.actual || '—') : r.unit === 'pct' ? fmtPct(r.actual) : fmtGbp(r.actual)}</td>
                      <td style={{ padding: '6px 8px', borderBottom: `0.5px solid ${COLORS.border}`, color: r.deltaAbs == null ? COLORS.textFaint : r.deltaAbs > 0 ? COLORS.good : r.deltaAbs < 0 ? COLORS.bad : COLORS.textMuted }}>
                        {r.deltaAbs == null ? '—' : `${r.deltaAbs >= 0 ? '+' : ''}${r.unit === 'pct' ? r.deltaAbs.toFixed(1) + '%' : fmtGbp(r.deltaAbs)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ paddingTop: '12px', borderTop: `0.5px solid ${COLORS.border}` }}>
              <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', color: COLORS.textFaint, marginBottom: '8px' }}>Post-completion actuals</div>
              <Row label="Actual rent achieved">
                <NumInput value={resolved.rent.custom} onChange={v => patchDeepOverride('rent', { custom: v, selected: 'custom' })} />
              </Row>
              <Row label="Actual refinance valuation">
                <NumInput value={resolved.endValue.custom} onChange={v => patchDeepOverride('endValue', { custom: v, selected: 'custom' })} />
              </Row>
              <Row label="Actual mortgage advance">
                <NumInput value={resolved.mortgage.maxMortgageOverride} onChange={v => patchDeepOverride('mortgage', { maxMortgageOverride: v })} />
              </Row>
            </div>
          </>
        ) : (
          <>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <Row label="Min price to test">
            <NumInput value={solverMinPrice != null ? solverMinPrice : effectiveMinPrice} onChange={v => setSolverMinPrice(v)} />
          </Row>
          <Row label="Increment">
            <Select value={solverIncrement} onChange={e => setSolverIncrement(parseInt(e.target.value, 10))} options={[[250, '£250'], [500, '£500'], [1000, '£1,000'], [2500, '£2,500']]} />
          </Row>
        </div>

        <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', color: COLORS.textFaint, marginBottom: '8px' }}>Max bid by scenario</div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '8px', marginBottom: '14px' }}>
          {nonArchived.map(s => {
            const r = resolveScenario(property, brr, s);
            const tileResult = r.inputs.hammer > 0 || s.id === scenario.id ? solveMaxBid({ property, brr, scenario: s, rules: brr.rules, minPrice: effectiveMinPrice, increment: solverIncrement, ceiling: solverCeiling }) : null;
            return (
              <div key={s.id} style={{ padding: '8px 10px', background: '#0b1120', border: `0.5px solid ${s.id === scenario.id ? COLORS.accent : COLORS.border}`, borderRadius: '8px', minHeight: '44px' }}>
                <div style={{ fontSize: '10px', color: COLORS.textFaint, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>{s.name}</div>
                <div style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: '600', color: tileResult && tileResult.maxBid != null ? COLORS.text : COLORS.textFaint }}>
                  {tileResult ? (tileResult.maxBid != null ? fmtGbp(tileResult.maxBid) : 'No bid passes') : '—'}
                </div>
              </div>
            );
          })}
        </div>

        {maxBidResult && (
          <>
            <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', color: COLORS.textFaint, marginBottom: '8px' }}>{scenario.name} — full result</div>
            {maxBidResult.maxBid != null ? (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '8px' }}>
                <KpiTile label="Recommended max bid" value={fmtGbp(maxBidResult.maxBid)} isMobile={isMobile} />
                <KpiTile label="Total cash at that bid" value={fmtGbp(maxBidResult.outputsAtMax.totalCashInvested)} isMobile={isMobile} />
                <KpiTile label="Mortgage" value={fmtGbp(maxBidResult.outputsAtMax.finalMortgage)} isMobile={isMobile} />
                <KpiTile label="Cash returned" value={fmtGbp(maxBidResult.outputsAtMax.netCashReturned)} isMobile={isMobile} />
                <KpiTile label="Cash left in" value={maxBidResult.outputsAtMax.cashLeftIn > 0 ? fmtGbp(maxBidResult.outputsAtMax.cashLeftIn) : 'Recycled'} isMobile={isMobile} />
                <KpiTile label="Capital recycled" value={fmtPct(maxBidResult.outputsAtMax.capitalRecycledPct)} isMobile={isMobile} />
                <KpiTile label="Equity retained" value={fmtGbp(maxBidResult.outputsAtMax.equityRetained)} isMobile={isMobile} />
                <KpiTile label="Expected cash flow" value={maxBidResult.outputsAtMax.monthlyCashflow == null ? '—' : fmtGbp(maxBidResult.outputsAtMax.monthlyCashflow) + '/mo'} isMobile={isMobile} />
                <KpiTile label="Stressed cash flow" value={stressedAtMaxBid && stressedAtMaxBid.monthlyCashflow != null ? fmtGbp(stressedAtMaxBid.monthlyCashflow) + '/mo' : '—'} isMobile={isMobile} />
                <KpiTile label="Limiting rule" value={maxBidResult.limitingRuleKey ? (RULE_META[maxBidResult.limitingRuleKey] || {}).label || maxBidResult.limitingRuleKey : 'None — ceiling reached'} isMobile={isMobile} />
                <KpiTile label="First failing bid" value={maxBidResult.firstFailingBid != null ? fmtGbp(maxBidResult.firstFailingBid) : '—'} isMobile={isMobile} />
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: COLORS.bad }}>{maxBidResult.failReason}</div>
            )}
            <div style={{ fontSize: '11px', color: COLORS.textFaint, marginTop: '10px' }}>{maxBidResult.failReason}</div>
            <button onClick={() => saveSnapshot('maxBid')} style={{ marginTop: '10px', fontSize: '12px', fontWeight: '600', color: '#fff', background: COLORS.accent, border: 'none', borderRadius: '6px', padding: '8px 14px', minHeight: '44px', cursor: 'pointer' }}>Save result</button>
          </>
        )}
          </>
        )}
      </Section>

      {/* Section 13 — Bid ladder */}
      <Section title="13. Bid ladder" expanded={expanded.ladder} onToggle={() => toggle('ladder')}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <Row label="Start bid">
            <NumInput value={ladderStart != null ? ladderStart : (ladder ? ladder.start : null)} onChange={setLadderStart} />
          </Row>
          <Row label="End bid">
            <NumInput value={ladderEnd != null ? ladderEnd : (ladder ? ladder.end : null)} onChange={setLadderEnd} />
          </Row>
          <Row label="Increment">
            <Select value={bidIncrement} onChange={e => setBidIncrement(parseInt(e.target.value, 10))} options={BID_LADDER_INCREMENTS.map(v => [v, fmtGbp(v)])} />
          </Row>
          {isMobile && <button onClick={() => setLadderFullScreen(true)} style={{ fontSize: '11px', fontWeight: '600', color: COLORS.accent, background: 'transparent', border: `1px solid ${COLORS.accent}`, borderRadius: '6px', padding: '6px 10px', minHeight: '32px', cursor: 'pointer' }}>Full screen</button>}
        </div>

        {ladder && ladder.error ? (
          <div style={{ fontSize: '12px', color: COLORS.bad }}>{ladder.error}</div>
        ) : ladder && (
          <BidLadderTable ladder={ladder} isMobile={isMobile} />
        )}
      </Section>

      {ladderFullScreen && ladder && !ladder.error && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0b1120', padding: '10px', overflowY: 'auto' }}>
          <button onClick={() => setLadderFullScreen(false)} style={{ marginBottom: '10px', fontSize: '12px', fontWeight: '600', color: '#fff', background: COLORS.accent, border: 'none', borderRadius: '6px', padding: '8px 14px', minHeight: '44px', cursor: 'pointer' }}>✕ Close</button>
          <BidLadderTable ladder={ladder} isMobile={isMobile} />
        </div>
      )}

      {/* Section 14 — Risks & warnings */}
      <Section title="14. Risks & warnings" expanded={expanded.warnings ?? (cautionPlusWarnings.length > 0)} onToggle={() => toggle('warnings')}>
        {warnings.length === 0 ? (
          <div style={{ fontSize: '12px', color: COLORS.textFaint }}>No warnings — evidence and assumptions look complete.</div>
        ) : (
          ['blocked', 'high', 'caution', 'info'].map(sev => (warningsBySeverity[sev] || []).length > 0 && (
            <div key={sev} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: sev === 'blocked' || sev === 'high' ? COLORS.bad : sev === 'caution' ? COLORS.warnText : COLORS.textFaint, marginBottom: '4px' }}>{sev}</div>
              {warningsBySeverity[sev].map((w, i) => (
                <div key={`${w.code}_${i}`} style={{ fontSize: '12px', color: COLORS.textMuted, padding: '4px 0', borderBottom: `0.5px solid ${COLORS.border}` }}>
                  <span style={{ color: COLORS.accent, fontSize: '10px', marginRight: '6px' }}>{w.code}</span>{w.message}
                </div>
              ))}
            </div>
          ))
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
        {(brr.snapshots || []).length > 0 && (
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: `0.5px solid ${COLORS.border}` }}>
            <div style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', color: COLORS.textFaint, marginBottom: '8px' }}>Snapshots</div>
            {[...brr.snapshots].reverse().map(snap => (
              <div key={snap.id} style={{ padding: '6px 0', borderBottom: `0.5px solid ${COLORS.border}`, fontSize: '11px', color: COLORS.textMuted }}>
                <span style={{ color: COLORS.textFaint }}>{new Date(snap.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                {' — '}<strong style={{ color: COLORS.text }}>{snap.kind === 'maxBid' ? 'Max-bid result' : snap.kind === 'confirmed' ? 'Confirmed hammer' : 'Pre-auction review'}</strong>
                {' · '}{snap.scenarioName}
                <span style={{ fontSize: '9px', color: COLORS.textFaint, marginLeft: '6px' }}>calc v{snap.calcVersion}{snap.calcVersion !== BRR_CALC_VERSION ? ' (older version)' : ''}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
      </>
      )}
    </div>
  );
}
