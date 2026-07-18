import React, { useState, useEffect, useRef } from 'react';
import { Globe, RefreshCw, Download, ExternalLink, AlertTriangle, TrendingUp, Search } from 'lucide-react';

// Market Intelligence — Auction Area Intelligence (Pass A screens).
// Data: /api/market/* (worker/marketIntel.js). All metrics are 24-month
// window, confirmed = printed sale price only.

async function api(path) {
  const token = localStorage.getItem('crm_session');
  const res = await fetch(path, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const token = localStorage.getItem('crm_session');
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(j.message || `API ${res.status}`);
  return j;
}

const SCORE_FACTORS = [
  ['sub100kSupply', 'Sub-£100k supply'],
  ['demandLiquidity', 'Demand & liquidity'],
  ['flipSpread', 'Flip spread'],
  ['compQuality', 'Comparable quality'],
  ['growthResilience', 'Growth resilience'],
  ['risk', 'Risk / confidence'],
];
const COST_FIELDS = [
  ['buyersPremiumPct', "Buyer's premium %", 'pct'],
  ['sdltSurchargePct', 'SDLT surcharge %', 'pct'],
  ['legalBuy', 'Legal (buy) £', 'gbp'],
  ['legalSell', 'Legal (sell) £', 'gbp'],
  ['holdingMonths', 'Holding months', 'num'],
  ['holdingPerMonth', 'Holding £/mo', 'gbp'],
  ['agentPct', 'Agent fee %', 'pct'],
  ['refurbLight', 'Refurb light £', 'gbp'],
  ['refurbHeavy', 'Refurb heavy £', 'gbp'],
  ['targetReturn', 'Target return %', 'pct'],
];

const STATUS_META = {
  sold_for: { label: 'Sold for', fg: '#059669', bg: '#d1fae5' },
  sold_prior_for: { label: 'Sold prior for', fg: '#059669', bg: '#d1fae5' },
  sold_after_for: { label: 'Sold after for', fg: '#059669', bg: '#d1fae5' },
  sold: { label: 'Sold (undisclosed)', fg: '#b45309', bg: '#fef3c7' },
  sold_prior: { label: 'Sold prior (undisclosed)', fg: '#b45309', bg: '#fef3c7' },
  sold_after: { label: 'Sold after (undisclosed)', fg: '#b45309', bg: '#fef3c7' },
  last_bid: { label: 'Last bid (unsold)', fg: '#2563eb', bg: '#dbeafe' },
  no_bids: { label: 'No bids', fg: '#dc2626', bg: '#fee2e2' },
  unsold: { label: 'Unsold', fg: '#dc2626', bg: '#fee2e2' },
  withdrawn: { label: 'Withdrawn', fg: '#64748b', bg: '#f1f5f9' },
  postponed: { label: 'Postponed', fg: '#64748b', bg: '#f1f5f9' },
  unknown: { label: 'Unknown', fg: '#7c3aed', bg: '#ede9fe' },
};

const fmtGBP = n => n == null ? '—' : '£' + Number(n).toLocaleString('en-GB');
const fmtGuide = (min, max) => min == null ? '—' : (max == null ? fmtGBP(min) + '+' : (min === max ? fmtGBP(min) : `${fmtGBP(min)} – ${fmtGBP(max)}`));
const scoreColor = s => s == null ? '#94a3b8' : s >= 80 ? '#059669' : s >= 65 ? '#d97706' : '#64748b';

const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' };
const label11 = { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', color: '#64748b', fontWeight: 600 };
const th = { textAlign: 'left', padding: '8px 10px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px', color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: '12px', color: '#334155', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };

function ScoreChip({ score }) {
  return (
    <span style={{ display: 'inline-block', minWidth: '42px', textAlign: 'center', padding: '3px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, color: '#fff', background: scoreColor(score) }}>
      {score == null ? '—' : score}
    </span>
  );
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.unknown;
  return <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, color: m.fg, background: m.bg, whiteSpace: 'nowrap' }}>{m.label}</span>;
}

const BAND_META = {
  target: { label: 'Target (≥15% ROI)', fg: '#059669', bg: '#d1fae5' },
  entry_opportunity: { label: 'Entry opportunity', fg: '#b45309', bg: '#fef3c7' },
  below_breakeven: { label: 'Below breakeven', fg: '#64748b', bg: '#f1f5f9' },
};
function BandChip({ band, thin }) {
  if (thin) return <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, color: '#7c3aed', background: '#ede9fe', whiteSpace: 'nowrap' }}>Insufficient comps</span>;
  if (!band) return <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, color: '#64748b', background: '#f1f5f9', whiteSpace: 'nowrap' }}>No purchase price</span>;
  const m = BAND_META[band] || BAND_META.below_breakeven;
  return <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, color: m.fg, background: m.bg, whiteSpace: 'nowrap' }}>{m.label}</span>;
}

const fmtPct1 = n => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
const fmtRoi = n => n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';

// The South Yorkshire benchmark, shown on every area screen so alternatives are
// always read against the flagship area.
function SyStrip({ syBench, isMobile }) {
  if (!syBench) return null;
  return (
    <div style={{ ...card, background: '#f0fdf4', borderColor: '#bbf7d0', display: 'flex', gap: isMobile ? '12px' : '24px', flexWrap: 'wrap', alignItems: 'center', padding: '10px 14px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669', letterSpacing: '0.4px' }}>SOUTH YORKSHIRE BENCHMARK</div>
      <div style={{ fontSize: '13px', color: '#334155' }}>Score <ScoreChip score={syBench.score} /></div>
      <div style={{ fontSize: '13px', color: '#334155' }}>≤£100k: <b>{syBench.sub100k_confirmed}</b></div>
      <div style={{ fontSize: '13px', color: '#334155' }}>Median: <b>{fmtGBP(syBench.price_median)}</b></div>
      <div style={{ fontSize: '13px', color: '#334155' }}>Sell-through: <b>{syBench.sell_through_pct != null ? syBench.sell_through_pct + '%' : '—'}</b></div>
    </div>
  );
}

// Mirrors worker/marketIntel.js MI_FLIP_COSTS — display-only, no backend call.
// Kept in sync manually; this is the labelled default cost model, not a live value.
const MI_FLIP_COSTS_DISPLAY = {
  buyersPremiumPct: 0.03, buyersPremiumMin: 1500, sdltSurchargePct: 0.05,
  legalBuy: 1500, legalSell: 1200, holdingMonths: 7, holdingPerMonth: 350,
  agentPct: 0.012, refurbLight: 20000, refurbHeavy: 35000, targetReturn: 0.15,
};

// Backs out an inline-SVG sparkline (same construction as App.jsx's LR/HPI
// sparkline: viewBox 0 0 240 72, polyline + gridlines + end-dot) from the
// reported growth percentages rather than a stored time series (the backend
// keeps derived stats only, not the raw HPI series per point).
function buildGrowthSpark(growth, hpi) {
  const g = growth || hpi;
  const current = hpi?.current;
  if (!g || !current) return null;
  const back = pct => pct == null ? null : Math.round(current / (1 + pct / 100));
  const pts = [
    { yr: -5, price: back(g.growth5yr) },
    { yr: -3, price: back(g.growth3yr) },
    { yr: -1, price: back(g.growth1yr) },
    { yr: 0, price: current },
  ].filter(p => p.price != null);
  return pts.length >= 2 ? pts : null;
}

