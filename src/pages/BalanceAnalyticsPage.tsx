import React, { useState } from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { BackButton, Card, PageHeader, SectionHeader, Sparkline } from '../components';
import { CHART_COLORS, PALETTE } from '../theme';

/**
 * Balance sheet analytics — PREVIEW / MOCKUP.
 *
 * Every number on this page is SAMPLE DATA: the page exists to validate the
 * reading before wiring it. The intended sources are noted under each block:
 *  - trend: /mercury/balance run per certified period (baselines = markers);
 *  - currency & booking center: the balance endpoint's existing dimensions;
 *  - residence: needs a core_positions × list_counterparties join (TVF or a
 *    dedicated query) — flagged.
 */

const PERIODS = ['AUG-25', 'SEP-25', 'OCT-25', 'NOV-25', 'DEC-25', 'JAN-26'];

const TREND = [
  { p: 'AUG-25', assets: 226.1, liabilities: 60.9, certified: true },
  { p: 'SEP-25', assets: 228.4, liabilities: 61.2, certified: true },
  { p: 'OCT-25', assets: 231.0, liabilities: 61.0, certified: true },
  { p: 'NOV-25', assets: 229.7, liabilities: 62.4, certified: true },
  { p: 'DEC-25', assets: 233.1, liabilities: 62.5, certified: true },
  { p: 'JAN-26', assets: 233.8, liabilities: 62.5, certified: false },
];

const BY_CCY = PERIODS.map((p, i) => ({
  p,
  CHF: 118 + i * 1.2, EUR: 54 + (i % 3), USD: 36 + i * 0.6, GBP: 9 + (i % 2) * 0.4, Other: 7.5 + i * 0.2,
}));

const BY_BC = [
  { bc: 'BC-GVA — Geneva', amount: 168.2, prev: 166.0 },
  { bc: 'BC-ZH — Zurich', amount: 48.9, prev: 49.6 },
  { bc: 'BC-LUG — Lugano', amount: 16.7, prev: 17.5 },
];

const BY_RES = [
  { c: 'CH', amount: 121.4 }, { c: 'LU', amount: 28.9 }, { c: 'DE', amount: 24.1 },
  { c: 'FR', amount: 18.7 }, { c: 'GB', amount: 14.2 }, { c: 'Other', amount: 26.5 },
];

const TOP_MOVES = [
  { acct: '104', label: 'Due from customers — loans', prev: 58.4, now: 59.9, adj: 0.7 },
  { acct: '106', label: 'Trading securities', prev: 66.9, now: 68.2, adj: 0 },
  { acct: '201', label: 'Due to banks — term', prev: 42.1, now: 41.0, adj: -0.7 },
  { acct: '103', label: 'Due from banks', prev: 89.2, now: 90.0, adj: 0 },
  { acct: '105', label: 'Mortgages', prev: 15.0, now: 14.9, adj: 0 },
];

const fmtB = (n: number) => `${n.toFixed(1)}`;

