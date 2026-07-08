import React, { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useData } from '../context/DataContext';
import { BackButton, Card, PageHeader, SectionHeader, TabButton } from '../components';
import { LcrReport, NsfrReport } from '../types';
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
  comments?: string;
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
      });
    }
    // Detailed capital reports override (source of truth).
    for (const r of (data.capitalReports || []).filter(r => r.entity === entity)) {
      const s = computeCapitalSummary(r);
      points.set(r.date, {
        date: r.date,
        cet1: s.cet1, at1: s.at1, t2: s.t2, tier1: s.tier1, totalCapital: s.totalCapital,
        creditRwa: s.creditRwa, marketRwa: s.marketRwa, opRwa: s.opRwa,
        otherRwa: s.rwaTotal - s.creditRwa - s.marketRwa - s.opRwa, rwaTotal: s.rwaTotal,
        cet1Ratio: s.cet1Ratio, at1Ratio: s.rwaTotal > 0 ? (s.at1 / s.rwaTotal) * 100 : null,
        t2Ratio: s.rwaTotal > 0 ? (s.t2 / s.rwaTotal) * 100 : null, totalRatio: s.totalCapitalRatio,
        leverageExposure: s.leverageExposure, leverageRatio: s.leverageRatio,
        isProjection: !!r.isProjection,
        comments: r.comments,
      });
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

// --- Capital tab ---------------------------------------------------------------------

const CapitalTab: React.FC<{ entity: string }> = ({ entity }) => {
  const { getKpisForDate } = useData();
  const series = useCapitalSeries(entity);
  const lastN = series.slice(-6);

  // Bridge period selectors (any two periods, projections included).
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const effFrom = fromDate || (series.length >= 2 ? series[series.length - 2].date : '');
  const effTo = toDate || (series.length >= 1 ? series[series.length - 1].date : '');

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
      {/* Position: ratios + RWA + commentary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <SectionHeader title="Regulatory capital position" suffix="total capital ratios, %" />
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

      {/* Bridge between any two periods */}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4 mb-2">
          <SectionHeader title="Capital bridge — evolution of CET1 capital ratio" suffix="between any two periods" />
          <div className="flex gap-3">
            {[['From', effFrom, setFromDate], ['To', effTo, setToDate]].map(([label, val, set]) => (
              <div key={label as string}>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">{label as string}</label>
                <select
                  value={val as string}
                  onChange={e => (set as (v: string) => void)(e.target.value)}
                  className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary"
                >
                  {series.map(p => (
                    <option key={p.date} value={p.date}>{monthLabel(p.date)}{p.isProjection ? ' (P)' : ''}</option>
                  ))}
                </select>
              </div>
            ))}
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
        <SectionHeader title="Regulatory capital summary" suffix="CHF mn — (P) = projection" />
        <div className="overflow-x-auto border border-efg-line rounded-lg">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-brand-bg-body">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold sticky left-0 bg-brand-bg-body">CHF mn</th>
                {series.map(p => (
                  <th key={p.date} className={`px-3 py-2 text-right text-[10px] uppercase tracking-wider font-semibold ${p.isProjection ? 'text-brand-primary' : 'text-brand-text-secondary'}`}>
                    {monthLabel(p.date)}{p.isProjection ? ' (P)' : ''}
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

const EntitiesTable: React.FC = () => {
  const { data, allEntities } = useData();
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
      <SectionHeader title="Capital positions by regulated entity" suffix="latest available period per entity, CHF mn" />
      <div className="overflow-x-auto border border-efg-line rounded-lg">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-brand-bg-body">
            <tr>
              {['Entity', 'Date', 'Total RWA', 'CET1', 'AT1', 'Total Tier 1', 'Tier 2', 'Eligible capital', 'Capital ratio', 'Leverage ratio'].map((h, i) => (
                <th key={h} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-efg-line">
            {rows.map(r => (
              <tr key={r.entity} className="hover:bg-brand-bg-body">
                <td className="px-3 py-2 font-semibold text-brand-text-primary">{r.entity}</td>
                <td className="px-3 py-2 text-brand-text-secondary">{r.date}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.rwa, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.cet1, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.at1, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(r.tier1, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.t2, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.total, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtPct(r.ratio)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.leverage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

// --- LCR tab -----------------------------------------------------------------------

const LcrTab: React.FC<{ entity: string }> = ({ entity }) => {
  const { data, allEntities } = useData();
  const lcrs = data.lcrReports || [];

  const dates = useMemo(
    () => Array.from(new Set(lcrs.map(r => r.date))).sort(),
    [lcrs]
  );
  const [asOf, setAsOf] = useState('');
  const effAsOf = asOf || dates[dates.length - 1] || '';
  const prevDate = dates.filter(d => d < effAsOf).pop();

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

  if (lcrs.length === 0) {
    return <p className="text-brand-text-secondary py-10 text-center">No LCR data yet — import the SNB LCR_G file in the Workbench.</p>;
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
        <SectionHeader title={`LCR — Overview as of ${monthLabel(effAsOf)}`} suffix={prevDate ? `vs ${monthLabel(prevDate)}` : undefined} />
        <div>
          <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">As of</label>
          <select value={effAsOf} onChange={e => setAsOf(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
            {dates.map(d => <option key={d} value={d}>{monthLabel(d)}</option>)}
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

const NsfrTab: React.FC<{ entity: string }> = ({ entity }) => {
  const { data } = useData();
  const reports = useMemo(
    () => (data.nsfrReports || []).filter(r => r.entity === entity).sort((a, b) => a.date.localeCompare(b.date)),
    [data.nsfrReports, entity]
  );
  const [asOf, setAsOf] = useState('');
  const current = reports.find(r => r.date === (asOf || reports[reports.length - 1]?.date));
  const previous = current ? [...reports].reverse().find(r => r.date < current.date) : undefined;

  if (!current) {
    return <p className="text-brand-text-secondary py-10 text-center">No NSFR data for {entity} yet — import the SNB NSFR_G file in the Workbench.</p>;
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
        <SectionHeader title={`NSFR — ${entity}`} suffix={`${monthLabel(current.date)}${previous ? ` vs ${monthLabel(previous.date)}` : ''}`} />
        <div>
          <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">As of</label>
          <select value={current.date} onChange={e => setAsOf(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
            {reports.map(r => <option key={r.date} value={r.date}>{monthLabel(r.date)}</option>)}
          </select>
        </div>
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

// --- Overview tab --------------------------------------------------------------------

const OverviewTab: React.FC<{ onDrill: (entity: string, tab: ReportTab) => void }> = ({ onDrill }) => {
  const { data, allEntities } = useData();

  const rows = useMemo(() => allEntities.map(entity => {
    const capSeries = (data.capitalReports || []).filter(r => r.entity === entity && !r.isProjection);
    const kpiDates = data.kpisHistory.filter(k => k.entity === entity).map(k => k.date);
    const capDates = Array.from(new Set([...capSeries.map(r => r.date), ...kpiDates])).sort();
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

    const lcrs = (data.lcrReports || []).filter(r => r.entity === entity && r.currency === 'TOT').sort((a, b) => a.date.localeCompare(b.date));
    const lcrCur = lcrs[lcrs.length - 1]; const lcrPrev = lcrs[lcrs.length - 2];

    const nsfrs = (data.nsfrReports || []).filter(r => r.entity === entity).sort((a, b) => a.date.localeCompare(b.date));
    const nsfrCur = nsfrs[nsfrs.length - 1]; const nsfrPrev = nsfrs[nsfrs.length - 2];

    if (!cur && !lcrCur && !nsfrCur) return null;
    return { entity, date: latestCap, cur, prev, lcrCur, lcrPrev, nsfrCur, nsfrPrev };
  }).filter(Boolean) as Array<{
    entity: string; date?: string;
    cur: { cet1Ratio: number | null; totalRatio: number | null; leverage: number | null } | null;
    prev: { cet1Ratio: number | null; totalRatio: number | null; leverage: number | null } | null;
    lcrCur?: LcrReport; lcrPrev?: LcrReport; nsfrCur?: NsfrReport; nsfrPrev?: NsfrReport;
  }>, [allEntities, data]);

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

type ReportTab = 'overview' | 'capital' | 'lcr' | 'nsfr';

export const ManagementReportPage: React.FC = () => {
  const { allEntities } = useData();
  const [tab, setTab] = useState<ReportTab>('overview');
  const [entity, setEntity] = useState(allEntities[0] || 'Group');

  return (
    <div className="p-5 md:p-8">
      <BackButton />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Management Report" subtitle="Capital adequacy, LCR and NSFR — history, variance between any periods, projections" />
        {tab !== 'overview' && (
          <div className="mb-6">
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Entity</label>
            <select value={entity} onChange={e => setEntity(e.target.value)} className="p-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-brand-primary min-w-44">
              {allEntities.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="mb-6 border-b border-efg-line">
        <nav className="-mb-px flex flex-wrap gap-x-2">
          <TabButton label="Overview" isActive={tab === 'overview'} onClick={() => setTab('overview')} />
          <TabButton label="Capital Adequacy" isActive={tab === 'capital'} onClick={() => setTab('capital')} />
          <TabButton label="LCR" isActive={tab === 'lcr'} onClick={() => setTab('lcr')} />
          <TabButton label="NSFR" isActive={tab === 'nsfr'} onClick={() => setTab('nsfr')} />
        </nav>
      </div>

      <div className="animate-fade-in">
        {tab === 'overview' && <OverviewTab onDrill={(e, t) => { setEntity(e); setTab(t); }} />}
        {tab === 'capital' && <CapitalTab entity={entity} />}
        {tab === 'lcr' && <LcrTab entity={entity} />}
        {tab === 'nsfr' && <NsfrTab entity={entity} />}
      </div>
    </div>
  );
};