export default function MarketIntel({ isMobile, isTablet, liveLotsByOutcode, onNavigateToTriageOutcode, target, onTargetConsumed }) {
  const [view, setView] = useState('overview');
  const [error, setError] = useState(null);

  // Overview
  const [overview, setOverview] = useState(null);
  const [branchRank, setBranchRank] = useState([]);

  // Ranking
  const [areaType, setAreaType] = useState('outcode');
  const [minConfirmed, setMinConfirmed] = useState(5);
  const [prefix, setPrefix] = useState('');
  const [rankSort, setRankSort] = useState('score');
  const [areas, setAreas] = useState([]);
  const [syBench, setSyBench] = useState(null);
  const [rankLoading, setRankLoading] = useState(false);

  // Explorer
  const [branches, setBranches] = useState([]);
  const [filters, setFilters] = useState({ branch: '', outcode: '', status: '', confirmedOnly: false, sub100k: false, q: '' });
  const [lots, setLots] = useState([]);
  const [lotsTotal, setLotsTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [lotsLoading, setLotsLoading] = useState(false);
  const debounceRef = useRef(null);
  const PAGE_SIZE = 50;

  // Area Detail
  const [detailInput, setDetailInput] = useState('');
  const [detailAreaId, setDetailAreaId] = useState('');
  const [detailContext, setDetailContext] = useState(null);
  const [detailLots, setDetailLots] = useState([]);
  const [detailMeta, setDetailMeta] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState(null);
  const detailDebounceRef = useRef(null);

  // Compare Areas
  const [outcodeOptions, setOutcodeOptions] = useState([]);
  const [outcodeOptionsLoaded, setOutcodeOptionsLoaded] = useState(false);
  const [compareIds, setCompareIds] = useState(['', '']);
  const [compareThird, setCompareThird] = useState(false);
  const [compareData, setCompareData] = useState({});
  const [compareLoading, setCompareLoading] = useState(false);

  // Data Health & Settings
  const [jobs, setJobs] = useState([]);
  const [storage, setStorage] = useState(null);
  const [weightsForm, setWeightsForm] = useState(null);
  const [costsForm, setCostsForm] = useState(null);
  const [refreshDaysForm, setRefreshDaysForm] = useState(7);
  const [enrichOutcode, setEnrichOutcode] = useState('');
  const [dataBusy, setDataBusy] = useState('');
  const [dataMsg, setDataMsg] = useState(null);

  const openAreaDetail = id => { setView('detail'); setDetailInput(id); };

  // External navigation request from App.jsx (e.g. from the Dashboard or a Triage lot's MI badge)
  useEffect(() => {
    if (!target) return;
    if (target.sub === 'detail' && target.outcode) openAreaDetail(target.outcode);
    else if (target.sub) setView(target.sub);
    if (onTargetConsumed) onTargetConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const loadDataHealth = () => {
    api('/api/market/jobs').then(d => setJobs(d.jobs || [])).catch(e => setError(String(e)));
    api('/api/market/storage-estimate').then(setStorage).catch(() => {});
    api('/api/market/scoring-model').then(d => setWeightsForm(d.model?.weights || null)).catch(() => {});
    api('/api/market/settings').then(d => { setCostsForm(d.settings?.costs || null); setRefreshDaysForm(d.settings?.refreshDays ?? 7); }).catch(() => {});
    api('/api/market/overview').then(setOverview).catch(() => {});
  };

  useEffect(() => { if (view === 'data') loadDataHealth(); /* eslint-disable-next-line */ }, [view]);

  // Runs a POST action, shows a transient message, reloads the dashboard.
  const runAction = async (key, path, body, okMsg) => {
    setDataBusy(key); setDataMsg(null);
    try {
      const r = await apiPost(path, body);
      setDataMsg({ ok: true, text: okMsg || 'Done' });
      loadDataHealth();
      return r;
    } catch (e) {
      setDataMsg({ ok: false, text: String(e.message || e) });
    } finally {
      setDataBusy('');
    }
  };

  useEffect(() => {
    api('/api/market/overview').then(setOverview).catch(e => setError(String(e)));
    api('/api/market/areas?type=branch&limit=10').then(d => setBranchRank(d.areas || [])).catch(() => {});
    api('/api/market/branches').then(d => setBranches(d.branches || [])).catch(() => {});
    api('/api/market/areas?type=branch&prefix=southyorkshire&limit=1').then(d => setSyBench((d.areas || [])[0] || null)).catch(() => {});
  }, []);

  useEffect(() => {
    if (view !== 'ranking') return;
    setRankLoading(true);
    const params = new URLSearchParams({ type: areaType, minConfirmed: String(minConfirmed || 0), sort: rankSort, limit: '100' });
    if (prefix.trim()) params.set('prefix', prefix.trim());
    api('/api/market/areas?' + params)
      .then(d => setAreas(d.areas || []))
      .catch(e => setError(String(e)))
      .finally(() => setRankLoading(false));
  }, [view, areaType, minConfirmed, prefix, rankSort]);

  const lotsQuery = (limit, offset) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (filters.branch) params.set('branch', filters.branch);
    if (filters.outcode.trim()) params.set('outcode', filters.outcode.trim());
    if (filters.status) params.set('status', filters.status);
    if (filters.confirmedOnly) params.set('confirmedOnly', '1');
    if (filters.sub100k) { params.set('confirmedOnly', '1'); params.set('maxPrice', '100000'); }
    if (filters.q.trim()) params.set('q', filters.q.trim());
    return '/api/market/lots?' + params;
  };

  useEffect(() => {
    if (view !== 'explorer') return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLotsLoading(true);
      api(lotsQuery(PAGE_SIZE, page * PAGE_SIZE))
        .then(d => { setLots(d.lots || []); setLotsTotal(d.total || 0); })
        .catch(e => setError(String(e)))
        .finally(() => setLotsLoading(false));
    }, 350);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, filters, page]);

  // Area Detail — debounced fetch keyed on the picked outcode; also cross-references
  // /api/market/areas (same endpoint the ranking table uses) for the header score.
  useEffect(() => {
    if (view !== 'detail') return;
    const id = detailInput.trim().toUpperCase();
    clearTimeout(detailDebounceRef.current);
    if (!id) { setDetailAreaId(''); setDetailContext(null); setDetailLots([]); setDetailMeta(null); setSelectedLotId(null); return; }
    detailDebounceRef.current = setTimeout(() => {
      setDetailLoading(true);
      setDetailAreaId(id);
      setSelectedLotId(null);
      Promise.all([
        api('/api/market/context?type=outcode&id=' + encodeURIComponent(id)),
        api('/api/market/areas?type=outcode&prefix=' + encodeURIComponent(id) + '&limit=20'),
      ])
        .then(([ctxRes, areaRes]) => {
          setDetailContext(ctxRes.context || {});
          setDetailLots(ctxRes.gdvLots || []);
          setDetailMeta((areaRes.areas || []).find(a => a.area_id === id) || null);
        })
        .catch(e => setError(String(e)))
        .finally(() => setDetailLoading(false));
    }, 350);
    return () => clearTimeout(detailDebounceRef.current);
  }, [view, detailInput]);

  // Compare Areas — lazy-load the outcode picker list once, then fetch each
  // selected outcode's context in parallel (same context/areas endpoints as Detail).
  useEffect(() => {
    if (view !== 'compare' || outcodeOptionsLoaded) return;
    setOutcodeOptionsLoaded(true);
    api('/api/market/areas?type=outcode&limit=500')
      .then(d => setOutcodeOptions((d.areas || []).slice().sort((a, b) => a.area_id.localeCompare(b.area_id))))
      .catch(e => setError(String(e)));
  }, [view, outcodeOptionsLoaded]);

  useEffect(() => {
    if (view !== 'compare') return;
    const ids = compareIds.map(x => (x || '').trim().toUpperCase()).filter(Boolean);
    if (!ids.length) { setCompareData({}); return; }
    setCompareLoading(true);
    Promise.all(ids.map(id => Promise.all([
      api('/api/market/context?type=outcode&id=' + encodeURIComponent(id)),
      api('/api/market/areas?type=outcode&prefix=' + encodeURIComponent(id) + '&limit=20'),
    ])
      .then(([ctxRes, areaRes]) => [id, { context: ctxRes.context || {}, gdvLots: ctxRes.gdvLots || [], meta: (areaRes.areas || []).find(a => a.area_id === id) || null }])
      .catch(e => [id, { error: String(e) }])
    )).then(pairs => setCompareData(Object.fromEntries(pairs)))
      .finally(() => setCompareLoading(false));
  }, [view, compareIds]);

  const exportCsv = async () => {
    const d = await api(lotsQuery(1000, 0));
    const cols = ['auction_end_at', 'branch_id', 'address', 'postcode', 'outcode', 'town', 'guide_min', 'guide_max', 'result_status', 'sold_price', 'price_confirmed', 'excluded', 'exclusion_reasons'];
    const esc = v => v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const csv = [cols.join(','), ...(d.lots || []).map(l => cols.map(c => esc(l[c])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `market-intel-lots-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const subTabs = [
    { k: 'overview', l: 'Overview' },
    { k: 'ranking', l: 'National Ranking' },
    { k: 'explorer', l: 'Results Explorer' },
    { k: 'detail', l: 'Area Detail' },
    { k: 'compare', l: 'Compare Areas' },
    { k: 'data', l: 'Data Health & Settings' },
  ];

  const kpis = overview ? [
    { l: 'Lots analysed', v: overview.totals.lots?.toLocaleString(), sub: `${overview.branches} branches` },
    { l: 'Confirmed sales', v: overview.totals.confirmed?.toLocaleString(), sub: 'printed price only' },
    { l: 'Confirmed ≤ £100k', v: overview.totals.sub100k?.toLocaleString(), sub: 'before eligibility filters' },
    { l: 'Areas scored', v: overview.areasScored?.toLocaleString(), sub: `${overview.totals.outcodes} postcode districts` },
  ] : [];

  const jobErrors = overview?.jobs?.error || 0;
  const unknownStatuses = overview?.totals?.unknown_status || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
        {subTabs.map(t => (
          <button key={t.k} onClick={() => setView(t.k)} style={{
            padding: isMobile ? '12px 16px' : '9px 16px', minHeight: isMobile ? '44px' : undefined,
            borderRadius: '8px', border: '1px solid ' + (view === t.k ? '#0f172a' : '#e2e8f0'),
            background: view === t.k ? '#0f172a' : '#fff', color: view === t.k ? '#fff' : '#334155',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{t.l}</button>
        ))}
      </div>

      {error && (
        <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* ============ OVERVIEW ============ */}
      {view === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px' }}>
            {kpis.map(k => (
              <div key={k.l} style={card}>
                <div style={label11}>{k.l}</div>
                <div style={{ fontSize: isMobile ? '20px' : '26px', fontWeight: 800, color: '#0f172a', margin: '4px 0 2px' }}>{k.v ?? '…'}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '10px', alignItems: 'start' }}>
            <div style={card}>
              <div style={{ ...label11, marginBottom: '8px' }}>Branch ranking — Pass A score (24 months)</div>
              <div className="crm-table-wrap">
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '460px' }}>
                  <thead><tr>
                    <th style={th}>#</th><th style={th}>Branch</th><th style={th}>Score</th>
                    <th style={th}>≤£100k</th><th style={th}>Median</th><th style={th}>Sell-through</th>
                  </tr></thead>
                  <tbody>
                    {branchRank.map((a, i) => (
                      <tr key={a.area_id} style={a.area_id === 'southyorkshire' ? { background: '#f0fdf4' } : undefined}>
                        <td style={td}>{i + 1}</td>
                        <td style={{ ...td, fontWeight: a.area_id === 'southyorkshire' ? 700 : 500 }}>
                          {a.area_id}{a.area_id === 'southyorkshire' && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#059669', fontWeight: 700 }}>BENCHMARK</span>}
                        </td>
                        <td style={td}><ScoreChip score={a.score} /></td>
                        <td style={td}>{a.sub100k_confirmed}</td>
                        <td style={td}>{fmtGBP(a.price_median)}</td>
                        <td style={td}>{a.sell_through_pct != null ? a.sell_through_pct + '%' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={card}>
                <div style={label11}>Data window</div>
                <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px', lineHeight: 1.6 }}>
                  {overview ? (
                    <>
                      Results {String(overview.totals.earliest || '').slice(0, 10)} → {String(overview.totals.latest || '').slice(0, 10)}<br />
                      Rankings use a 24-month window.<br />
                      Last aggregated: {overview.lastAggregatedAt ? new Date(overview.lastAggregatedAt).toLocaleString('en-GB') : 'never'}
                    </>
                  ) : 'Loading…'}
                </div>
              </div>
              <div style={{ ...card, borderColor: (jobErrors || unknownStatuses) ? '#fde68a' : '#e2e8f0' }}>
                <div style={label11}>Data quality</div>
                <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px', lineHeight: 1.6 }}>
                  {jobErrors ? <span style={{ color: '#b45309' }}>⚠ {jobErrors} scrape job(s) in error</span> : '✓ All scrape jobs healthy'}<br />
                  {unknownStatuses ? <span style={{ color: '#b45309' }}>⚠ {unknownStatuses} unknown result status(es)</span> : '✓ 0 unknown result statuses'}<br />
                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>Scores are Pass A only — demand, comps and growth factors arrive with area enrichment.</span>
                </div>
              </div>
              <div style={{ ...card, cursor: 'pointer', minHeight: isMobile ? '44px' : undefined }} onClick={() => openAreaDetail('S63')} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') openAreaDetail('S63'); }}>
                <div style={label11}>South Yorkshire — flagship area</div>
                <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px', lineHeight: 1.6 }}>
                  S63 (Dearne Valley) has full Pass B enrichment — comps, growth and per-lot GDV bands.<br />
                  <span style={{ color: '#2563eb', fontWeight: 600 }}>View Area Detail →</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ============ NATIONAL RANKING ============ */}
      {view === 'ranking' && (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={areaType} onChange={e => setAreaType(e.target.value)} style={{ padding: isMobile ? '11px 10px' : '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fff' }}>
              <option value="outcode">Postcode district</option>
              <option value="town">Town</option>
              <option value="branch">Branch</option>
            </select>
            <input value={prefix} onChange={e => setPrefix(e.target.value)} placeholder={areaType === 'outcode' ? 'Prefix e.g. S / DN' : 'Prefix…'}
              style={{ padding: isMobile ? '11px 10px' : '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', width: '110px' }} />
            <label style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Min confirmed
              <input type="number" min="0" value={minConfirmed} onChange={e => setMinConfirmed(parseInt(e.target.value, 10) || 0)}
                style={{ padding: isMobile ? '11px 8px' : '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', width: '64px' }} />
            </label>
            <select value={rankSort} onChange={e => setRankSort(e.target.value)} style={{ padding: isMobile ? '11px 10px' : '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fff' }}>
              <option value="score">Sort: Score</option>
              <option value="sub100k">Sort: ≤£100k volume</option>
            </select>
            {rankLoading && <RefreshCw size={15} style={{ color: '#94a3b8', animation: 'spin 1s linear infinite' }} />}
          </div>

          {syBench && (
            <div style={{ ...card, background: '#f0fdf4', borderColor: '#bbf7d0', display: 'flex', gap: isMobile ? '12px' : '28px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#059669' }}>SOUTH YORKSHIRE BENCHMARK</div>
              <div style={{ fontSize: '13px', color: '#334155' }}>Score <ScoreChip score={syBench.score} /></div>
              <div style={{ fontSize: '13px', color: '#334155' }}>≤£100k: <b>{syBench.sub100k_confirmed}</b></div>
              <div style={{ fontSize: '13px', color: '#334155' }}>Median: <b>{fmtGBP(syBench.price_median)}</b></div>
              <div style={{ fontSize: '13px', color: '#334155' }}>Sell-through: <b>{syBench.sell_through_pct}%</b></div>
            </div>
          )}

          <div style={{ ...card, padding: 0 }}>
            <div className="crm-table-wrap">
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '860px' }}>
                <thead><tr>
                  <th style={th}>#</th><th style={th}>Area</th><th style={th}>Score</th><th style={th}>Confidence</th>
                  <th style={th}>≤£100k</th><th style={th}>Confirmed</th><th style={th}>% under budget</th>
                  <th style={th}>Median</th><th style={th}>P25–P75</th><th style={th}>Sell-through</th><th style={th}>Guide→Sold</th>
                </tr></thead>
                <tbody>
                  {areas.map((a, i) => {
                    const comp = a.components ? JSON.parse(a.components) : null;
                    const clickable = areaType === 'outcode';
                    return (
                      <tr key={a.area_id} onClick={clickable ? () => openAreaDetail(a.area_id) : undefined} style={clickable ? { cursor: 'pointer' } : undefined} title={clickable ? `Open ${a.area_id} in Area Detail` : undefined}>
                        <td style={td}>{i + 1}</td>
                        <td style={{ ...td, fontWeight: 600, color: clickable ? '#2563eb' : undefined }}>
                          {a.area_id}
                          {liveLotsByOutcode?.[a.area_id] > 0 && (
                            <span onClick={e => { e.stopPropagation(); onNavigateToTriageOutcode && onNavigateToTriageOutcode(a.area_id); }} title={`${liveLotsByOutcode[a.area_id]} live Auction Triage lot(s) in ${a.area_id} — click to open Triage`} style={{ fontSize: '10px', padding: '1px 5px', background: '#ede9fe', color: '#6d28d9', borderRadius: '4px', fontWeight: '500', marginLeft: '6px', cursor: 'pointer' }}>🔨 {liveLotsByOutcode[a.area_id]} live</span>
                          )}
                        </td>
                        <td style={td}><ScoreChip score={a.score} /></td>
                        <td style={td}>{a.confidence != null ? Math.round(a.confidence * 100) + '%' : '—'}</td>
                        <td style={{ ...td, fontWeight: 700, color: '#059669' }}>{a.sub100k_confirmed}</td>
                        <td style={td}>{a.sold_confirmed}</td>
                        <td style={td}>{comp?.pctUnderBudget != null ? comp.pctUnderBudget + '%' : '—'}</td>
                        <td style={td}>{fmtGBP(a.price_median)}</td>
                        <td style={td}>{a.price_p25 != null ? `${fmtGBP(a.price_p25)} – ${fmtGBP(a.price_p75)}` : '—'}</td>
                        <td style={td}>{a.sell_through_pct != null ? a.sell_through_pct + '%' : '—'}</td>
                        <td style={td}>{a.guide_to_sold_ratio != null ? '×' + a.guide_to_sold_ratio.toFixed(2) : '—'}</td>
                      </tr>
                    );
                  })}
                  {!areas.length && !rankLoading && (
                    <tr><td style={{ ...td, padding: '20px', color: '#94a3b8' }} colSpan={11}>No areas match — lower the minimum confirmed sales or clear the prefix.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
            24-month window · confirmed = printed sale price only · scores shrink small samples toward the national average (k=8) · Pass A factors only.
          </div>
        </>
      )}

      {/* ============ RESULTS EXPLORER ============ */}
      {view === 'explorer' && (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={filters.branch} onChange={e => { setFilters(f => ({ ...f, branch: e.target.value })); setPage(0); }}
              style={{ padding: isMobile ? '11px 10px' : '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fff', maxWidth: isMobile ? '46vw' : undefined }}>
              <option value="">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input value={filters.outcode} onChange={e => { setFilters(f => ({ ...f, outcode: e.target.value })); setPage(0); }} placeholder="Outcode e.g. S63"
              style={{ padding: isMobile ? '11px 10px' : '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', width: '110px' }} />
            <select value={filters.status} onChange={e => { setFilters(f => ({ ...f, status: e.target.value })); setPage(0); }}
              style={{ padding: isMobile ? '11px 10px' : '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fff' }}>
              <option value="">All results</option>
              {Object.entries(STATUS_META).filter(([k]) => k !== 'unknown').map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <label style={{ fontSize: '12px', color: '#334155', display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 0' }}>
              <input type="checkbox" checked={filters.sub100k} onChange={e => { setFilters(f => ({ ...f, sub100k: e.target.checked })); setPage(0); }} style={{ width: '16px', height: '16px' }} />
              Confirmed ≤ £100k
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: '9px', color: '#94a3b8' }} />
              <input value={filters.q} onChange={e => { setFilters(f => ({ ...f, q: e.target.value })); setPage(0); }} placeholder="Search address…"
                style={{ padding: isMobile ? '11px 10px 11px 28px' : '8px 10px 8px 28px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', width: isMobile ? '150px' : '200px' }} />
            </div>
            <button onClick={exportCsv} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: isMobile ? '11px 14px' : '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              <Download size={14} /> CSV
            </button>
          </div>

          <div style={{ ...card, padding: 0 }}>
            <div className="crm-table-wrap">
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '900px' }}>
                <thead><tr>
                  <th style={th}>Ended</th><th style={th}>Address</th><th style={th}>Outcode</th>
                  <th style={th}>Branch</th><th style={th}>Guide</th><th style={th}>Result</th><th style={th}>Price</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {lots.map(l => (
                    <tr key={l.id} style={l.excluded ? { opacity: 0.55 } : undefined}>
                      <td style={td}>{String(l.auction_end_at || '').slice(0, 10)}</td>
                      <td style={{ ...td, whiteSpace: 'normal', minWidth: '220px' }}>
                        {l.address}
                        {!!l.excluded && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#94a3b8' }}>excluded: {JSON.parse(l.exclusion_reasons || '[]').join(', ')}</span>}
                      </td>
                      <td style={td}>{l.outcode || '—'}</td>
                      <td style={td}>{l.branch_id}</td>
                      <td style={td}>{fmtGuide(l.guide_min, l.guide_max)}</td>
                      <td style={td}><StatusBadge status={l.result_status} /></td>
                      <td style={{ ...td, fontWeight: l.price_confirmed ? 700 : 400, color: l.price_confirmed ? '#059669' : '#94a3b8' }}>{fmtGBP(l.sold_price)}</td>
                      <td style={td}>
                        {l.platform_lot_id && (
                          <a href={`https://online.auctionhouse.co.uk/lot/redirect/${l.platform_lot_id}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', display: 'inline-flex', padding: '4px' }}>
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!lots.length && !lotsLoading && (
                    <tr><td style={{ ...td, padding: '20px', color: '#94a3b8' }} colSpan={8}>No lots match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              {lotsTotal.toLocaleString()} lots · page {page + 1} of {Math.max(1, Math.ceil(lotsTotal / PAGE_SIZE))}
            </span>
            <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
              style={{ padding: isMobile ? '11px 16px' : '7px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '13px', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>Prev</button>
            <button disabled={(page + 1) * PAGE_SIZE >= lotsTotal} onClick={() => setPage(p => p + 1)}
              style={{ padding: isMobile ? '11px 16px' : '7px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', fontSize: '13px', cursor: (page + 1) * PAGE_SIZE >= lotsTotal ? 'default' : 'pointer', opacity: (page + 1) * PAGE_SIZE >= lotsTotal ? 0.5 : 1 }}>Next</button>
            {lotsLoading && <RefreshCw size={15} style={{ color: '#94a3b8' }} />}
          </div>
        </>
      )}

      {/* ============ AREA DETAIL ============ */}
      {view === 'detail' && (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={detailInput} onChange={e => setDetailInput(e.target.value)} placeholder="Outcode e.g. S63"
              style={{ padding: isMobile ? '11px 10px' : '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', width: '140px', textTransform: 'uppercase', minHeight: isMobile ? '44px' : undefined }} />
            {detailLoading && <RefreshCw size={15} style={{ color: '#94a3b8', animation: 'spin 1s linear infinite' }} />}
            {!detailInput.trim() && <span style={{ fontSize: '12px', color: '#94a3b8' }}>Enter a postcode district (e.g. S63), or click an outcode row in National Ranking / the South Yorkshire card on Overview.</span>}
          </div>

          <SyStrip syBench={syBench} isMobile={isMobile} />

          {detailAreaId && detailContext && (
            <>
              {/* Header */}
              <div style={card}>
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <Globe size={16} style={{ color: '#64748b', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {detailAreaId}
                        {liveLotsByOutcode?.[detailAreaId] > 0 && (
                          <span onClick={() => onNavigateToTriageOutcode && onNavigateToTriageOutcode(detailAreaId)} title={`${liveLotsByOutcode[detailAreaId]} live Auction Triage lot(s) in ${detailAreaId} — click to open Triage`} style={{ fontSize: '11px', padding: '2px 7px', background: '#ede9fe', color: '#6d28d9', borderRadius: '5px', fontWeight: '600', cursor: 'pointer' }}>🔨 {liveLotsByOutcode[detailAreaId]} live</span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{detailContext.geo?.localAuthority || 'Local authority — unknown'}{detailContext.geo?.region ? ` · ${detailContext.geo.region}` : ''}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={label11}>Area score</div>
                      <ScoreChip score={detailMeta?.score} />
                    </div>
                    {detailMeta?.confidence != null && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={label11}>Confidence</div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>{Math.round(detailMeta.confidence * 100)}%</div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(3,1fr)' : 'repeat(3,1fr)', gap: '10px', marginTop: '14px' }}>
                  <div>
                    <div style={label11}>Flip spread</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{detailContext.score_factors?.flipSpread ?? '—'}</div>
                  </div>
                  <div>
                    <div style={label11}>Comp quality</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{detailContext.score_factors?.compQuality ?? '—'}</div>
                  </div>
                  <div>
                    <div style={label11}>Growth resilience</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{detailContext.score_factors?.growthResilience ?? '—'}</div>
                  </div>
                </div>

                {detailContext.score_factors && (detailContext.score_factors.flipSpread ?? 100) <= 5 && (
                  <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '8px', background: '#fef3c7', color: '#b45309', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0 }} /> Median purchase price ≈ median resale comp here — a thin flip margin, not a strong area. See the eligible-lots table below for the honest per-lot picture.
                  </div>
                )}
              </div>

              {/* Comps summary */}
              <div style={card}>
                <div style={{ ...label11, marginBottom: '8px' }}>Comparable sales — Land Registry, 24 months</div>
                {detailContext.comps_summary ? (
                  <>
                    <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginBottom: '10px', fontSize: '12px', color: '#64748b' }}>
                      <span>{detailContext.comps_summary.houseSales} house sales / {detailContext.comps_summary.totalSales} total sales</span>
                      <span>Outcode ceiling (P95): {fmtGBP(detailContext.comps_summary.outcodeCeiling)}</span>
                      <span>{detailContext.comps_summary.eligibleLots} eligible lots · {detailContext.comps_summary.lotsWithEconomics} with GDV computed</span>
                    </div>
                    <div className="crm-table-wrap">
                      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '520px' }}>
                        <thead><tr>
                          <th style={th}>Class</th><th style={th}>Count</th><th style={th}>Median</th><th style={th}>P25–P75</th><th style={th}>Ceiling (P95)</th>
                        </tr></thead>
                        <tbody>
                          {['Detached', 'Semi-detached', 'Terraced'].map(cls => {
                            const c = detailContext.comps_summary.classes?.[cls];
                            if (!c) return null;
                            return (
                              <tr key={cls}>
                                <td style={{ ...td, fontWeight: 600 }}>{cls}{c.thin && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#b45309', fontWeight: 700 }}>THIN SAMPLE</span>}</td>
                                <td style={td}>{c.count}</td>
                                <td style={td}>{c.thin ? 'insufficient comps' : fmtGBP(c.median)}</td>
                                <td style={td}>{c.thin ? '—' : `${fmtGBP(c.p25)} – ${fmtGBP(c.p75)}`}</td>
                                <td style={td}>{c.thin ? '—' : fmtGBP(c.ceiling)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {detailContext.comps_summary.medianExpectedGdv != null && detailContext.comps_summary.medianPurchase != null && (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                        Median expected GDV {fmtGBP(detailContext.comps_summary.medianExpectedGdv)} vs median purchase {fmtGBP(detailContext.comps_summary.medianPurchase)}.
                      </div>
                    )}
                  </>
                ) : <div style={{ fontSize: '13px', color: '#94a3b8' }}>No comps summary for this area yet.</div>}
              </div>

              {/* Growth chart */}
              <div style={card}>
                <div style={{ ...label11, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><TrendingUp size={13} /> HPI growth{detailContext.geo?.localAuthority ? ` — ${detailContext.geo.localAuthority}` : ''}</div>
                {(() => {
                  const spk = buildGrowthSpark(detailContext.growth, detailContext.hpi);
                  if (!spk) return <div style={{ fontSize: '13px', color: '#94a3b8' }}>No HPI growth data for this area yet.</div>;
                  const prices = spk.map(p => p.price);
                  const spkMin = Math.min(...prices) * 0.98, spkMax = Math.max(...prices) * 1.02;
                  const toY = v => 60 - ((v - spkMin) / (spkMax - spkMin || 1)) * 54;
                  const toX = i => 10 + i * Math.floor(230 / Math.max(spk.length - 1, 1));
                  const poly = spk.map((p, i) => `${toX(i)},${toY(p.price).toFixed(1)}`).join(' ');
                  const lastX = toX(spk.length - 1), lastY = toY(spk[spk.length - 1].price);
                  const g = detailContext.growth || detailContext.hpi;
                  return (
                    <>
                      <svg viewBox="0 0 240 72" width="100%" style={{ display: 'block', marginBottom: '6px', maxWidth: isMobile ? '100%' : '360px' }}>
                        <line x1="0" y1="64" x2="240" y2="64" stroke="#e2e8f0" strokeWidth="0.5" />
                        <line x1="0" y1="33" x2="240" y2="33" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2,2" />
                        <line x1="0" y1="4" x2="240" y2="4" stroke="#e2e8f0" strokeWidth="0.5" />
                        <text x="0" y="8" fontSize="8" fill="#94a3b8">£{Math.round(spkMax / 1000)}k</text>
                        <text x="0" y="37" fontSize="8" fill="#94a3b8">£{Math.round((spkMin + spkMax) / 2 / 1000)}k</text>
                        <polyline points={poly} fill="none" stroke="#059669" strokeWidth="1.5" strokeLinejoin="round" />
                        <circle cx={lastX} cy={lastY} r="3" fill="#059669" />
                        <line x1={lastX} y1={lastY} x2={lastX} y2="64" stroke="#059669" strokeWidth="0.5" strokeDasharray="2,2" />
                      </svg>
                      <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6 }}>
                        5yr raw: <b>{fmtPct1(g?.growth5yr)}</b> · 3yr raw: <b>{fmtPct1(g?.growth3yr)}</b> · 1yr raw: <b>{fmtPct1(g?.growth1yr)}</b><br />
                        COVID-adjusted annualised trend: <b>{fmtPct1(g?.covidAdjustedAnnual)}/yr</b>{g?.volatility != null && <> · volatility {g.volatility}%</>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Chart points are backed out from the reported growth rates (the backend stores derived stats, not a raw time series) — trend shape is indicative, the 5/3/1yr and current-price endpoints are exact.</div>
                    </>
                  );
                })()}
              </div>

              {/* Eligible lots + flip economics */}
              <div style={{ ...card, padding: 0 }}>
                <div style={{ padding: '14px 14px 0' }}>
                  <div style={label11}>Eligible lots — GDV bands ({detailLots.length}) <span style={{ fontWeight: 400, textTransform: 'none', color: '#94a3b8' }}>— click a row to price it in the flip calculator below</span></div>
                </div>
                <div className="crm-table-wrap">
                  <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '920px' }}>
                    <thead><tr>
                      <th style={th}>Address</th><th style={th}>Type</th><th style={th}>Beds</th><th style={th}>Purchase</th>
                      <th style={th}>GDV cons.</th><th style={th}>GDV exp.</th><th style={th}>GDV opt.</th>
                      <th style={th}>Profit exp.</th><th style={th}>ROI exp.</th><th style={th}>Band</th>
                    </tr></thead>
                    <tbody>
                      {detailLots.map(l => {
                        const g = l.gdv || {};
                        const sel = selectedLotId === l.id;
                        return (
                          <tr key={l.id} onClick={() => setSelectedLotId(l.id)} style={{ cursor: 'pointer', background: sel ? '#eff6ff' : undefined }}>
                            <td style={{ ...td, whiteSpace: 'normal', minWidth: '220px', fontWeight: sel ? 700 : 400 }}>{l.address}</td>
                            <td style={td}>{l.property_type || '—'}</td>
                            <td style={td}>{l.bedrooms ?? '—'}</td>
                            <td style={td}>{fmtGBP(g.purchase)}<div style={{ fontSize: '10px', color: '#94a3b8' }}>{g.purchaseBasis === 'confirmed_sale' ? 'confirmed sale' : g.purchaseBasis === 'guide_midpoint' ? 'guide midpoint' : '—'}</div></td>
                            <td style={td}>{g.thin ? '—' : fmtGBP(g.gdvConservative)}</td>
                            <td style={td}>{g.thin ? '—' : fmtGBP(g.gdvExpected)}</td>
                            <td style={td}>{g.thin ? '—' : fmtGBP(g.gdvOptimistic)}</td>
                            <td style={{ ...td, fontWeight: 600, color: g.profitExpected > 0 ? '#059669' : g.profitExpected != null ? '#dc2626' : undefined }}>{g.thin || g.profitExpected == null ? '—' : fmtGBP(g.profitExpected)}</td>
                            <td style={td}>{g.thin || g.roiExpected == null ? '—' : fmtRoi(g.roiExpected)}</td>
                            <td style={td}><BandChip band={g.band} thin={g.thin} /></td>
                          </tr>
                        );
                      })}
                      {!detailLots.length && !detailLoading && (
                        <tr><td style={{ ...td, padding: '20px', color: '#94a3b8' }} colSpan={10}>No eligible lots with GDV bands for this outcode yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Flip calculator (display-only) */}
              {(() => {
                const lot = detailLots.find(l => l.id === selectedLotId) || detailLots[0];
                if (!lot) return null;
                const g = lot.gdv || {};
                if (g.thin || g.purchase == null) {
                  return (
                    <div style={card}>
                      <div style={label11}>Flip calculator</div>
                      <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>{g.thin ? `Insufficient comps for ${lot.address} — no flip economics computed.` : `No purchase price available for ${lot.address} (no confirmed sale or guide price) — flip economics cannot be costed.`}</div>
                    </div>
                  );
                }
                const c = MI_FLIP_COSTS_DISPLAY;
                const premium = Math.max(c.buyersPremiumMin, Math.round(g.purchase * c.buyersPremiumPct));
                const sdltAndSurcharge = (g.costs?.buyCosts ?? 0) - premium - c.legalBuy;
                const refurbMid = Math.round((c.refurbLight + c.refurbHeavy) / 2);
                const agentFee = Math.round((g.gdvExpected ?? 0) * c.agentPct);
                const legalSellActual = (g.costs?.sellCostsAtExpected ?? 0) - agentFee;
                return (
                  <div style={card}>
                    <div style={{ ...label11, marginBottom: '10px' }}>Flip calculator — {lot.address} <span style={{ fontWeight: 400, textTransform: 'none', color: '#94a3b8' }}>(display-only, default assumptions — not editable, not a quote)</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 1fr', gap: '20px' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Costs (purchase → sale)</div>
                        {[
                          ['Purchase price', fmtGBP(g.purchase), g.purchaseBasis === 'confirmed_sale' ? 'confirmed sale price' : 'guide-price midpoint'],
                          ["Buyer's premium", fmtGBP(premium), '3% of purchase (min £1,500)'],
                          ['SDLT + additional-dwelling surcharge', fmtGBP(sdltAndSurcharge), 'banded SDLT + 5% surcharge'],
                          ['Legal fees (buy)', fmtGBP(c.legalBuy), 'fixed assumption'],
                          ['Holding costs', fmtGBP(g.costs?.holding), `${c.holdingMonths} months × £${c.holdingPerMonth}/mo`],
                          ['Refurb (mid-point used)', fmtGBP(refurbMid), `assumption range £${Math.round(c.refurbLight / 1000)}k–£${Math.round(c.refurbHeavy / 1000)}k`],
                          ['Selling agent', fmtGBP(agentFee), '1.2% of expected GDV'],
                          ['Legal fees (sell)', fmtGBP(legalSellActual), 'fixed assumption'],
                        ].map(([l2, v, note]) => (
                          <div key={l2} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#334155' }}>{l2}<div style={{ fontSize: '10px', color: '#94a3b8' }}>{note}</div></span>
                            <span style={{ fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Result (GDV band)</div>
                        {[
                          ['GDV — conservative (P25)', fmtGBP(g.gdvConservative)],
                          ['GDV — expected (median)', fmtGBP(g.gdvExpected)],
                          ['GDV — optimistic (P75, street-capped)', fmtGBP(g.gdvOptimistic)],
                        ].map(([l2, v]) => (
                          <div key={l2} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <span style={{ color: '#334155' }}>{l2}</span><span style={{ fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>{v}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '10px 0 4px', marginTop: '6px', borderTop: '2px solid #e2e8f0' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>Profit (expected)</span>
                          <span style={{ fontWeight: 800, color: g.profitExpected > 0 ? '#059669' : '#dc2626' }}>{fmtGBP(g.profitExpected)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>ROI (expected)</span>
                          <span style={{ fontWeight: 800, color: g.roiExpected >= c.targetReturn ? '#059669' : '#dc2626' }}>{fmtRoi(g.roiExpected)}</span>
                        </div>
                        <div style={{ marginTop: '8px' }}><BandChip band={g.band} thin={g.thin} /></div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '10px' }}>Target return assumption: {(c.targetReturn * 100).toFixed(0)}%. These are default cost assumptions applied uniformly across all lots — not a personalised quote, and not editable in this view.</div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {detailAreaId && !detailContext && !detailLoading && (
            <div style={card}>
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>No context data found for {detailAreaId} — Pass B enrichment may not have run for this outcode yet.</div>
            </div>
          )}
        </>
      )}

      {/* ============ COMPARE AREAS ============ */}
      {view === 'compare' && (
        <>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {compareIds.map((val, idx) => (
              <div key={idx}>
                <div style={{ ...label11, marginBottom: '4px' }}>Area {idx + 1}</div>
                <select value={val} onChange={e => setCompareIds(ids => ids.map((v, i) => i === idx ? e.target.value : v))}
                  style={{ padding: isMobile ? '11px 10px' : '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fff', minWidth: '150px', minHeight: isMobile ? '44px' : undefined }}>
                  <option value="">Select outcode…</option>
                  {outcodeOptions.map(a => <option key={a.area_id} value={a.area_id}>{a.area_id}{a.score != null ? ` · score ${a.score}` : ''}</option>)}
                </select>
              </div>
            ))}
            {!compareThird ? (
              <button onClick={() => { setCompareThird(true); setCompareIds(ids => [...ids, '']); }}
                style={{ padding: isMobile ? '11px 14px' : '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: '13px', fontWeight: 600, cursor: 'pointer', minHeight: isMobile ? '44px' : undefined }}>+ Add third area</button>
            ) : (
              <button onClick={() => { setCompareThird(false); setCompareIds(ids => ids.slice(0, 2)); }}
                style={{ padding: isMobile ? '11px 14px' : '8px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: '13px', fontWeight: 600, cursor: 'pointer', minHeight: isMobile ? '44px' : undefined }}>− Remove third area</button>
            )}
            {compareLoading && <RefreshCw size={15} style={{ color: '#94a3b8', animation: 'spin 1s linear infinite' }} />}
          </div>

          <SyStrip syBench={syBench} isMobile={isMobile} />

          {compareIds.filter(id => id).length === 0 ? (
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Select two or three outcodes above to compare side-by-side.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : `repeat(${Math.min(3, compareIds.filter(id => id).length)}, 1fr)`, gap: '10px', alignItems: 'start' }}>
              {compareIds.filter(id => id).map(id => {
                const d = compareData[id];
                if (!d) {
                  return (
                    <div key={id} style={card}>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{id}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Loading…</div>
                    </div>
                  );
                }
                if (d.error) {
                  return (
                    <div key={id} style={{ ...card, borderColor: '#fecaca' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{id}</div>
                      <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '4px' }}>{d.error}</div>
                    </div>
                  );
                }
                const ctx = d.context || {};
                const factors = ctx.score_factors || {};
                const comps = ctx.comps_summary || {};
                const growth = ctx.growth || ctx.hpi;
                return (
                  <div key={id} style={card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{id}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{ctx.geo?.localAuthority || '—'}</div>
                      </div>
                      <ScoreChip score={d.meta?.score} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '10px' }}>
                      <div><div style={label11}>Spread</div><div style={{ fontSize: '14px', fontWeight: 700 }}>{factors.flipSpread ?? '—'}</div></div>
                      <div><div style={label11}>Comps</div><div style={{ fontSize: '14px', fontWeight: 700 }}>{factors.compQuality ?? '—'}</div></div>
                      <div><div style={label11}>Growth</div><div style={{ fontSize: '14px', fontWeight: 700 }}>{factors.growthResilience ?? '—'}</div></div>
                    </div>

                    <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.7 }}>
                      {['Detached', 'Semi-detached', 'Terraced'].map(cls => {
                        const c = comps.classes?.[cls];
                        return <div key={cls}>{cls}: {c ? (c.thin ? 'insufficient comps' : `${fmtGBP(c.median)} median (n=${c.count})`) : '—'}</div>;
                      })}
                    </div>

                    <div style={{ fontSize: '12px', color: '#334155', marginTop: '8px', lineHeight: 1.7, borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                      <div>5yr growth (raw): <b>{fmtPct1(growth?.growth5yr)}</b></div>
                      <div>COVID-adjusted: <b>{fmtPct1(growth?.covidAdjustedAnnual)}/yr</b></div>
                    </div>

                    <div style={{ fontSize: '12px', color: '#334155', marginTop: '8px', lineHeight: 1.7, borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                      <div>Median expected GDV: <b>{fmtGBP(comps.medianExpectedGdv)}</b></div>
                      <div>Median purchase: <b>{fmtGBP(comps.medianPurchase)}</b></div>
                      <div>Headline spread: <b>{comps.medianExpectedGdv != null && comps.medianPurchase != null ? fmtGBP(comps.medianExpectedGdv - comps.medianPurchase) : '—'}</b></div>
                    </div>

                    <button onClick={() => openAreaDetail(id)} style={{ marginTop: '10px', width: '100%', padding: isMobile ? '11px' : '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', color: '#2563eb', fontSize: '12px', fontWeight: 600, cursor: 'pointer', minHeight: isMobile ? '44px' : undefined }}>Open full Area Detail →</button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============ DATA HEALTH & SETTINGS ============ */}
      {view === 'data' && (
        <>
          {dataMsg && (
            <div style={{ ...card, padding: '10px 12px', fontSize: '12px', borderColor: dataMsg.ok ? '#bbf7d0' : '#fecaca', background: dataMsg.ok ? '#f0fdf4' : '#fef2f2', color: dataMsg.ok ? '#166534' : '#b91c1c' }}>{dataMsg.text}</div>
          )}

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px' }}>
            {[
              { l: 'Storage used', v: storage?.currentDbBytes != null ? (storage.currentDbBytes / 1048576).toFixed(1) + ' MB' : '…', sub: storage?.projection ? `${storage.projection.pctOfFreeDbLimit}% of free D1` : '' },
              { l: 'Unknown statuses', v: overview?.totals?.unknown_status ?? '…', sub: 'should be 0' },
              { l: 'Jobs', v: jobs.length, sub: `${jobs.filter(j => j.status === 'queued' || j.status === 'running').length} active · ${jobs.filter(j => j.status === 'error').length} error` },
              { l: 'Last aggregated', v: overview?.lastAggregatedAt ? new Date(overview.lastAggregatedAt).toLocaleDateString('en-GB') : 'never', sub: overview?.lastAggregatedAt ? new Date(overview.lastAggregatedAt).toLocaleTimeString('en-GB') : '' },
            ].map(k => (
              <div key={k.l} style={card}>
                <div style={label11}>{k.l}</div>
                <div style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: 800, color: '#0f172a', margin: '4px 0 2px' }}>{k.v}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={card}>
            <div style={{ ...label11, marginBottom: '10px' }}>Actions</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button disabled={!!dataBusy} onClick={() => runAction('tick', '/api/market/jobs/tick', {}, 'Tick processed')} style={btnStyle(isMobile)}>{dataBusy === 'tick' ? '…' : 'Run one tick'}</button>
              <button disabled={!!dataBusy} onClick={() => runAction('agg', '/api/market/aggregate', {}, 'Scores recomputed')} style={btnStyle(isMobile)}>{dataBusy === 'agg' ? '…' : 'Recompute scores'}</button>
              <button disabled={!!dataBusy} onClick={() => runAction('refresh', '/api/market/jobs/seed', { type: 'passA_refresh', maxPages: 2 }, 'Refresh queued for all branches — runs via the tick/cron')} style={btnStyle(isMobile)}>{dataBusy === 'refresh' ? '…' : 'Refresh recent national results'}</button>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Deep-enrich an area:</span>
              <input value={enrichOutcode} onChange={e => setEnrichOutcode(e.target.value.toUpperCase())} placeholder="Outcode e.g. DN12"
                style={{ padding: isMobile ? '11px 10px' : '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', width: '130px' }} />
              <button disabled={!!dataBusy || !enrichOutcode.trim()} onClick={async () => {
                const oc = enrichOutcode.trim();
                await runAction('enrich', '/api/market/jobs/seed', { type: 'passB_lots', outcode: oc }, `Queued lot enrichment + comps for ${oc}`);
                await apiPost('/api/market/jobs/seed', { type: 'passB_context', outcode: oc }).catch(() => {});
                loadDataHealth();
              }} style={btnStyle(isMobile, '#2563eb')}>{dataBusy === 'enrich' ? '…' : 'Enrich lots + comps'}</button>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Enrichment + refresh run as background jobs (the cron drains them every ~10 min, or click “Run one tick” repeatedly).</div>
          </div>

          {/* Jobs table */}
          <div style={{ ...card, padding: 0 }}>
            <div style={{ ...label11, padding: '12px 14px 0' }}>Job queue</div>
            <div className="crm-table-wrap">
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '720px' }}>
                <thead><tr>
                  <th style={th}>Type</th><th style={th}>Target</th><th style={th}>Status</th><th style={th}>Att.</th><th style={th}>Progress / last error</th><th style={th}></th>
                </tr></thead>
                <tbody>
                  {jobs.map(j => {
                    let stats = {}; try { stats = JSON.parse(j.stats || '{}'); } catch {}
                    const statColor = { done: '#059669', running: '#2563eb', queued: '#d97706', error: '#dc2626', paused: '#64748b' }[j.status] || '#64748b';
                    return (
                      <tr key={j.id}>
                        <td style={td}>{j.type}</td>
                        <td style={td}>{j.target || '—'}</td>
                        <td style={{ ...td, color: statColor, fontWeight: 700 }}>{j.status}</td>
                        <td style={td}>{j.attempts || 0}</td>
                        <td style={{ ...td, whiteSpace: 'normal', maxWidth: '320px', color: j.last_error ? '#b91c1c' : '#64748b' }}>
                          {j.last_error || Object.entries(stats).filter(([, v]) => typeof v !== 'object').map(([k, v]) => `${k}:${v}`).join(' · ') || '—'}
                        </td>
                        <td style={td}>
                          {(j.status === 'queued' || j.status === 'error') && <button disabled={!!dataBusy} onClick={() => runAction('p' + j.id, `/api/market/jobs/${encodeURIComponent(j.id)}/pause`, {}, 'Paused')} style={miniBtn}>Pause</button>}
                          {j.status === 'paused' && <button disabled={!!dataBusy} onClick={() => runAction('r' + j.id, `/api/market/jobs/${encodeURIComponent(j.id)}/resume`, {}, 'Resumed')} style={miniBtn}>Resume</button>}
                        </td>
                      </tr>
                    );
                  })}
                  {!jobs.length && <tr><td style={{ ...td, padding: '18px', color: '#94a3b8' }} colSpan={6}>No jobs. Seed one above, or the cron is idle (all done).</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Scoring weights editor */}
          {weightsForm && (
            <div style={card}>
              <div style={{ ...label11, marginBottom: '4px' }}>Scoring weights (versioned)</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>Saving creates a new default model and recomputes every area’s score. Weights are normalised to sum to 1.</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '10px' }}>
                {SCORE_FACTORS.map(([k, lbl]) => (
                  <label key={k} style={{ fontSize: '12px', color: '#334155' }}>
                    <div style={{ marginBottom: '3px', color: '#64748b' }}>{lbl}</div>
                    <input type="number" step="0.01" min="0" value={weightsForm[k] ?? 0}
                      onChange={e => setWeightsForm(w => ({ ...w, [k]: e.target.value === '' ? '' : Number(e.target.value) }))}
                      style={{ width: '100%', padding: isMobile ? '11px 8px' : '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Sum: <b>{SCORE_FACTORS.reduce((s, [k]) => s + (Number(weightsForm[k]) || 0), 0).toFixed(2)}</b> (auto-normalised)</span>
                <button disabled={!!dataBusy} onClick={() => runAction('weights', '/api/market/scoring-model', { weights: weightsForm }, 'Weights saved + scores recomputed')} style={btnStyle(isMobile, '#2563eb')}>{dataBusy === 'weights' ? 'Saving…' : 'Save weights & recompute'}</button>
              </div>
            </div>
          )}

          {/* Flip cost model editor */}
          {costsForm && (
            <div style={card}>
              <div style={{ ...label11, marginBottom: '4px' }}>Flip cost model</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>Assumptions behind the GDV bands / flip calculator. Changes apply the next time an area is enriched (re-run “Enrich lots + comps”).</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '10px' }}>
                {COST_FIELDS.map(([k, lbl, kind]) => (
                  <label key={k} style={{ fontSize: '12px', color: '#334155' }}>
                    <div style={{ marginBottom: '3px', color: '#64748b' }}>{lbl}</div>
                    <input type="number" step={kind === 'pct' ? '0.1' : '1'} min="0"
                      value={kind === 'pct' ? +(Number(costsForm[k] || 0) * 100).toFixed(2) : (costsForm[k] ?? 0)}
                      onChange={e => { const raw = Number(e.target.value); setCostsForm(c => ({ ...c, [k]: kind === 'pct' ? raw / 100 : raw })); }}
                      style={{ width: '100%', padding: isMobile ? '11px 8px' : '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Auto-refresh cadence (days)
                  <input type="number" min="1" value={refreshDaysForm} onChange={e => setRefreshDaysForm(Number(e.target.value) || 7)}
                    style={{ width: '64px', padding: isMobile ? '11px 8px' : '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                </label>
                <button disabled={!!dataBusy} onClick={() => runAction('costs', '/api/market/settings', { costs: costsForm, refreshDays: refreshDaysForm }, 'Settings saved')} style={btnStyle(isMobile, '#2563eb')}>{dataBusy === 'costs' ? 'Saving…' : 'Save settings'}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const btnStyle = (isMobile, accent) => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: isMobile ? '11px 14px' : '8px 14px', minHeight: isMobile ? '44px' : undefined,
  borderRadius: '8px', border: '1px solid ' + (accent || '#e2e8f0'),
  background: accent || '#fff', color: accent ? '#fff' : '#334155',
  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
});
const miniBtn = { padding: '5px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontSize: '11px', fontWeight: 600, cursor: 'pointer' };
