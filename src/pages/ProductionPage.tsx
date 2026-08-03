import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { BackButton, Card, PageHeader, SectionHeader, TabButton } from '../components';
import {
  ControlFinding, PROD_DATASETS, runCounterpartyDrift, runCrossDataset,
  runOrphans, runSecurityDrift, runSecurityVsRef,
} from '../services/productionControls';
import type { AdjustmentLine, AdjustmentMappings, MatchCandidate } from '../services/adjustments';

/**
 * Production (team-only): consistency controls on the production data,
 * period over period. Prerequisites = the CSV-fed datasets (counterparty
 * records, securities vs security master, Grouplexid guarantee/HQLA
 * reference); Controls = the check results between two periods.
 */

const SEV_STYLE: Record<ControlFinding['severity'], string> = {
  error: 'bg-status-red/10 text-status-red border-status-red/30',
  warning: 'bg-status-amber/10 text-status-amber border-status-amber/30',
  info: 'bg-brand-bg-body text-brand-text-secondary border-efg-line',
};

/** Trigger the MERCURY-side feed (TVF) for a loadid + product type. */
const MercuryCard: React.FC<{ entity: string; onLoaded: (msg: string) => void; onError: (msg: string) => void }> =
  ({ entity, onLoaded, onError }) => {
    const { mode, apiBaseUrl, reload } = useData();
    const [target, setTarget] = useState<'counterparties' | 'securities'>('counterparties');
    const [loadId, setLoadId] = useState('');
    const [loads, setLoads] = useState<Array<{ loadId: number | string; reportingDate: string; name?: string | null }>>([]);
    const [productType, setProductType] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
      if (mode !== 'api') return;
      fetch(`${apiBaseUrl}/production/mercury/loads`, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : []))
        .then(l => setLoads(Array.isArray(l) ? l : []))
        .catch(() => setLoads([]));
    }, [mode, apiBaseUrl]);

    if (mode !== 'api') {
      return (
        <Card>
          <SectionHeader title="0 — Feed from MERCURY" suffix="requires the API backend" />
          <p className="text-sm text-brand-text-secondary">
            Connect the app to the .NET backend to trigger the MERCURY TVF feed (loadid + product type) —
            see docs/MERCURY_INTEGRATION.md.
          </p>
        </Card>
      );
    }

    const run = async () => {
      if (!loadId) { onError('MERCURY feed: loadid is required.'); return; }
      setBusy(true);
      try {
        const res = await fetch(`${apiBaseUrl}/production/mercury/load`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ target, entity, date: '', loadId, productType: productType || null }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`);
        }
        const out = await res.json() as { inserted: number; skipped: number; tvf: string; date: string };
        await reload();
        onLoaded(`MERCURY feed OK: ${out.inserted} row(s) loaded into ${target} for ${entity} — ${out.date} (loadid ${loadId}${productType ? `, ${productType}` : ''}) via ${out.tvf}${out.skipped ? ` · ${out.skipped} row(s) without key skipped` : ''}.`);
      } catch (err) {
        onError(`MERCURY feed failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally { setBusy(false); }
    };

    const input = 'p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary';
    return (
      <Card>
        <SectionHeader title="0 — Feed from MERCURY" suffix="trigger the TVF by loadid + product type — replaces the scope, then run the controls" />
        {loads.length > 0 && (
          <div className="overflow-x-auto border border-efg-line rounded-lg mb-3 max-h-48 overflow-y-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-brand-bg-body sticky top-0"><tr>
                <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Loadid (core_loads)</th>
                <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Reporting date</th>
                <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Name</th>
              </tr></thead>
              <tbody>
                {loads.map(l => (
                  <tr key={String(l.loadId)} onClick={() => setLoadId(String(l.loadId))}
                    className={`border-t border-efg-line cursor-pointer hover:bg-brand-bg-body/60 ${String(l.loadId) === loadId ? 'bg-brand-secondary/10 font-semibold' : ''}`}>
                    <td className="px-3 py-1">{String(l.loadId) === loadId ? '● ' : ''}{String(l.loadId)}</td>
                    <td className="px-3 py-1">{String(l.reportingDate).slice(0, 10)}</td>
                    <td className="px-3 py-1 text-brand-text-secondary">{l.name || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Target</label>
            <select value={target} onChange={e => setTarget(e.target.value as 'counterparties' | 'securities')} className={input}>
              <option value="counterparties">Counterparty datasets</option>
              <option value="securities">Securities</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Loadid</label>
            <input value={loadId} onChange={e => setLoadId(e.target.value)} placeholder="e.g. 20251231-01" className={input} />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Product type (optional)</label>
            <input value={productType} onChange={e => setProductType(e.target.value)} placeholder="e.g. BONDS" className={input} />
          </div>
          <button onClick={run} disabled={busy}
            className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors disabled:opacity-50">
            {busy ? 'Loading…' : '⚡ Load from MERCURY'}
          </button>
        </div>
        <p className="text-[11px] text-brand-text-secondary mt-2">
          The API calls the TVF configured in Production:Sources (e.g. dbo.fn_regreport_prod_counterparties(@loadid, @producttype))
          on the MERCURY connection — the TVF owns the joins (core_positions × list_counterparty…) and returns the fixed
          column contract described in docs/MERCURY_INTEGRATION.md.
        </p>
      </Card>
    );
  };


/** Correction aid: pick the value to keep among divergent attributes — the
 * tool prepares the targeted UPDATE for MERCURY (review, then run in SSMS;
 * PointInTime is resolved from core_loads, loadid = PIT convention). */
const CORR_CPTY_COLS: Record<string, string> = {
  clientType: 'TypeOf', groupLexId: 'GroupLEXId',
  counterpartyType: 'EconomicActivityType', issuerRating: 'RatingClass',
};
const CORR_SEC_COLS: Record<string, string> = {
  securityType: 'TypeOf', rating: 'RatingClass', hqlaLevel: 'HQLACategory',
};
const sqlLit = (v: string) => (/^\d+$/.test(v) ? v : `'${v.replace(/'/g, "''")}'`);

const CorrectionHelper: React.FC<{ kind: 'cpty' | 'sec'; rows: Array<Record<string, unknown>>; keyValue: string }> =
  ({ kind, rows, keyValue }) => {
    const [script, setScript] = useState('');
    const cols = kind === 'cpty' ? CORR_CPTY_COLS : CORR_SEC_COLS;
    const divergent = Object.keys(cols).filter(f => {
      const vals = new Set(rows.map(r => String(r[f] ?? '')).filter(Boolean));
      return vals.size > 1;
    });
    if (divergent.length === 0) return null;

    const prepare = (field: string, keep: string) => {
      const table = kind === 'cpty' ? 'list_counterparties' : 'list_securities';
      const keyCol = kind === 'cpty' ? 'Id' : 'ISIN';
      const col = cols[field];
      const wrongRows = rows.filter(r => String(r[field] ?? '') !== keep && String(r[field] ?? ''));
      const wrongVals = Array.from(new Set(wrongRows.map(r => String(r[field]))));
      const dates = Array.from(new Set(wrongRows.map(r => String(r.date))));
      const sql = [
        `-- 1) PREVIEW — run this SELECT first to see exactly what will be modified:`,
        `SELECT * FROM ${table} t`,
        `WHERE t.${keyCol} = '${keyValue.replace(/'/g, "''")}'`,
        `  AND t.${col} IN (${wrongVals.map(sqlLit).join(', ')})`,
        `  AND t.PointInTime IN (SELECT LoadId FROM core_loads`,
        `                        WHERE ReportingDate IN (${dates.map(d => `'${d}'`).join(', ')}));`,
        ``,
        `-- 2) CORRECTION — prepared by RegReport Production on ${new Date().toISOString().slice(0, 10)}`,
        `-- Decision: keep ${col} = ${keep} for ${keyValue}; fix the load(s) of ${dates.join(', ')}`,
        `-- Review before executing on MERCURY, then re-run the feed (loadid = PointInTime convention).`,
        `UPDATE t SET t.${col} = ${sqlLit(keep)}`,
        `FROM ${table} t`,
        `WHERE t.${keyCol} = '${keyValue.replace(/'/g, "''")}'`,
        `  AND t.${col} IN (${wrongVals.map(sqlLit).join(', ')})`,
        `  AND t.PointInTime IN (SELECT LoadId FROM core_loads`,
        `                        WHERE ReportingDate IN (${dates.map(d => `'${d}'`).join(', ')}));`,
      ].join('\n');
      setScript(sql);
    };

    return (
      <div className="mt-2 border-t border-efg-line pt-2">
        <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-brand-text-secondary mb-1">
          Correction aid — pick the value to keep
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          {divergent.map(field => {
            const vals = Array.from(new Set(rows.map(r => String(r[field] ?? '')).filter(Boolean)));
            return vals.map(v => (
              <button key={`${field}:${v}`} onClick={() => prepare(field, v)}
                className="text-[11px] font-semibold border border-brand-secondary text-brand-secondary hover:bg-brand-secondary hover:text-white py-1 px-2.5 rounded-md transition-colors">
                {cols[field]}: keep "{v}"
              </button>
            ));
          })}
        </div>
        {script && (
          <div>
            <textarea readOnly value={script} rows={script.split('\n').length}
              className="w-full font-mono text-[11px] bg-white border border-efg-line rounded-md p-2" />
            <button onClick={() => navigator.clipboard.writeText(script)}
              className="mt-1 text-[11px] font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-1 px-3 rounded-md transition-colors">
              📋 Copy UPDATE (run in SSMS after review)
            </button>
          </div>
        )}
      </div>
    );
  };


/** Orphan (C5) insert aid: form with the MERCURY mandatory/useful fields —
 * generates the INSERT INTO list_counterparties / list_securities to review
 * and run in SSMS (with an existence-check SELECT first). */
type InsField = { name: string; type: 'text' | 'int' | 'flag' | 'date'; required?: boolean; hint?: string };
const CPTY_INS_FIELDS: InsField[] = [
  { name: 'Id', type: 'text', required: true },
  { name: 'PointInTime', type: 'int', required: true, hint: '= loadid of the period' },
  { name: 'Name', type: 'text' },
  { name: 'LEI', type: 'text' },
  { name: 'DomicileCountry', type: 'text', hint: 'ISO2' },
  { name: 'HQDomicile', type: 'text', hint: 'ISO2' },
  { name: 'TypeOf', type: 'text', hint: 'Bank | Corp | IP | CGov…' },
  { name: 'EconomicActivityType', type: 'text', hint: 'NOGA/NACE' },
  { name: 'ExternalRatingId', type: 'text' },
  { name: 'ExternalRatingPIT', type: 'int' },
  { name: 'GroupLEXId', type: 'text' },
  { name: 'GroupARISId', type: 'text' },
  { name: 'SMEFlag', type: 'flag' },
  { name: 'EstablishedRelationshipFlag', type: 'flag' },
  { name: 'CreditQuality', type: 'text' },
  { name: 'Nationality', type: 'text', hint: 'ISO2' },
];
const SEC_INS_FIELDS: InsField[] = [
  { name: 'Id', type: 'text', required: true },
  { name: 'PointInTime', type: 'int', required: true, hint: '= loadid of the period' },
  { name: 'Name', type: 'text' },
  { name: 'ISIN', type: 'text' },
  { name: 'ListedType', type: 'text', hint: 'RecoExc | RepMark' },
  { name: 'Currency', type: 'text', hint: 'ISO3' },
  { name: 'IndexFlag', type: 'flag' },
  { name: 'MainIndexFlag', type: 'flag' },
  { name: 'RevaluationFrequency', type: 'text', hint: 'D = daily' },
  { name: 'SNBEligibleFlag', type: 'flag' },
  { name: 'CMAApproachType', type: 'text' },
  { name: 'RatingClass', type: 'int' },
  { name: 'ExternalRatingId', type: 'text' },
  { name: 'ExternalRatingPIT', type: 'int' },
  { name: 'MaturityDate', type: 'date' },
  { name: 'TypeOf', type: 'text', hint: 'Bond | Equity…' },
  { name: 'SubType', type: 'text' },
  { name: 'HQLACategory', type: 'text', hint: 'L1 | L2a | L2b' },
  { name: 'LEXGuaranteedFlag', type: 'flag' },
];

/** Full column lists per the exact MERCURY DDL (docs/mercury-model/ddl.txt):
 * almost every column is NOT NULL, so the generated INSERT covers ALL columns
 * — user-provided values where filled, neutral typed defaults elsewhere
 * ('' / 0 / 1900-01-01), NULL only for the nullable *PIT columns. */
type ColKind = 'text' | 'int' | 'num' | 'flag' | 'date' | 'pit';
const CPTY_ALL: Array<[string, ColKind]> = [
  ['Id', 'text'], ['PointInTime', 'int'], ['CreationDate', 'date'], ['Name', 'text'],
  ['LegalName', 'text'], ['LEI', 'text'], ['DomicileCountry', 'text'], ['DomicileCanton', 'text'],
  ['HQDomicile', 'text'], ['RelatedPartyType', 'text'], ['TypeOf', 'text'],
  ['EconomicActivityType', 'text'], ['RatingClass', 'int'], ['ExternalRatingId', 'text'],
  ['ExternalRatingPIT', 'pit'], ['BookingCenterId', 'text'], ['GroupLEXId', 'text'],
  ['GroupARISId', 'text'], ['Headcount', 'int'], ['Turnover', 'int'], ['BalanceSheet', 'num'],
  ['Income1', 'int'], ['Income2', 'int'], ['SMEFlag', 'flag'], ['AdequateSupervisionFlag', 'flag'],
  ['RelationshipManagerId', 'text'], ['EstablishedRelationshipFlag', 'flag'], ['LEXLimitFlag', 'flag'],
  ['CreditQuality', 'text'], ['IncomeCurrency', 'text'], ['IsEdited', 'flag'], ['Nationality', 'text'],
  ['ReportingDate', 'date'], ['PD', 'num'], ['RiskEvaluationDate', 'date'], ['SIScode', 'text'],
];
const SEC_ALL: Array<[string, ColKind]> = [
  ['Id', 'text'], ['PointInTime', 'int'], ['CreationDate', 'date'], ['Name', 'text'],
  ['ISIN', 'text'], ['BBGTicker', 'text'], ['FIGI', 'text'], ['SEDOL', 'text'], ['Currency', 'text'],
  ['IndexFlag', 'flag'], ['MainIndexFlag', 'flag'], ['RevaluationFrequency', 'text'],
  ['SNBEligibleFlag', 'flag'], ['CMAApproachType', 'text'], ['CMARiskIndicator', 'int'],
  ['CMASARwFlag', 'flag'], ['RatingClass', 'int'], ['ExternalRatingId', 'text'],
  ['ExternalRatingPIT', 'pit'], ['MaturityDate', 'date'], ['TypeOf', 'text'], ['SubType', 'text'],
  ['InterestRateId', 'text'], ['IssuerId', 'text'], ['IssuerPIT', 'pit'],
  ['InvestmentGradeFlag', 'flag'], ['TimeSeriesId', 'int'], ['HQLACategory', 'text'],
  ['LEXGuaranteedFlag', 'flag'], ['ListedType', 'text'], ['IsEdited', 'flag'],
  ['StartDate', 'date'], ['ReportingDate', 'date'],
];

const OrphanInsertHelper: React.FC<{ keyValue: string; periodDate?: string }> = ({ keyValue, periodDate }) => {
  const [kind, setKind] = useState<'cpty' | 'sec'>('cpty');
  const [vals, setVals] = useState<Record<string, string>>(
    { Id: keyValue.startsWith('POS:') ? '' : keyValue });
  const [script, setScript] = useState('');
  const fields = kind === 'cpty' ? CPTY_INS_FIELDS : SEC_INS_FIELDS;
  const table = kind === 'cpty' ? 'list_counterparties' : 'list_securities';

  const fmt = (f: InsField, raw: string): string | null => {
    const v = raw.trim();
    if (!v) return null;
    if (f.type === 'int') return /^-?\d+$/.test(v) ? v : null;
    if (f.type === 'flag') return ['1', 'true', 'yes', 'y', 'x'].includes(v.toLowerCase()) ? '1' : '0';
    return `'${v.replace(/'/g, "''")}'`;
  };
  const generate = () => {
    const missing = fields.filter(f => f.required && !vals[f.name]?.trim());
    if (missing.length > 0) { setScript(`-- Missing required field(s): ${missing.map(f => f.name).join(', ')}`); return; }
    // The real MERCURY tables are NOT NULL on almost every column: emit ALL
    // columns — user values where provided, neutral typed defaults elsewhere.
    const today = new Date().toISOString().slice(0, 10);
    const all = kind === 'cpty' ? CPTY_ALL : SEC_ALL;
    const colVals = all.map(([name, t]) => {
      const raw = (vals[name] || '').trim();
      if (raw) {
        if (t === 'int' || t === 'num' || t === 'pit') return [name, /^-?\d+(\.\d+)?$/.test(raw) ? raw : '0'] as const;
        if (t === 'flag') return [name, ['1', 'true', 'yes', 'y', 'x'].includes(raw.toLowerCase()) ? '1' : '0'] as const;
        return [name, `'${raw.replace(/'/g, "''")}'`] as const;
      }
      if (name === 'CreationDate') return [name, `'${today}'`] as const;
      if (name === 'ReportingDate') return [name, `'${periodDate || today}'`] as const;
      if (name === 'IsEdited') return [name, '1'] as const;   // manually created record
      if (t === 'pit') return [name, 'NULL'] as const;
      if (t === 'date') return [name, `'1900-01-01'`] as const;
      if (t === 'text') return [name, `''`] as const;
      return [name, '0'] as const;
    });
    const sql = [
      `-- Orphan fix prepared by RegReport Production on ${today}`,
      `-- All NOT NULL columns are filled (neutral defaults per the real DDL);`,
      `-- *PIT columns default to NULL. Adjust any default before executing.`,
      `-- 1) CHECK — the row must not already exist:`,
      `SELECT * FROM ${table} WHERE Id = ${fmt({ name: 'Id', type: 'text' }, vals.Id || '')} AND PointInTime = ${vals.PointInTime?.trim() || '?'};`,
      ``,
      `-- 2) INSERT — review, run in SSMS, then re-run the feed:`,
      `INSERT INTO ${table} (${colVals.map(([n]) => n).join(', ')})`,
      `VALUES (${colVals.map(([, v]) => v).join(', ')});`,
    ].join('\n');
    setScript(sql);
  };

  const input = 'p-1.5 border border-gray-200 rounded-md text-[11px] bg-white w-40';
  return (
    <div className="mt-2 border-t border-efg-line pt-2">
      <div className="flex items-center gap-3 mb-2">
        <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-brand-text-secondary">
          Create the missing record (INSERT INTO {table})
        </p>
        <select value={kind} onChange={e => { setKind(e.target.value as 'cpty' | 'sec'); setScript(''); }}
          className="p-1 border border-gray-200 rounded-md text-[11px] bg-white">
          <option value="cpty">list_counterparties</option>
          <option value="sec">list_securities</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {fields.map(f => (
          <div key={f.name}>
            <label className="block text-[9px] uppercase tracking-wider text-brand-text-secondary">
              {f.name}{f.required ? ' *' : ''}{f.hint ? ` (${f.hint})` : ''}
            </label>
            <input type={f.type === 'date' ? 'date' : 'text'} value={vals[f.name] || ''}
              onChange={e => setVals(prev => ({ ...prev, [f.name]: e.target.value }))}
              placeholder={f.type === 'flag' ? '1 / 0' : ''} className={input} />
          </div>
        ))}
      </div>
      <button onClick={generate}
        className="text-[11px] font-semibold border border-brand-secondary text-brand-secondary hover:bg-brand-secondary hover:text-white py-1 px-3 rounded-md transition-colors">
        Generate INSERT
      </button>
      {script && (
        <div className="mt-2">
          <textarea readOnly value={script} rows={script.split('\n').length}
            className="w-full font-mono text-[11px] bg-white border border-efg-line rounded-md p-2" />
          <button onClick={() => navigator.clipboard.writeText(script)}
            className="mt-1 text-[11px] font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-1 px-3 rounded-md transition-colors">
            📋 Copy (run in SSMS after review)
          </button>
        </div>
      )}
    </div>
  );
};

/** Adjustments (step 3): accounting adjustment lines matched against
 * core_positions of a load via the agreed composite LIKE key
 * (InternalReference1 OR ContractId ~ REFERENCE, CounterpartyId ~ CLIENT),
 * disambiguated by the Mapping_GL_BALANCESHEET account. Output = prepared
 * INSERT scripts (copied attributes, or full build from the mappings). */
const AdjustmentsCard: React.FC<{ entity: string; onNotice: (m: string) => void; onError: (m: string) => void }> =
  ({ entity, onNotice, onError }) => {
    const { mode, apiBaseUrl, setData, currentUser } = useData();
    const [mappings, setMappings] = useState<AdjustmentMappings | null>(null);
    const [mappingInfo, setMappingInfo] = useState('');
    const [lines, setLines] = useState<AdjustmentLine[]>([]);
    const [linesInfo, setLinesInfo] = useState('');
    const [loads, setLoads] = useState<Array<{ loadId: number | string; reportingDate: string; name?: string | null }>>([]);
    const [loadId, setLoadId] = useState('');
    const [busy, setBusy] = useState(false);
    const [results, setResults] = useState<Record<number, MatchCandidate[]> | null>(null);
    const [chosen, setChosen] = useState<Record<number, string>>({});
    const [scripts, setScripts] = useState<Record<number, string>>({});
    const [manual, setManual] = useState({ ligne: '', montant: '', ccy: 'CHF', nominal: '', reference: '', client: '', ind: '', libelle: '' });
    const [manualScript, setManualScript] = useState('');
    const [bookingCenter, setBookingCenter] = useState('');
    const [baseBalance, setBaseBalance] = useState<Record<string, { amount: number; positions: number }> | null>(null);
    const [showImpact, setShowImpact] = useState(false);
    // The adjustments service is dynamically imported (keeps xlsx out of the
    // main chunk); the module is kept here so memos can use it once loaded.
    const [svcMod, setSvcMod] = useState<typeof import('../services/adjustments') | null>(null);

    useEffect(() => {
      if (mode !== 'api') return;
      fetch(`${apiBaseUrl}/production/mercury/loads`, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : []))
        .then(l => setLoads(Array.isArray(l) ? l : []))
        .catch(() => setLoads([]));
    }, [mode, apiBaseUrl]);

    const reportingDate = useMemo(() => {
      const l = loads.find(x => String(x.loadId) === loadId);
      return l ? String(l.reportingDate).slice(0, 10) : '';
    }, [loads, loadId]);

    const onMappingFile = async (f: File | undefined) => {
      if (!f) return;
      try {
        const svc = await import('../services/adjustments');
        setSvcMod(svc);
        const m = svc.parseMappingWorkbook(await f.arrayBuffer());
        setMappings(m);
        setMappingInfo(`${f.name} — ${m.gl.size} GL lines, ${m.fx.size} FX rates, ${m.rt01.size} RT01→QDL, ${m.industry.size} industry codes`);
      } catch (err) { onError(`Mapping workbook: ${err instanceof Error ? err.message : String(err)}`); }
    };
    const onLinesFile = async (f: File | undefined) => {
      if (!f) return;
      try {
        const svc = await import('../services/adjustments');
        const parsed = svc.parseAdjustmentsFile(await f.arrayBuffer());
        setLines(parsed);
        setResults(null); setChosen({}); setScripts({});
        setLinesInfo(`${f.name} — ${parsed.length} adjustment line(s)`);
      } catch (err) { onError(`Adjustments file: ${err instanceof Error ? err.message : String(err)}`); }
    };

    const runMatch = async () => {
      if (!mappings || lines.length === 0 || !loadId) { onError('Adjustments: mapping workbook, adjustments file and loadid are all required.'); return; }
      setBusy(true);
      try {
        const svc = await import('../services/adjustments');
        const res = await fetch(`${apiBaseUrl}/production/mercury/adjustments/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            loadId,
            lines: lines.map(l => ({
              row: l.row, reference: l.reference, client: l.client || null,
              legalAccountNumber: mappings.gl.get(l.ligne)?.legalAccountNumber || null,
            })),
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`);
        }
        const out = await res.json() as { results: Array<{ row: number; candidates: Array<Record<string, unknown>> }> };
        const map: Record<number, MatchCandidate[]> = {};
        const pre: Record<number, string> = {};
        for (const r of out.results || []) {
          const cands = (r.candidates || []).map(svc.normalizeCandidate)
            .sort((a, b) => Number(b.accountMatch) - Number(a.accountMatch));
          map[r.row] = cands;
          // Preselect when the answer is unambiguous: a single candidate, or a
          // single one carrying the GL-mapping account.
          const matches = cands.filter(c => c.accountMatch);
          if (cands.length === 1) pre[r.row] = cands[0].id;
          else if (matches.length === 1) pre[r.row] = matches[0].id;
        }
        setResults(map); setChosen(pre); setScripts({});
        const total = lines.length;
        const none = lines.filter(l => (map[l.row] || []).length === 0).length;
        const auto = Object.keys(pre).length;
        onNotice(`Matching done on load ${loadId}: ${auto}/${total} line(s) resolved automatically, ${total - auto - none} to disambiguate, ${none} without match (new position).`);
      } catch (err) { onError(`Adjustments matching failed: ${err instanceof Error ? err.message : String(err)}`); }
      finally { setBusy(false); }
    };

    const makeScript = async (line: AdjustmentLine) => {
      if (!mappings) return;
      const svc = await import('../services/adjustments');
      const cands = results?.[line.row] || [];
      const cand = cands.find(c => c.id === chosen[line.row]);
      const sql = cand
        ? svc.buildAdjustmentInsert(line, cand, loadId, mappings)
        : svc.buildNewPositionPackage(line, loadId, reportingDate || new Date().toISOString().slice(0, 10), mappings, buildOpts());
      setScripts(prev => ({ ...prev, [line.row]: sql }));
    };

    const copyAndLog = (line: AdjustmentLine, sql: string) => {
      navigator.clipboard.writeText(sql);
      const cand = (results?.[line.row] || []).find(c => c.id === chosen[line.row]);
      setData(prev => ({
        ...prev,
        prodFindingLogs: [...(prev.prodFindingLogs || []), {
          id: Date.now(), entity, date: reportingDate || loadId,
          control: 'ADJ', findingKey: `LIGNE ${line.ligne} · row ${line.row}`,
          signature: `${entity}|ADJ|${loadId}|${line.row}|${line.reference}|${line.montant}`,
          decision: 'corrected' as const,
          note: cand
            ? `Adjustment INSERT from position ${cand.id} (${line.montant} ${line.ccy}, ref ${line.reference})`
            : `New position INSERT (no match for ref ${line.reference}, ${line.montant} ${line.ccy})`,
          decidedBy: currentUser.name, decidedAt: new Date().toISOString(),
        }],
      }));
      onNotice(`Script for LIGNE ${line.ligne} (row ${line.row}) copied and logged — review it, then run in SSMS.`);
    };

    // One-shot generation: every line resolved to a single candidate (or to
    // "no match" → new position) — lines still ambiguous are excluded.
    const oneShotItems = useMemo(() => {
      if (!results) return null;
      const ready: Array<{ line: AdjustmentLine; cand: MatchCandidate | null }> = [];
      let pending = 0;
      for (const l of lines) {
        const cands = results[l.row] || [];
        const cand = cands.find(c => c.id === chosen[l.row]) || null;
        if (cands.length > 0 && !cand) pending += 1;
        else ready.push({ line: l, cand });
      }
      return { ready, pending };
    }, [results, lines, chosen]);

    const logBatch = (what: string, n: number) => {
      setData(prev => ({
        ...prev,
        prodFindingLogs: [...(prev.prodFindingLogs || []), {
          id: Date.now(), entity, date: reportingDate || loadId,
          control: 'ADJ', findingKey: `one-shot ${n} line(s)`,
          signature: `${entity}|ADJ|${loadId}|batch|${Date.now()}`,
          decision: 'corrected' as const, note: what,
          decidedBy: currentUser.name, decidedAt: new Date().toISOString(),
        }],
      }));
    };

    const buildOpts = () => ({ bookingCenterId: bookingCenter.trim() || undefined });

    const downloadAllSql = async () => {
      if (!mappings || !oneShotItems || oneShotItems.ready.length === 0) return;
      const svc = await import('../services/adjustments');
      const sql = svc.buildAllSql(oneShotItems.ready, loadId, reportingDate || new Date().toISOString().slice(0, 10), mappings, buildOpts());
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([sql], { type: 'text/plain' }));
      a.download = `adjustments-load${loadId}.sql`;
      a.click();
      URL.revokeObjectURL(a.href);
      const adj = oneShotItems.ready.filter(i => i.cand).length;
      logBatch(`One-shot .sql generated for load ${loadId}: ${adj} adjustment(s) + ${oneShotItems.ready.length - adj} new position(s)`, oneShotItems.ready.length);
      onNotice(`adjustments-load${loadId}.sql downloaded (${oneShotItems.ready.length} INSERT) — review, then run once in SSMS.`);
    };

    const downloadExcel = async () => {
      if (!mappings || !oneShotItems || oneShotItems.ready.length === 0) return;
      const svc = await import('../services/adjustments');
      const name = svc.exportAdjustmentsWorkbook(oneShotItems.ready, loadId, reportingDate || new Date().toISOString().slice(0, 10), mappings, buildOpts());
      const adj = oneShotItems.ready.filter(i => i.cand).length;
      logBatch(`One-shot Excel generated for load ${loadId}: ${adj} adjustment(s) + ${oneShotItems.ready.length - adj} new position(s)`, oneShotItems.ready.length);
      onNotice(`${name} downloaded — Summary + core_positions rows (all columns) for mass review / bulk import.`);
    };

    // Manual line: build a position for a GL mapping LIGNE directly (e.g. a
    // pure accounting gap with no reference to match).
    const mkManualLine = async (): Promise<AdjustmentLine | null> => {
      if (!mappings) { onError('Load the mapping workbook first.'); return null; }
      const ligne = manual.ligne.trim();
      if (!mappings.gl.has(ligne)) { onError(`LIGNE "${ligne}" not found in Mapping_GL_BALANCESHEET.`); return null; }
      const montant = Number(manual.montant.replace(/['\s]/g, '').replace(',', '.'));
      if (!isFinite(montant) || manual.montant.trim() === '') { onError('Manual line: a signed MONTANT is required.'); return null; }
      const nominal = Number(manual.nominal.replace(/['\s]/g, '').replace(',', '.'));
      const row = (lines.length ? Math.max(...lines.map(l => l.row)) : 0) + 1;
      return {
        row, ligne, montant,
        nominal: isFinite(nominal) && manual.nominal.trim() !== '' ? nominal : undefined,
        ccy: manual.ccy.trim().toUpperCase() || 'CHF',
        reference: manual.reference.trim() || `MANUAL-${ligne}-${row}`,
        client: manual.client.trim() || undefined,
        ind: manual.ind.trim() || undefined,
        libelle: manual.libelle.trim() || undefined,
        description: mappings.gl.get(ligne)?.description,
      };
    };
    const manualGenerate = async () => {
      const ml = await mkManualLine();
      if (!ml || !mappings) return;
      if (!loadId) { onError('Pick a loadid first.'); return; }
      const svc = await import('../services/adjustments');
      setManualScript(svc.buildNewPositionPackage(ml, loadId, reportingDate || new Date().toISOString().slice(0, 10), mappings, buildOpts()));
    };
    const manualAdd = async () => {
      const ml = await mkManualLine();
      if (!ml) return;
      setLines(prev => [...prev, ml]);
      setLinesInfo(prev => `${prev || 'manual lines'} + row ${ml.row} (LIGNE ${ml.ligne})`);
      onNotice(`Line added as row ${ml.row} — re-run the matching to look for candidates (its reference is "${ml.reference}"), or export directly (treated as a new position).`);
    };

    // Balance-sheet impact preview: base balance of the load (LEFT3 aggregate
    // from MERCURY) + adjustment deltas per account prefix.
    const toggleImpact = async () => {
      if (showImpact) { setShowImpact(false); return; }
      setShowImpact(true);
      if (!baseBalance && loadId) {
        try {
          const r = await fetch(`${apiBaseUrl}/production/mercury/balance?loadId=${encodeURIComponent(loadId)}`, { credentials: 'include' });
          if (r.ok) {
            const arr = await r.json() as Array<{ prefix: string; amount: number; positions: number }>;
            const map: Record<string, { amount: number; positions: number }> = {};
            for (const b of arr) if (b.prefix) map[b.prefix] = { amount: b.amount, positions: b.positions };
            setBaseBalance(map);
          }
        } catch { /* base unavailable — deltas shown alone */ }
      }
    };

    const impact = useMemo(() => {
      if (!svcMod || !mappings || lines.length === 0) return null;
      const items = lines.map(l => {
        const cands = results?.[l.row] || [];
        return { line: l, cand: cands.find(c => c.id === chosen[l.row]) || null };
      });
      return svcMod.computeImpactByPrefix(items, mappings);
    }, [svcMod, mappings, lines, results, chosen]);

    if (mode !== 'api') {
      return (
        <Card>
          <SectionHeader title="Adjustments from accounting" suffix="requires the API backend" />
          <p className="text-sm text-brand-text-secondary">
            Connect the app to the .NET backend to match the accounting adjustment lines against core_positions
            of a MERCURY load — see docs/MERCURY_INTEGRATION.md §5.
          </p>
        </Card>
      );
    }

    const input = 'p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary';
    const fileBtn = 'block text-sm text-brand-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:text-sm file:font-semibold file:text-brand-text-primary hover:file:border-brand-secondary';
    return (
      <Card>
        <SectionHeader title="Adjustments from accounting"
          suffix="match each line against core_positions of the load (LIKE on InternalReference1/ContractId + CLIENT), then prepare the INSERT" />
        <div className="grid md:grid-cols-2 gap-4 mb-3">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">1 — Mapping workbook (Mapping.xlsb)</label>
            <input type="file" accept=".xlsb,.xlsx,.xls" onChange={e => onMappingFile(e.target.files?.[0])} className={fileBtn} />
            {mappingInfo && <p className="text-[11px] text-status-green mt-1">✓ {mappingInfo}</p>}
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">2 — Adjustments file (LIGNE, REFERENCE, MONTANT…)</label>
            <input type="file" accept=".xlsx,.xls,.xlsb,.csv" onChange={e => onLinesFile(e.target.files?.[0])} className={fileBtn} />
            {linesInfo && <p className="text-[11px] text-status-green mt-1">✓ {linesInfo}</p>}
          </div>
        </div>
        {loads.length > 0 && (
          <div className="overflow-x-auto border border-efg-line rounded-lg mb-3 max-h-40 overflow-y-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead className="bg-brand-bg-body sticky top-0"><tr>
                <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">3 — Loadid (core_loads)</th>
                <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Reporting date</th>
                <th className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Name</th>
              </tr></thead>
              <tbody>
                {loads.map(l => (
                  <tr key={String(l.loadId)} onClick={() => setLoadId(String(l.loadId))}
                    className={`border-t border-efg-line cursor-pointer hover:bg-brand-bg-body/60 ${String(l.loadId) === loadId ? 'bg-brand-secondary/10 font-semibold' : ''}`}>
                    <td className="px-3 py-1">{String(l.loadId) === loadId ? '● ' : ''}{String(l.loadId)}</td>
                    <td className="px-3 py-1">{String(l.reportingDate).slice(0, 10)}</td>
                    <td className="px-3 py-1 text-brand-text-secondary">{l.name || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Loadid</label>
            <input value={loadId} onChange={e => { setLoadId(e.target.value); setBaseBalance(null); }} placeholder="e.g. 1002" className={input} />
          </div>
          {reportingDate && <p className="text-sm text-brand-text-secondary pb-2">→ reporting date <strong>{reportingDate}</strong></p>}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Booking center (new positions)</label>
            <input value={bookingCenter} onChange={e => setBookingCenter(e.target.value)} placeholder="BookingCenterId" className={input} />
          </div>
          <button onClick={runMatch} disabled={busy || !mappings || lines.length === 0 || !loadId}
            className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors disabled:opacity-50">
            {busy ? 'Matching…' : '🔍 Run matching on core_positions'}
          </button>
          <button onClick={toggleImpact} disabled={!mappings || lines.length === 0}
            className={`text-sm font-semibold border py-2 px-4 rounded-md transition-colors disabled:opacity-50 ${showImpact ? 'bg-brand-secondary text-white border-brand-secondary' : 'border-brand-secondary text-brand-secondary hover:bg-brand-secondary hover:text-white'}`}>
            📊 Balance sheet impact
          </button>
        </div>

        {showImpact && impact && mappings && (() => {
          const fmt = (n: number) => n.toLocaleString('en-CH', { maximumFractionDigits: 2 });
          const prefixes = Array.from(new Set([...Object.keys(baseBalance || {}), ...impact.keys()])).sort();
          const sections: Array<{ title: string; match: (p: string) => boolean }> = [
            { title: 'Assets (1xx)', match: p => p.startsWith('1') },
            { title: 'Liabilities & equity (2xx)', match: p => p.startsWith('2') },
            { title: 'Off-balance sheet / other', match: p => !p.startsWith('1') && !p.startsWith('2') },
          ];
          return (
            <div className="border border-efg-line rounded-lg mb-3 overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-brand-bg-body"><tr>
                  {['Account (LEFT 3)', 'Label', 'Base (load)', 'Adjustments', 'After', 'Adj lines'].map((h, hi) =>
                    <th key={h} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold ${hi >= 2 && hi <= 4 ? 'text-right' : 'text-left'}`}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {sections.map(sec => {
                    const ps = prefixes.filter(sec.match);
                    if (ps.length === 0) return null;
                    let tBase = 0, tDelta = 0, tLines = 0;
                    return (
                      <React.Fragment key={sec.title}>
                        <tr className="border-t border-efg-line bg-brand-bg-body/60">
                          <td colSpan={6} className="px-3 py-1.5 font-semibold text-[11px] uppercase tracking-[0.08em] text-brand-text-secondary">{sec.title}</td>
                        </tr>
                        {ps.map(p => {
                          const base = baseBalance?.[p]?.amount ?? 0;
                          const d = impact.get(p);
                          const delta = d?.delta ?? 0;
                          tBase += base; tDelta += delta; tLines += d?.lines ?? 0;
                          return (
                            <tr key={p} className={`border-t border-efg-line/60 ${delta !== 0 ? 'font-semibold' : ''}`}>
                              <td className="px-3 py-1">{p}</td>
                              <td className="px-3 py-1 text-brand-text-secondary font-normal max-w-xs truncate">{mappings.accountLabels.get(p) || '—'}</td>
                              <td className="px-3 py-1 text-right tabular-nums">{baseBalance ? fmt(base) : '—'}</td>
                              <td className={`px-3 py-1 text-right tabular-nums ${delta > 0 ? 'text-status-green' : delta < 0 ? 'text-status-red' : 'text-brand-text-secondary'}`}>{delta === 0 ? '—' : fmt(delta)}</td>
                              <td className="px-3 py-1 text-right tabular-nums">{baseBalance ? fmt(base + delta) : '—'}</td>
                              <td className="px-3 py-1 text-right tabular-nums text-brand-text-secondary font-normal">{d?.lines || ''}</td>
                            </tr>
                          );
                        })}
                        <tr className="border-t border-efg-line font-semibold">
                          <td className="px-3 py-1.5" colSpan={2}>Total {sec.title}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{baseBalance ? fmt(tBase) : '—'}</td>
                          <td className={`px-3 py-1.5 text-right tabular-nums ${tDelta > 0 ? 'text-status-green' : tDelta < 0 ? 'text-status-red' : ''}`}>{tDelta === 0 ? '—' : fmt(tDelta)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{baseBalance ? fmt(tBase + tDelta) : '—'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-brand-text-secondary">{tLines || ''}</td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-brand-text-secondary px-3 py-2 border-t border-efg-line">
                Amounts in CHF (CCY sheet, BS_RATE_6). Base = SUM(BookAmount) of load {loadId || '?'} grouped by LEFT(LegalAccountNumber, 3);
                matched lines hit the account of the chosen position, unmatched lines the Mapping_GL_BALANCESHEET account of their LIGNE.
                {!baseBalance && ' Base balance unavailable (MERCURY not reachable or loadid empty) — showing adjustment deltas only.'}
              </p>
            </div>
          );
        })()}

        {lines.length > 0 && (
          <div className="overflow-x-auto border border-efg-line rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-brand-bg-body"><tr>
                {['Row', 'LIGNE', 'Description', 'Reference', 'Client', 'Amount', 'GL account', 'Match'].map(h =>
                  <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {lines.map(l => {
                  const gl = mappings?.gl.get(l.ligne);
                  const interco = l.ind ? mappings?.industry.get(l.ind)?.interco : undefined;
                  const cands = results?.[l.row];
                  const cand = cands?.find(c => c.id === chosen[l.row]);
                  const status = !cands ? '—'
                    : cands.length === 0 ? '✚ new position'
                    : cand ? `✓ ${cand.id}`
                    : `${cands.length} candidates`;
                  const statusCls = !cands ? 'text-brand-text-secondary'
                    : cands.length === 0 ? 'text-status-amber font-semibold'
                    : cand ? 'text-status-green font-semibold'
                    : 'text-status-red font-semibold';
                  return (
                    <React.Fragment key={l.row}>
                      <tr className="border-t border-efg-line align-top">
                        <td className="px-3 py-1.5 tabular-nums">{l.row}</td>
                        <td className="px-3 py-1.5 font-semibold">{l.ligne}</td>
                        <td className="px-3 py-1.5 whitespace-normal max-w-xs">{l.libelle || l.description || '—'}</td>
                        <td className="px-3 py-1.5">{l.reference}</td>
                        <td className="px-3 py-1.5">
                          {l.client || '—'}
                          {interco && (
                            <span title={`Intercompany — IND ${l.ind} → ${mappings?.industry.get(l.ind || '')?.description || ''} → CounterpartyBookingCenterId ${interco}`}
                              className="ml-1 text-[9px] font-semibold px-1 py-0.5 rounded border border-brand-secondary/50 text-brand-secondary">IC {interco}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{l.montant.toLocaleString('en-CH')} {l.ccy}</td>
                        <td className="px-3 py-1.5">{gl?.legalAccountNumber || <span className="text-status-red">no GL map</span>}</td>
                        <td className={`px-3 py-1.5 whitespace-nowrap ${statusCls}`}>{status}</td>
                      </tr>
                      {cands && (
                        <tr className="border-t border-efg-line/50 bg-brand-bg-body/40">
                          <td colSpan={8} className="px-4 py-2">
                            {cands.length > 0 && (
                              <table className="text-[11px] w-full mb-2">
                                <thead><tr>
                                  {['Pick', 'Position Id', 'Account', 'TypeOf', 'Ccy', 'Book amount', 'Counterparty', 'InternalRef1', 'ContractId', 'Source'].map(h =>
                                    <th key={h} className="px-2 py-1 text-left text-[9px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
                                </tr></thead>
                                <tbody>
                                  {cands.map(c => (
                                    <tr key={c.id} onClick={() => { setChosen(prev => ({ ...prev, [l.row]: c.id })); setScripts(prev => { const p = { ...prev }; delete p[l.row]; return p; }); }}
                                      className={`border-t border-efg-line/60 cursor-pointer hover:bg-white ${chosen[l.row] === c.id ? 'bg-brand-secondary/10 font-semibold' : ''}`}>
                                      <td className="px-2 py-1">{chosen[l.row] === c.id ? '●' : '○'}</td>
                                      <td className="px-2 py-1">{c.id}</td>
                                      <td className={`px-2 py-1 ${c.accountMatch ? 'text-status-green font-semibold' : ''}`}>{c.legalAccountNumber || '—'}{c.accountMatch ? ' ✓GL' : ''}</td>
                                      <td className="px-2 py-1">{c.typeOf || '—'}{c.subType ? `/${c.subType}` : ''}</td>
                                      <td className="px-2 py-1">{c.currency || '—'}</td>
                                      <td className="px-2 py-1 text-right tabular-nums">{c.bookAmount?.toLocaleString('en-CH') ?? '—'}</td>
                                      <td className="px-2 py-1">{c.counterpartyId || '—'}</td>
                                      <td className="px-2 py-1">{c.internalReference1 || '—'}</td>
                                      <td className="px-2 py-1">{c.contractId || '—'}</td>
                                      <td className="px-2 py-1">{c.dataSource || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            <div className="flex gap-2">
                              <button onClick={() => makeScript(l)}
                                disabled={cands.length > 0 && !cand}
                                className="text-[11px] font-semibold border border-brand-secondary text-brand-secondary hover:bg-brand-secondary hover:text-white py-1 px-2.5 rounded-md transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-brand-secondary">
                                {cands.length === 0 ? '✚ Prepare new-position INSERT (from mappings)' : cand ? `Prepare adjustment INSERT from ${cand.id}` : 'Pick a candidate first'}
                              </button>
                            </div>
                            {scripts[l.row] && (
                              <div className="mt-2">
                                <textarea readOnly value={scripts[l.row]} rows={Math.min(scripts[l.row].split('\n').length, 24)}
                                  className="w-full font-mono text-[11px] bg-white border border-efg-line rounded-md p-2" />
                                <button onClick={() => copyAndLog(l, scripts[l.row])}
                                  className="mt-1 text-[11px] font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-1 px-3 rounded-md transition-colors">
                                  📋 Copy + log decision (run in SSMS after review)
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {oneShotItems && oneShotItems.ready.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3 border border-efg-line rounded-lg bg-brand-bg-body/40 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-text-secondary">
              One-shot generation — {oneShotItems.ready.length} line(s) ready
              ({oneShotItems.ready.filter(i => i.cand).length} adjustment(s), {oneShotItems.ready.filter(i => !i.cand).length} new)
            </span>
            <button onClick={downloadAllSql}
              className="text-[11px] font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-1.5 px-3 rounded-md transition-colors">
              ⬇ Single .sql script (all INSERTs)
            </button>
            <button onClick={downloadExcel}
              className="text-[11px] font-semibold border border-brand-secondary text-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-3 rounded-md transition-colors">
              ⬇ Excel — core_positions rows (all columns)
            </button>
            {oneShotItems.pending > 0 && (
              <span className="text-[11px] text-status-amber font-semibold">
                ⚠ {oneShotItems.pending} line(s) excluded — pick their candidate first
              </span>
            )}
          </div>
        )}

        {mappings && (
          <div className="mt-4 border-t border-efg-line pt-3">
            <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-brand-text-secondary mb-2">
              Manual line — build a position for any GL LIGNE (e.g. accounting gap, no reference to match)
            </p>
            <div className="flex flex-wrap items-end gap-2 mb-2">
              <div>
                <label className="block text-[9px] uppercase tracking-wider text-brand-text-secondary">LIGNE (GL mapping) *</label>
                <input list="adj-gl-lines" value={manual.ligne}
                  onChange={e => { setManual(prev => ({ ...prev, ligne: e.target.value })); setManualScript(''); }}
                  placeholder="e.g. 155" className="p-1.5 border border-gray-200 rounded-md text-[11px] bg-white w-32" />
                <datalist id="adj-gl-lines">
                  {Array.from(mappings.gl.values()).map(g => (
                    <option key={g.line} value={g.line}>{`${g.legalAccountNumber}${g.description ? ` — ${g.description}` : ''}`}</option>
                  ))}
                </datalist>
              </div>
              {(() => { const g = mappings.gl.get(manual.ligne.trim()); return g ? (
                <p className="text-[11px] text-brand-text-secondary pb-1.5">
                  → account <strong>{g.legalAccountNumber}</strong>{g.typeOf ? ` · ${g.typeOf}${g.subType ? `/${g.subType}` : ''}` : ''}{g.description ? ` · ${g.description}` : ''}
                </p>
              ) : null; })()}
            </div>
            <div className="flex flex-wrap items-end gap-2 mb-2">
              {([
                ['montant', 'Montant (signed) *', 'e.g. -125000.50', 'w-32'],
                ['ccy', 'CCY', 'CHF', 'w-16'],
                ['nominal', 'Nominal', '', 'w-28'],
                ['reference', 'Reference', 'auto if empty', 'w-40'],
                ['client', 'Client (CounterpartyId)', '', 'w-32'],
                ['ind', 'IND (interco)', '', 'w-24'],
                ['libelle', 'Libellé', '', 'w-48'],
              ] as const).map(([key, label, ph, w]) => (
                <div key={key}>
                  <label className="block text-[9px] uppercase tracking-wider text-brand-text-secondary">{label}</label>
                  <input value={manual[key]} onChange={e => { setManual(prev => ({ ...prev, [key]: e.target.value })); setManualScript(''); }}
                    placeholder={ph} className={`p-1.5 border border-gray-200 rounded-md text-[11px] bg-white ${w}`} />
                </div>
              ))}
              <button onClick={manualGenerate}
                className="text-[11px] font-semibold border border-brand-secondary text-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-3 rounded-md transition-colors">
                Generate INSERT
              </button>
              <button onClick={manualAdd}
                className="text-[11px] font-semibold border border-gray-300 text-brand-text-secondary hover:border-brand-secondary hover:text-brand-secondary py-1.5 px-3 rounded-md transition-colors">
                ➕ Add to the lines (for matching / one-shot)
              </button>
            </div>
            {manualScript && (
              <div>
                <textarea readOnly value={manualScript} rows={Math.min(manualScript.split('\n').length, 24)}
                  className="w-full font-mono text-[11px] bg-white border border-efg-line rounded-md p-2" />
                <button onClick={async () => {
                  const ml = await mkManualLine();
                  if (ml) copyAndLog(ml, manualScript);
                }}
                  className="mt-1 text-[11px] font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-1 px-3 rounded-md transition-colors">
                  📋 Copy + log decision (run in SSMS after review)
                </button>
              </div>
            )}
          </div>
        )}

        <p className="text-[11px] text-brand-text-secondary mt-3">
          Matching key (agreed rules): (InternalReference1 LIKE '%REFERENCE%' OR ContractId LIKE '%REFERENCE%') AND CounterpartyId LIKE '%CLIENT%',
          on the chosen load. Candidates carrying the Mapping_GL_BALANCESHEET account of the LIGNE are flagged ✓GL and preselected when unambiguous.
          One candidate → adjustment INSERT copying the position's attributes (signed MONTANT, CHF via the CCY sheet, Id suffixed -ADJ, DataSource = 'ADJUSTMENT').
          No candidate → full new-position package built from the mappings (LIGNE→GL account/TypeOf, IND→INDUSTRY, CATEG→RT01, counterparty = CLIENT),
          including the missing referential rows so no C5 orphan is created: list_counterparties for the CLIENT (guarded by IF NOT EXISTS) and,
          when the GL line is cp_TypeOf = Security, a list_securities row (issuer = CLIENT) linked via SecurityId.
          Intercompany: an IND code carrying HYPERIOD_INTERCO in the INDUSTRY sheet (badge IC) forces the group company into CounterpartyBookingCenterId — on both matched adjustments and new positions. The Booking center field stamps BookingCenterId on new positions.
          One-shot generation: a single .sql with every INSERT (one execution in SSMS) or an Excel with the core_positions rows (all columns) for mass review / bulk import.
          The 📊 impact preview shows base (load aggregate from MERCURY), adjustments and resulting balance per LEFT(LegalAccountNumber,3), split assets / liabilities / off-balance, labels derived from the GL mapping.
          Every copied or downloaded script is logged in the decision history (control ADJ). The tool never writes to MERCURY — review and run in SSMS.
        </p>
      </Card>
    );
  };

const ProductionPage: React.FC = () => {
  const { data, setData, allEntities, currentUser } = useData();
  const [tab, setTab] = useState<'prereq' | 'controls' | 'adjust'>('prereq');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cps = data.prodCounterparties || [];
  const secs = data.prodSecurities || [];
  const refs = data.prodGuaranteeRefs || [];

  const entities = useMemo(() => {
    const set = new Set<string>(allEntities);
    cps.forEach(r => set.add(r.entity));
    secs.forEach(r => set.add(r.entity));
    return Array.from(set).sort();
  }, [allEntities, cps, secs]);
  const [entitySel, setEntitySel] = useState('');
  const entity = entities.includes(entitySel) ? entitySel : entities[0] || '';

  const dates = useMemo(() => {
    const set = new Set<string>();
    cps.filter(r => r.entity === entity).forEach(r => set.add(r.date));
    secs.filter(r => r.entity === entity).forEach(r => set.add(r.date));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [cps, secs, entity]);




  const deletePeriod = (d: string) => {
    if (!window.confirm(`Delete ALL production data (counterparties + securities) for ${entity} — ${d}?`)) return;
    setData(prev => ({
      ...prev,
      prodCounterparties: (prev.prodCounterparties || []).filter(r => !(r.entity === entity && r.date === d)),
      prodSecurities: (prev.prodSecurities || []).filter(r => !(r.entity === entity && r.date === d)),
    }));
  };

  // --- Controls tab state ---
  const [openFinding, setOpenFinding] = useState<number | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [dateSel, setDateSel] = useState('');
  const date = dates.includes(dateSel) ? dateSel : dates[0] || '';
  const prevDates = dates.filter(d => d < date);
  const [compareSel, setCompareSel] = useState('');
  const compare = prevDates.includes(compareSel) ? compareSel : prevDates[0] || '';

  const findings = useMemo(() => {
    if (!entity || !date) return [];
    const out: ControlFinding[] = [];
    if (compare) {
      out.push(...runCounterpartyDrift(cps, entity, compare, date));
      out.push(...runSecurityDrift(secs, entity, compare, date));
    }
    out.push(...runCrossDataset(cps, entity, date));
    out.push(...runSecurityVsRef(secs, refs, entity, date));
    out.push(...runOrphans(cps, entity, date));
    const order = { error: 0, warning: 1, info: 2 };
    return out.sort((a, b) => order[a.severity] - order[b.severity] || a.control.localeCompare(b.control));
  }, [cps, secs, refs, entity, date, compare]);

  // Decision log: findings already validated/corrected are hidden until the
  // underlying values change again (the signature embeds the message).
  const logs = data.prodFindingLogs || [];
  const sig = (f: ControlFinding) => `${entity}|${date}|${compare}|${f.control}|${f.key}|${f.message}`;
  const logOf = (f: ControlFinding) => logs.find(l => l.signature === sig(f));
  const activeFindings = useMemo(() => findings.filter(f => !logOf(f)), [findings, logs]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownFindings = showResolved ? findings : activeFindings;

  const decide = (f: ControlFinding, decision: 'validated' | 'corrected') => {
    const note = window.prompt(
      decision === 'corrected'
        ? `Correction done for ${f.key} — describe the decision (e.g. "kept GroupLEXId = LEX-EFG, UPDATE run on load 1002"):`
        : `Validate ${f.key} as correct — optional note (e.g. "rating genuinely changed after review"):`,
      '');
    if (note === null) return;
    setData(prev => ({
      ...prev,
      prodFindingLogs: [...(prev.prodFindingLogs || []), {
        id: Date.now(), entity, date, compareDate: compare || undefined,
        control: f.control, findingKey: f.key, signature: sig(f),
        decision, note: note || undefined,
        decidedBy: currentUser.name, decidedAt: new Date().toISOString(),
      }],
    }));
  };
  const reopen = (logId: number) => {
    if (!window.confirm('Reopen this finding (delete the decision from the log)?')) return;
    setData(prev => ({ ...prev, prodFindingLogs: (prev.prodFindingLogs || []).filter(l => l.id !== logId) }));
  };
  const entityLogs = useMemo(() =>
    logs.filter(l => l.entity === entity).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)), [logs, entity]);

  const counts = useMemo(() => ({
    error: activeFindings.filter(f => f.severity === 'error').length,
    warning: activeFindings.filter(f => f.severity === 'warning').length,
    info: activeFindings.filter(f => f.severity === 'info').length,
  }), [activeFindings]);

  const periodRows = useMemo(() => dates.map(d => ({
    date: d,
    byDataset: PROD_DATASETS.map(ds => cps.filter(r => r.entity === entity && r.date === d && r.dataset === ds.key).length),
    securities: secs.filter(r => r.entity === entity && r.date === d).length,
  })), [dates, cps, secs, entity]);

  return (
    <div className="space-y-6">
      <BackButton />
      <PageHeader
        title="Production"
        subtitle="Team production aid — period-over-period consistency controls on the counterparty datasets, the security master and the Grouplexid guarantee/HQLA reference."
      />
      <div className="flex flex-wrap items-center gap-3">
        <TabButton label="Prerequisites" isActive={tab === 'prereq'} onClick={() => setTab('prereq')} />
        <TabButton label={`Controls${counts.error > 0 ? ` (${counts.error} ⚠)` : ''}`} isActive={tab === 'controls'} onClick={() => setTab('controls')} />
        <TabButton label="Adjustments" isActive={tab === 'adjust'} onClick={() => setTab('adjust')} />
        <div className="ml-auto">
          <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Entity</label>
          <select value={entity} onChange={e => setEntitySel(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
            {entities.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-status-red bg-status-red/10 border border-status-red/30 rounded-md px-4 py-2">{error}</p>}
      {notice && (
        <p className="text-sm text-brand-text-primary bg-brand-bg-body border border-efg-line rounded-md px-4 py-2 flex justify-between items-center">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-brand-text-secondary hover:text-brand-text-primary ml-4">×</button>
        </p>
      )}

      {tab === 'prereq' && (
        <>
          <MercuryCard entity={entity} onLoaded={m => { setNotice(m); setError(null); }} onError={m => setError(m)} />
          <Card>
            <SectionHeader title="Loaded periods" suffix={entity} />
            {periodRows.length === 0 ? (
              <p className="text-sm text-brand-text-secondary">No production data yet for {entity} — import the CSVs above.</p>
            ) : (
              <div className="overflow-x-auto border border-efg-line rounded-lg">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-brand-bg-body"><tr>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Date</th>
                    {PROD_DATASETS.map(d => <th key={d.key} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{d.label}</th>)}
                    <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Securities</th>
                    <th />
                  </tr></thead>
                  <tbody>
                    {periodRows.map(p => (
                      <tr key={p.date} className="border-t border-efg-line">
                        <td className="px-3 py-1.5 font-semibold">{p.date}</td>
                        {p.byDataset.map((n, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums">{n || '—'}</td>)}
                        <td className="px-3 py-1.5 text-right tabular-nums">{p.securities || '—'}</td>
                        <td className="px-3 py-1.5 text-right"><button onClick={() => deletePeriod(p.date)} className="text-status-red/70 hover:text-status-red underline">delete</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'adjust' && (
        <AdjustmentsCard entity={entity} onNotice={m => { setNotice(m); setError(null); }} onError={m => setError(m)} />
      )}

      {tab === 'controls' && (
        <Card>
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <SectionHeader title="Consistency controls" suffix={`${entity} — treatment must stay identical over time and vs the reference`} />
            <div className="ml-auto flex gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Period</label>
                <select value={date} onChange={e => setDateSel(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white">
                  {dates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Compare with</label>
                <select value={compare} onChange={e => setCompareSel(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white">
                  {prevDates.length === 0 && <option value="">— none —</option>}
                  {prevDates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mb-4 text-[12px] font-semibold">
            <span className={`px-3 py-1 rounded-full border ${SEV_STYLE.error}`}>{counts.error} errors</span>
            <span className={`px-3 py-1 rounded-full border ${SEV_STYLE.warning}`}>{counts.warning} warnings</span>
            <span className={`px-3 py-1 rounded-full border ${SEV_STYLE.info}`}>{counts.info} info (new / disappeared)</span>
            <button onClick={() => setShowResolved(v => !v)}
              className={`px-3 py-1 rounded-full border transition-colors ${showResolved ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-white text-brand-text-secondary border-gray-300 hover:border-brand-secondary'}`}>
              {findings.length - activeFindings.length} resolved {showResolved ? '(shown)' : '(hidden)'}
            </button>
          </div>
          {dates.length === 0 ? (
            <p className="text-sm text-brand-text-secondary">No production data for {entity} — load the Prerequisites first.</p>
          ) : shownFindings.length === 0 ? (
            <p className="text-sm text-brand-text-primary bg-status-green/10 border border-status-green/30 rounded-md px-4 py-3">
              ✓ No open finding for {date}{compare ? ` vs ${compare}` : ''}{findings.length > 0 ? ` — ${findings.length} decided (see resolved / history below)` : ' — same treatment across periods, datasets and the reference'}.
            </p>
          ) : (
            <div className="overflow-x-auto border border-efg-line rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-brand-bg-body"><tr>
                  {['Control', 'Severity', 'Dataset', 'Key', 'Finding'].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {shownFindings.map((f, i) => {
                    const isSec = f.control.startsWith('C3') || f.control.startsWith('C4');
                    const detail = isSec
                      ? secs.filter(r => r.entity === entity && (r.date === date || r.date === compare) && r.isin === f.key)
                      : cps.filter(r => r.entity === entity && (r.date === date || r.date === compare) && (r.clientNumber === f.key || r.groupLexId === f.key));
                    return (
                      <React.Fragment key={i}>
                        <tr onClick={() => setOpenFinding(openFinding === i ? null : i)}
                          className={`border-t border-efg-line align-top cursor-pointer hover:bg-brand-bg-body/50 ${logOf(f) ? 'opacity-50' : ''}`}
                          title="Click to show the underlying records">
                          <td className="px-3 py-1.5 whitespace-nowrap font-semibold">{f.control}</td>
                          <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${SEV_STYLE[f.severity]}`}>{f.severity}</span></td>
                          <td className="px-3 py-1.5 whitespace-nowrap text-brand-text-secondary">{f.dataset || '—'}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap font-semibold">{openFinding === i ? '▾ ' : '▸ '}{f.key}</td>
                          <td className="px-3 py-1.5">{f.message}</td>
                        </tr>
                        {openFinding === i && (
                          <tr className="border-t border-efg-line bg-brand-bg-body/40">
                            <td colSpan={5} className="px-4 py-2">
                              {detail.length === 0 ? (
                                <p className="text-[11px] text-brand-text-secondary">No underlying records on the two selected periods.</p>
                              ) : (
                                <table className="text-[11px] w-full">
                                  <thead><tr>
                                    {(isSec
                                      ? ['Date', 'ISIN', 'Security master', 'Type', 'Rating', 'Daily reval', 'Issuer lexid', 'Guarantor', 'HQLA', 'Amount']
                                      : ['Date', 'Dataset', 'Client', 'Client type', 'Grouplexid', 'Cpty type', 'Rating', 'Amount', 'Ccy']
                                    ).map(h => <th key={h} className="px-2 py-1 text-left text-[9px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
                                  </tr></thead>
                                  <tbody>
                                    {isSec
                                      ? (detail as typeof secs).sort((a, b) => a.date.localeCompare(b.date)).map(r => (
                                        <tr key={r.id} className="border-t border-efg-line/60">
                                          <td className="px-2 py-1 font-semibold">{r.date}</td><td className="px-2 py-1">{r.isin}</td>
                                          <td className="px-2 py-1">{r.securityMaster || '—'}</td><td className="px-2 py-1">{r.securityType || '—'}</td>
                                          <td className="px-2 py-1">{r.rating || '—'}</td><td className="px-2 py-1">{r.dailyReval === undefined ? '—' : String(r.dailyReval)}</td>
                                          <td className="px-2 py-1">{r.issuerLexId || '—'}</td><td className="px-2 py-1">{r.guarantorName || r.guarantorLexId || '—'}</td>
                                          <td className="px-2 py-1 font-semibold">{r.hqlaLevel || '—'}</td>
                                          <td className="px-2 py-1 text-right tabular-nums">{r.amount?.toFixed(1) ?? '—'}</td>
                                        </tr>))
                                      : (detail as typeof cps).sort((a, b) => a.date.localeCompare(b.date) || a.dataset.localeCompare(b.dataset)).map(r => (
                                        <tr key={r.id} className="border-t border-efg-line/60">
                                          <td className="px-2 py-1 font-semibold">{r.date}</td>
                                          <td className="px-2 py-1">{PROD_DATASETS.find(d => d.key === r.dataset)?.label || r.dataset}</td>
                                          <td className="px-2 py-1">{r.clientNumber}</td><td className="px-2 py-1">{r.clientType || '—'}</td>
                                          <td className="px-2 py-1">{r.groupLexId || '—'}</td><td className="px-2 py-1">{r.counterpartyType || '—'}</td>
                                          <td className="px-2 py-1">{r.issuerRating || '—'}</td>
                                          <td className="px-2 py-1 text-right tabular-nums">{r.amount?.toFixed(1) ?? '—'}</td>
                                          <td className="px-2 py-1">{r.currency || '—'}</td>
                                        </tr>))}
                                  </tbody>
                                </table>
                              )}
                              {(() => { const l = logOf(f); return l ? (
                                <p className="text-[11px] text-brand-text-secondary mt-2 border-t border-efg-line pt-2">
                                  {l.decision === 'validated' ? '✓ Validated' : '🔧 Corrected'} by <strong>{l.decidedBy}</strong> on {l.decidedAt.slice(0, 16).replace('T', ' ')}{l.note ? ` — ${l.note}` : ''}
                                  <button onClick={() => reopen(l.id)} className="ml-3 underline text-status-red/70 hover:text-status-red">reopen</button>
                                </p>
                              ) : (
                                <div className="flex gap-2 mt-2 border-t border-efg-line pt-2">
                                  <button onClick={() => decide(f, 'validated')}
                                    className="text-[11px] font-semibold border border-status-green text-status-green hover:bg-status-green hover:text-white py-1 px-2.5 rounded-md transition-colors">
                                    ✓ Validate as correct
                                  </button>
                                  <button onClick={() => decide(f, 'corrected')}
                                    className="text-[11px] font-semibold border border-brand-secondary text-brand-secondary hover:bg-brand-secondary hover:text-white py-1 px-2.5 rounded-md transition-colors">
                                    🔧 Mark corrected (with decision)
                                  </button>
                                </div>
                              ); })()}
                              {detail.length > 0 && !logOf(f) && !f.control.startsWith('C5') && (
                                <CorrectionHelper kind={isSec ? 'sec' : 'cpty'}
                                  rows={detail as unknown as Array<Record<string, unknown>>} keyValue={f.key} />
                              )}
                              {!logOf(f) && f.control.startsWith('C5') && (
                                <OrphanInsertHelper keyValue={f.key} periodDate={date} />
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-brand-text-secondary mt-3">
            C1 — attribute drift per client between the two periods (client type, grouplexid, counterparty type, rating).
            C2 — the same client number must carry one single treatment across all datasets of the period (grouplexid = ultimate parent, legitimately shared within a group). Click a finding to see the underlying records of both periods.
            C3 — security attribute drift per ISIN (HQLA level change = error).
            C4 — guarantor & HQLA level vs the Grouplexid reference (physical data must match the HQLA report treatment).
            C5 — orphan positions: the counterparty resolved by the MERCURY feed (issuer for securities) was not found in list_counterparties at the load PIT.
          </p>
          {entityLogs.length > 0 && (
            <div className="mt-5">
              <SectionHeader title="Decision history" suffix={`${entityLogs.length} logged decision(s) — ${entity}`} />
              <div className="overflow-x-auto border border-efg-line rounded-lg">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-brand-bg-body"><tr>
                    {['Decided at', 'By', 'Control', 'Key', 'Period', 'Decision', 'Note', ''].map((h, hi) => <th key={hi} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {entityLogs.map(l => (
                      <tr key={l.id} className="border-t border-efg-line">
                        <td className="px-3 py-1.5 tabular-nums">{l.decidedAt.slice(0, 16).replace('T', ' ')}</td>
                        <td className="px-3 py-1.5">{l.decidedBy}</td>
                        <td className="px-3 py-1.5 font-semibold">{l.control}</td>
                        <td className="px-3 py-1.5">{l.findingKey}</td>
                        <td className="px-3 py-1.5">{l.date}{l.compareDate ? ` vs ${l.compareDate}` : ''}</td>
                        <td className="px-3 py-1.5">{l.decision === 'validated' ? '✓ validated' : '🔧 corrected'}</td>
                        <td className="px-3 py-1.5 whitespace-normal max-w-md text-brand-text-secondary">{l.note || '—'}</td>
                        <td className="px-3 py-1.5"><button onClick={() => reopen(l.id)} className="underline text-status-red/70 hover:text-status-red">reopen</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default ProductionPage;
