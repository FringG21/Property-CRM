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

export default function MarketIntel({ isMobile }) {
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
                    return (
                      <tr key={a.area_id}>
                        <td style={td}>{i + 1}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{a.area_id}</td>
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
                          <a href={`https://online.auctionhouse.co.uk/lot/${l.platform_lot_id}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', display: 'inline-flex', padding: '4px' }}>
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
    </div>
  );
}
