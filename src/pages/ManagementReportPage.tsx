import React, { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useData } from '../context/DataContext';
import { BackButton, Card, Modal, PageHeader, SectionHeader, TabButton } from '../components';
import { CET1CapitalBreakdown, FinStatementKind, LcrReport, NsfrReport } from '../types';
import { computeFinSummary, DEFAULT_GAAP, gaapOf, KIND_LABELS, KIND_SECTIONS } from '../services/finStatements';
import { computeCapitalSummary } from '../services/capital';
import { formatDate } from '../utils';
import { calculateCet1RatioEvolutionData, calculateKpis } from '../utils';
import { CapitalEvolutionChart } from '../components';
import { PALETTE, STATUS_COLORS } from '../theme';

/**
 * Management Report: the top-down KPI pack (modelled on the management
 * presentations) built from the detailed Excel-imported reports
 * (CapitalReports / LcrReports / NsfrReports) plus the memoranda and
 * comments captured in the Workbench. History everywhere, variance
 * between any two periods.
 */

const fmt = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined || isNaN(v as number) ? '—'
    : (v as number).toLocaleString('en-CH', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmtPct = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined || isNaN(v as number) ? '—' : `${(v as number).toFixed(digits)}%`;

const monthLabel = (iso: string): string => formatDate(iso);

// --- Unified capital series (reports first, KPI history as fallback) -------------

interface CapitalPoint {
  date: string;
  cet1: number; at1: number; t2: number; tier1: number; totalCapital: number;
  creditRwa: number; marketRwa: number; opRwa: number; otherRwa: number; rwaTotal: number;
  cet1Ratio: number | null; at1Ratio: number | null; t2Ratio: number | null; totalRatio: number | null;
  leverageExposure: number | null; leverageRatio: number | null;
  isProjection: boolean;
  /** 'report' = detailed Workbench/Excel report; 'kpi' = legacy KPI-history row only. */
  source: 'report' | 'kpi';
  comments?: string;
  /** CET1 composition (from the projected KPI entry) — feeds the movement table. */
  breakdown?: CET1CapitalBreakdown;
  /** RWA by currency: memo rows of the RWA section labelled with a 3-letter code (CHF equivalent). */
  rwaCcy?: Record<string, number>;
  /** RWA by currency in original currency: memo rows labelled "USD (LC)" etc. */
  rwaCcyLc?: Record<string, number>;
  /** Equity/deduction memo balances by label — feeds extra movement rows. */
  memoBalances?: Record<string, number>;
}

const useCapitalSeries = (entity: string): CapitalPoint[] => {
  const { data } = useData();
  return useMemo(() => {
    const points = new Map<string, CapitalPoint>();
    // KPI history entries first (fallback level).
    for (const k of data.kpisHistory.filter(k => k.entity === entity)) {
      const rwaTotal = k.creditRWA + k.marketRWA + k.opRWA + k.otherRWA;
      const at1 = k.tier1 - k.cet1Capital;
      points.set(k.date, {
        date: k.date,
        cet1: k.cet1Capital, at1, t2: 0, tier1: k.tier1, totalCapital: k.tier1,
        creditRwa: k.creditRWA, marketRwa: k.marketRWA, opRwa: k.opRWA, otherRwa: k.otherRWA, rwaTotal,
        cet1Ratio: rwaTotal > 0 ? (k.cet1Capital / rwaTotal) * 100 : null,
        at1Ratio: rwaTotal > 0 ? (at1 / rwaTotal) * 100 : null,
        t2Ratio: 0,
        totalRatio: rwaTotal > 0 ? (k.tier1 / rwaTotal) * 100 : null,
        leverageExposure: k.exposure || null,
        leverageRatio: k.exposure > 0 ? (k.tier1 / k.exposure) * 100 : null,
        isProjection: false,
        source: 'kpi',
      });
    }
    // Detailed capital reports override (source of truth).
    for (const r of (data.capitalReports || []).filter(r => r.entity === entity)) {
      const s = computeCapitalSummary(r);
      // RWA-by-currency memo rows: "USD" = CHF equivalent, "USD (LC)" = original currency.
      const rwaCcy: Record<string, number> = {};
      const rwaCcyLc: Record<string, number> = {};
      // Equity/deduction memo balances (share buyback, acquisitions, shares sold…).
      const memoBalances: Record<string, number> = {};
      for (const i of r.lineItems) {
        const label = i.label.trim();
        if (i.section === 'rwa' && i.memo) {
          const lc = label.match(/^([A-Z]{3})\s*\(LC\)$/i);
          if (lc) rwaCcyLc[lc[1].toUpperCase()] = (rwaCcyLc[lc[1].toUpperCase()] || 0) + i.amount;
          else if (/^[A-Z]{3}$/.test(label)) rwaCcy[label] = (rwaCcy[label] || 0) + i.amount;
        }
        if ((i.section === 'equity' || i.section === 'deduction') && i.memo && label) {
          memoBalances[label] = (memoBalances[label] || 0) + i.amount;
        }
      }
      points.set(r.date, {
        date: r.date,
        cet1: s.cet1, at1: s.at1, t2: s.t2, tier1: s.tier1, totalCapital: s.totalCapital,
        creditRwa: s.creditRwa, marketRwa: s.marketRwa, opRwa: s.opRwa,
        otherRwa: s.rwaTotal - s.creditRwa - s.marketRwa - s.opRwa, rwaTotal: s.rwaTotal,
        cet1Ratio: s.cet1Ratio, at1Ratio: s.rwaTotal > 0 ? (s.at1 / s.rwaTotal) * 100 : null,
        t2Ratio: s.rwaTotal > 0 ? (s.t2 / s.rwaTotal) * 100 : null, totalRatio: s.totalCapitalRatio,
        leverageExposure: s.leverageExposure, leverageRatio: s.leverageRatio,
        isProjection: !!r.isProjection,
        source: 'report',
        comments: r.comments,
        rwaCcy: Object.keys(rwaCcy).length > 0 ? rwaCcy : undefined,
        rwaCcyLc: Object.keys(rwaCcyLc).length > 0 ? rwaCcyLc : undefined,
        memoBalances: Object.keys(memoBalances).length > 0 ? memoBalances : undefined,
      });
    }
    // CET1 breakdown comes from the projected KPI entry (kept in sync for both
    // imported reports and manual KPI entries).
    for (const p of points.values()) {
      const k = data.kpisHistory.find(x => x.entity === entity && x.date === p.date);
      if (k?.cet1CapitalBreakdown) p.breakdown = k.cet1CapitalBreakdown;
    }
    return Array.from(points.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data.kpisHistory, data.capitalReports, entity]);
};

// --- Small building blocks --------------------------------------------------------

const KpiTile: React.FC<{ label: string; value: string; delta?: string; deltaGood?: boolean | null; sub?: string; accent?: boolean }> =
  ({ label, value, delta, deltaGood, sub, accent }) => (
    <div className={`px-5 py-5 text-center flex flex-col justify-center ${accent ? 'bg-brand-secondary text-white' : 'bg-white'}`}>
      <p className={`text-[11px] uppercase tracking-[0.15em] mb-1.5 ${accent ? 'text-white/70' : 'text-brand-text-secondary'}`}>{label}</p>
      <p className={`text-2xl font-light leading-none ${accent ? '' : 'text-brand-text-primary'}`}>{value}</p>
      {delta && (
        <p className={`text-[12px] mt-1.5 font-medium ${deltaGood == null ? (accent ? 'text-white/60' : 'text-brand-text-secondary') : deltaGood ? 'text-status-green' : 'text-status-red'}`}>
          {delta}
        </p>
      )}
      {sub && <p className={`text-[11px] mt-1 ${accent ? 'text-white/60' : 'text-brand-text-secondary'}`}>{sub}</p>}
    </div>
  );

const CommentPanel: React.FC<{ title: string; text?: string }> = ({ title, text }) => (
  <div className="bg-brand-bg-body rounded-lg px-6 py-5 h-full">
    <h3 className="text-base font-semibold text-brand-primary mb-3">{title}</h3>
    {text?.trim() ? (
      <ul className="space-y-2">
        {text.split('\n').filter(l => l.trim()).map((l, i) => (
          <li key={i} className="text-sm text-brand-text-primary flex gap-2">
            <span className="text-brand-primary mt-0.5">▪</span>
            <span>{l.replace(/^[-•▪]\s*/, '')}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-sm text-brand-text-secondary italic">No commentary — add it in the Workbench (Comments tab).</p>
    )}
  </div>
);

const axisStyle = { fontSize: 11, fill: PALETTE.muted };

// --- Audit trail -------------------------------------------------------------------

interface AuditQuery {
  /** What is displayed (e.g. "CET1 / RWA charts"). */
  what: string;
  /** Store object + filter, e.g. capitalReports [entity=Group, date=2025-12-31]. */
  object: string;
  filter: string;
  /** REST endpoint that returns the same rows in API mode. */
  endpoint: string;
  /** SQL executed against SQL Server (API mode). */
  sql: string;
  /** Derivation formulas / notes. */
  notes?: string[];
}

/**
 * Data-lineage popover: shows, for each block of the report, exactly which
 * store object / SQL query / REST endpoint feeds it and how the figures are
 * derived. Opens from the small "audit" button (and right-click) on each card.
 */
const AuditButton: React.FC<{ queries: AuditQuery[] }> = ({ queries }) => {
  const [open, setOpen] = useState(false);
  const { mode, apiBaseUrl } = useData();
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        onContextMenu={e => { e.preventDefault(); setOpen(true); }}
        title="Audit trail — where this data comes from"
        className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary rounded px-2 py-1 transition-colors"
      >
        ⚲ Audit
      </button>
      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title="Audit trail — data lineage">
          <div className="space-y-5 text-sm">
            <p className="text-brand-text-secondary">
              Source mode: <span className="font-semibold text-brand-text-primary">{mode === 'api' ? `REST API + SQL Server (${apiBaseUrl})` : 'Browser storage (localStorage["regReportData"]) — same structure as the SQL tables'}</span>.
              The data flows Excel/manual entry → Workbench → relational store → this report; the aggregated
              KPI history is a projection of the detailed reports.
            </p>
            {queries.map((q, i) => (
              <div key={i} className="border border-efg-line rounded-lg overflow-hidden">
                <div className="bg-brand-bg-body px-4 py-2 text-[11px] uppercase tracking-[0.12em] font-semibold text-brand-text-primary">{q.what}</div>
                <table className="w-full text-[13px]">
                  <tbody className="divide-y divide-efg-line">
                    <tr>
                      <td className="px-4 py-2 text-brand-text-secondary w-28 align-top">Object</td>
                      <td className="px-4 py-2 font-mono">{q.object} <span className="text-brand-text-secondary">{q.filter}</span></td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-brand-text-secondary align-top">Endpoint</td>
                      <td className="px-4 py-2 font-mono text-[12px]">{q.endpoint}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-brand-text-secondary align-top">SQL</td>
                      <td className="px-4 py-2 font-mono text-[12px] whitespace-pre-wrap">{q.sql}</td>
                    </tr>
                    {q.notes && q.notes.length > 0 && (
                      <tr>
                        <td className="px-4 py-2 text-brand-text-secondary align-top">Derivation</td>
                        <td className="px-4 py-2">
                          <ul className="list-disc list-inside space-y-0.5 text-[12px]">
                            {q.notes.map((n, j) => <li key={j}>{n}</li>)}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
};

/** SectionHeader + audit button on one line. */
const AuditedHeader: React.FC<{ title: string; suffix?: string; queries: AuditQuery[] }> = ({ title, suffix, queries }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="flex-1 min-w-0"><SectionHeader title={title} suffix={suffix} /></div>
    <AuditButton queries={queries} />
  </div>
);

// --- Capital tab ---------------------------------------------------------------------

const CapitalTab: React.FC<{ entity: string; asOf: string }> = ({ entity, asOf }) => {
  const { getKpisForDate } = useData();
  const fullSeries = useCapitalSeries(entity);
  // Some periods may only exist as legacy KPI-history rows (demo/manual KPI
  // entries without a detailed Workbench report) — allow hiding them.
  const [reportsOnly, setReportsOnly] = useState(false);
  // Reference basis: actuals up to the as-of date + forward projections.
  const series = useMemo(
    () => fullSeries.filter(p => (p.date <= asOf || p.isProjection) && (!reportsOnly || p.source === 'report')),
    [fullSeries, asOf, reportsOnly]
  );
  const hasKpiOnly = fullSeries.some(p => p.source === 'kpi');
  const lastN = series.slice(-6);

  // Comparison period for the bridge (any earlier period; reference = as-of).
  const [compareDate, setCompareDate] = useState('');
  const beforeAsOf = series.filter(p => p.date < asOf);
  const effFrom = compareDate || (beforeAsOf.length > 0 ? beforeAsOf[beforeAsOf.length - 1].date : '');
  const effTo = asOf;

  const bridge = useMemo(() => {
    if (!effFrom || !effTo || effFrom === effTo) return null;
    const a = getKpisForDate(entity, effFrom);
    const b = getKpisForDate(entity, effTo);
    if (!a || !b) return null;
    return calculateCet1RatioEvolutionData(a, b);
  }, [entity, effFrom, effTo, getKpisForDate]);

  const ratioChart = lastN.map(p => ({
    name: monthLabel(p.date) + (p.isProjection ? ' (P)' : ''),
    cet1: p.cet1Ratio ?? 0,
    at1t2: (p.at1Ratio ?? 0) + (p.t2Ratio ?? 0),
    total: p.totalRatio ?? 0,
  }));
  const rwaChart = lastN.map(p => ({
    name: monthLabel(p.date) + (p.isProjection ? ' (P)' : ''),
    op: p.opRwa / 1000,
    credit: p.creditRwa / 1000,
    market: (p.marketRwa + p.otherRwa) / 1000,
    total: p.rwaTotal / 1000,
  }));

  const latest = series[series.length - 1];
  const comments = [...series].reverse().find(p => p.comments?.trim())?.comments;

  if (series.length === 0) {
    return <p className="text-brand-text-secondary py-10 text-center">No capital data for {entity} yet — import the FINMA CASABIS file in the Workbench.</p>;
  }

  return (
    <div className="space-y-8">
      {hasKpiOnly && (
        <div className="flex items-center justify-between flex-wrap gap-2 -mb-3">
          <p className="text-[11px] text-brand-text-secondary">
            † = period backed only by a KPI-history row (no detailed Workbench report — e.g. demo or manually keyed KPI data).
          </p>
          <label className="flex items-center gap-2 text-[12px] text-brand-text-secondary cursor-pointer">
            <input type="checkbox" checked={reportsOnly} onChange={e => setReportsOnly(e.target.checked)}
              className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer" />
            Workbench reports only
          </label>
        </div>
      )}
      {/* Position: ratios + RWA + commentary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <AuditedHeader title="Regulatory capital position" suffix="total capital ratios, %" queries={[{
            what: 'Capital ratios & RWA charts',
            object: 'capitalReports',
            filter: `[entity=${entity}, date ≤ ${asOf} + projections]`,
            endpoint: `GET /api/capital-reports?entity=${entity}`,
            sql: `SELECT r.*, i.* FROM CapitalReports r\nJOIN CapitalLineItems i ON i.CapitalReportId = r.Id\nWHERE r.Entity = '${entity}' AND (r.Date <= '${asOf}' OR r.IsProjection = 1)`,
            notes: [
              'CET1 = Σ equity + Σ deductions (non-memo line items); fallback: KpiHistory row when no detailed report exists.',
              'CET1 ratio = CET1 / Total RWA; AT1+T2 band = (AT1 + T2) / Total RWA.',
              'RWA chart in CHF bn = mCHF / 1000.',
            ],
          }]} />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ratioChart} margin={{ top: 24, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} axisLine={{ stroke: PALETTE.line }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} unit="%" />
              <Tooltip formatter={(v: number, n: string) => [`${v.toFixed(1)}%`, n === 'cet1' ? 'CET1' : 'AT1 + T2']} />
              <Bar dataKey="cet1" name="CET1" stackId="r" fill={PALETTE.sand} maxBarSize={44}>
                <LabelList dataKey="cet1" position="inside" formatter={(v: number) => v.toFixed(1)} style={{ fill: '#fff', fontSize: 11, fontWeight: 600 }} />
              </Bar>
              <Bar dataKey="at1t2" name="AT1 + T2" stackId="r" fill={PALETTE.mist} maxBarSize={44}>
                <LabelList dataKey="total" position="top" formatter={(v: number) => v.toFixed(1)} style={{ fill: PALETTE.ink, fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <SectionHeader title="Risk Weighted Assets" suffix="breakdown, CHF bn" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rwaChart} margin={{ top: 24, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
              <XAxis dataKey="name" tick={axisStyle} axisLine={{ stroke: PALETTE.line }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number, n: string) => [v.toFixed(1), n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="op" name="Operational risk" stackId="rwa" fill={PALETTE.slateDark} maxBarSize={44} />
              <Bar dataKey="credit" name="Credit risk" stackId="rwa" fill={PALETTE.steel} maxBarSize={44} />
              <Bar dataKey="market" name="Market / other" stackId="rwa" fill={PALETTE.sand} maxBarSize={44}>
                <LabelList dataKey="total" position="top" formatter={(v: number) => v.toFixed(1)} style={{ fill: PALETTE.ink, fontSize: 11, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <CommentPanel title="Active capital management" text={comments} />
      </div>

      {/* Bridge: comparison period vs the as-of reference */}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
          <AuditedHeader title="Capital bridge — evolution of CET1 capital ratio" suffix={`compared period → reference ${monthLabel(asOf)}`} queries={[{
            what: 'CET1 ratio bridge (waterfall)',
            object: 'kpisHistory (projection of capitalReports)',
            filter: `[entity=${entity}, date ∈ {${effFrom}, ${effTo}}]`,
            endpoint: `GET /api/kpis/${entity}/${effFrom} · GET /api/kpis/${entity}/${effTo}`,
            sql: `SELECT * FROM KpiHistory\nWHERE Entity = '${entity}' AND Date IN ('${effFrom}', '${effTo}')`,
            notes: [
              'Movements from the CET1 composition (cet1CapitalBreakdown): P&L Δ, dividend accrual, share buy-back, other.',
              'Ratio impact of each movement ≈ Δcapital / RWA(start); RWA & CTA = denominator effect; residual plugged into "Other".',
            ],
          }]} />
          <div className="flex gap-3 items-end">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Compare with</label>
              <select
                value={effFrom}
                onChange={e => setCompareDate(e.target.value)}
                className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary"
              >
                {series.filter(p => p.date !== asOf).map(p => (
                  <option key={p.date} value={p.date}>{monthLabel(p.date)}{p.isProjection ? ' (P)' : ''}{p.source === 'kpi' ? ' †' : ''}</option>
                ))}
              </select>
            </div>
            <div className="pb-2 text-sm text-brand-text-secondary">→ <span className="font-semibold text-brand-text-primary">{monthLabel(asOf)}</span></div>
          </div>
        </div>
        {bridge ? (
          <CapitalEvolutionChart data={bridge} />
        ) : (
          <p className="text-sm text-brand-text-secondary py-8 text-center">
            Select two different periods with CET1 breakdown data (the movement detail needs the composition — available for imported or workbench-entered reports).
          </p>
        )}
      </Card>

      {/* Regulatory capital summary — monthly table */}
      <Card>
        <AuditedHeader title="Regulatory capital summary" suffix="CHF mn — (P) = projection" queries={[{
          what: 'Monthly regulatory capital summary',
          object: 'capitalReports (+ kpisHistory fallback)',
          filter: `[entity=${entity}, date ≤ ${asOf} + projections]`,
          endpoint: `GET /api/capital-reports?entity=${entity}`,
          sql: `SELECT r.*, i.* FROM CapitalReports r\nJOIN CapitalLineItems i ON i.CapitalReportId = r.Id\nWHERE r.Entity = '${entity}'\nORDER BY r.Date`,
          notes: ['One column per reporting date; capital & RWA aggregates computed from the line items (memo rows excluded).'],
        }]} />
        <div className="overflow-x-auto border border-efg-line rounded-lg">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-brand-bg-body">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold sticky left-0 bg-brand-bg-body">CHF mn</th>
                {series.map(p => (
                  <th key={p.date} className={`px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold ${p.isProjection ? 'text-brand-primary' : 'text-brand-text-secondary'}`}>
                    {monthLabel(p.date)}{p.isProjection ? ' (P)' : ''}{p.source === 'kpi' ? ' †' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                ['Common Equity Tier 1', (p: CapitalPoint) => fmt(p.cet1, 0), false],
                ['Additional Tier 1', (p: CapitalPoint) => fmt(p.at1, 0), false],
                ['Tier 1 capital', (p: CapitalPoint) => fmt(p.tier1, 0), true],
                ['Tier 2', (p: CapitalPoint) => fmt(p.t2, 0), false],
                ['Total regulatory capital', (p: CapitalPoint) => fmt(p.totalCapital, 0), true],
                ['Credit risk RWA', (p: CapitalPoint) => fmt(p.creditRwa, 0), false],
                ['Market risk RWA', (p: CapitalPoint) => fmt(p.marketRwa, 0), false],
                ['Operational risk RWA', (p: CapitalPoint) => fmt(p.opRwa, 0), false],
                ['Other RWA', (p: CapitalPoint) => fmt(p.otherRwa, 0), false],
                ['Total Risk Weighted Assets', (p: CapitalPoint) => fmt(p.rwaTotal, 0), true],
                ['CET1 ratio', (p: CapitalPoint) => fmtPct(p.cet1Ratio), false],
                ['Total capital ratio', (p: CapitalPoint) => fmtPct(p.totalRatio), false],
                ['Leverage ratio exposure', (p: CapitalPoint) => fmt(p.leverageExposure, 0), false],
                ['Leverage ratio', (p: CapitalPoint) => fmtPct(p.leverageRatio), true],
              ] as Array<[string, (p: CapitalPoint) => string, boolean]>).map(([label, get, strong]) => (
                <tr key={label} className={`border-t border-efg-line ${strong ? 'bg-brand-bg-body/60 font-semibold' : ''}`}>
                  <td className="px-3 py-1.5 text-brand-text-primary sticky left-0 bg-white">{label}</td>
                  {series.map(p => (
                    <td key={p.date} className={`px-3 py-1.5 text-right tabular-nums ${p.isProjection ? 'text-brand-primary/90 italic' : 'text-brand-text-primary'}`}>{get(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* CET1 movement details month by month */}
      <Cet1MovementTable series={series} entity={entity} />

      {/* RWA by currency (memo rows) */}
      <RwaCurrencyTable series={series} entity={entity} />

      {/* Positions by regulated entity */}
      <EntitiesTable />

      {latest?.isProjection && (
        <p className="text-[11px] text-brand-text-secondary italic">
          (P) columns are management projections entered in the Workbench, not reported positions.
        </p>
      )}
    </div>
  );
};

/**
 * Month-by-month CET1 & RWA movement detail (PDF "CET1 Movement details"):
 * for every consecutive pair of periods, decompose ΔCET1 into P&L, dividend
 * accrual, share buy-back and other equity movements (from the CET1
 * composition), plus the RWA movement by risk type; YTD = last vs first.
 */
const Cet1MovementTable: React.FC<{ series: CapitalPoint[]; entity: string }> = ({ series, entity }) => {
  // Calendar view (like the management pack): Jan..Dec columns of a selected
  // year + YTD vs December of the previous year.
  const years = useMemo(() => Array.from(new Set(series.map(p => p.date.slice(0, 4)))).sort(), [series]);
  const [yearSel, setYearSel] = useState('');
  const year = years.includes(yearSel) ? yearSel : years[years.length - 1] || '';

  type Move = { pnl: number | null; dividend: number | null; buyback: number | null; other: number | null;
    totalCet1: number; credit: number; market: number; op: number; otherRwa: number; totalRwa: number;
    ratioDelta: number | null; a: CapitalPoint; b: CapitalPoint; isProjection: boolean };

  const buildMove = (a: CapitalPoint, b: CapitalPoint): Move => {
    const totalCet1 = b.cet1 - a.cet1;
    const newYear = b.date.slice(0, 4) !== a.date.slice(0, 4);
    let pnl: number | null = null, dividend: number | null = null, buyback: number | null = null, other: number | null = null;
    if (a.breakdown && b.breakdown) {
      pnl = newYear ? b.breakdown.pnl : b.breakdown.pnl - a.breakdown.pnl;
      dividend = -(newYear ? (b.breakdown.dividend || 0) : (b.breakdown.dividend || 0) - (a.breakdown.dividend || 0));
      buyback = -(newYear ? b.breakdown.shareBuyback : b.breakdown.shareBuyback - a.breakdown.shareBuyback);
      other = totalCet1 - pnl - dividend - buyback;
    }
    return { pnl, dividend, buyback, other, totalCet1,
      credit: b.creditRwa - a.creditRwa, market: b.marketRwa - a.marketRwa,
      op: b.opRwa - a.opRwa, otherRwa: b.otherRwa - a.otherRwa, totalRwa: b.rwaTotal - a.rwaTotal,
      ratioDelta: a.cet1Ratio != null && b.cet1Ratio != null ? b.cet1Ratio - a.cet1Ratio : null,
      a, b, isProjection: b.isProjection };
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const { columns, ytd, baseline } = useMemo(() => {
    const base = [...series].reverse().find(p => p.date < `${year}-01-01`) || null;
    const cols: Array<{ label: string; move: Move | null }> = [];
    let prev: CapitalPoint | null = base;
    let last: CapitalPoint | null = null;
    for (let mth = 1; mth <= 12; mth++) {
      const mm = String(mth).padStart(2, '0');
      const pts = series.filter(p => p.date.startsWith(`${year}-${mm}`));
      const pt = pts[pts.length - 1];
      if (pt && prev) { cols.push({ label: MONTHS[mth - 1], move: buildMove(prev, pt) }); prev = pt; last = pt; }
      else if (pt) { prev = pt; last = pt; cols.push({ label: MONTHS[mth - 1], move: null }); }
      else cols.push({ label: MONTHS[mth - 1], move: null });
    }
    const y = base && last ? buildMove(base, last) : (last && series.filter(p => p.date.startsWith(year)).length > 1
      ? buildMove(series.filter(p => p.date.startsWith(year))[0], last) : null);
    return { columns: cols, ytd: y, baseline: base };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, year]);

  const signed = (v: number | null) =>
    v === null ? '—' : (v < 0 ? `(${fmt(Math.abs(v), 1)})` : fmt(v, 1));

  const rows: Array<[string, (m: Move) => number | null, boolean]> = [
    ['P&L plus non-cash items', m => m.pnl, false],
    ['Dividend accrual', m => m.dividend, false],
    ['Share buy-back', m => m.buyback, false],
    ['Equity movement excl. dividend & buy-back', m => m.other, false],
    ['Total CET1 movement', m => m.totalCet1, true],
    ['Credit risk RWA Δ', m => m.credit, false],
    ['Market risk RWA Δ', m => m.market, false],
    ['Operational risk RWA Δ', m => m.op, false],
    ['Other RWA Δ', m => m.otherRwa, false],
    ['Total RWA movement', m => m.totalRwa, true],
    ['Net CET1 ratio movement (p.p.)', m => m.ratioDelta, true],
  ];
  const memoLabels = useMemo(() => {
    const set = new Set<string>();
    series.forEach(p => Object.keys(p.memoBalances || {}).forEach(l => set.add(l)));
    return Array.from(set).sort();
  }, [series]);
  const memoGet = (label: string) => (m: Move): number | null =>
    (!m.a.memoBalances && !m.b.memoBalances) ? null : (m.b.memoBalances?.[label] ?? 0) - (m.a.memoBalances?.[label] ?? 0);

  if (series.length < 2) return null;

  const cell = (move: Move | null, get: (m: Move) => number | null, italic = false) => (
    <td className={`px-3 py-1.5 text-right tabular-nums ${italic ? 'italic text-brand-text-secondary' : ''} ${move && (get(move) ?? 0) < 0 ? 'text-status-red' : ''} ${move?.isProjection ? 'italic' : ''}`}>
      {move ? signed(get(move)) : ''}
    </td>
  );

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <AuditedHeader title="CET1 movement details" suffix={`month-to-month ${year} · YTD vs ${baseline ? monthLabel(baseline.date) : 'first period of the year'} · CHF mn — negatives in ( )`} queries={[{
          what: 'CET1 & RWA monthly movement decomposition',
          object: 'kpisHistory.cet1CapitalBreakdown + capitalReports memo rows',
          filter: `[entity=${entity}, year ${year}]`,
          endpoint: `GET /api/kpis?entity=${entity} · GET /api/capital-reports?entity=${entity}`,
          sql: `SELECT Entity, Date, Cet1Capital, Cet1CapitalBreakdown FROM KpiHistory WHERE Entity = '${entity}' ORDER BY Date`,
          notes: [
            'Each month = movement vs the previous available period; empty column = no data for that month.',
            'YTD = last available period of the year vs December of the previous year.',
            'P&L / dividend / buy-back are YTD accruals: they reset in January.',
          ],
        }]} />
        <div>
          <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Year</label>
          <select value={year} onChange={e => setYearSel(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto border border-efg-line rounded-lg mt-2">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-brand-bg-body">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold sticky left-0 bg-brand-bg-body">CHF mn</th>
              {columns.map(c => (
                <th key={c.label} className={`px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold ${c.move?.isProjection ? 'text-brand-primary' : 'text-brand-text-secondary'}`}>
                  {c.label}{c.move?.isProjection ? ' (P)' : ''}
                </th>
              ))}
              <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-primary font-bold bg-efg-line/60">YTD {year}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, get, strong]) => (
              <tr key={label} className={`border-t border-efg-line ${strong ? 'bg-brand-bg-body/60 font-semibold' : ''}`}>
                <td className="px-3 py-1.5 text-brand-text-primary sticky left-0 bg-white">{label}</td>
                {columns.map(c => <React.Fragment key={c.label}>{cell(c.move, get)}</React.Fragment>)}
                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold bg-brand-bg-body/40 ${ytd && (get(ytd) ?? 0) < 0 ? 'text-status-red' : ''}`}>{ytd ? signed(get(ytd)) : '—'}</td>
              </tr>
            ))}
            {memoLabels.length > 0 && (
              <>
                <tr className="border-t border-brand-text-primary/30 bg-brand-bg-body">
                  <td colSpan={columns.length + 2} className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">
                    Memorandum movements (Workbench memo rows — not part of the CET1 total)
                  </td>
                </tr>
                {memoLabels.map(label => (
                  <tr key={label} className="border-t border-efg-line">
                    <td className="px-3 py-1.5 text-brand-text-secondary italic sticky left-0 bg-white">{label}</td>
                    {columns.map(c => <React.Fragment key={c.label}>{cell(c.move, memoGet(label), true)}</React.Fragment>)}
                    <td className="px-3 py-1.5 text-right tabular-nums italic bg-brand-bg-body/40 text-brand-text-secondary">{ytd ? signed(memoGet(label)(ytd)) : '—'}</td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-brand-text-secondary mt-2">
        To add more movement lines (acquisitions, disposals, RSUs, CTA…): enter them as <em>memo</em> rows in the
        Workbench with the same label on each period — monthly deltas and YTD are computed automatically.
      </p>
    </Card>
  );
};

/**
 * RWA by currency — driven by memo rows of the RWA section:
 *  "USD"       → CHF-equivalent RWA (mCHF)
 *  "USD (LC)"  → RWA in original currency (m units)
 * When both exist, the implied FX rate is derived and, between the two most
 * recent periods, the RWA growth is decomposed into FX impact vs business.
 */
const RwaCurrencyTable: React.FC<{ series: CapitalPoint[]; entity: string }> = ({ series, entity }) => {
  const withCcy = series.filter(p => p.rwaCcy);
  const currencies = useMemo(() => {
    const set = new Set<string>();
    withCcy.forEach(p => Object.keys(p.rwaCcy!).forEach(c => set.add(c)));
    return Array.from(set).sort();
  }, [withCcy]);

  const rate = (p: CapitalPoint, c: string): number | null => {
    const chf = p.rwaCcy?.[c]; const lc = p.rwaCcyLc?.[c];
    return chf !== undefined && lc !== undefined && lc !== 0 ? chf / lc : null;
  };

  // FX vs business decomposition between the two latest periods with data.
  const growth = useMemo(() => {
    if (withCcy.length < 2) return null;
    const a = withCcy[withCcy.length - 2], b = withCcy[withCcy.length - 1];
    const rows = currencies.map(c => {
      const lcA = a.rwaCcyLc?.[c], lcB = b.rwaCcyLc?.[c];
      const rA = rate(a, c), rB = rate(b, c);
      if (lcA === undefined || lcB === undefined || rA === null || rB === null) return null;
      return {
        currency: c,
        fxImpact: lcA * (rB - rA),          // rate move on the opening balance
        business: (lcB - lcA) * rB,          // volume move at the closing rate
        total: (b.rwaCcy?.[c] ?? 0) - (a.rwaCcy?.[c] ?? 0),
      };
    }).filter(Boolean) as Array<{ currency: string; fxImpact: number; business: number; total: number }>;
    return rows.length > 0 ? { from: a.date, to: b.date, rows } : null;
  }, [withCcy, currencies]);

  const hasLc = withCcy.some(p => p.rwaCcyLc);

  return (
    <Card>
      <AuditedHeader title="RWA by currency" suffix="memorandum — CHF mn / original currency" queries={[{
        what: 'RWA by currency + FX decomposition',
        object: 'capitalReports.lineItems (RWA section, memo)',
        filter: `[entity=${entity}, label = 'USD' (CHF eq.) / 'USD (LC)' (original ccy)]`,
        endpoint: `GET /api/capital-reports?entity=${entity}`,
        sql: `SELECT r.Date, i.Label, i.Amount FROM CapitalLineItems i\nJOIN CapitalReports r ON r.Id = i.CapitalReportId\nWHERE r.Entity = '${entity}' AND i.Section = 'rwa' AND i.Memo = 1`,
        notes: [
          'Implied FX rate = CHF equivalent / local-currency amount.',
          'FX impact = LC(prev) × (rate(cur) − rate(prev)); business growth = ΔLC × rate(cur).',
        ],
      }]} />
      {currencies.length === 0 ? (
        <p className="text-sm text-brand-text-secondary py-4">
          No currency memoranda yet. In the <strong>Workbench → RWA</strong> tab, add <em>memo</em> rows labelled with the
          3-letter currency code (<code>USD</code> = CHF equivalent) and optionally <code>USD (LC)</code> = amount in
          original currency — the table, implied FX rates and the FX-vs-business growth split appear automatically.
        </p>
      ) : (
        <div className="overflow-x-auto border border-efg-line rounded-lg">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-brand-bg-body">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Item</th>
                {withCcy.map(p => (
                  <th key={p.date} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{monthLabel(p.date)}{p.isProjection ? ' (P)' : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-efg-line">
              {hasLc && (
                <tr className="bg-brand-bg-body"><td colSpan={withCcy.length + 1} className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">Original currencies (m units)</td></tr>
              )}
              {hasLc && currencies.map(c => (
                <tr key={c + '-lc'}>
                  <td className="px-3 py-1.5 text-brand-text-primary">{c}</td>
                  {withCcy.map(p => <td key={p.date} className="px-3 py-1.5 text-right tabular-nums">{p.rwaCcyLc?.[c] !== undefined ? fmt(p.rwaCcyLc[c], 0) : '—'}</td>)}
                </tr>
              ))}
              {hasLc && (
                <tr className="bg-brand-bg-body"><td colSpan={withCcy.length + 1} className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">Implied exchange rates</td></tr>
              )}
              {hasLc && currencies.map(c => (
                <tr key={c + '-fx'}>
                  <td className="px-3 py-1.5 text-brand-text-secondary italic">{c}/CHF</td>
                  {withCcy.map(p => { const r = rate(p, c); return <td key={p.date} className="px-3 py-1.5 text-right tabular-nums italic text-brand-text-secondary">{r !== null ? r.toFixed(4) : '—'}</td>; })}
                </tr>
              ))}
              <tr className="bg-brand-bg-body"><td colSpan={withCcy.length + 1} className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">CHF equivalent (mCHF)</td></tr>
              {currencies.map(c => (
                <tr key={c}>
                  <td className="px-3 py-1.5 font-semibold text-brand-text-primary">{c}</td>
                  {withCcy.map(p => <td key={p.date} className="px-3 py-1.5 text-right tabular-nums">{p.rwaCcy![c] !== undefined ? fmt(p.rwaCcy![c], 0) : '—'}</td>)}
                </tr>
              ))}
              <tr className="bg-brand-bg-body/60 font-semibold border-t border-brand-text-primary/30">
                <td className="px-3 py-2 text-brand-text-primary">Total RWA (all risks)</td>
                {withCcy.map(p => <td key={p.date} className="px-3 py-2 text-right tabular-nums">{fmt(p.rwaTotal, 0)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {growth && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary mb-2">
            Breakdown of RWA growth — {monthLabel(growth.from)} → {monthLabel(growth.to)} (CHF mn)
          </p>
          <div className="overflow-x-auto border border-efg-line rounded-lg max-w-xl">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-brand-bg-body">
                <tr>
                  {['Currency', 'FX impact', 'Business growth', 'Total Δ (CHF eq.)'].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold ${i > 0 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-efg-line">
                {growth.rows.map(r => (
                  <tr key={r.currency}>
                    <td className="px-3 py-1.5 font-semibold">{r.currency}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.fxImpact < 0 ? 'text-status-red' : ''}`}>{fmt(r.fxImpact, 0)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.business < 0 ? 'text-status-red' : ''}`}>{fmt(r.business, 0)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${r.total < 0 ? 'text-status-red' : ''}`}>{fmt(r.total, 0)}</td>
                  </tr>
                ))}
                <tr className="bg-brand-bg-body/60 font-semibold border-t border-brand-text-primary/30">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(growth.rows.reduce((a, r) => a + r.fxImpact, 0), 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(growth.rows.reduce((a, r) => a + r.business, 0), 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(growth.rows.reduce((a, r) => a + r.total, 0), 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
};

const EntitiesTable: React.FC = () => {
  const { data, setData, allEntities } = useData();

  const setLocalReq = (entity: string, pct: number | undefined) => {
    setData(prev => ({
      ...prev,
      riskAppetite: {
        ...prev.riskAppetite,
        [entity]: { ...(prev.riskAppetite[entity] || {}), localCapitalRequirement: pct },
      },
    }));
  };
  const rows = useMemo(() => allEntities.map(entity => {
    const reports = (data.capitalReports || []).filter(r => r.entity === entity && !r.isProjection);
    const dates = new Set<string>([
      ...reports.map(r => r.date),
      ...data.kpisHistory.filter(k => k.entity === entity).map(k => k.date),
    ]);
    const latestDate = Array.from(dates).sort().pop();
    if (!latestDate) return null;
    const report = reports.find(r => r.date === latestDate);
    if (report) {
      const s = computeCapitalSummary(report);
      return { entity, date: latestDate, rwa: s.rwaTotal, cet1: s.cet1, at1: s.at1, tier1: s.tier1, t2: s.t2, total: s.totalCapital, ratio: s.totalCapitalRatio, leverage: s.leverageRatio };
    }
    const k = data.kpisHistory.find(x => x.entity === entity && x.date === latestDate);
    if (!k) return null;
    const kp = calculateKpis(k);
    if (!kp) return null;
    return {
      entity, date: latestDate, rwa: kp.rwaTotal, cet1: k.cet1Capital, at1: k.tier1 - k.cet1Capital,
      tier1: k.tier1, t2: 0, total: k.tier1,
      ratio: kp.rwaTotal > 0 ? (k.tier1 / kp.rwaTotal) * 100 : null,
      leverage: k.exposure > 0 ? (k.tier1 / k.exposure) * 100 : null,
    };
  }).filter(Boolean) as Array<{ entity: string; date: string; rwa: number; cet1: number; at1: number; tier1: number; t2: number; total: number; ratio: number | null; leverage: number | null }>,
  [allEntities, data.capitalReports, data.kpisHistory]);

  if (rows.length === 0) return null;
  return (
    <Card>
      <AuditedHeader title="Capital positions by regulated entity" suffix="latest available period per entity, CHF mn — local requirement is editable" queries={[{
        what: 'Per-entity capital positions + local requirements',
        object: 'capitalReports (latest per entity) + Settings[riskAppetite]',
        filter: '[latest non-projection date per entity]',
        endpoint: 'GET /api/capital-reports · GET /api/settings/risk-appetite',
        sql: `SELECT r.* FROM CapitalReports r\nWHERE r.IsProjection IS NULL OR r.IsProjection = 0\n  AND r.Date = (SELECT MAX(Date) FROM CapitalReports WHERE Entity = r.Entity);\nSELECT [Value] FROM Settings WHERE [Key] = 'riskAppetite'`,
        notes: [
          'Min capital requirement = Total RWA × local requirement %.',
          'Capital excess = eligible capital − minimum requirement.',
          'Editing the % writes riskAppetite[entity].localCapitalRequirement (persisted with the settings).',
        ],
      }]} />
      <div className="overflow-x-auto border border-efg-line rounded-lg">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-brand-bg-body">
            <tr>
              {['Entity', 'Date', 'Total RWA', 'CET1', 'AT1', 'Total Tier 1', 'Tier 2', 'Eligible capital', 'Local req %', 'Min capital req', 'Capital excess', 'Capital ratio', 'Leverage ratio'].map((h, i) => (
                <th key={h} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-efg-line">
            {rows.map(r => {
              const reqPct = data.riskAppetite[r.entity]?.localCapitalRequirement;
              const minReq = reqPct != null ? (r.rwa * reqPct) / 100 : null;
              const excess = minReq != null ? r.total - minReq : null;
              return (
                <tr key={r.entity} className="hover:bg-brand-bg-body">
                  <td className="px-3 py-2 font-semibold text-brand-text-primary">{r.entity}</td>
                  <td className="px-3 py-2 text-brand-text-secondary">{r.date}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.rwa, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.cet1, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.at1, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(r.tier1, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.t2, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.total, 0)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number" step="0.1" min="0" max="100"
                      value={reqPct ?? ''}
                      placeholder="—"
                      onChange={e => setLocalReq(r.entity, e.target.value === '' ? undefined : parseFloat(e.target.value))}
                      className="w-16 text-right bg-transparent border-0 border-b border-gray-300 focus:border-brand-primary focus:ring-0 text-xs py-0.5 tabular-nums"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{minReq != null ? fmt(minReq, 0) : '—'}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${excess == null ? '' : excess >= 0 ? 'text-status-green' : 'text-status-red'}`}>
                    {excess != null ? fmt(excess, 0) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtPct(r.ratio)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.leverage)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-brand-text-secondary mt-2">
        Local req % = local regulatory capital requirement incl. Pillar 2 (stored with the risk appetite settings).
        Min capital req = Total RWA × Local req %. Capital excess = eligible capital − minimum requirement.
      </p>
    </Card>
  );
};

// --- LCR tab -----------------------------------------------------------------------

const LcrTab: React.FC<{ entity: string; asOf: string }> = ({ entity, asOf }) => {
  const { data, allEntities } = useData();
  const lcrs = data.lcrReports || [];

  const dates = useMemo(
    () => Array.from(new Set(lcrs.map(r => r.date))).sort(),
    [lcrs]
  );
  // Reference = global as-of: strictly the latest LCR date at or before it.
  const effAsOf = dates.filter(d => d <= asOf).pop() || '';
  const [compare, setCompare] = useState('');
  const prevDate = (compare && compare < effAsOf ? compare : undefined) || dates.filter(d => d < effAsOf).pop();

  // Overview: current vs previous LCR (TOT) per entity.
  const overview = useMemo(() => allEntities.map(e => {
    const cur = lcrs.find(r => r.entity === e && r.date === effAsOf && r.currency === 'TOT');
    const prev = prevDate ? lcrs.find(r => r.entity === e && r.date === prevDate && r.currency === 'TOT') : undefined;
    if (!cur && !prev) return null;
    return { entity: e, prev: prev?.lcrRatio ?? null, cur: cur?.lcrRatio ?? null };
  }).filter(Boolean) as Array<{ entity: string; prev: number | null; cur: number | null }>,
  [allEntities, lcrs, effAsOf, prevDate]);

  // History per entity (TOT).
  const historyEntities = useMemo(
    () => allEntities.filter(e => lcrs.filter(r => r.entity === e && r.currency === 'TOT').length >= 2),
    [allEntities, lcrs]
  );

  // Detail: per-currency table for the selected entity+date.
  const detail = useMemo(() => {
    const rows = lcrs.filter(r => r.entity === entity && r.date === effAsOf);
    const order = ['TOT', 'CHF', 'EUR', 'GBP', 'USD'];
    return rows.sort((a, b) => {
      const ia = order.indexOf(a.currency); const ib = order.indexOf(b.currency);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [lcrs, entity, effAsOf]);

  const comments = detail.find(r => r.currency === 'TOT')?.comments;

  // --- Entity-level HQLA & flow analytics (TOT rows) ---
  const entityTotHistory = useMemo(
    () => lcrs.filter(r => r.entity === entity && r.currency === 'TOT').sort((a, b) => a.date.localeCompare(b.date)),
    [lcrs, entity]
  );
  const hqlaEvolution = entityTotHistory.map(r => ({
    name: monthLabel(r.date),
    l1: Math.round(r.hqlaCat1),
    l2: Math.round(r.totalHqla - r.hqlaCat1),
    total: Math.round(r.totalHqla),
  }));
  const curTot = entityTotHistory.find(r => r.date === effAsOf);
  const prevTot = prevDate ? entityTotHistory.find(r => r.date === prevDate) : undefined;
  const hqlaSplit = curTot ? [
    { name: 'Level 1', prev: prevTot?.hqlaCat1 ?? null, cur: curTot.hqlaCat1 },
    { name: 'Level 2a', prev: prevTot?.hqlaCat2a ?? null, cur: curTot.hqlaCat2a },
    { name: 'Level 2b', prev: prevTot?.hqlaCat2b ?? null, cur: curTot.hqlaCat2b },
  ] : [];
  const flowSplit = curTot ? [
    { name: 'Retail outflows', prev: prevTot?.retailOutflows ?? null, cur: curTot.retailOutflows ?? 0 },
    { name: 'Wholesale & others out', prev: prevTot && prevTot.retailOutflows != null ? prevTot.totalOutflows - prevTot.retailOutflows : null, cur: curTot.retailOutflows != null ? curTot.totalOutflows - curTot.retailOutflows : 0 },
    { name: 'Reverse repo in', prev: prevTot?.reverseRepoInflows ?? null, cur: curTot.reverseRepoInflows ?? 0 },
    { name: 'Other inflows', prev: prevTot && prevTot.reverseRepoInflows != null ? prevTot.inflowsAfterCap - prevTot.reverseRepoInflows : null, cur: curTot.reverseRepoInflows != null ? curTot.inflowsAfterCap - curTot.reverseRepoInflows : 0 },
  ] : [];

  if (lcrs.length === 0 || !effAsOf) {
    return (
      <p className="text-brand-text-secondary py-10 text-center">
        {lcrs.length === 0
          ? 'No LCR data yet — import the SNB LCR_G file in the Workbench.'
          : `No LCR report at or before the reference date. Earliest available: ${monthLabel(dates[0])}.`}
      </p>
    );
  }

  const lcrRow = (label: string, get: (r: LcrReport) => number | null, opts?: { strong?: boolean; pct?: boolean; indent?: boolean }) => (
    <tr className={`border-t border-efg-line ${opts?.strong ? 'bg-brand-bg-body/60 font-semibold' : ''}`}>
      <td className={`px-3 py-1.5 text-brand-text-primary ${opts?.indent ? 'pl-7 italic text-brand-text-secondary' : ''}`}>{label}</td>
      {detail.map(r => {
        const v = get(r);
        return <td key={r.id} className="px-3 py-1.5 text-right tabular-nums">{opts?.pct ? (v === null ? '—' : fmtPct(v, 0)) : fmt(v, 0)}</td>;
      })}
    </tr>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex-1 min-w-0 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <SectionHeader title={`LCR — Overview as of ${monthLabel(effAsOf)}`} suffix={prevDate ? `vs ${monthLabel(prevDate)}` : undefined} />
          </div>
          <AuditButton queries={[{
            what: 'LCR overview, history & currency detail',
            object: 'lcrReports',
            filter: `[date ∈ {${prevDate || '—'}, ${effAsOf}}; detail: entity=${entity}]`,
            endpoint: `GET /api/lcr-reports?date=${effAsOf} · GET /api/lcr-reports?entity=${entity}&date=${effAsOf}`,
            sql: `SELECT * FROM LcrReports\nWHERE Date IN ('${prevDate || ''}', '${effAsOf}')\nORDER BY Entity, Currency`,
            notes: [
              'LCR = Total HQLA / Net outflows; Net outflows = Total outflows − Inflows after cap.',
              'Level 2 after cap = Total HQLA − Level 1; flow components are the weighted SNB rows (81, 121, 138, 195, 206).',
            ],
          }]} />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Compare with</label>
          <select value={prevDate || ''} onChange={e => setCompare(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
            {dates.filter(d => d < effAsOf).map(d => <option key={d} value={d}>{monthLabel(d)}</option>)}
          </select>
        </div>
      </div>

      {/* All-entity comparison bars */}
      <Card>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={overview} margin={{ top: 24, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
            <XAxis dataKey="entity" tick={axisStyle} axisLine={{ stroke: PALETTE.line }} tickLine={false} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} unit="%" />
            <Tooltip formatter={(v: number) => `${v?.toFixed(0)}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={100} stroke={STATUS_COLORS.red} strokeDasharray="4 3" label={{ value: 'SNB limit 100%', position: 'insideTopRight', fontSize: 10, fill: STATUS_COLORS.red }} />
            {prevDate && <Bar dataKey="prev" name={`LCR ${monthLabel(prevDate)}`} fill={PALETTE.slate} maxBarSize={38}>
              <LabelList dataKey="prev" position="top" formatter={(v: number) => (v ? `${v.toFixed(0)}%` : '')} style={{ fontSize: 10, fill: PALETTE.ink }} />
            </Bar>}
            <Bar dataKey="cur" name={`LCR ${monthLabel(effAsOf)}`} fill={PALETTE.red} maxBarSize={38}>
              <LabelList dataKey="cur" position="top" formatter={(v: number) => (v ? `${v.toFixed(0)}%` : '')} style={{ fontSize: 10, fill: PALETTE.ink, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* History per entity */}
      {historyEntities.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {historyEntities.map(e => {
            const hist = lcrs
              .filter(r => r.entity === e && r.currency === 'TOT')
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(r => ({ name: monthLabel(r.date), lcr: r.lcrRatio }));
            const thresholds = data.riskAppetite[e]?.lcr;
            return (
              <Card key={e}>
                <SectionHeader title={e} suffix="LCR history, TOT" />
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={hist} margin={{ top: 16, right: 12, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                    <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 10 }} axisLine={{ stroke: PALETTE.line }} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} unit="%" domain={['dataMin - 20', 'dataMax + 20']} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(0)}%`} />
                    <ReferenceLine y={100} stroke={STATUS_COLORS.red} strokeDasharray="4 3" />
                    {thresholds?.amber != null && <ReferenceLine y={thresholds.amber} stroke={STATUS_COLORS.amber} strokeDasharray="4 3" />}
                    <Line type="monotone" dataKey="lcr" stroke={PALETTE.slate} strokeWidth={2} dot={{ r: 3, fill: PALETTE.red, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            );
          })}
        </div>
      )}

      {/* Entity HQLA analytics */}
      {curTot && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <SectionHeader title={`${entity} — HQLA split by category`} suffix={prevTot ? `${monthLabel(prevDate!)} vs ${monthLabel(effAsOf)} · CHF mn` : `${monthLabel(effAsOf)} · CHF mn`} />
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={hqlaSplit} margin={{ top: 24, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                <XAxis dataKey="name" tick={axisStyle} axisLine={{ stroke: PALETTE.line }} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => fmt(v, 0)} />
                {prevTot && <Bar dataKey="prev" name={monthLabel(prevDate!)} fill={PALETTE.slate} maxBarSize={36}>
                  <LabelList dataKey="prev" position="top" formatter={(v: number) => (v ? fmt(v, 0) : '')} style={{ fontSize: 10, fill: PALETTE.ink }} />
                </Bar>}
                <Bar dataKey="cur" name={monthLabel(effAsOf)} fill={PALETTE.red} maxBarSize={36}>
                  <LabelList dataKey="cur" position="top" formatter={(v: number) => (v ? fmt(v, 0) : '')} style={{ fontSize: 10, fill: PALETTE.ink, fontWeight: 600 }} />
                </Bar>
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <SectionHeader title={`${entity} — Outflows & inflows composition`} suffix="weighted, CHF mn" />
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={flowSplit} margin={{ top: 24, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 10 }} axisLine={{ stroke: PALETTE.line }} tickLine={false} interval={0} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => fmt(v, 0)} />
                {prevTot && <Bar dataKey="prev" name={monthLabel(prevDate!)} fill={PALETTE.slate} maxBarSize={36} />}
                <Bar dataKey="cur" name={monthLabel(effAsOf)} fill={PALETTE.red} maxBarSize={36} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* HQLA evolution over time */}
      {hqlaEvolution.length >= 2 && (
        <Card>
          <SectionHeader title={`${entity} — HQLA evolution`} suffix="Level 1 / Level 2 (after cap), CHF mn" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={hqlaEvolution} margin={{ top: 24, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
              <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 10 }} axisLine={{ stroke: PALETTE.line }} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number, n: string) => [fmt(v, 0), n === 'l1' ? 'HQLA Level 1' : 'HQLA Level 2']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="l1" name="HQLA Level 1" stackId="h" fill={PALETTE.sand} maxBarSize={40} />
              <Bar dataKey="l2" name="HQLA Level 2" stackId="h" fill={PALETTE.red} maxBarSize={40}>
                <LabelList dataKey="total" position="top" formatter={(v: number) => fmt(v, 0)} style={{ fontSize: 10, fill: PALETTE.ink, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Per-entity currency detail */}
      <Card>
        <SectionHeader title={`${entity} — LCR reporting in main currencies`} suffix={`${monthLabel(effAsOf)} · weighted amounts, CHF mn`} />
        {detail.length === 0 ? (
          <p className="text-sm text-brand-text-secondary py-6 text-center">No LCR rows for {entity} at this date.</p>
        ) : (
          <div className="overflow-x-auto border border-efg-line rounded-lg">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-brand-bg-body">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">High quality liquid assets & flows</th>
                  {detail.map(r => <th key={r.id} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{r.currency}</th>)}
                </tr>
              </thead>
              <tbody>
                {lcrRow('Level 1', r => r.hqlaCat1)}
                {lcrRow('Level 2 after applying the cap', r => r.totalHqla - r.hqlaCat1)}
                {lcrRow('Total HQLA', r => r.totalHqla, { strong: true })}
                {lcrRow('Retail deposits (after risk-weighting)', r => r.retailOutflows ?? null)}
                {lcrRow('Unsecured wholesale funding and others', r => r.retailOutflows != null ? r.totalOutflows - r.retailOutflows : null)}
                {lcrRow('of which derivatives outflows', r => r.derivativesOutflows ?? null, { indent: true })}
                {lcrRow('Total outflow', r => r.totalOutflows, { strong: true })}
                {lcrRow('Reverse repo and securities borrowing', r => r.reverseRepoInflows ?? null)}
                {lcrRow('Other inflows', r => r.reverseRepoInflows != null ? r.inflowsAfterCap - r.reverseRepoInflows : null)}
                {lcrRow('of which derivatives inflows', r => r.derivativesInflows ?? null, { indent: true })}
                {lcrRow('Total inflow (after cap)', r => r.inflowsAfterCap, { strong: true })}
                {lcrRow('Net outflow', r => r.netOutflows, { strong: true })}
                {lcrRow('Ratio LCR', r => (r.netOutflows === 0 ? null : r.lcrRatio), { strong: true, pct: true })}
              </tbody>
            </table>
          </div>
        )}
        {comments && (
          <div className="mt-4">
            <CommentPanel title="HQLA comments" text={comments} />
          </div>
        )}
      </Card>
    </div>
  );
};

// --- NSFR tab ----------------------------------------------------------------------

const NsfrTab: React.FC<{ entity: string; asOf: string }> = ({ entity, asOf }) => {
  const { data } = useData();
  const reports = useMemo(
    () => (data.nsfrReports || []).filter(r => r.entity === entity).sort((a, b) => a.date.localeCompare(b.date)),
    [data.nsfrReports, entity]
  );
  const [compare, setCompare] = useState('');
  // Reference = global as-of: strictly the latest report AT OR BEFORE it —
  // never fall forward to future data.
  const current = [...reports].reverse().find(r => r.date <= asOf);
  const previous = current
    ? (compare && compare < current.date ? reports.find(r => r.date === compare) : undefined)
      || [...reports].reverse().find(r => r.date < current.date)
    : undefined;

  if (!current) {
    const earliest = reports[0]?.date;
    return (
      <p className="text-brand-text-secondary py-10 text-center">
        No NSFR report for {entity} at or before the reference date ({monthLabel(asOf)}).
        {earliest ? <> Earliest available: {monthLabel(earliest)} — move the reference date forward to see it.</> : <> Import the SNB NSFR_G file in the Workbench.</>}
      </p>
    );
  }

  const rawTotal = (r: NsfrReport, section: string) =>
    r.lineItems.filter(i => i.section === section)
      .reduce((a, i) => a + i.amountLt6m + i.amount6mTo1y + i.amountGte1y, 0);

  const sectionTable = (section: 'asf' | 'rsf' | 'rsfOff', title: string) => {
    const rows = current.lineItems.filter(i => i.section === section);
    if (rows.length === 0) return null;
    return (
      <Card key={section}>
        <SectionHeader title={title} suffix="raw amounts by residual maturity, CHF mn" />
        <div className="overflow-x-auto border border-efg-line rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-brand-bg-body">
              <tr>
                {['Item', '< 6 months', '6m – 1y', '≥ 1 year', 'Total', previous ? `Δ vs ${monthLabel(previous.date)}` : ''].filter(h => h !== '').map((h, i) => (
                  <th key={h} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold ${i > 0 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-efg-line">
              {rows.map(row => {
                const total = row.amountLt6m + row.amount6mTo1y + row.amountGte1y;
                const prevRow = previous?.lineItems.find(i => i.code === row.code);
                const prevTotal = prevRow ? prevRow.amountLt6m + prevRow.amount6mTo1y + prevRow.amountGte1y : null;
                const delta = prevTotal !== null ? total - prevTotal : null;
                return (
                  <tr key={row.id} className="hover:bg-brand-bg-body">
                    <td className="px-3 py-1.5 text-brand-text-primary">{row.label}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(row.amountLt6m, 0)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(row.amount6mTo1y, 0)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmt(row.amountGte1y, 0)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmt(total, 0)}</td>
                    {previous && (
                      <td className={`px-3 py-1.5 text-right tabular-nums ${delta == null ? 'text-brand-text-secondary' : delta >= 0 ? 'text-status-green' : 'text-status-red'}`}>
                        {delta == null ? 'new' : (delta >= 0 ? '+' : '') + fmt(delta, 0)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-brand-bg-body border-t border-brand-text-primary/30 font-semibold text-brand-text-primary">
                <td className="px-3 py-2">Total (raw)</td>
                <td className="px-3 py-2 text-right tabular-nums" colSpan={3}></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(rawTotal(current, section), 0)}</td>
                {previous && (
                  <td className="px-3 py-2 text-right tabular-nums">
                    {(rawTotal(current, section) - rawTotal(previous, section) >= 0 ? '+' : '') + fmt(rawTotal(current, section) - rawTotal(previous, section), 0)}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    );
  };

  const ratioDelta = previous ? current.nsfrRatio - previous.nsfrRatio : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex-1 min-w-0 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <SectionHeader title={`NSFR — ${entity}`} suffix={`${monthLabel(current.date)}${previous ? ` vs ${monthLabel(previous.date)}` : ''}`} />
          </div>
          <AuditButton queries={[{
            what: 'NSFR summary & section tables',
            object: 'nsfrReports (+ line items)',
            filter: `[entity=${entity}, date ∈ {${previous?.date || '—'}, ${current.date}}]`,
            endpoint: `GET /api/nsfr-reports?entity=${entity}&date=${current.date}`,
            sql: `SELECT r.*, i.* FROM NsfrReports r\nJOIN NsfrLineItems i ON i.NsfrReportId = r.Id\nWHERE r.Entity = '${entity}' AND r.Date IN ('${previous?.date || ''}', '${current.date}')`,
            notes: [
              'Weighted totals (ASF/RSF) & ratio come from the NSFR_G form (column V); bucket amounts are pre-weighting.',
              'Δ column = total raw amount vs the comparison period, matched by SNB row code.',
            ],
          }]} />
        </div>
        {reports.length > 1 && (
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Compare with</label>
            <select value={previous?.date || ''} onChange={e => setCompare(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
              {reports.filter(r => r.date < current.date).map(r => <option key={r.date} value={r.date}>{monthLabel(r.date)}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 border border-efg-line rounded-lg overflow-hidden divide-x divide-efg-line">
        <KpiTile label="Total ASF (weighted)" value={fmt(current.totalAsf, 0)} sub="CHF mn"
          delta={previous ? `${current.totalAsf - previous.totalAsf >= 0 ? '+' : ''}${fmt(current.totalAsf - previous.totalAsf, 0)} vs prior` : undefined}
          deltaGood={previous ? current.totalAsf >= previous.totalAsf : null} />
        <KpiTile label="Total RSF (weighted)" value={fmt(current.totalRsf, 0)} sub="CHF mn"
          delta={previous ? `${current.totalRsf - previous.totalRsf >= 0 ? '+' : ''}${fmt(current.totalRsf - previous.totalRsf, 0)} vs prior` : undefined}
          deltaGood={previous ? current.totalRsf <= previous.totalRsf : null} />
        <KpiTile label="NSFR Ratio" value={fmtPct(current.nsfrRatio, 0)} accent
          delta={ratioDelta != null ? `${ratioDelta >= 0 ? '+' : ''}${ratioDelta.toFixed(0)} p.p.` : undefined}
          deltaGood={ratioDelta != null ? ratioDelta >= 0 : null} />
        <KpiTile label="Requirement" value="100%" sub={current.nsfrRatio >= 100 ? 'met ✓' : 'NOT met'} />
      </div>

      {sectionTable('asf', 'Available Stable Funding (ASF — liabilities and capital)')}
      {sectionTable('rsf', 'Required Stable Funding (RSF — on balance-sheet)')}
      {sectionTable('rsfOff', 'Required Stable Funding (off balance-sheet)')}

      {current.comments && <CommentPanel title="NSFR comments" text={current.comments} />}
    </div>
  );
};

// --- Financial statements tab -----------------------------------------------------------

const FinancialsTab: React.FC<{ entity: string; asOf: string }> = ({ entity, asOf }) => {
  const { data } = useData();
  const [kind, setKind] = useState<FinStatementKind>('balanceSheet');
  const [compare, setCompare] = useState('');
  const [gaapSel, setGaapSel] = useState('');
  const [viewMode, setViewMode] = useState<'compare' | 'history'>('compare');
  const [rangeFrom, setRangeFrom] = useState('');
  const [deltaA, setDeltaA] = useState('');
  const [deltaB, setDeltaB] = useState('');

  // Frameworks actually present for this entity+kind (an entity can carry
  // e.g. IFRS + Swiss GAAP in parallel — each is its own view).
  const gaaps = useMemo(() => {
    const set = new Set<string>();
    (data.finStatements || []).filter(s => s.entity === entity && s.kind === kind).forEach(s => set.add(gaapOf(s)));
    return Array.from(set).sort();
  }, [data.finStatements, entity, kind]);
  const gaap = gaaps.includes(gaapSel) ? gaapSel : (gaaps[0] || DEFAULT_GAAP);

  const all = useMemo(
    () => (data.finStatements || [])
      .filter(s => s.entity === entity && s.kind === kind && gaapOf(s) === gaap)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [data.finStatements, entity, kind, gaap]
  );
  // Strictly at or before the reference date — never fall forward.
  const current = [...all].reverse().find(s => s.date <= asOf);
  const previous = current
    ? (compare && compare < current.date ? all.find(s => s.date === compare) : undefined)
      || [...all].reverse().find(s => s.date < current.date)
    : undefined;

  if (!current) {
    return (
      <div>
        <div className="flex gap-2 mb-6">
          {(Object.keys(KIND_LABELS) as FinStatementKind[]).map(k => (
            <TabButton key={k} label={KIND_LABELS[k]} isActive={kind === k} onClick={() => setKind(k)} isSubTab />
          ))}
        </div>
        <p className="text-brand-text-secondary py-10 text-center">
          No {KIND_LABELS[kind]} for {entity} yet — enter it in the Workbench ({KIND_LABELS[kind]} tab) or import a CSV there.
        </p>
      </div>
    );
  }

  const curSummary = computeFinSummary(current);
  const prevSummary = previous ? computeFinSummary(previous) : null;

  // --- History mode: every period in the selected range (≤ as-of), Δ between two chosen periods ---
  const upToAsOf = all.filter(s => s.date <= asOf);
  const effFrom = rangeFrom || upToAsOf[0]?.date || '';
  const periods = upToAsOf.filter(s => s.date >= effFrom);
  const effA = periods.some(s => s.date === deltaA) ? deltaA : periods[0]?.date;
  const effB = periods.some(s => s.date === deltaB) ? deltaB : periods[periods.length - 1]?.date;
  const valueOf = (s: typeof all[number] | undefined, section: string, label: string): number | null => {
    const row = s?.lineItems.find(i => i.section === section && i.label.trim().toLowerCase() === label.trim().toLowerCase());
    return row ? row.amount : null;
  };
  const histLabels = (section: string): string[] => {
    const seen: string[] = [];
    periods.forEach(s => s.lineItems.filter(i => i.section === section).forEach(i => {
      if (!seen.some(l => l.toLowerCase() === i.label.trim().toLowerCase())) seen.push(i.label.trim());
    }));
    return seen;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex gap-2 items-center flex-wrap">
          {(Object.keys(KIND_LABELS) as FinStatementKind[]).map(k => (
            <TabButton key={k} label={KIND_LABELS[k]} isActive={kind === k} onClick={() => setKind(k)} isSubTab />
          ))}
          {gaaps.length > 0 && (
            <span className="flex items-center gap-1.5 ml-3 pl-3 border-l border-efg-line">
              {gaaps.map(g => (
                <button key={g} onClick={() => setGaapSel(g)}
                  className={`text-[12px] font-semibold py-1 px-2.5 rounded border transition-colors ${gaap === g ? 'bg-brand-secondary text-white border-brand-secondary' : 'text-brand-text-secondary border-gray-300 hover:border-brand-secondary'}`}>
                  {g}
                </button>
              ))}
            </span>
          )}
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex gap-1">
            {(['compare', 'history'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`text-[12px] font-semibold py-1.5 px-3 rounded border transition-colors ${viewMode === mode ? 'bg-brand-primary text-white border-brand-primary' : 'text-brand-text-secondary border-gray-300 hover:border-brand-primary'}`}>
                {mode === 'compare' ? 'Two periods' : 'History (range)'}
              </button>
            ))}
          </div>
          {viewMode === 'compare' && all.length > 1 && (
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Compare with</label>
              <select value={previous?.date || ''} onChange={e => setCompare(e.target.value)}
                className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
                {all.filter(s => s.date < current.date).map(s => <option key={s.date} value={s.date}>{monthLabel(s.date)}</option>)}
              </select>
            </div>
          )}
          {viewMode === 'history' && (
            <>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">From</label>
                <select value={effFrom} onChange={e => setRangeFrom(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
                  {upToAsOf.map(s => <option key={s.date} value={s.date}>{monthLabel(s.date)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Δ between</label>
                <select value={effA || ''} onChange={e => setDeltaA(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
                  {periods.map(s => <option key={s.date} value={s.date}>{monthLabel(s.date)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">and</label>
                <select value={effB || ''} onChange={e => setDeltaB(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
                  {periods.map(s => <option key={s.date} value={s.date}>{monthLabel(s.date)}</option>)}
                </select>
              </div>
            </>
          )}
          <AuditButton queries={[{
            what: `${KIND_LABELS[kind]} (${entity})`,
            object: 'finStatements (+ line items)',
            filter: `[entity=${entity}, kind=${kind}, date ∈ {${previous?.date || '—'}, ${current.date}}]`,
            endpoint: `GET /api/fin-statements?entity=${entity}&kind=${kind}`,
            sql: `SELECT s.*, i.* FROM FinStatements s\nJOIN FinStatementLineItems i ON i.FinStatementId = s.Id\nWHERE s.Entity = '${entity}' AND s.Kind = '${kind}'`,
            notes: ['Section totals exclude memo rows.', kind === 'balanceSheet' ? 'Balance check: assets − liabilities − equity = 0.' : kind === 'pnl' ? 'Net profit = Σ income + Σ expenses (expenses negative).' : 'Closing balance = Σ movements (incl. opening balance).'],
          }]} />
        </div>
      </div>

      {viewMode === 'history' && (
        <Card>
          <SectionHeader title={`${KIND_LABELS[kind]} — ${entity} (${gaap})`} suffix={`${periods.length} period(s) · Δ = ${effB ? monthLabel(effB) : '—'} − ${effA ? monthLabel(effA) : '—'} · CHF mn`} />
          <div className="overflow-x-auto border border-efg-line rounded-lg">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-brand-bg-body">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold sticky left-0 bg-brand-bg-body">Item</th>
                  {periods.map(s => <th key={s.date} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{monthLabel(s.date)}</th>)}
                  <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-primary font-bold bg-efg-line/60">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-efg-line">
                {KIND_SECTIONS[kind].map(({ key, label }) => (
                  <React.Fragment key={key}>
                    <tr className="bg-brand-bg-body">
                      <td colSpan={periods.length + 2} className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">{label}</td>
                    </tr>
                    {histLabels(key).map(lbl => {
                      const a = valueOf(periods.find(s => s.date === effA), key, lbl);
                      const b = valueOf(periods.find(s => s.date === effB), key, lbl);
                      const d = a !== null && b !== null ? b - a : null;
                      return (
                        <tr key={lbl}>
                          <td className="px-3 py-1.5 text-brand-text-primary sticky left-0 bg-white">{lbl}</td>
                          {periods.map(s => {
                            const v = valueOf(s, key, lbl);
                            return <td key={s.date} className={`px-3 py-1.5 text-right tabular-nums ${v !== null && v < 0 ? 'text-status-red' : ''}`}>{v === null ? '—' : fmt(v, 1)}</td>;
                          })}
                          <td className={`px-3 py-1.5 text-right tabular-nums font-semibold bg-brand-bg-body/40 ${d !== null && d < 0 ? 'text-status-red' : d !== null && d > 0 ? 'text-status-green' : 'text-brand-text-secondary'}`}>
                            {d === null ? '—' : (d >= 0 ? '+' : '') + fmt(d, 1)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-brand-bg-body/60 font-semibold border-t border-brand-text-primary/20">
                      <td className="px-3 py-2 sticky left-0 bg-brand-bg-body/60">Total {label}</td>
                      {periods.map(s => <td key={s.date} className="px-3 py-2 text-right tabular-nums">{fmt(computeFinSummary(s).sections[key] ?? 0, 1)}</td>)}
                      <td className="px-3 py-2 text-right tabular-nums bg-efg-line/40">
                        {(() => {
                          const sa = periods.find(s => s.date === effA); const sb = periods.find(s => s.date === effB);
                          if (!sa || !sb) return '—';
                          const d = (computeFinSummary(sb).sections[key] ?? 0) - (computeFinSummary(sa).sections[key] ?? 0);
                          return (d >= 0 ? '+' : '') + fmt(d, 1);
                        })()}
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
                <tr className="bg-brand-secondary text-white font-semibold">
                  <td className="px-3 py-2 sticky left-0 bg-brand-secondary">{curSummary.keyFigureLabel}</td>
                  {periods.map(s => <td key={s.date} className="px-3 py-2 text-right tabular-nums">{fmt(computeFinSummary(s).keyFigure, 1)}</td>)}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {(() => {
                      const sa = periods.find(s => s.date === effA); const sb = periods.find(s => s.date === effB);
                      if (!sa || !sb) return '—';
                      const d = computeFinSummary(sb).keyFigure - computeFinSummary(sa).keyFigure;
                      return (d >= 0 ? '+' : '') + fmt(d, 1);
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {viewMode === 'compare' && (
      <Card>
        <SectionHeader title={`${KIND_LABELS[kind]} — ${entity} (${gaap})`} suffix={`${monthLabel(current.date)}${previous ? ` vs ${monthLabel(previous.date)}` : ''} · CHF mn`} />
        <div className="overflow-x-auto border border-efg-line rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-brand-bg-body">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Item</th>
                {previous && <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{monthLabel(previous.date)}</th>}
                <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{monthLabel(current.date)}</th>
                {previous && <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Δ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-efg-line">
              {KIND_SECTIONS[kind].map(({ key, label }) => {
                const rows = current.lineItems.filter(i => i.section === key);
                return (
                  <React.Fragment key={key}>
                    <tr className="bg-brand-bg-body">
                      <td colSpan={previous ? 4 : 2} className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">{label}</td>
                    </tr>
                    {rows.map(row => {
                      const prevRow = previous?.lineItems.find(i => i.section === key && i.label.trim().toLowerCase() === row.label.trim().toLowerCase());
                      const delta = prevRow ? row.amount - prevRow.amount : null;
                      return (
                        <tr key={row.id} className={row.memo ? 'bg-gray-50/60' : ''}>
                          <td className={`px-3 py-1.5 ${row.memo ? 'italic text-brand-text-secondary pl-6' : 'text-brand-text-primary'}`}>{row.label}</td>
                          {previous && <td className="px-3 py-1.5 text-right tabular-nums">{prevRow ? fmt(prevRow.amount, 1) : '—'}</td>}
                          <td className={`px-3 py-1.5 text-right tabular-nums ${row.amount < 0 ? 'text-status-red' : ''}`}>{fmt(row.amount, 1)}</td>
                          {previous && <td className={`px-3 py-1.5 text-right tabular-nums ${delta == null ? 'text-brand-text-secondary' : delta >= 0 ? 'text-status-green' : 'text-status-red'}`}>{delta == null ? 'new' : (delta >= 0 ? '+' : '') + fmt(delta, 1)}</td>}
                        </tr>
                      );
                    })}
                    <tr className="bg-brand-bg-body/60 font-semibold border-t border-brand-text-primary/20">
                      <td className="px-3 py-2">Total {label}</td>
                      {previous && <td className="px-3 py-2 text-right tabular-nums">{fmt(prevSummary!.sections[key] ?? 0, 1)}</td>}
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(curSummary.sections[key] ?? 0, 1)}</td>
                      {previous && <td className="px-3 py-2 text-right tabular-nums">{(() => { const d = (curSummary.sections[key] ?? 0) - (prevSummary!.sections[key] ?? 0); return (d >= 0 ? '+' : '') + fmt(d, 1); })()}</td>}
                    </tr>
                  </React.Fragment>
                );
              })}
              <tr className="bg-brand-secondary text-white font-semibold">
                <td className="px-3 py-2">{curSummary.keyFigureLabel}</td>
                {previous && <td className="px-3 py-2 text-right tabular-nums">{fmt(prevSummary!.keyFigure, 1)}</td>}
                <td className="px-3 py-2 text-right tabular-nums">{fmt(curSummary.keyFigure, 1)}</td>
                {previous && <td className="px-3 py-2 text-right tabular-nums">{(() => { const d = curSummary.keyFigure - prevSummary!.keyFigure; return (d >= 0 ? '+' : '') + fmt(d, 1); })()}</td>}
              </tr>
            </tbody>
          </table>
        </div>
        {kind === 'balanceSheet' && !curSummary.balanced && (
          <p className="text-[12px] text-status-amber mt-2">⚠ The balance sheet does not balance — check the amounts in the Workbench.</p>
        )}
        {current.comments && <div className="mt-4"><CommentPanel title="Comments" text={current.comments} /></div>}
      </Card>
      )}
    </div>
  );
};

// --- Overview tab --------------------------------------------------------------------

const OverviewTab: React.FC<{ asOf: string; onDrill: (entity: string, tab: ReportTab) => void }> = ({ asOf, onDrill }) => {
  const { data, allEntities } = useData();

  const rows = useMemo(() => allEntities.map(entity => {
    const capSeries = (data.capitalReports || []).filter(r => r.entity === entity && !r.isProjection);
    const kpiDates = data.kpisHistory.filter(k => k.entity === entity).map(k => k.date);
    // Anchor on the global reference date: latest period at or before as-of.
    const capDates = Array.from(new Set([...capSeries.map(r => r.date), ...kpiDates]))
      .filter(d => d <= asOf).sort();
    const latestCap = capDates[capDates.length - 1];
    const prevCap = capDates[capDates.length - 2];

    const capAt = (date?: string) => {
      if (!date) return null;
      const rep = capSeries.find(r => r.date === date);
      if (rep) { const s = computeCapitalSummary(rep); return { cet1Ratio: s.cet1Ratio, totalRatio: s.totalCapitalRatio, leverage: s.leverageRatio }; }
      const k = data.kpisHistory.find(x => x.entity === entity && x.date === date);
      if (!k) return null;
      const rwa = k.creditRWA + k.marketRWA + k.opRWA + k.otherRWA;
      return {
        cet1Ratio: rwa > 0 ? (k.cet1Capital / rwa) * 100 : null,
        totalRatio: rwa > 0 ? (k.tier1 / rwa) * 100 : null,
        leverage: k.exposure > 0 ? (k.tier1 / k.exposure) * 100 : null,
      };
    };
    const cur = capAt(latestCap); const prev = capAt(prevCap);

    const lcrs = (data.lcrReports || []).filter(r => r.entity === entity && r.currency === 'TOT' && r.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
    const lcrCur = lcrs[lcrs.length - 1]; const lcrPrev = lcrs[lcrs.length - 2];

    const nsfrs = (data.nsfrReports || []).filter(r => r.entity === entity && r.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
    const nsfrCur = nsfrs[nsfrs.length - 1]; const nsfrPrev = nsfrs[nsfrs.length - 2];

    if (!cur && !lcrCur && !nsfrCur) return null;
    // Most recent underlying date actually shown on the card.
    const shownDate = [latestCap, lcrCur?.date, nsfrCur?.date].filter(Boolean).sort().pop();
    return { entity, date: shownDate, cur, prev, lcrCur, lcrPrev, nsfrCur, nsfrPrev };
  }).filter(Boolean) as Array<{
    entity: string; date?: string;
    cur: { cet1Ratio: number | null; totalRatio: number | null; leverage: number | null } | null;
    prev: { cet1Ratio: number | null; totalRatio: number | null; leverage: number | null } | null;
    lcrCur?: LcrReport; lcrPrev?: LcrReport; nsfrCur?: NsfrReport; nsfrPrev?: NsfrReport;
  }>, [allEntities, data, asOf]);

  const delta = (cur?: number | null, prev?: number | null) =>
    cur != null && prev != null ? `${cur - prev >= 0 ? '▲' : '▼'} ${Math.abs(cur - prev).toFixed(1)} p.p.` : undefined;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {rows.map(r => (
        <Card key={r.entity} className="border-l-2 border-l-brand-primary">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-lg font-semibold text-brand-text-primary">{r.entity}</h3>
            <span className="text-xs text-brand-text-secondary">{r.date ? monthLabel(r.date) : ''}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 border border-efg-line rounded-lg overflow-hidden divide-x divide-efg-line mb-3">
            <button onClick={() => onDrill(r.entity, 'capital')} className="text-left hover:bg-brand-bg-body transition-colors">
              <KpiTile label="CET1" value={fmtPct(r.cur?.cet1Ratio)} delta={delta(r.cur?.cet1Ratio, r.prev?.cet1Ratio)} deltaGood={r.cur?.cet1Ratio != null && r.prev?.cet1Ratio != null ? r.cur.cet1Ratio >= r.prev.cet1Ratio : null} />
            </button>
            <button onClick={() => onDrill(r.entity, 'capital')} className="text-left hover:bg-brand-bg-body transition-colors">
              <KpiTile label="Leverage" value={fmtPct(r.cur?.leverage)} delta={delta(r.cur?.leverage, r.prev?.leverage)} deltaGood={r.cur?.leverage != null && r.prev?.leverage != null ? r.cur.leverage >= r.prev.leverage : null} />
            </button>
            <button onClick={() => onDrill(r.entity, 'lcr')} className="text-left hover:bg-brand-bg-body transition-colors">
              <KpiTile label="LCR" value={r.lcrCur ? fmtPct(r.lcrCur.lcrRatio, 0) : '—'} delta={r.lcrCur && r.lcrPrev ? delta(r.lcrCur.lcrRatio, r.lcrPrev.lcrRatio) : undefined} deltaGood={r.lcrCur && r.lcrPrev ? r.lcrCur.lcrRatio >= r.lcrPrev.lcrRatio : null} />
            </button>
            <button onClick={() => onDrill(r.entity, 'nsfr')} className="text-left hover:bg-brand-bg-body transition-colors">
              <KpiTile label="NSFR" value={r.nsfrCur ? fmtPct(r.nsfrCur.nsfrRatio, 0) : '—'} delta={r.nsfrCur && r.nsfrPrev ? delta(r.nsfrCur.nsfrRatio, r.nsfrPrev.nsfrRatio) : undefined} deltaGood={r.nsfrCur && r.nsfrPrev ? r.nsfrCur.nsfrRatio >= r.nsfrPrev.nsfrRatio : null} />
            </button>
          </div>
          <p className="text-[11px] text-brand-text-secondary">Click a metric to open the detailed view.</p>
        </Card>
      ))}
      {rows.length === 0 && (
        <p className="text-brand-text-secondary py-10 text-center col-span-2">
          No data yet — import the FINMA/SNB Excel returns in the Capital &amp; Liquidity Workbench.
        </p>
      )}
    </div>
  );
};

// --- Page ------------------------------------------------------------------------------

type ReportTab = 'overview' | 'capital' | 'lcr' | 'nsfr' | 'financials';

const TAB_TITLES: Record<ReportTab, string> = {
  overview: 'Overview',
  capital: 'Capital Adequacy',
  lcr: 'Liquidity Coverage Ratio',
  nsfr: 'Net Stable Funding Ratio',
  financials: 'Financial Statements',
};

export const ManagementReportPage: React.FC = () => {
  const { data, allEntities } = useData();
  const [tab, setTab] = useState<ReportTab>('overview');
  const [entity, setEntity] = useState(allEntities[0] || 'Group');
  const [refDate, setRefDate] = useState('');
  const [exporting, setExporting] = useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  const handleExportPdf = async () => {
    if (!contentRef.current || exporting) return;
    setExporting(true);
    try {
      const { exportSectionPdf } = await import('../services/pdfExport');
      // The tab renders one wrapper div whose children are the section cards —
      // capture those so each card paginates as its own block.
      const wrapper = (contentRef.current.firstElementChild as HTMLElement) ?? contentRef.current;
      await exportSectionPdf({
        root: wrapper,
        title: TAB_TITLES[tab],
        entity: tab === 'overview' ? 'All entities' : entity,
        date: asOf,
        fileName: `Report_${TAB_TITLES[tab].replace(/[^A-Za-z]+/g, '')}_${tab === 'overview' ? 'All' : entity}_${asOf}.pdf`,
      });
    } catch (err) {
      console.error('PDF export failed', err);
      alert(`PDF export failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setExporting(false);
    }
  };

  // Reference basis dates: every actual (non-projection) period known across
  // capital, LCR, NSFR and the KPI history — for any entity.
  const referenceDates = useMemo(() => {
    const set = new Set<string>();
    (data.capitalReports || []).filter(r => !r.isProjection).forEach(r => set.add(r.date));
    (data.lcrReports || []).forEach(r => set.add(r.date));
    (data.nsfrReports || []).forEach(r => set.add(r.date));
    data.kpisHistory.forEach(k => set.add(k.date));
    return Array.from(set).sort();
  }, [data]);

  const asOf = refDate || referenceDates[referenceDates.length - 1] || '';

  return (
    <div className="p-5 md:p-8">
      <BackButton />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Management Report" subtitle="Capital adequacy, LCR and NSFR — one reference date, per-section comparisons, projections" />
        <div className="mb-6 flex gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Reference date (as of)</label>
            <select value={asOf} onChange={e => setRefDate(e.target.value)} className="p-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-brand-primary min-w-40 font-semibold">
              {referenceDates.map(d => <option key={d} value={d}>{monthLabel(d)}</option>)}
            </select>
          </div>
          {tab !== 'overview' && (
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Entity</label>
              <select value={entity} onChange={e => setEntity(e.target.value)} className="p-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-brand-primary min-w-44">
                {allEntities.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-end">
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              title="Export the current section as a landscape PDF pack (one block per page section)"
              className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2.5 px-5 rounded-lg transition-colors disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : '⬇ Export PDF'}
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 border-b border-efg-line">
        <nav className="-mb-px flex flex-wrap gap-x-2">
          <TabButton label="Overview" isActive={tab === 'overview'} onClick={() => setTab('overview')} />
          <TabButton label="Capital Adequacy" isActive={tab === 'capital'} onClick={() => setTab('capital')} />
          <TabButton label="LCR" isActive={tab === 'lcr'} onClick={() => setTab('lcr')} />
          <TabButton label="NSFR" isActive={tab === 'nsfr'} onClick={() => setTab('nsfr')} />
          <TabButton label="Financial Statements" isActive={tab === 'financials'} onClick={() => setTab('financials')} />
        </nav>
      </div>

      <div className="animate-fade-in" ref={contentRef}>
        {tab === 'overview' && <OverviewTab asOf={asOf} onDrill={(e, t) => { setEntity(e); setTab(t); }} />}
        {tab === 'capital' && <CapitalTab entity={entity} asOf={asOf} />}
        {tab === 'lcr' && <LcrTab entity={entity} asOf={asOf} />}
        {tab === 'nsfr' && <NsfrTab entity={entity} asOf={asOf} />}
        {tab === 'financials' && <FinancialsTab entity={entity} asOf={asOf} />}
      </div>
    </div>
  );
};
