import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useData } from '../context/DataContext';
import { BackButton, Card, EmptyState, PageHeader, SectionHeader, Sparkline } from '../components';
import { CHART_COLORS, PALETTE } from '../theme';
import { hfmKeyOf } from '../services/hfm';
import { lanLabelsFrom, prefixLabelOf } from '../services/legalAccountLabels';
import { GeoFootprint, type GeoDetailRow } from '../components/GeoFootprint';

/**
 * Balance sheet analytics — wired to MERCURY.
 *
 * The period axis comes from the entity's load collections (one point per
 * reporting date, ✔ when a certified baseline exists); each period's figures
 * are the /mercury/balance aggregate of its loads, with the consolidation
 * scope (list_reporting_sets) and intra-scope interco elimination applied
 * client-side — identical to the Reco panel. Residence comes from the
 * dedicated /mercury/balance-residence join.
 */

type BalanceRow = {
  account?: string; prefix: string; bookingCenterId: string;
  counterpartyBookingCenterId: string; currency?: string; dataSource?: string;
  amount: number; positions?: number;
};
type ResidenceRow = {
  country: string; side: string; bookingCenterId: string;
  counterpartyBookingCenterId: string; amount: number;
  /** 3-digit rubrique — present once the API ships the prefix column. */
  prefix?: string;
};
type CollectionInfo = {
  loadCollectionId: number | string; name?: string | null; reportingDate?: string | null;
  reportingEntityId?: string | null; isMaster?: boolean; loadIds: Array<number | string>;
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const periodLabel = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]}-${m[1].slice(2)}` : iso;
};
const fmtM = (n: number) => (n / 1_000_000).toLocaleString('en-CH', { maximumFractionDigits: 1 });

const SourceNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] text-brand-text-secondary mt-2 border-t border-efg-line pt-2">{children}</p>
);

const Tile: React.FC<{ label: string; value: string; sub: string; trend: (number | null)[]; accent?: boolean }> =
  ({ label, value, sub, trend, accent }) => (
    <Card className="!p-4">
      <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-brand-text-secondary">{label}</p>
      <p className={`text-2xl font-bold mt-1 tabular-nums ${accent ? 'text-brand-primary' : ''}`}>{value}</p>
      <p className="text-[11px] text-brand-text-secondary">{sub}</p>
      <div className="mt-2 text-brand-text-secondary"><Sparkline points={trend} height={26} /></div>
    </Card>
  );

const BalanceAnalyticsPage: React.FC = () => {
  const { data, mode, apiBaseUrl } = useData();
  const [gaap, setGaap] = useState<'swiss' | 'ifrs'>('swiss');
  const [conso, setConso] = useState<{
    entities: Array<{ id: string; name?: string }>;
    sets: Record<string, string[]>;
    bcNames: Record<string, string>;
    bcCountries: Record<string, string>;
  } | null>(null);
  const [geoMode, setGeoMode] = useState<'residence' | 'bc'>('residence');
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [entitySel, setEntitySel] = useState('');
  const [balances, setBalances] = useState<Record<string, BalanceRow[]>>({});
  const [residence, setResidence] = useState<ResidenceRow[] | null>(null);
  const [residencePrev, setResidencePrev] = useState<ResidenceRow[] | null>(null);
  const fetched = useRef(new Set<string>());

  useEffect(() => {
    if (mode !== 'api') return;
    fetch(`${apiBaseUrl}/production/mercury/conso`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(out => {
        if (!out) return;
        const sets: Record<string, string[]> = {};
        for (const st of out.sets || []) (sets[String(st.reportingEntityId)] ??= []).push(String(st.bookingCenterId));
        const bcNames: Record<string, string> = {};
        const bcCountries: Record<string, string> = {};
        for (const b of out.bookingCenters || []) {
          bcNames[String(b.id)] = String(b.name ?? '');
          bcCountries[String(b.id)] = String(b.officeCountry ?? '').toUpperCase();
        }
        setConso({
          entities: (out.entities || []).map((e: { id: unknown; name?: unknown }) => ({
            id: String(e.id), name: e.name ? String(e.name) : undefined,
          })),
          sets, bcNames, bcCountries,
        });
      })
      .catch(() => { /* unavailable */ });
    fetch(`${apiBaseUrl}/production/mercury/load-collections`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setCollections(Array.isArray(l)
        ? l.map((c: CollectionInfo) => ({ ...c, loadIds: Array.isArray(c.loadIds) ? c.loadIds : [] }))
        : []))
      .catch(() => setCollections([]));
  }, [mode, apiBaseUrl]);

  // Entities that actually carry collections, most useful default first.
  const entities = useMemo(() => {
    const withCols = Array.from(new Set(collections.map(c => String(c.reportingEntityId ?? '')).filter(Boolean)));
    return withCols.length > 0 ? withCols.sort() : (conso?.entities || []).map(e => e.id);
  }, [collections, conso]);
  const entity = entities.includes(entitySel) ? entitySel : entities[0] || '';
  const entityName = conso?.entities.find(e => e.id === entity)?.name;

  const baselines = useMemo(() =>
    (data.prodBaselines || []).filter(b => b.entity === entity), [data.prodBaselines, entity]);

  // One period per reporting date (master collections win), last 8, oldest first.
  const periods = useMemo(() => {
    const byDate = new Map<string, CollectionInfo>();
    for (const c of collections) {
      if (String(c.reportingEntityId ?? '') !== entity) continue;
      const d = c.reportingDate ? String(c.reportingDate).slice(0, 10) : '';
      if (!d || (c.loadIds || []).length === 0) continue;
      const cur = byDate.get(d);
      if (!cur || (c.isMaster && !cur.isMaster)) byDate.set(d, c);
    }
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8)
      .map(([date, c]) => ({
        date, label: periodLabel(date),
        loadIds: (c.loadIds || []).map(String),
        collectionId: String(c.loadCollectionId),
        certified: baselines.some(b => b.date === date),
      }));
  }, [collections, entity, baselines]);

  // Fetch each period's balance once (sequentially — a handful of aggregates).
  useEffect(() => {
    if (mode !== 'api' || periods.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const p of periods) {
        const key = `${entity}|${p.date}`;
        if (fetched.current.has(key)) continue;
        fetched.current.add(key);
        const qs = p.loadIds.length > 1 ? `loadIds=${encodeURIComponent(p.loadIds.join(','))}` : `loadId=${encodeURIComponent(p.loadIds[0])}`;
        try {
          const r = await fetch(`${apiBaseUrl}/production/mercury/balance?${qs}`, { credentials: 'include' });
          if (!r.ok) continue;
          const arr = await r.json() as BalanceRow[];
          if (cancelled) return;
          setBalances(prev => ({ ...prev, [key]: arr.filter(b => b.prefix) }));
        } catch { /* skip period */ }
      }
      // Residence for the two latest periods (map figures + Δ vs previous).
      const fetchRes = async (p: typeof periods[number] | undefined, set: (r: ResidenceRow[]) => void) => {
        if (!p) return;
        const qs = p.loadIds.length > 1 ? `loadIds=${encodeURIComponent(p.loadIds.join(','))}` : `loadId=${encodeURIComponent(p.loadIds[0])}`;
        try {
          const r = await fetch(`${apiBaseUrl}/production/mercury/balance-residence?${qs}`, { credentials: 'include' });
          if (r.ok) {
            const arr = await r.json() as ResidenceRow[];
            if (!cancelled) set(arr);
          }
        } catch { /* block hidden */ }
      };
      await fetchRes(periods[periods.length - 1], setResidence);
      await fetchRes(periods.length > 1 ? periods[periods.length - 2] : undefined, setResidencePrev);
    })();
    return () => { cancelled = true; };
  }, [mode, apiBaseUrl, periods, entity]);

  const scopeSet = useMemo(() => {
    const bcs = conso?.sets[entity];
    return bcs && bcs.length > 0 ? new Set(bcs.map(x => x.trim())) : null;
  }, [conso, entity]);

  // HFM maps (IFRS view) + Swiss labels from the stored mapping workbook.
  const maps = useMemo(() => {
    const hfmDirect = new Map<string, string>(), hfmLbl = new Map<string, string>(), hfmRules = new Map<string, string>();
    const swissLbl = new Map<string, string>();
    for (const e of data.prodMappingEntries || []) {
      if (!e.textValue) continue;
      if (e.kind === 'hfm') hfmDirect.set(e.mapKey, e.textValue);
      else if (e.kind === 'hfmlabel') hfmLbl.set(e.mapKey, e.textValue);
      else if (e.kind === 'hfmrule') hfmRules.set(e.mapKey, e.textValue);
      else if (e.kind === 'label') swissLbl.set(e.mapKey, e.textValue);
    }
    for (const e of data.prodMappingEntries || []) {
      if (e.kind !== 'gl' || !e.textValue || !e.description) continue;
      const pfx = e.textValue.slice(0, 3);
      if (pfx && !swissLbl.has(pfx)) swissLbl.set(pfx, e.description);
    }
    // Official nomenclatures stored in the database win.
    for (const e of data.prodMappingEntries || [])
      if (e.kind === 'hfmname' && e.textValue) hfmLbl.set(e.mapKey, e.textValue);
    const lan = lanLabelsFrom(data.prodMappingEntries);
    return { hfmDirect, hfmLbl, hfmRules, swissLbl, lan };
  }, [data.prodMappingEntries]);

  // Scope-filtered net rows of one period.
  const netRows = (rows: BalanceRow[] | undefined): Array<BalanceRow & { net: number }> => {
    if (!rows) return [];
    const out: Array<BalanceRow & { net: number }> = [];
    for (const b of rows) {
      if (scopeSet && b.bookingCenterId && !scopeSet.has(b.bookingCenterId)) continue;
      const elim = scopeSet && b.counterpartyBookingCenterId && scopeSet.has(b.counterpartyBookingCenterId) ? b.amount : 0;
      out.push({ ...b, net: b.amount - elim });
    }
    return out;
  };
  const rowsOf = (date: string) => netRows(balances[`${entity}|${date}`]);
  const loaded = (date: string) => balances[`${entity}|${date}`] !== undefined;

  const trend = useMemo(() => periods.map(p => {
    const rows = rowsOf(p.date);
    const assets = rows.filter(r => r.prefix.startsWith('1')).reduce((s, r) => s + r.net, 0);
    const liabilities = rows.filter(r => r.prefix.startsWith('2')).reduce((s, r) => s + r.net, 0);
    return { p: p.label, date: p.date, certified: p.certified, assets, liabilities, ok: loaded(p.date) };
  }), [periods, balances, scopeSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const latest = trend.length > 0 ? trend[trend.length - 1] : null;
  const prev = trend.length > 1 ? trend[trend.length - 2] : null;
  const latestRows = latest ? rowsOf(latest.date) : [];
  const prevRows = prev ? rowsOf(prev.date) : [];

  // Assets by currency: top 4 currencies of the latest period, rest = Other.
  const ccy = useMemo(() => {
    const latestBy: Record<string, number> = {};
    for (const r of latestRows) if (r.prefix.startsWith('1')) latestBy[r.currency || '?'] = (latestBy[r.currency || '?'] || 0) + r.net;
    const top = Object.entries(latestBy).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 4).map(([k]) => k);
    const series = periods.map(p => {
      const row: Record<string, number | string> = { p: p.label };
      for (const r of rowsOf(p.date)) {
        if (!r.prefix.startsWith('1')) continue;
        const k = top.includes(r.currency || '?') ? (r.currency || '?') : 'Other';
        row[k] = (Number(row[k]) || 0) + r.net;
      }
      return row;
    });
    return { top: [...top, 'Other'], series };
  }, [periods, balances, scopeSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const byBc = useMemo(() => {
    const agg = (rows: Array<BalanceRow & { net: number }>) => {
      const by: Record<string, number> = {};
      for (const r of rows) if (r.prefix.startsWith('1')) by[r.bookingCenterId || '—'] = (by[r.bookingCenterId || '—'] || 0) + r.net;
      return by;
    };
    const nowBy = agg(latestRows), prevBy = agg(prevRows);
    return Object.keys({ ...nowBy, ...prevBy })
      .sort((a, b) => (nowBy[b] || 0) - (nowBy[a] || 0))
      .map(k => ({
        bc: conso?.bcNames[k] ? `${k} — ${conso.bcNames[k]}` : k,
        amount: nowBy[k] || 0, prev: prevBy[k] || 0,
      }));
  }, [latestRows, prevRows, conso]);

  // Full ISO2 → assets maps for the world map (no Other bucketing).
  const geoResOf = (rows: ResidenceRow[] | null): Map<string, number> => {
    const by = new Map<string, number>();
    if (!rows) return by;
    for (const r of rows) {
      if (r.side !== '1') continue;
      if (scopeSet && r.bookingCenterId && !scopeSet.has(r.bookingCenterId)) continue;
      const elim = scopeSet && r.counterpartyBookingCenterId && scopeSet.has(r.counterpartyBookingCenterId) ? r.amount : 0;
      const k = (r.country || '').toUpperCase();
      by.set(k, (by.get(k) || 0) + r.amount - elim);
    }
    return by;
  };
  const geoResidence = useMemo(() => geoResOf(residence), [residence, scopeSet]); // eslint-disable-line react-hooks/exhaustive-deps
  const geoResidencePrev = useMemo(() => geoResOf(residencePrev), [residencePrev, scopeSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const geoBcOf = (rows: Array<BalanceRow & { net: number }>): Map<string, number> => {
    const by = new Map<string, number>();
    for (const r of rows) {
      if (!r.prefix.startsWith('1')) continue;
      const country = (conso?.bcCountries[r.bookingCenterId] || '').toUpperCase();
      by.set(country, (by.get(country) || 0) + r.net);
    }
    return by;
  };
  const geoBooking = useMemo(() => geoBcOf(latestRows), [latestRows, conso]); // eslint-disable-line react-hooks/exhaustive-deps
  const geoBookingPrev = useMemo(() => geoBcOf(prevRows), [prevRows, conso]); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-country rubrique breakdown for the map's pinned detail panel.
  const rubriqueLabel = (k: string) => prefixLabelOf(k, maps.lan) ?? maps.swissLbl.get(k) ?? '';
  const geoDetailOf = (a2: string): GeoDetailRow[] => {
    if (geoMode === 'residence') {
      const agg = (rows: ResidenceRow[] | null) => {
        const by = new Map<string, number>();
        for (const r of rows || []) {
          if (!(r.prefix || '').startsWith('1')) continue;
          if ((r.country || '').toUpperCase() !== a2) continue;
          if (scopeSet && r.bookingCenterId && !scopeSet.has(r.bookingCenterId)) continue;
          const elim = scopeSet && r.counterpartyBookingCenterId && scopeSet.has(r.counterpartyBookingCenterId) ? r.amount : 0;
          by.set(r.prefix!, (by.get(r.prefix!) || 0) + r.amount - elim);
        }
        return by;
      };
      const now = agg(residence), before = agg(residencePrev);
      return Array.from(now.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6)
        .map(([k, v]) => ({ k, label: rubriqueLabel(k), now: v, prev: residencePrev ? (before.get(k) || 0) : undefined }));
    }
    const agg = (rows: Array<BalanceRow & { net: number }>) => {
      const by = new Map<string, number>();
      for (const r of rows) {
        if (!r.prefix.startsWith('1')) continue;
        if ((conso?.bcCountries[r.bookingCenterId] || '').toUpperCase() !== a2) continue;
        by.set(r.prefix, (by.get(r.prefix) || 0) + r.net);
      }
      return by;
    };
    const now = agg(latestRows), before = agg(prevRows);
    return Array.from(now.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6)
      .map(([k, v]) => ({ k, label: rubriqueLabel(k), now: v, prev: prev ? (before.get(k) || 0) : undefined }));
  };

  const byRes = useMemo(() => {
    if (!residence) return null;
    const by: Record<string, number> = {};
    for (const r of residence) {
      if (r.side !== '1') continue; // assets side
      if (scopeSet && r.bookingCenterId && !scopeSet.has(r.bookingCenterId)) continue;
      const elim = scopeSet && r.counterpartyBookingCenterId && scopeSet.has(r.counterpartyBookingCenterId) ? r.amount : 0;
      const k = r.country || '—';
      by[k] = (by[k] || 0) + r.amount - elim;
    }
    const sorted = Object.entries(by).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const top = sorted.slice(0, 5);
    const other = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    return [...top.map(([c, amount]) => ({ c, amount })), ...(other !== 0 ? [{ c: 'Other', amount: other }] : [])];
  }, [residence, scopeSet]);

  // Top movements latest vs previous, grouped per the selected GAAP.
  const topMoves = useMemo(() => {
    if (!latest || !prev) return [];
    const keyOf = (r: BalanceRow): string | null => {
      const account = r.account || r.prefix;
      if (gaap === 'ifrs') {
        if (!/^[12]/.test(account)) return null;
        return hfmKeyOf(account, maps.hfmDirect, maps.hfmRules);
      }
      return r.prefix;
    };
    const agg = (rows: Array<BalanceRow & { net: number }>, adjOnly = false) => {
      const by: Record<string, number> = {};
      for (const r of rows) {
        if (adjOnly && (r.dataSource || '').toUpperCase() !== 'ADJUSTMENT') continue;
        const k = keyOf(r);
        if (k === null) continue;
        by[k] = (by[k] || 0) + r.net;
      }
      return by;
    };
    const nowBy = agg(latestRows), prevBy = agg(prevRows), adjBy = agg(latestRows, true);
    return Object.keys({ ...nowBy, ...prevBy })
      .map(k => ({
        k, label: (gaap === 'ifrs' ? maps.hfmLbl.get(k) : (prefixLabelOf(k, maps.lan) ?? maps.swissLbl.get(k))) || '',
        prev: prevBy[k] || 0, now: nowBy[k] || 0, adj: adjBy[k] || 0,
      }))
      .sort((a, b) => Math.abs(b.now - b.prev) - Math.abs(a.now - a.prev))
      .slice(0, 8);
  }, [latest, prev, latestRows, prevRows, gaap, maps]);

  const adjTile = useMemo(() => {
    const adj = latestRows.filter(r => (r.dataSource || '').toUpperCase() === 'ADJUSTMENT');
    const sum = adj.reduce((s, r) => s + r.net, 0);
    const n = adj.reduce((s, r) => s + (r.positions || 0), 0);
    return { sum, n };
  }, [latestRows]);
  const elimTile = useMemo(() =>
    latestRows.reduce((s, r) => s + (r.amount - r.net), 0), [latestRows]);
  const trendOf = (get: (t: typeof trend[number]) => number) => trend.map(t => (t.ok ? get(t) : null));

  const tooltipStyle = { fontSize: 12 };

  if (mode !== 'api') {
    return (
      <div className="p-5 md:p-8 space-y-6">
        <BackButton />
        <PageHeader title="Balance sheet analytics" subtitle="Requires the API backend and the MERCURY connection." />
        <Card><EmptyState title="Not available in local mode" hint="Connect the app to the .NET backend (ConnectionStrings:Mercury) to aggregate the load collections into these views." /></Card>
      </div>
    );
  }

  return (
    <div className="p-5 md:p-8 space-y-6">
      <BackButton />
      <PageHeader
        title="Balance sheet analytics"
        subtitle="The consolidated balance sheet as a BI reading — one point per load collection, certified baselines marked, scope and intra-scope interco applied like everywhere else."
      />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Reporting entity (scope)</label>
          <select value={entity} onChange={e => setEntitySel(e.target.value)}
            className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
            {entities.map(e => <option key={e} value={e}>{conso?.entities.find(x => x.id === e)?.name ? `${e} — ${conso.entities.find(x => x.id === e)!.name}` : e}</option>)}
          </select>
        </div>
        {scopeSet && <p className="text-[11px] text-brand-text-secondary pb-2.5">{scopeSet.size} booking center(s) · intra-scope interco eliminated</p>}
        <span className="ml-auto inline-flex rounded-md border border-gray-300 overflow-hidden text-[11px] font-semibold">
          {(['swiss', 'ifrs'] as const).map(g => (
            <button key={g} onClick={() => setGaap(g)}
              className={`px-2.5 py-1 transition-colors ${gaap === g ? 'bg-brand-primary text-white' : 'bg-white text-brand-text-secondary hover:text-brand-primary'}`}>
              {g === 'swiss' ? 'SWISS GAAP' : 'IFRS (HFM)'}
            </button>
          ))}
        </span>
      </div>

      {periods.length === 0 ? (
        <Card><EmptyState title="No load collection found"
          hint={`No visible collection carries reporting entity ${entity || '—'} — the period axis comes from core_load_collections. Check the MERCURY connection (☰ → Logs).`} /></Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Tile label="Total assets" value={latest && latest.ok ? `${fmtM(latest.assets)} mCHF` : '…'}
              sub={prev && latest && prev.ok && prev.assets !== 0 ? `${(((latest.assets - prev.assets) / Math.abs(prev.assets)) * 100).toFixed(1)}% vs ${prev.p}${prev.certified ? ' ✔' : ''}` : `${latest?.p ?? ''}`}
              trend={trendOf(t => t.assets)} accent />
            <Tile label="Total liabilities & equity" value={latest && latest.ok ? `${fmtM(latest.liabilities)} mCHF` : '…'}
              sub={prev && prev.ok ? `vs ${fmtM(prev.liabilities)} in ${prev.p}` : ''}
              trend={trendOf(t => t.liabilities)} />
            <Tile label="Intercompany eliminated" value={`${fmtM(elimTile)} mCHF`}
              sub={scopeSet ? `${entity} scope · ${scopeSet.size} booking centers` : 'no reporting set — nothing eliminated'}
              trend={trend.map(t => (t.ok ? rowsOf(t.date).reduce((s, r) => s + (r.amount - r.net), 0) : null))} />
            <Tile label="Adjustments in the period" value={`${adjTile.sum >= 0 ? '+' : ''}${fmtM(adjTile.sum)} mCHF`}
              sub={adjTile.n > 0 ? `${adjTile.n} position(s) flagged ADJUSTMENT` : 'none loaded in MERCURY yet'}
              trend={trend.map(t => (t.ok ? rowsOf(t.date).filter(r => (r.dataSource || '').toUpperCase() === 'ADJUSTMENT').reduce((s, r) => s + r.net, 0) : null))} />
          </div>

          <Card>
            <SectionHeader title="Balance sheet trend" suffix={`${periods.length} period(s) — ✔ = certified baseline · ${entityName || entity}`} />
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={trend.filter(t => t.ok)} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="baFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE.slate} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={PALETTE.slate} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                  <XAxis dataKey="p" tickFormatter={(_, i) => {
                    const t = trend.filter(x => x.ok)[i];
                    return t ? `${t.p}${t.certified ? ' ✔' : ''}` : '';
                  }} />
                  <YAxis width={64} domain={['auto', 'auto']} tickFormatter={(v: number) => fmtM(v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${fmtM(v)} mCHF`, n]} />
                  <Legend />
                  <Area dataKey="assets" name="Assets" stroke="none" fill="url(#baFill)" tooltipType="none" legendType="none" />
                  <Line dataKey="assets" name="Assets" stroke={PALETTE.slate} strokeWidth={2} dot={{ r: 3 }} />
                  <Line dataKey="liabilities" name="Liabilities & equity" stroke={PALETTE.red} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <SourceNote>SUM(BookAmount) of each collection's loads, net of intra-scope interco. With one or two collections in MERCURY_MOCK the trend is short — it grows with every monthly load{baselines.length === 0 ? '; certify periods (Production → Certify) to mark the ✔ baselines' : ''}.</SourceNote>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <SectionHeader title="🌍 Geographic footprint" suffix={`assets · ${latest?.p || ''} — zoom, hover, click a country to pin its detail`} />
              <span className="ml-auto inline-flex rounded-md border border-gray-300 overflow-hidden text-[11px] font-semibold">
                {([['residence', 'Counterparty residence'], ['bc', 'Booking center']] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setGeoMode(k)}
                    className={`px-2.5 py-1 transition-colors ${geoMode === k ? 'bg-brand-primary text-white' : 'bg-white text-brand-text-secondary hover:text-brand-primary'}`}>
                    {lbl}
                  </button>
                ))}
              </span>
            </div>
            <GeoFootprint data={geoMode === 'residence' ? geoResidence : geoBooking}
              prevData={geoMode === 'residence'
                ? (residencePrev ? geoResidencePrev : undefined)
                : (prev ? geoBookingPrev : undefined)}
              detailOf={geoDetailOf}
              fmt={(n: number) => fmtM(n)} unit="mCHF"
              periodLabel={latest?.p} prevPeriodLabel={prev?.p} />
            <SourceNote>
              {geoMode === 'residence'
                ? "DomicileCountry of list_counterparties at the position's PIT (assets side, scope applied); positions without counterparty appear as Unassigned."
                : 'OfficeCountry of list_booking_centers per position booking center (assets side, scope applied).'}
              {' '}Bundled world-atlas boundaries — nothing is fetched from the internet.
            </SourceNote>
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <SectionHeader title="Assets by currency" suffix="position currency, stacked" />
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={ccy.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                    <XAxis dataKey="p" />
                    <YAxis width={64} tickFormatter={(v: number) => fmtM(v)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${fmtM(v)} mCHF`, n]} />
                    <Legend />
                    {ccy.top.map((k, i) => (
                      <Bar key={k} dataKey={k} stackId="ccy" fill={CHART_COLORS[i % CHART_COLORS.length]}
                        radius={i === ccy.top.length - 1 ? [3, 3, 0, 0] : undefined} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <SourceNote>Top {Math.max(ccy.top.length - 1, 0)} currencies of the latest period; the rest is bucketed as Other.</SourceNote>
            </Card>

            <Card>
              <SectionHeader title="By booking center" suffix={prev ? `${latest?.p} vs ${prev.p}` : latest?.p || ''} />
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={byBc} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} horizontal={false} />
                    <XAxis type="number" tickFormatter={(v: number) => fmtM(v)} />
                    <YAxis type="category" dataKey="bc" width={170} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [`${fmtM(v)} mCHF`, n]} />
                    <Legend />
                    {prev && <Bar dataKey="prev" name={prev.p} fill={PALETTE.mist} radius={[0, 3, 3, 0]} />}
                    <Bar dataKey="amount" name={latest?.p || 'latest'} fill={PALETTE.slate} radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <SourceNote>Assets (1xx) per BookingCenterId, names from list_booking_centers; positions outside the reporting set are excluded.</SourceNote>
            </Card>

            <Card>
              <SectionHeader title="By counterparty residence" suffix={`assets · ${latest?.p || ''}`} />
              {!byRes ? (
                <EmptyState title="Residence unavailable" hint="The balance-residence query did not answer — check the MERCURY connection." compact />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={byRes} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.line} vertical={false} />
                      <XAxis dataKey="c" />
                      <YAxis width={64} tickFormatter={(v: number) => fmtM(v)} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${fmtM(v)} mCHF`, 'Assets']} />
                      <Bar dataKey="amount" radius={[3, 3, 0, 0]}>
                        {byRes.map((e, i) => <Cell key={e.c} fill={e.c === 'CH' ? PALETTE.red : CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <SourceNote>DomicileCountry of list_counterparties at the position's PIT (— = position without counterparty, e.g. pure security lines).</SourceNote>
            </Card>

            <Card>
              <SectionHeader title="Top movements vs previous period" suffix={`${gaap === 'ifrs' ? 'HFM lines' : 'rubriques'} sorted by |Δ| — adjustments isolated`} />
              {topMoves.length === 0 ? (
                <EmptyState title="Needs two periods" hint="Load (and keep) at least two collections to compare period over period." compact />
              ) : (
                <div className="overflow-x-auto border border-efg-line rounded-lg">
                  <table className="w-full text-xs whitespace-nowrap">
                    <thead className="bg-brand-bg-body"><tr>
                      {[gaap === 'ifrs' ? 'HFM' : 'Acct', 'Label', prev?.p || 'prev', latest?.p || 'now', 'Δ', 'of which adj'].map((h, hi) =>
                        <th key={h} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold ${hi >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {topMoves.map(m => {
                        const d = m.now - m.prev;
                        return (
                          <tr key={m.k} className="border-t border-efg-line/60">
                            <td className="px-3 py-1.5 font-semibold">{m.k}</td>
                            <td className="px-3 py-1.5 text-brand-text-secondary max-w-[220px] truncate">{m.label || '—'}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{fmtM(m.prev)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtM(m.now)}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${d > 0 ? 'text-status-green' : d < 0 ? 'text-status-red' : ''}`}>
                              {d > 0 ? '+' : ''}{fmtM(d)}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-brand-text-secondary">{m.adj !== 0 ? `${m.adj > 0 ? '+' : ''}${fmtM(m.adj)}` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <SourceNote>Per-{gaap === 'ifrs' ? 'HFM-line' : 'rubrique'} diff of the two latest periods; the adjustment column sums the positions flagged DataSource = ADJUSTMENT.</SourceNote>
            </Card>
          </div>

          <p className="text-[11px] text-brand-text-secondary">
            All amounts mCHF as booked (BookAmount). Certify periods in the Production line to mark the ✔ baselines on the trend.
          </p>
        </>
      )}
    </div>
  );
};

export default BalanceAnalyticsPage;