const Tile: React.FC<{ label: string; value: string; sub: string; trend: number[]; accent?: boolean }> =
  ({ label, value, sub, trend, accent }) => (
    <Card className="!p-4">
      <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${accent ? 'text-brand-primary' : ''}`}>{value}</p>
      <p className="text-[11px] text-brand-text-secondary">{sub}</p>
      <div className="mt-2 text-brand-text-secondary"><Sparkline points={trend} height={26} /></div>
    </Card>
  );

const SourceNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] text-brand-text-secondary mt-2 border-t border-efg-line pt-2">🔌 Wiring: {children}</p>
);

const BalanceAnalyticsPage: React.FC = () => {
  const [gaap, setGaap] = useState<'swiss' | 'ifrs'>('swiss');
  const tooltipStyle = { fontSize: 12 };
  return (
    <div className="p-5 md:p-8 space-y-6">
      <BackButton />
      <div className="flex flex-wrap items-center gap-3">
        <PageHeader
          title="Balance sheet analytics"
          subtitle="The consolidated balance sheet as a BI reading: trends across certified periods, and the structure by currency, booking center and counterparty residence."
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full bg-status-amber/15 text-status-amber border border-status-amber/40">
          Preview — sample data
        </span>
        <span className="text-[12px] text-brand-text-secondary">
          Mockup for validation: every figure is invented. Say what to keep / change and it gets wired to MERCURY.
        </span>
        <span className="ml-auto inline-flex rounded-md border border-gray-300 overflow-hidden text-[11px] font-semibold">
          {(['swiss', 'ifrs'] as const).map(g => (
            <button key={g} onClick={() => setGaap(g)}
              className={`px-2.5 py-1 transition-colors ${gaap === g ? 'bg-brand-primary text-white' : 'bg-white text-brand-text-secondary hover:text-brand-primary'}`}>
              {g === 'swiss' ? 'SWISS GAAP' : 'IFRS (HFM)'}
            </button>
          ))}
        </span>
      </div>

      {/* KPI row */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Tile label="Total assets" value="233.8 mCHF" sub="+0.3% vs DEC-25 (certified)"
          trend={TREND.map(t => t.assets)} accent />
        <Tile label="Total liabilities & equity" value="62.5 mCHF" sub="stable vs DEC-25"
          trend={TREND.map(t => t.liabilities)} />
        <Tile label="Intercompany eliminated" value="1.6 mCHF" sub="MOCK-GROUP scope · 2 booking centers"
          trend={[1.1, 1.3, 1.2, 1.5, 1.4, 1.6]} />
        <Tile label="Adjustments this period" value="+0.74 mCHF" sub="3 lines · 2 matched · 1 new position"
          trend={[0.2, -0.4, 0.5, 0.1, -0.2, 0.74]} />
      </div>

      {/* Trend */}
      <Card>
        <SectionHeader title="Balance sheet trend" suffix="six periods — ✔ = certified baseline; JAN-26 open" />
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={TREND} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="baFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE.slate} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={PALETTE.slate} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
              <XAxis dataKey="p" tickFormatter={(p: string, i: number) => `${p}${TREND[i]?.certified ? ' ✔' : ''}`} />
              <YAxis width={56} domain={['auto', 'auto']} tickFormatter={fmtB} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v.toFixed(1)} mCHF`, n]} />
              <Legend />
              <Area dataKey="assets" name="Assets" stroke="none" fill="url(#baFill)" tooltipType="none" legendType="none" />
              <Line dataKey="assets" name="Assets" stroke={PALETTE.slate} strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="liabilities" name="Liabilities & equity" stroke={PALETTE.red} strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <SourceNote>/mercury/balance executed for each certified baseline's loads (the baselines give the period axis); {gaap === 'ifrs' ? 'IFRS totals via the HFM mapping' : 'Swiss GAAP totals by rubrique'}.</SourceNote>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* By currency */}
        <Card>
          <SectionHeader title="Assets by currency" suffix="stacked, six periods" />
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={BY_CCY} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                <XAxis dataKey="p" />
                <YAxis width={56} tickFormatter={fmtB} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v.toFixed(1)} mCHF`, n]} />
                <Legend />
                {(['CHF', 'EUR', 'USD', 'GBP', 'Other'] as const).map((k, i) => (
                  <Bar key={k} dataKey={k} stackId="ccy" fill={CHART_COLORS[i % CHART_COLORS.length]}
                    radius={i === 4 ? [3, 3, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <SourceNote>already available — the balance endpoint returns the currency dimension since v3.12.</SourceNote>
        </Card>

        {/* By booking center */}
        <Card>
          <SectionHeader title="By booking center" suffix="latest period vs previous" />
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={BY_BC} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} horizontal={false} />
                <XAxis type="number" tickFormatter={fmtB} />
                <YAxis type="category" dataKey="bc" width={150} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${v.toFixed(1)} mCHF`, n]} />
                <Legend />
                <Bar dataKey="prev" name="DEC-25" fill={PALETTE.mist} radius={[0, 3, 3, 0]} />
                <Bar dataKey="amount" name="JAN-26" fill={PALETTE.slate} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <SourceNote>already available — booking-center dimension of the balance endpoint, names from list_booking_centers.</SourceNote>
        </Card>

        {/* By residence */}
        <Card>
          <SectionHeader title="By counterparty residence" suffix="exposure country of risk — latest period" />
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={BY_RES} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                <XAxis dataKey="c" />
                <YAxis width={56} tickFormatter={fmtB} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)} mCHF`, 'Assets']} />
                <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                  {BY_RES.map((e, i) => <Cell key={e.c} fill={e.c === 'CH' ? PALETTE.red : CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <SourceNote>needs a core_positions × list_counterparties (DomicileCountry) join — a small TVF/query extension on MERCURY; to validate with IT.</SourceNote>
        </Card>

        {/* Top movements */}
        <Card>
          <SectionHeader title="Top movements vs previous period" suffix="rubriques sorted by |Δ| — adjustments isolated" />
          <div className="overflow-x-auto border border-efg-line rounded-lg">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-brand-bg-body"><tr>
                {['Acct', 'Label', 'DEC-25', 'JAN-26', 'Δ', 'of which adj'].map((h, hi) =>
                  <th key={h} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold ${hi >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>)}
              </tr></thead>
              <tbody>
                {TOP_MOVES.map(m => {
                  const d = m.now - m.prev;
                  return (
                    <tr key={m.acct} className="border-t border-efg-line/60">
                      <td className="px-3 py-1.5 font-semibold">{m.acct}</td>
                      <td className="px-3 py-1.5 text-brand-text-secondary">{m.label}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{m.prev.toFixed(1)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{m.now.toFixed(1)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${d > 0 ? 'text-status-green' : d < 0 ? 'text-status-red' : ''}`}>
                        {d > 0 ? '+' : ''}{d.toFixed(1)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-brand-text-secondary">{m.adj ? `${m.adj > 0 ? '+' : ''}${m.adj.toFixed(1)}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <SourceNote>period-over-period diff of the per-rubrique balance; the adjustment column comes from the positions flagged DataSource = 'ADJUSTMENT'.</SourceNote>
        </Card>
      </div>

      <p className="text-[11px] text-brand-text-secondary">
        All amounts mCHF, sample data. Planned filters (not mocked): reporting entity / scope, GAAP (toggle above), period range —
        and a click on any bar drills into the Reco workspace filtered on that dimension.
      </p>
    </div>
  );
};

export default BalanceAnalyticsPage;
