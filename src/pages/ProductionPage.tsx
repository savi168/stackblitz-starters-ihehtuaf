import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { BackButton, Card, EmptyState, PageHeader, SectionHeader } from '../components';
import {
  ControlFinding, PROD_DATASETS, runCounterpartyDrift, runCrossDataset,
  runOrphans, runSecurityDrift, runSecurityVsRef,
} from '../services/productionControls';
import type { AdjustmentLine, AdjustmentMappings, MatchCandidate } from '../services/adjustments';
import { hfmKeyOf } from '../services/hfm';

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

/** Trigger the MERCURY-side feed (TVF) for a loadid + product type. When the
 * Scope step picked a load collection, its loads are preset and one click
 * feeds both targets for every load of the collection. */
const MercuryCard: React.FC<{
  entity: string; presetLoadIds?: string[];
  onLoaded: (msg: string) => void; onError: (msg: string) => void;
}> =
  ({ entity, presetLoadIds, onLoaded, onError }) => {
    const { mode, apiBaseUrl, reload } = useData();
    const [target, setTarget] = useState<'counterparties' | 'securities'>('counterparties');
    const [loadId, setLoadId] = useState('');
    const [loads, setLoads] = useState<Array<{ loadId: number | string; reportingDate: string; name?: string | null }>>([]);
    const [productType, setProductType] = useState('');
    const [busy, setBusy] = useState(false);
    const [showManual, setShowManual] = useState(false);

    useEffect(() => {
      if (mode !== 'api') return;
      fetch(`${apiBaseUrl}/production/mercury/loads`, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : []))
        .then(l => setLoads(Array.isArray(l) ? l : []))
        .catch(() => setLoads([]));
    }, [mode, apiBaseUrl]);

    // Collection loads preset by the Scope step.
    useEffect(() => {
      if (presetLoadIds && presetLoadIds.length > 0) setLoadId(presetLoadIds[0]);
    }, [presetLoadIds]);

    if (mode !== 'api') {
      return (
        <Card>
          <SectionHeader title="Feed from MERCURY" suffix="requires the API backend" />
          <p className="text-sm text-brand-text-secondary">
            Connect the app to the .NET backend to trigger the MERCURY TVF feed (loadid + product type) —
            see docs/MERCURY_INTEGRATION.md.
          </p>
        </Card>
      );
    }

    const feedOne = async (tgt: 'counterparties' | 'securities', id: string) => {
      const res = await fetch(`${apiBaseUrl}/production/mercury/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target: tgt, entity, date: '', loadId: id, productType: productType || null }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`);
      }
      return await res.json() as { inserted: number; skipped: number; tvf: string; date: string };
    };

    const run = async () => {
      if (!loadId) { onError('MERCURY feed: loadid is required.'); return; }
      setBusy(true);
      try {
        const out = await feedOne(target, loadId);
        await reload();
        onLoaded(`MERCURY feed OK: ${out.inserted} row(s) loaded into ${target} for ${entity} — ${out.date} (loadid ${loadId}${productType ? `, ${productType}` : ''}) via ${out.tvf}${out.skipped ? ` · ${out.skipped} row(s) without key skipped` : ''}.`);
      } catch (err) {
        onError(`MERCURY feed failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally { setBusy(false); }
    };

    // One click: both targets × every load of the collection.
    const runAll = async () => {
      if (!presetLoadIds || presetLoadIds.length === 0) return;
      setBusy(true);
      try {
        const parts: string[] = [];
        for (const id of presetLoadIds) {
          for (const tgt of ['counterparties', 'securities'] as const) {
            const out = await feedOne(tgt, id);
            parts.push(`${tgt} ${out.inserted} row(s) for ${out.date} (load ${id})`);
          }
        }
        await reload();
        onLoaded(`MERCURY feed OK — ${parts.join(' · ')}.`);
      } catch (err) {
        onError(`MERCURY feed failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally { setBusy(false); }
    };

    const input = 'p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary';
    return (
      <Card>
        <SectionHeader title="Feed from MERCURY" suffix="the TVF replaces the period's data, then run the controls" />
        {presetLoadIds && presetLoadIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-3 border border-brand-secondary/40 bg-brand-secondary/5 rounded-lg px-3 py-2">
            <span className="text-sm text-brand-text-primary">
              Collection scope — load(s) <strong>{presetLoadIds.join(', ')}</strong>
            </span>
            <button onClick={runAll} disabled={busy}
              className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-1.5 px-4 rounded-md transition-colors disabled:opacity-50">
              {busy ? 'Loading…' : '⚡ Feed counterparties + securities'}
            </button>
            <span className="text-[11px] text-brand-text-secondary">everything the controls need, in one click</span>
            <button onClick={() => setShowManual(v => !v)}
              className="ml-auto text-[11px] underline text-brand-text-secondary hover:text-brand-primary">
              {showManual ? 'hide advanced' : 'advanced: one target / another loadid'}
            </button>
          </div>
        )}
        {(showManual || !presetLoadIds || presetLoadIds.length === 0) && (<>
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
        </>)}
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
const AdjustmentsCard: React.FC<{
  entity: string; presetCollectionId?: string;
  onNotice: (m: string) => void; onError: (m: string) => void;
}> =
  ({ entity, presetCollectionId, onNotice, onError }) => {
    const { mode, apiBaseUrl, data, setData, currentUser } = useData();
    const [mappings, setMappings] = useState<AdjustmentMappings | null>(null);
    const [mappingInfo, setMappingInfo] = useState('');
    const [mappingFile, setMappingFile] = useState<File | null>(null);
    const [lines, setLines] = useState<AdjustmentLine[]>([]);
    const [linesInfo, setLinesInfo] = useState('');
    const [loads, setLoads] = useState<Array<{ loadId: number | string; reportingDate: string; name?: string | null }>>([]);
    const [collections, setCollections] = useState<Array<{
      loadCollectionId: number | string; name?: string | null; reportingDate?: string | null;
      reportingEntityId?: string | null; isMaster?: boolean; loadIds: Array<number | string>;
    }>>([]);
    const [collectionSel, setCollectionSel] = useState('');
    const [loadId, setLoadId] = useState('');
    const [busy, setBusy] = useState(false);
    const [results, setResults] = useState<Record<number, MatchCandidate[]> | null>(null);
    const [chosen, setChosen] = useState<Record<number, string>>({});
    const [scripts, setScripts] = useState<Record<number, string>>({});
    const [manual, setManual] = useState({ ligne: '', montant: '', ccy: 'CHF', nominal: '', reference: '', client: '', ind: '', libelle: '' });
    const [manualScript, setManualScript] = useState('');
    const [bookingCenter, setBookingCenter] = useState('');
    const [genericCpty, setGenericCpty] = useState(false);
    const [genericRating, setGenericRating] = useState('');
    const [expandedRow, setExpandedRow] = useState<number | null>(null);
    const [adjFilter, setAdjFilter] = useState<'' | 'matched' | 'ambiguous' | 'new'>('');
    // New-position form (no-match lines): the few fields that matter, editable
    // per line — everything else keeps neutral defaults / generic referential.
    const [rowOverrides, setRowOverrides] = useState<Record<number, { legalAccountNumber?: string; typeOf?: string; subType?: string; maturityDate?: string }>>({});
    const setOverride = (row: number, field: string, value: string) => {
      setRowOverrides(prev => ({ ...prev, [row]: { ...prev[row], [field]: value } }));
      setScripts(prev => { const n = { ...prev }; delete n[row]; return n; });
    };
    const [baseRows, setBaseRows] = useState<Array<{ account?: string; prefix: string; bookingCenterId: string; counterpartyBookingCenterId: string; amount: number }> | null>(null);
    const [gaapAdj, setGaapAdj] = useState<'swiss' | 'ifrs'>('swiss');
    const [conso, setConso] = useState<{
      entities: Array<{ id: string; name?: string; bankOffice?: boolean; parentCompany?: boolean; consoGroup?: boolean }>;
      sets: Record<string, string[]>;
      bcNames: Record<string, string>;
    } | null>(null);
    const [scopeSel, setScopeSel] = useState('');
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
      fetch(`${apiBaseUrl}/production/mercury/load-collections`, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : []))
        .then(l => setCollections(Array.isArray(l) ? l.map(c => ({ ...c, loadIds: Array.isArray(c.loadIds) ? c.loadIds : [] })) : []))
        .catch(() => setCollections([]));
      // Conso referential fetched up front: the collection's reporting entity
      // resolves to a scope immediately, so eliminations show right away.
      fetch(`${apiBaseUrl}/production/mercury/conso`, { credentials: 'include' })
        .then(r => (r.ok ? r.json() : null))
        .then(out => {
          if (!out) return;
          const sets: Record<string, string[]> = {};
          for (const s of out.sets || []) (sets[String(s.reportingEntityId)] ??= []).push(String(s.bookingCenterId));
          const bcNames: Record<string, string> = {};
          for (const b of out.bookingCenters || []) bcNames[String(b.id)] = String(b.name ?? '');
          setConso({
            entities: (out.entities || []).map((e: { id: unknown; name?: unknown; bankOffice?: unknown; parentCompany?: unknown; consoGroup?: unknown }) => ({
              id: String(e.id), name: e.name ? String(e.name) : undefined,
              bankOffice: e.bankOffice === true, parentCompany: e.parentCompany === true, consoGroup: e.consoGroup === true,
            })),
            sets, bcNames,
          });
        })
        .catch(() => { /* conso referential unavailable — scope selector empty */ });
    }, [mode, apiBaseUrl]);

    // Mappings persisted in the RegReport database (ProdMappingEntries):
    // loaded automatically so the workbook is not re-uploaded every session.
    const storedMappings = data.prodMappingEntries || [];
    useEffect(() => {
      if (mappings || storedMappings.length === 0) return;
      import('../services/adjustments').then(svc => {
        setSvcMod(svc);
        const m = svc.entriesToMappings(storedMappings);
        setMappings(m);
        setMappingInfo(`database — ${m.gl.size} GL lines, ${m.fx.size} FX rates, ${m.rt01.size} RT01→QDL, ${m.industry.size} industry codes`);
      });
    }, [storedMappings.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const saveMappings = async () => {
      if (!mappings) return;
      const svc = await import('../services/adjustments');
      const entries = svc.mappingsToEntries(mappings);
      setData(prev => ({ ...prev, prodMappingEntries: entries }));
      onNotice(`Mappings saved to the database (${entries.length} rows in ProdMappingEntries) — no re-upload needed next session; re-upload the workbook and save again to update (e.g. new CCY rates).`);
    };

    // Keep the workbook FILE itself in the Library (versioned, downloadable
    // by the team) — the relational save above only stores the lookups.
    const storeInLibrary = async () => {
      if (!mappingFile || mode !== 'api') return;
      try {
        const form = new FormData();
        form.append('File', mappingFile);
        form.append('Folder', 'Production/Mappings');
        form.append('Title', `Mapping workbook — uploaded ${new Date().toISOString().slice(0, 10)}`);
        form.append('Kind', 'mapping');
        const res = await fetch(`${apiBaseUrl}/documents`, { method: 'POST', credentials: 'include', body: form });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        onNotice(`${mappingFile.name} stored in the Library (folder Production/Mappings).`);
      } catch (err) {
        onError(`Library upload failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    const collection = useMemo(() =>
      collections.find(c => String(c.loadCollectionId) === collectionSel) || null, [collections, collectionSel]);
    const collLoadIds = useMemo(() => (collection?.loadIds || []).map(String), [collection]);

    // The page-level reporting entity drives the view: collections filtered
    // on it, and the conso scope defaults to it.
    const [showAllCollections, setShowAllCollections] = useState(false);
    const visibleCollections = useMemo(() => {
      const mine = collections.filter(c => String(c.reportingEntityId ?? '') === entity);
      return showAllCollections || mine.length === 0 ? collections : mine;
    }, [collections, entity, showAllCollections]);
    useEffect(() => {
      if (conso?.sets[entity]) setScopeSel(entity);
    }, [entity, conso]);

    const pickCollection = (c: typeof collections[number]) => {
      setCollectionSel(String(c.loadCollectionId));
      setBaseRows(null);
      const ids = (c.loadIds || []).map(String);
      if (ids.length > 0) setLoadId(ids[0]);
      // The collection's reporting entity IS the consolidation level.
      setScopeSel(c.reportingEntityId ? String(c.reportingEntityId) : '');
    };

    // Collection preset by the Scope step: apply it once the list arrives.
    useEffect(() => {
      if (!presetCollectionId || collectionSel || collections.length === 0) return;
      const c = collections.find(x => String(x.loadCollectionId) === presetCollectionId);
      if (c) pickCollection(c);
    }, [presetCollectionId, collections]); // eslint-disable-line react-hooks/exhaustive-deps

    const reportingDate = useMemo(() => {
      if (collection?.reportingDate) return String(collection.reportingDate).slice(0, 10);
      const l = loads.find(x => String(x.loadId) === loadId);
      return l ? String(l.reportingDate).slice(0, 10) : '';
    }, [collection, loads, loadId]);

    const onMappingFile = async (f: File | undefined) => {
      if (!f) return;
      try {
        const svc = await import('../services/adjustments');
        setSvcMod(svc);
        const m = svc.parseMappingWorkbook(await f.arrayBuffer());
        setMappingFile(f);
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
      if (!mappings || lines.length === 0 || (!loadId && collLoadIds.length === 0)) { onError('Adjustments: mappings, adjustments file and a load collection (or loadid) are all required.'); return; }
      setBusy(true);
      try {
        const svc = await import('../services/adjustments');
        const res = await fetch(`${apiBaseUrl}/production/mercury/adjustments/match`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            loadId,
            loadIds: collLoadIds.length > 0 ? collLoadIds : undefined,
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
        setResults(map); setChosen(pre); setScripts({}); setExpandedRow(null);
        const total = lines.length;
        const none = lines.filter(l => (map[l.row] || []).length === 0).length;
        const auto = Object.keys(pre).length;
        const target = collection ? `collection ${collection.loadCollectionId} (${collLoadIds.length} load(s))` : `load ${loadId}`;
        onNotice(`Matching done on ${target}: ${auto}/${total} line(s) resolved automatically, ${total - auto - none} to disambiguate, ${none} without match (new position).`);
        // Surface the consolidated impact right away — the point of the whole
        // exercise is to see the balance sheet move.
        if (!showImpact) void toggleImpact();
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
        : svc.buildNewPositionPackage(line, loadId, reportingDate || new Date().toISOString().slice(0, 10), mappings,
            { ...buildOpts(), overrides: rowOverrides[line.row] });
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
      const ready: Array<{ line: AdjustmentLine; cand: MatchCandidate | null; overrides?: typeof rowOverrides[number] }> = [];
      let pending = 0;
      for (const l of lines) {
        const cands = results[l.row] || [];
        const cand = cands.find(c => c.id === chosen[l.row]) || null;
        if (cands.length > 0 && !cand) pending += 1;
        else ready.push({ line: l, cand, overrides: rowOverrides[l.row] });
      }
      return { ready, pending };
    }, [results, lines, chosen, rowOverrides]);

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

    const buildOpts = () => ({
      bookingCenterId: bookingCenter.trim() || undefined,
      genericCounterparty: genericCpty || undefined,
      genericRating: genericRating.trim() || undefined,
    });

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

    // Balance-sheet impact preview: base balance of the load (LEFT3 ×
    // booking center aggregate from MERCURY) + adjustment deltas per prefix,
    // optionally restricted to a consolidation scope (list_reporting_sets)
    // with intra-scope intercompany eliminations.
    const toggleImpact = async () => {
      if (showImpact) { setShowImpact(false); return; }
      setShowImpact(true);
      if (!baseRows && (loadId || collLoadIds.length > 0)) {
        try {
          const qs = collLoadIds.length > 0
            ? `loadIds=${encodeURIComponent(collLoadIds.join(','))}`
            : `loadId=${encodeURIComponent(loadId)}`;
          const r = await fetch(`${apiBaseUrl}/production/mercury/balance?${qs}`, { credentials: 'include' });
          if (r.ok) {
            const arr = await r.json() as Array<{ account?: string; prefix: string; bookingCenterId: string; counterpartyBookingCenterId: string; amount: number }>;
            setBaseRows(arr.filter(b => b.prefix));
          }
        } catch { /* base unavailable — deltas shown alone */ }
      }
    };

    const scopeSet = useMemo(() => {
      if (!scopeSel || !conso) return null;
      return new Set((conso.sets[scopeSel] || []).map(s => s.trim()));
    }, [scopeSel, conso]);

    const impactByAccount = useMemo(() => {
      if (!svcMod || !mappings || lines.length === 0) return null;
      const items = lines.map(l => {
        const cands = results?.[l.row] || [];
        return { line: l, cand: cands.find(c => c.id === chosen[l.row]) || null };
      });
      return svcMod.computeImpactByAccount(items, mappings, { bookingCenterId: bookingCenter.trim() || undefined }, scopeSet);
    }, [svcMod, mappings, lines, results, chosen, bookingCenter, scopeSet]);

    // View key of a MERCURY account: Swiss GAAP = LEFT-3 rubrique; IFRS = the
    // HFM account (direct mapping, else the prefix fallback rules).
    const viewKeyOf = (account: string): string | null => {
      if (gaapAdj === 'swiss') return account.slice(0, 3) || '???';
      if (!/^[12]/.test(account)) return null; // IFRS view: balance sheet only
      return svcMod && mappings ? svcMod.hfmOf(account, mappings) : account;
    };

    // Impact regrouped for the selected GAAP.
    const impact = useMemo(() => {
      if (!impactByAccount) return null;
      const per = new Map<string, { gross: number; eliminated: number; net: number; lines: number }>();
      for (const [account, e] of impactByAccount.perAccount) {
        const key = viewKeyOf(account);
        if (key === null) continue;
        const t = per.get(key) ?? { gross: 0, eliminated: 0, net: 0, lines: 0 };
        t.gross += e.gross; t.eliminated += e.eliminated; t.net += e.net; t.lines += e.lines;
        per.set(key, t);
      }
      return { perPrefix: per, outOfScope: impactByAccount.outOfScope };
    }, [impactByAccount, gaapAdj, svcMod, mappings]); // eslint-disable-line react-hooks/exhaustive-deps

    // Base per view key, scope-filtered: amounts booked outside the scope
    // drop out; intra-scope interco amounts are the base eliminations.
    const baseAgg = useMemo(() => {
      if (!baseRows) return null;
      const per: Record<string, { amount: number; eliminated: number }> = {};
      for (const b of baseRows) {
        if (scopeSet && b.bookingCenterId && !scopeSet.has(b.bookingCenterId)) continue;
        const key = viewKeyOf(b.account || b.prefix);
        if (key === null) continue;
        const e = (per[key] ??= { amount: 0, eliminated: 0 });
        e.amount += b.amount;
        if (scopeSet && b.counterpartyBookingCenterId && scopeSet.has(b.counterpartyBookingCenterId)) e.eliminated += b.amount;
      }
      return per;
    }, [baseRows, scopeSet, gaapAdj, svcMod, mappings]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const stepTitle = 'text-[11px] uppercase tracking-[0.12em] font-bold text-brand-primary mb-2';
    return (
      <Card>
        <SectionHeader title="Adjustments from accounting"
          suffix="pick a load collection (= consolidation level), match each line against core_positions, prepare the INSERTs — eliminations previewed before loading" />

        {/* What you need — at a glance. */}
        <div className="flex flex-wrap gap-2 mb-3 text-[11px] font-semibold">
          {([
            ['Mapping workbook', storedMappings.length > 0 || !!mappings, storedMappings.length > 0 ? 'stored in database' : mappings ? 'loaded this session' : 'upload Mapping.xlsb below (once) and 💾 save'],
            ['Adjustments file', lines.length > 0, lines.length > 0 ? `${lines.length} line(s)` : 'the accounting extract (LIGNE / REFERENCE / CLIENT / MONTANT…)'],
            ['Load collection', collLoadIds.length > 0 || !!loadId, collLoadIds.length > 0 ? `load(s) ${collLoadIds.join(', ')}` : 'from the Scope step, or a loadid below'],
          ] as Array<[string, boolean, string]>).map(([label, ok, hint]) => (
            <span key={label} title={hint}
              className={`px-2.5 py-1 rounded-full border ${ok
                ? 'border-status-green/40 bg-status-green/5 text-status-green'
                : 'border-status-amber/40 bg-status-amber/5 text-status-amber'}`}>
              {ok ? '✓' : '○'} {label}
            </span>
          ))}
          <span className="px-2.5 py-1 rounded-full border border-efg-line text-brand-text-secondary font-normal">
            Flow: files ready → 🔍 matching → pick candidates (or new/generic positions) → 📊 impact → one-shot .sql / Excel
          </span>
        </div>

        {/* 1 — Mappings (persisted in the RegReport database) */}
        <div className="border border-efg-line rounded-lg p-3 mb-3">
          <p className={stepTitle}>1 — Mappings {storedMappings.length > 0 ? '· stored in database' : '· not stored yet'}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Mapping workbook (Mapping.xlsb) — only to update</label>
              <input type="file" accept=".xlsb,.xlsx,.xls" onChange={e => onMappingFile(e.target.files?.[0])} className={fileBtn} />
            </div>
            {mappings && (
              <button onClick={saveMappings}
                className="text-[12px] font-semibold border border-brand-secondary text-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-3 rounded-md transition-colors">
                💾 Save to database
              </button>
            )}
            {mappingFile && mode === 'api' && (
              <button onClick={storeInLibrary}
                title="Keep the workbook file itself in the Library (folder Production/Mappings) so the team always finds the version in force"
                className="text-[12px] font-semibold border border-gray-300 text-brand-text-secondary hover:border-brand-secondary hover:text-brand-secondary py-1.5 px-3 rounded-md transition-colors">
                📚 Store workbook in Library
              </button>
            )}
          </div>
          {mappingInfo && <p className="text-[11px] text-status-green mt-1">✓ Mappings loaded from {mappingInfo}</p>}
          <p className="text-[11px] text-brand-text-secondary mt-1">
            GL and INDUSTRY are static; to refresh the CCY rates, re-upload the workbook and 💾 save again — stored relationally in ProdMappingEntries.
            Individual rows (a rate, an HFM rule…) are editable in place in Backend → Data Explorer → ProdMappingEntries (audited like any data change).
          </p>
        </div>

        {/* 2 — Adjustments file */}
        <div className="border border-efg-line rounded-lg p-3 mb-3">
          <p className={stepTitle}>2 — Accounting adjustments file</p>
          <input type="file" accept=".xlsx,.xls,.xlsb,.csv" onChange={e => onLinesFile(e.target.files?.[0])} className={fileBtn} />
          {linesInfo && <p className="text-[11px] text-status-green mt-1">✓ {linesInfo}</p>}
        </div>

        {/* 3 — Load collection (consolidation level) */}
        <div className="border border-efg-line rounded-lg p-3 mb-3">
          <p className={stepTitle}>
            3 — Load collection · filtered on reporting entity {entity}
            {collections.length > visibleCollections.length && (
              <button onClick={() => setShowAllCollections(true)} className="ml-2 underline text-brand-text-secondary font-normal normal-case tracking-normal">
                show all {collections.length}
              </button>
            )}
            {showAllCollections && (
              <button onClick={() => setShowAllCollections(false)} className="ml-2 underline text-brand-text-secondary font-normal normal-case tracking-normal">
                filter on {entity}
              </button>
            )}
          </p>
          {visibleCollections.length > 0 ? (
            <div className="overflow-x-auto border border-efg-line rounded-lg mb-2 max-h-44 overflow-y-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-brand-bg-body sticky top-0"><tr>
                  {['Collection', 'Name', 'Reporting date', 'Reporting entity (scope)', 'Loads', 'Master'].map(h =>
                    <th key={h} className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {visibleCollections.map(c => (
                    <tr key={String(c.loadCollectionId)} onClick={() => pickCollection(c)}
                      className={`border-t border-efg-line cursor-pointer hover:bg-brand-bg-body/60 ${String(c.loadCollectionId) === collectionSel ? 'bg-brand-secondary/10 font-semibold' : ''}`}>
                      <td className="px-3 py-1">{String(c.loadCollectionId) === collectionSel ? '● ' : ''}{String(c.loadCollectionId)}</td>
                      <td className="px-3 py-1">{c.name || ''}</td>
                      <td className="px-3 py-1">{c.reportingDate ? String(c.reportingDate).slice(0, 10) : ''}</td>
                      <td className="px-3 py-1">{c.reportingEntityId || '—'}</td>
                      <td className="px-3 py-1 text-brand-text-secondary">{(c.loadIds || []).join(', ') || '—'}</td>
                      <td className="px-3 py-1">{c.isMaster ? '★' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : loads.length > 0 && (
            <div className="overflow-x-auto border border-efg-line rounded-lg mb-2 max-h-40 overflow-y-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="bg-brand-bg-body sticky top-0"><tr>
                  {['Loadid (no collections found)', 'Reporting date', 'Name'].map(h =>
                    <th key={h} className="px-3 py-1.5 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
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
            {collLoadIds.length > 1 ? (
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Target load (new positions)</label>
                <select value={loadId} onChange={e => setLoadId(e.target.value)} className={input}>
                  {collLoadIds.map(id => <option key={id} value={id}>{id}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Loadid</label>
                <input value={loadId} onChange={e => { setLoadId(e.target.value); setBaseRows(null); }} placeholder="e.g. 1002" className={input} />
              </div>
            )}
            {reportingDate && <p className="text-sm text-brand-text-secondary pb-2">→ reporting date <strong>{reportingDate}</strong></p>}
            {collection?.reportingEntityId && (
              <p className="text-sm text-brand-text-secondary pb-2">
                → scope <strong>{collection.reportingEntityId}</strong>
                {scopeSet ? ` (${scopeSet.size} booking centers)` : ' (not in list_reporting_sets)'}
              </p>
            )}
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Booking center (new positions)</label>
              <input value={bookingCenter} onChange={e => setBookingCenter(e.target.value)} placeholder="BookingCenterId" className={input} />
            </div>
            <div className="pb-1">
              <label className="flex items-center gap-2 text-[12px] cursor-pointer"
                title="No-match lines: instead of creating one list_counterparties row per unknown CLIENT, book them on a shared generic counterparty per industry type (GEN-BANK, GEN-CORP…). The real client number is kept on the position in InternalReference2.">
                <input type="checkbox" checked={genericCpty} onChange={e => setGenericCpty(e.target.checked)} />
                Generic counterparty for unknown clients
              </label>
              {genericCpty && (
                <input value={genericRating} onChange={e => setGenericRating(e.target.value)}
                  placeholder="RatingClass (optional)" className="mt-1 p-1.5 border border-gray-200 rounded-md text-[11px] bg-white w-40" />
              )}
            </div>
          </div>
        </div>

        {/* 4 — Matching & impact */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <button onClick={runMatch} disabled={busy || !mappings || lines.length === 0 || (!loadId && collLoadIds.length === 0)}
            className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors disabled:opacity-50">
            {busy ? 'Matching…' : `🔍 Run matching${collection ? ` on collection ${collection.loadCollectionId}` : ''}`}
          </button>
          <button onClick={toggleImpact} disabled={!mappings || lines.length === 0}
            className={`text-sm font-semibold border py-2 px-4 rounded-md transition-colors disabled:opacity-50 ${showImpact ? 'bg-brand-secondary text-white border-brand-secondary' : 'border-brand-secondary text-brand-secondary hover:bg-brand-secondary hover:text-white'}`}>
            📊 Balance sheet impact{scopeSel ? ` — ${scopeSel}` : ''}
          </button>
        </div>

        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-4 xl:items-start">
        {showImpact && impact && mappings && (() => {
          const fmt = (n: number) => n.toLocaleString('en-CH', { maximumFractionDigits: 0 });
          const per = impact.perPrefix;
          const scoped = !!scopeSet;
          const prefixes = Array.from(new Set([...Object.keys(baseAgg || {}), ...per.keys()])).sort();
          const labelOf = (k: string) => gaapAdj === 'ifrs' ? mappings.hfmLabels.get(k) : mappings.accountLabels.get(k);
          const sections: Array<{ title: string; match: (p: string) => boolean }> = [
            { title: 'Assets', match: p => p.startsWith('1') },
            { title: 'Liabilities & equity', match: p => p.startsWith('2') },
            { title: gaapAdj === 'ifrs' ? 'Equity / other' : 'Off-balance / other', match: p => !p.startsWith('1') && !p.startsWith('2') },
          ];
          const levelsOf = (e: { bankOffice?: boolean; parentCompany?: boolean; consoGroup?: boolean }) =>
            [e.bankOffice ? 'BO' : '', e.parentCompany ? 'PC' : '', e.consoGroup ? 'GR' : ''].filter(Boolean).join('/');
          const deltaCls = (n: number) => n > 0 ? 'text-status-green' : n < 0 ? 'text-status-red' : 'text-brand-text-secondary';
          return (
            // Sticky on wide screens: the balance sheet stays in view while
            // you scroll through the adjustment lines — every pick updates it.
            <div className="xl:col-start-2 xl:row-start-1 xl:sticky xl:top-4 min-w-0 border border-efg-line rounded-lg mb-3 xl:mb-0 xl:max-h-[88vh] xl:overflow-y-auto bg-white dark:bg-transparent">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-efg-line bg-brand-bg-body/40 sticky top-0">
                <span className="inline-flex rounded-md border border-gray-300 overflow-hidden text-[11px] font-semibold">
                  {(['swiss', 'ifrs'] as const).map(g => (
                    <button key={g} onClick={() => setGaapAdj(g)}
                      className={`px-2 py-1 transition-colors ${gaapAdj === g ? 'bg-brand-primary text-white' : 'bg-white text-brand-text-secondary hover:text-brand-primary'}`}>
                      {g === 'swiss' ? 'SWISS GAAP' : 'IFRS (HFM)'}
                    </button>
                  ))}
                </span>
                <select value={scopeSel} onChange={e => setScopeSel(e.target.value)}
                  className="p-1 border border-gray-200 rounded-md text-[11px] bg-white max-w-[160px]">
                  <option value="">— no scope —</option>
                  {(conso?.entities || []).map(e => (
                    <option key={e.id} value={e.id}>{e.id}{levelsOf(e) ? ` (${levelsOf(e)})` : ''}</option>
                  ))}
                </select>
                {impact.outOfScope > 0 && (
                  <span className="text-[10px] text-status-amber font-semibold" title="Lines booked outside the reporting set — excluded from this consolidated view only; their INSERTs are unaffected.">
                    ⊘ {impact.outOfScope} out of scope
                  </span>
                )}
              </div>
              {gaapAdj === 'ifrs' && mappings.hfm.size === 0 && (
                <p className="text-[10px] text-status-amber font-semibold px-3 py-1.5 border-b border-efg-line">
                  ⚠ prefix fallback rules only — re-upload Mapping.xlsb + 💾 save for the account-level HFM mapping
                </p>
              )}
              <table className="w-full text-[11px] whitespace-nowrap">
                <thead className="bg-brand-bg-body"><tr>
                  {[gaapAdj === 'ifrs' ? 'HFM' : 'Acct', 'Base', 'Adj', 'After'].map((h, hi) =>
                    <th key={h} className={`px-2 py-1.5 text-[9px] uppercase tracking-wider text-brand-text-secondary font-semibold ${hi >= 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {sections.map(sec => {
                    const ps = prefixes.filter(sec.match);
                    if (ps.length === 0) return null;
                    let tBase = 0, tNet = 0;
                    return (
                      <React.Fragment key={sec.title}>
                        <tr className="border-t border-efg-line bg-brand-bg-body/60">
                          <td colSpan={4} className="px-2 py-1 font-semibold text-[10px] uppercase tracking-[0.08em] text-brand-text-secondary">{sec.title}</td>
                        </tr>
                        {ps.map(p => {
                          const b = baseAgg?.[p];
                          const baseNet = (b?.amount ?? 0) - (b?.eliminated ?? 0);
                          const d = per.get(p);
                          const gross = d?.gross ?? 0;
                          const elim = scoped ? (d?.eliminated ?? 0) : 0;
                          const net = scoped ? (d?.net ?? 0) : gross;
                          tBase += baseNet; tNet += net;
                          return (
                            <tr key={p} className={`border-t border-efg-line/60 ${net !== 0 ? 'font-semibold bg-brand-secondary/5' : ''}`}
                              title={`${labelOf(p) || p}${d ? ` — ${d.lines} line(s), gross ${fmt(gross)}${elim ? `, IC eliminated ${fmt(-elim)}` : ''}` : ''}`}>
                              <td className="px-2 py-1 max-w-[150px]">
                                <span className="font-semibold">{p}</span>
                                {labelOf(p) && <span className="block text-[9px] text-brand-text-secondary font-normal truncate leading-tight">{labelOf(p)}</span>}
                              </td>
                              <td className="px-2 py-1 text-right tabular-nums align-top">{baseAgg ? fmt(baseNet) : '—'}</td>
                              <td className={`px-2 py-1 text-right tabular-nums align-top ${deltaCls(net)}`}>{net === 0 ? '—' : fmt(net)}</td>
                              <td className="px-2 py-1 text-right tabular-nums align-top">{baseAgg ? fmt(baseNet + net) : '—'}</td>
                            </tr>
                          );
                        })}
                        <tr className="border-t border-efg-line font-semibold">
                          <td className="px-2 py-1">Total</td>
                          <td className="px-2 py-1 text-right tabular-nums">{baseAgg ? fmt(tBase) : '—'}</td>
                          <td className={`px-2 py-1 text-right tabular-nums ${deltaCls(tNet)}`}>{tNet === 0 ? '—' : fmt(tNet)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{baseAgg ? fmt(tBase + tNet) : '—'}</td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-brand-text-secondary px-3 py-2 border-t border-efg-line whitespace-normal">
                CHF, rounded. Each line is booked on its LIGNE's GL account — the match only supplies qualitative data. Hover a row for gross / IC-eliminated detail.
                {!baseAgg && ' Base unavailable — deltas only.'}
              </p>
            </div>
          );
        })()}

        <div className="xl:col-start-1 xl:row-start-1 min-w-0">
        {lines.length > 0 && results && (() => {
          const statusOf = (l: AdjustmentLine): 'matched' | 'ambiguous' | 'new' => {
            const cands = results[l.row] || [];
            if (cands.length === 0) return 'new';
            return chosen[l.row] ? 'matched' : 'ambiguous';
          };
          const nOf = (s: 'matched' | 'ambiguous' | 'new') => lines.filter(l => statusOf(l) === s).length;
          return (
            <div className="flex flex-wrap gap-2 mb-2 text-[11px] font-semibold">
              {([
                ['matched', `✓ ${nOf('matched')} matched`, 'text-status-green border-status-green/40'],
                ['ambiguous', `? ${nOf('ambiguous')} to disambiguate`, 'text-status-red border-status-red/40'],
                ['new', `✚ ${nOf('new')} new position(s)`, 'text-status-amber border-status-amber/40'],
              ] as Array<['matched' | 'ambiguous' | 'new', string, string]>).map(([key, label, cls]) => (
                <button key={key} onClick={() => setAdjFilter(adjFilter === key ? '' : key)}
                  className={`px-2.5 py-1 rounded-full border transition-colors ${cls} ${adjFilter === key ? 'ring-2 ring-brand-primary/30 bg-brand-bg-body' : 'bg-white hover:bg-brand-bg-body/60'}`}>
                  {label}
                </button>
              ))}
              <span className="px-2.5 py-1 text-brand-text-secondary font-normal">click a line to open its candidates</span>
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
                {lines.filter(l => {
                  if (!adjFilter || !results) return true;
                  const cands = results[l.row] || [];
                  const st = cands.length === 0 ? 'new' : chosen[l.row] ? 'matched' : 'ambiguous';
                  return st === adjFilter;
                }).map(l => {
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
                  // Scope view: is the line eliminated (interco inside the
                  // consolidation scope) or booked outside the scope?
                  const rawField = (raw: Record<string, unknown> | undefined, name: string): string => {
                    if (!raw) return '';
                    const k = Object.keys(raw).find(x => x.toLowerCase() === name.toLowerCase());
                    const v = k === undefined ? undefined : raw[k];
                    return v === null || v === undefined ? '' : String(v).trim();
                  };
                  const lineCbc = interco ?? (cand ? rawField(cand.raw, 'CounterpartyBookingCenterId') : '');
                  const lineBc = cand ? rawField(cand.raw, 'BookingCenterId') : bookingCenter.trim();
                  const scopeTag = !scopeSet ? null
                    : lineBc && !scopeSet.has(lineBc) ? { txt: `⊘ out of scope (${lineBc})`, cls: 'text-status-amber', tip: `Booked in ${lineBc}, outside the ${scopeSel} reporting set — excluded from the CONSOLIDATED impact preview only. The generated INSERT is not affected: it still copies the position's attributes as-is.` }
                    : lineCbc && scopeSet.has(lineCbc) ? { txt: `✂ eliminated in ${scopeSel} (IC ${lineCbc})`, cls: 'text-status-red', tip: `Faces the intra-scope group company ${lineCbc} — netted out of the CONSOLIDATED impact preview only. The generated INSERT is not affected.` }
                    : null;
                  return (
                    <React.Fragment key={l.row}>
                      <tr onClick={() => setExpandedRow(expandedRow === l.row ? null : l.row)}
                        className={`border-t border-efg-line align-top ${cands ? 'cursor-pointer hover:bg-brand-bg-body/50' : ''} ${expandedRow === l.row ? 'bg-brand-bg-body/40' : ''}`}>
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
                        <td className={`px-3 py-1.5 whitespace-nowrap ${statusCls}`}>
                          {cands ? (expandedRow === l.row ? '\u25be ' : '\u25b8 ') : ''}{status}
                          {scopeTag && <span title={scopeTag.tip} className={`ml-1.5 text-[10px] font-semibold cursor-help ${scopeTag.cls}`}>{scopeTag.txt}</span>}
                        </td>
                      </tr>
                      {cands && expandedRow === l.row && (
                        <tr className="border-t border-efg-line/50 bg-brand-bg-body/40">
                          <td colSpan={8} className="px-4 py-2">
                            {cands.length > 0 && (
                              <table className="text-[11px] w-full mb-2">
                                <thead><tr>
                                  {['Pick', 'Position Id', 'Load', 'Account', 'TypeOf', 'Ccy', 'Book amount', 'Counterparty', 'InternalRef1', 'ContractId', 'Source'].map(h =>
                                    <th key={h} className="px-2 py-1 text-left text-[9px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
                                </tr></thead>
                                <tbody>
                                  {cands.map(c => (
                                    <tr key={c.id} onClick={() => { setChosen(prev => ({ ...prev, [l.row]: c.id })); setScripts(prev => { const p = { ...prev }; delete p[l.row]; return p; }); }}
                                      className={`border-t border-efg-line/60 cursor-pointer hover:bg-white ${chosen[l.row] === c.id ? 'bg-brand-secondary/10 font-semibold' : ''}`}>
                                      <td className="px-2 py-1">{chosen[l.row] === c.id ? '●' : '○'}</td>
                                      <td className="px-2 py-1">{c.id}</td>
                                      <td className="px-2 py-1 text-brand-text-secondary">{c.loadId || '—'}</td>
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
                            {cands.length === 0 && mappings && (() => {
                              const glE = mappings.gl.get(l.ligne);
                              const ov = rowOverrides[l.row] || {};
                              const glAccounts = Array.from(new Map(Array.from(mappings.gl.values()).map(g => [g.legalAccountNumber, g])).values());
                              const typeOfs = Array.from(new Set([...Array.from(mappings.gl.values()).map(g => g.typeOf || ''), 'Account', 'Contract', 'Security', 'Cash'].filter(Boolean))).sort();
                              const subTypes = Array.from(new Set(Array.from(mappings.gl.values()).map(g => g.subType || '').filter(Boolean))).sort();
                              const isSec = (ov.typeOf || glE?.typeOf || '').toLowerCase() === 'security';
                              const inp = 'p-1.5 border border-gray-200 rounded-md text-[11px] bg-white';
                              return (
                                <div className="border border-efg-line rounded-lg bg-white/60 p-2.5 mb-2">
                                  <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-brand-text-secondary mb-1.5">
                                    New position — confirm the key fields, the rest gets safe defaults
                                  </p>
                                  <div className="flex flex-wrap items-end gap-2">
                                    <div>
                                      <label className="block text-[9px] uppercase tracking-wider text-brand-text-secondary">Legal account</label>
                                      <input list={`adj-accounts-${l.row}`} value={ov.legalAccountNumber ?? glE?.legalAccountNumber ?? ''}
                                        onChange={e => setOverride(l.row, 'legalAccountNumber', e.target.value)} className={`${inp} w-28`} />
                                      <datalist id={`adj-accounts-${l.row}`}>
                                        {glAccounts.map(g => <option key={g.legalAccountNumber} value={g.legalAccountNumber}>{g.description || g.line}</option>)}
                                      </datalist>
                                    </div>
                                    <div>
                                      <label className="block text-[9px] uppercase tracking-wider text-brand-text-secondary">TypeOf</label>
                                      <select value={ov.typeOf ?? glE?.typeOf ?? ''} onChange={e => setOverride(l.row, 'typeOf', e.target.value)} className={`${inp} w-28`}>
                                        <option value="">—</option>
                                        {typeOfs.map(t => <option key={t} value={t}>{t}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[9px] uppercase tracking-wider text-brand-text-secondary">SubType</label>
                                      <input list="adj-subtypes" value={ov.subType ?? glE?.subType ?? ''}
                                        onChange={e => setOverride(l.row, 'subType', e.target.value)} className={`${inp} w-28`} />
                                      <datalist id="adj-subtypes">{subTypes.map(t => <option key={t} value={t} />)}</datalist>
                                    </div>
                                    <div>
                                      <label className="block text-[9px] uppercase tracking-wider text-brand-text-secondary">Maturity date</label>
                                      <input type="date" value={ov.maturityDate ?? l.matDate ?? ''}
                                        onChange={e => setOverride(l.row, 'maturityDate', e.target.value)} className={inp} />
                                    </div>
                                  </div>
                                  <p className="text-[10px] text-brand-text-secondary mt-1.5">
                                    Counterparty: {genericCpty
                                      ? <>generic <strong>{svcMod ? svcMod.genericIdOf(l, mappings) : 'GEN-…'}</strong> (client {l.client || '?'} kept in InternalReference2{genericRating.trim() ? `, rating ${genericRating.trim()}` : ''})</>
                                      : <><strong>{l.client || '?'}</strong> — a list_counterparties row is created if missing (IND {l.ind || '—'} → {(l.ind && mappings.industry.get(l.ind)?.typeOf) || '?'})</>}.
                                    {isSec && ' Security line: a list_securities row is also created and linked to the counterparty (issuer).'}
                                  </p>
                                </div>
                              );
                            })()}
                            <div className="flex gap-2">
                              <button onClick={() => makeScript(l)}
                                disabled={cands.length > 0 && !cand}
                                className="text-[11px] font-semibold border border-brand-secondary text-brand-secondary hover:bg-brand-secondary hover:text-white py-1 px-2.5 rounded-md transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-brand-secondary">
                                {cands.length === 0 ? '✚ Generate the INSERT (position + referential)' : cand ? `Prepare adjustment INSERT from ${cand.id}` : 'Pick a candidate first'}
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

        </div>
        </div>

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
          A consolidation scope (list_reporting_entities / list_reporting_sets / list_booking_centers) restricts the view to the reporting set's booking centers and eliminates intra-scope intercompany amounts — base and adjustments alike.
          Every copied or downloaded script is logged in the decision history (control ADJ). The tool never writes to MERCURY — review and run in SSMS.
        </p>

        {(() => {
          const adjLogs = (data.prodFindingLogs || [])
            .filter(l => l.control === 'ADJ' && l.entity === entity)
            .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
          return adjLogs.length > 0 ? (
            <div className="mt-4 border-t border-efg-line pt-3">
              <p className={stepTitle}>Audit trail — {adjLogs.length} generation(s), stored in the RegReport database (ProdFindingLogs)</p>
              <div className="overflow-x-auto border border-efg-line rounded-lg max-h-56 overflow-y-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-brand-bg-body sticky top-0"><tr>
                    {['Generated at', 'By', 'What', 'Period', 'Detail'].map(h =>
                      <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {adjLogs.map(l => (
                      <tr key={l.id} className="border-t border-efg-line">
                        <td className="px-3 py-1.5 tabular-nums">{l.decidedAt.slice(0, 16).replace('T', ' ')}</td>
                        <td className="px-3 py-1.5">{l.decidedBy}</td>
                        <td className="px-3 py-1.5 font-semibold">{l.findingKey}</td>
                        <td className="px-3 py-1.5">{l.date}</td>
                        <td className="px-3 py-1.5 whitespace-normal max-w-xl text-brand-text-secondary">{l.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null;
        })()}
      </Card>
    );
  };

// ---------------------------------------------------------------------------
// v3.7 guided flow: Scope → Data → Controls → Balance sheet → Certify
// ---------------------------------------------------------------------------

type CollectionInfo = {
  loadCollectionId: number | string; name?: string | null; reportingDate?: string | null;
  reportingEntityId?: string | null; isMaster?: boolean; loadIds: Array<number | string>;
};
type ConsoInfo = {
  entities: Array<{ id: string; name?: string; bankOffice?: boolean; parentCompany?: boolean; consoGroup?: boolean }>;
  sets: Record<string, string[]>;
  bcNames: Record<string, string>;
};

const STEPS = [
  { key: 'scope', n: 1, label: 'Scope' },
  { key: 'data', n: 2, label: 'Data' },
  { key: 'controls', n: 3, label: 'Controls' },
  { key: 'balance', n: 4, label: 'Balance sheet' },
  { key: 'certify', n: 5, label: 'Certify' },
] as const;
type Step = typeof STEPS[number]['key'];

/** What each control checks — shown on the dashboard so the reviewer always
 * knows what a finding means and what to do with it. */
const CONTROL_DOCS: Array<{ id: string; title: string; what: string; base: string; action: string }> = [
  {
    id: 'C1', title: 'Counterparty drift',
    what: 'Every attribute of the MERCURY counterparty referential is compared per client between the two periods: client type, grouplexid, counterparty type (NOGA), internal rating class, external rating, domicile / HQ domicile / nationality, related-party type, credit quality, SME / adequate-supervision / LEX-limit flags, SIS code, LEI. PD is carried but deliberately excluded (a metric, not a treatment).',
    base: 'Current period vs the comparison period — the latest certified baseline when one exists.',
    action: 'A changed attribute changes the regulatory treatment: validate it (the change is genuine and enters the referential) or correct MERCURY with the prepared UPDATE.',
  },
  {
    id: 'C2', title: 'Cross-dataset consistency',
    what: 'Within the period, the same client number must carry one single treatment across all counterparty datasets. Domicile or related-party divergence is an error; rating class / credit quality / SME flag / LEI divergence a warning. Grouplexid is legitimately shared within a group (ultimate parent).',
    base: 'One period — all counterparty datasets side by side.',
    action: 'Fix the dataset carrying the wrong value; the correction aid prepares the targeted UPDATE.',
  },
  {
    id: 'C3', title: 'Security drift',
    what: 'Every attribute of the security referential is compared per ISIN: type / sub-type, ratings, revaluation frequency, currency, CMA approach / risk indicator / SA-RW flag, maturity, investment grade, listed type, LEX-guaranteed, SNB eligibility, HQLA level. An HQLA level or SNB-eligibility change is an error — the liquidity treatment changes.',
    base: 'Current period vs the comparison period — the latest certified baseline when one exists.',
    action: 'Validate a genuine market event (rating action, delisting…) or correct the load.',
  },
  {
    id: 'C4', title: 'Security vs reference',
    what: 'Guarantor and HQLA level of each security are checked against the Grouplexid guarantee/HQLA reference: the physical data must match the treatment declared in the HQLA report.',
    base: 'One period vs the maintained reference table.',
    action: 'Align the reference, or fix the security master.',
  },
  {
    id: 'C5', title: 'Orphan positions',
    what: 'Positions whose counterparty (issuer for securities) was not found in list_counterparties at the load PIT: the exposure exists but has no referential, so every counterparty-driven report misses it.',
    base: 'One period — positions vs referential.',
    action: 'Create the missing referential row (prepared INSERT covering all NOT NULL columns) and re-run the feed.',
  },
];

/** Balance sheet of the selected loads, consolidated: positions restricted to
 * the reporting set's booking centers, intra-scope intercompany eliminated —
 * per LEFT(LegalAccountNumber, 3), split assets / liabilities / off-balance. */
const BalanceCard: React.FC<{ collection: CollectionInfo | null; collLoadIds: string[]; conso: ConsoInfo | null }> =
  ({ collection, collLoadIds, conso }) => {
    const { data, mode, apiBaseUrl } = useData();
    const [rows, setRows] = useState<Array<{ account?: string; prefix: string; bookingCenterId: string; counterpartyBookingCenterId: string; amount: number }> | null>(null);
    const [err, setErr] = useState('');
    const [gaap, setGaap] = useState<'swiss' | 'ifrs'>('swiss');
    const [manualLoadId, setManualLoadId] = useState('');
    const [scopeSel, setScopeSel] = useState('');
    const [scopeOverride, setScopeOverride] = useState(false);
    useEffect(() => {
      const re = collection?.reportingEntityId ? String(collection.reportingEntityId) : '';
      if (re && conso?.sets[re]) setScopeSel(re);
    }, [collection, conso]);

    const ids = collLoadIds.length > 0 ? collLoadIds : (manualLoadId.trim() ? [manualLoadId.trim()] : []);
    const idsKey = ids.join(',');
    useEffect(() => {
      setRows(null); setErr('');
      if (mode !== 'api' || ids.length === 0) return;
      const qs = ids.length > 1 ? `loadIds=${encodeURIComponent(idsKey)}` : `loadId=${encodeURIComponent(ids[0])}`;
      fetch(`${apiBaseUrl}/production/mercury/balance?${qs}`, { credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); })
        .then((arr: Array<{ account?: string; prefix: string; bookingCenterId: string; counterpartyBookingCenterId: string; amount: number }>) =>
          setRows(arr.filter(b => b.prefix)))
        .catch(e => setErr(e instanceof Error ? e.message : String(e)));
    }, [mode, apiBaseUrl, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // IFRS (HFM) mapping persisted with the workbook: account → HFM account,
    // HFM account → label, and per-prefix fallback rule overrides.
    const hfmMaps = useMemo(() => {
      const direct = new Map<string, string>(), lbl = new Map<string, string>(), rules = new Map<string, string>();
      for (const e of data.prodMappingEntries || []) {
        if (!e.textValue) continue;
        if (e.kind === 'hfm') direct.set(e.mapKey, e.textValue);
        else if (e.kind === 'hfmlabel') lbl.set(e.mapKey, e.textValue);
        else if (e.kind === 'hfmrule') rules.set(e.mapKey, e.textValue);
      }
      return { direct, lbl, rules };
    }, [data.prodMappingEntries]);

    // Account labels persisted with the mapping workbook (kind = label).
    const labels = useMemo(() => {
      const m = new Map<string, string>();
      for (const e of data.prodMappingEntries || []) if (e.kind === 'label' && e.textValue) m.set(e.mapKey, e.textValue);
      // Fallback: derive a prefix label from the GL mapping lines (first
      // description seen for each LEFT-3 account prefix).
      for (const e of data.prodMappingEntries || []) {
        if (e.kind !== 'gl' || !e.textValue || !e.description) continue;
        const pfx = e.textValue.slice(0, 3);
        if (pfx && !m.has(pfx)) m.set(pfx, e.description);
      }
      return m;
    }, [data.prodMappingEntries]);

    const scopeSet = useMemo(() => {
      if (!scopeSel || !conso) return null;
      return new Set((conso.sets[scopeSel] || []).map(x => x.trim()));
    }, [scopeSel, conso]);

    const agg = useMemo(() => {
      if (!rows) return null;
      const per: Record<string, { amount: number; eliminated: number }> = {};
      for (const b of rows) {
        if (scopeSet && b.bookingCenterId && !scopeSet.has(b.bookingCenterId)) continue;
        const account = b.account || b.prefix;
        let key: string;
        if (gaap === 'ifrs') {
          if (!/^[12]/.test(account)) continue; // IFRS view: balance sheet only
          key = hfmKeyOf(account, hfmMaps.direct, hfmMaps.rules);
        } else key = b.prefix;
        const e = (per[key] ??= { amount: 0, eliminated: 0 });
        e.amount += b.amount;
        if (scopeSet && b.counterpartyBookingCenterId && scopeSet.has(b.counterpartyBookingCenterId)) e.eliminated += b.amount;
      }
      return per;
    }, [rows, scopeSet, gaap, hfmMaps]);

    const levelsOf = (e: { bankOffice?: boolean; parentCompany?: boolean; consoGroup?: boolean }) =>
      [e.bankOffice ? 'BO' : '', e.parentCompany ? 'PC' : '', e.consoGroup ? 'GR' : ''].filter(Boolean).join('/');
    const fmt = (n: number) => n.toLocaleString('en-CH', { maximumFractionDigits: 2 });
    const input = 'p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary';

    if (mode !== 'api') {
      return (
        <Card>
          <SectionHeader title="4 — Balance sheet" suffix="requires the API backend" />
          <p className="text-sm text-brand-text-secondary">Connect the app to the .NET backend to aggregate the load's core_positions into a consolidated balance sheet.</p>
        </Card>
      );
    }

    return (
      <Card>
        <SectionHeader title="4 — Balance sheet"
          suffix="SUM(BookAmount) of the collection's positions — scope restricted to the reporting set, intra-scope interco eliminated" />
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="pb-1">
            <span className="inline-flex rounded-md border border-gray-300 overflow-hidden text-[11px] font-semibold">
              {(['swiss', 'ifrs'] as const).map(g => (
                <button key={g} onClick={() => setGaap(g)}
                  className={`px-2.5 py-1 transition-colors ${gaap === g ? 'bg-brand-primary text-white' : 'bg-white text-brand-text-secondary hover:text-brand-primary'}`}>
                  {g === 'swiss' ? 'SWISS GAAP' : 'IFRS (HFM)'}
                </button>
              ))}
            </span>
            {gaap === 'ifrs' && hfmMaps.direct.size === 0 && (
              <p className="text-[10px] text-status-amber font-semibold mt-1">prefix fallback rules only — upload &amp; save Mapping.xlsb (Adjustments → Mappings) for the account-level HFM mapping</p>
            )}
          </div>
          {collLoadIds.length === 0 && (
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Loadid (no collection picked)</label>
              <input value={manualLoadId} onChange={e => setManualLoadId(e.target.value)} placeholder="e.g. 1002" className={input} />
            </div>
          )}
          {collection?.reportingEntityId && scopeSel === String(collection.reportingEntityId) && !scopeOverride ? (
            <div className="pb-1">
              <span className="inline-flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-full border border-brand-secondary/40 bg-brand-secondary/5">
                Scope <strong>{scopeSel}</strong>{conso?.entities.find(e => e.id === scopeSel)?.name ? ` — ${conso?.entities.find(e => e.id === scopeSel)?.name}` : ''} · from the Scope step
                <button onClick={() => setScopeOverride(true)} className="underline text-brand-text-secondary hover:text-brand-primary text-[11px]">change</button>
              </span>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Consolidation scope</label>
              <select value={scopeSel} onChange={e => setScopeSel(e.target.value)} className={input}>
                <option value="">— entire load(s), no scope —</option>
                {(conso?.entities || []).map(e => (
                  <option key={e.id} value={e.id}>{e.id}{e.name ? ` — ${e.name}` : ''}{levelsOf(e) ? ` (${levelsOf(e)})` : ''}</option>
                ))}
              </select>
            </div>
          )}
          {scopeSet && (
            <p className="text-[11px] text-brand-text-secondary pb-2">
              {scopeSet.size} booking center(s) in the reporting set — {Array.from(scopeSet).map(bc => conso?.bcNames[bc] || bc).join(', ')}
            </p>
          )}
        </div>
        {err && <p className="text-sm text-status-red">Balance unavailable: {err}</p>}
        {ids.length === 0 ? (
          <EmptyState title="No loads selected" hint="Pick a load collection in the Scope step (or type a loadid above) to aggregate its balance sheet." compact />
        ) : !agg ? (
          !err && <p className="text-sm text-brand-text-secondary">Loading balance from MERCURY…</p>
        ) : (
          (() => {
            const prefixes = Object.keys(agg).sort();
            const scoped = !!scopeSet;
            const sections: Array<{ title: string; match: (p: string) => boolean }> = [
              { title: 'Assets (1xx)', match: p => p.startsWith('1') },
              { title: 'Liabilities & equity (2xx)', match: p => p.startsWith('2') },
              { title: gaap === 'ifrs' ? 'Equity / other' : 'Off-balance sheet / other', match: p => !p.startsWith('1') && !p.startsWith('2') },
            ];
            const labelOf = (k: string) => gaap === 'ifrs' ? hfmMaps.lbl.get(k) : labels.get(k);
            return (
              <div className="overflow-x-auto border border-efg-line rounded-lg">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-brand-bg-body"><tr>
                    {(scoped
                      ? [gaap === 'ifrs' ? 'HFM account' : 'Account (LEFT 3)', 'Label', 'Gross (scope)', 'IC eliminated', 'Net']
                      : [gaap === 'ifrs' ? 'HFM account' : 'Account (LEFT 3)', 'Label', 'Amount'])
                      .map((h, hi) =>
                        <th key={h} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold ${hi >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {sections.map(sec => {
                      const ps = prefixes.filter(sec.match);
                      if (ps.length === 0) return null;
                      let tAmt = 0, tElim = 0;
                      return (
                        <React.Fragment key={sec.title}>
                          <tr className="border-t border-efg-line bg-brand-bg-body/60">
                            <td colSpan={scoped ? 5 : 3} className="px-3 py-1.5 font-semibold text-[11px] uppercase tracking-[0.08em] text-brand-text-secondary">{sec.title}</td>
                          </tr>
                          {ps.map(pfx => {
                            const e = agg[pfx];
                            tAmt += e.amount; tElim += e.eliminated;
                            return (
                              <tr key={pfx} className="border-t border-efg-line/60">
                                <td className="px-3 py-1 font-semibold">{pfx}</td>
                                <td className="px-3 py-1 text-brand-text-secondary max-w-xs truncate">{labelOf(pfx) || '—'}</td>
                                <td className="px-3 py-1 text-right tabular-nums">{fmt(e.amount)}</td>
                                {scoped && <td className="px-3 py-1 text-right tabular-nums text-brand-text-secondary">{e.eliminated === 0 ? '—' : fmt(-e.eliminated)}</td>}
                                {scoped && <td className="px-3 py-1 text-right tabular-nums font-semibold">{fmt(e.amount - e.eliminated)}</td>}
                              </tr>
                            );
                          })}
                          <tr className="border-t border-efg-line font-semibold">
                            <td className="px-3 py-1.5" colSpan={2}>Total {sec.title}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{fmt(tAmt)}</td>
                            {scoped && <td className="px-3 py-1.5 text-right tabular-nums text-brand-text-secondary">{tElim === 0 ? '—' : fmt(-tElim)}</td>}
                            {scoped && <td className="px-3 py-1.5 text-right tabular-nums">{fmt(tAmt - tElim)}</td>}
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-[11px] text-brand-text-secondary px-3 py-2 border-t border-efg-line">
                  Load(s) {ids.join(', ')} — amounts as booked in MERCURY (BookAmount), {gaap === 'ifrs' ? 'grouped by HFM (IFRS) account: direct account mapping from Mapping_GL_BALANCESHEET, else the per-prefix fallback rules (mirroring the HFM Power Query); balance-sheet accounts (1xx/2xx) only' : 'grouped by Swiss GAAP rubrique (LEFT 3)'}.
                  {scoped && ' Positions booked outside the reporting set are excluded; amounts facing an intra-scope CounterpartyBookingCenterId are shown as IC eliminated (net = consolidated view).'}
                  {labels.size === 0 && ' Account labels appear once the mapping workbook has been saved to the database (Adjustments → Mappings).'}
                </p>
              </div>
            );
          })()
        )}
      </Card>
    );
  };

const ProductionPage: React.FC = () => {
  const { data, setData, allEntities, currentUser, mode, apiBaseUrl } = useData();
  const [step, setStep] = useState<Step>('scope');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdj, setShowAdj] = useState(false);

  const cps = data.prodCounterparties || [];
  const secs = data.prodSecurities || [];
  const refs = data.prodGuaranteeRefs || [];
  const baselinesAll = data.prodBaselines || [];

  // --- MERCURY referential, fetched once: conso (reporting entities, sets,
  // booking centers) and the load collections that drive the Scope step.
  const [conso, setConso] = useState<ConsoInfo | null>(null);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  useEffect(() => {
    if (mode !== 'api') return;
    fetch(`${apiBaseUrl}/production/mercury/conso`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(out => {
        if (!out) return;
        const sets: Record<string, string[]> = {};
        for (const st of out.sets || []) (sets[String(st.reportingEntityId)] ??= []).push(String(st.bookingCenterId));
        const bcNames: Record<string, string> = {};
        for (const b of out.bookingCenters || []) bcNames[String(b.id)] = String(b.name ?? '');
        setConso({
          entities: (out.entities || []).map((e: { id: unknown; name?: unknown; bankOffice?: unknown; parentCompany?: unknown; consoGroup?: unknown }) => ({
            id: String(e.id), name: e.name ? String(e.name) : undefined,
            bankOffice: e.bankOffice === true, parentCompany: e.parentCompany === true, consoGroup: e.consoGroup === true,
          })),
          sets, bcNames,
        });
      })
      .catch(() => { /* MERCURY unreachable — fall back to app entities */ });
    fetch(`${apiBaseUrl}/production/mercury/load-collections`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setCollections(Array.isArray(l)
        ? l.map((c: CollectionInfo) => ({ ...c, loadIds: Array.isArray(c.loadIds) ? c.loadIds : [] }))
        : []))
      .catch(() => setCollections([]));
  }, [mode, apiBaseUrl]);

  const reportingEntities = conso?.entities || [];
  const entities = useMemo(() => {
    const set = new Set<string>();
    reportingEntities.forEach(e => set.add(e.id));
    cps.forEach(r => set.add(r.entity));
    secs.forEach(r => set.add(r.entity));
    if (set.size === 0) allEntities.forEach(e => set.add(e));
    return Array.from(set).sort();
  }, [reportingEntities, allEntities, cps, secs]);
  const entityLabel = (id: string) => {
    const re = reportingEntities.find(e => e.id === id);
    return re?.name ? `${id} — ${re.name}` : id;
  };
  const [entitySel, setEntitySel] = useState('');
  const entity = entities.includes(entitySel) ? entitySel : entities[0] || '';

  // --- Scope: the selected load collection drives entity, period and loads.
  const [collectionSel, setCollectionSel] = useState('');
  const collection = useMemo(() =>
    collections.find(c => String(c.loadCollectionId) === collectionSel) || null, [collections, collectionSel]);
  const collLoadIds = useMemo(() => (collection?.loadIds || []).map(String), [collection]);
  const collDate = collection?.reportingDate ? String(collection.reportingDate).slice(0, 10) : '';
  const pickCollection = (c: CollectionInfo) => {
    setCollectionSel(String(c.loadCollectionId));
    if (c.reportingEntityId) setEntitySel(String(c.reportingEntityId));
  };

  const dates = useMemo(() => {
    const set = new Set<string>();
    cps.filter(r => r.entity === entity).forEach(r => set.add(r.date));
    secs.filter(r => r.entity === entity).forEach(r => set.add(r.date));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [cps, secs, entity]);

  // --- Certified baselines of the entity (newest first).
  const baselines = useMemo(() =>
    baselinesAll.filter(b => b.entity === entity).sort((a, b) => b.date.localeCompare(a.date)),
    [baselinesAll, entity]);

  const deletePeriod = (d: string) => {
    if (!window.confirm(`Delete ALL production data (counterparties + securities) for ${entity} — ${d}?`)) return;
    setData(prev => ({
      ...prev,
      prodCounterparties: (prev.prodCounterparties || []).filter(r => !(r.entity === entity && r.date === d)),
      prodSecurities: (prev.prodSecurities || []).filter(r => !(r.entity === entity && r.date === d)),
    }));
  };

  // --- Controls state ---
  const [openFinding, setOpenFinding] = useState<number | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [controlFilter, setControlFilter] = useState('');
  const [docOpen, setDocOpen] = useState<string | null>(null);
  const [dateSel, setDateSel] = useState('');
  const date = dates.includes(dateSel) ? dateSel : (collDate && dates.includes(collDate) ? collDate : dates[0] || '');
  const prevDates = dates.filter(d => d < date);
  // Default comparison base: the latest certified baseline before the period,
  // falling back to the previous period when nothing is certified yet.
  const certifiedPrev = prevDates.find(d => baselines.some(b => b.date === d));
  const [compareSel, setCompareSel] = useState('');
  const compare = prevDates.includes(compareSel) ? compareSel : (certifiedPrev ?? prevDates[0] ?? '');
  const compareBaseline = baselines.find(b => b.date === compare);

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
  const shownFindings = (showResolved ? findings : activeFindings)
    .filter(f => !controlFilter || f.control.startsWith(controlFilter));

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

  // Per-control dashboard stats.
  const controlStats = useMemo(() => CONTROL_DOCS.map(cd => {
    const act = activeFindings.filter(f => f.control.startsWith(cd.id));
    return {
      id: cd.id, title: cd.title,
      errors: act.filter(f => f.severity === 'error').length,
      warnings: act.filter(f => f.severity === 'warning').length,
      infos: act.filter(f => f.severity === 'info').length,
      decided: findings.filter(f => f.control.startsWith(cd.id)).length - act.length,
    };
  }), [activeFindings, findings]);

  const periodRows = useMemo(() => dates.map(d => ({
    date: d,
    byDataset: PROD_DATASETS.map(ds => cps.filter(r => r.entity === entity && r.date === d && r.dataset === ds.key).length),
    securities: secs.filter(r => r.entity === entity && r.date === d).length,
  })), [dates, cps, secs, entity]);

  // --- Certification ---
  const currentBaseline = baselines.find(b => b.date === date);
  const periodDecisions = entityLogs.filter(l => l.date === date);
  const certify = () => {
    if (!date) return;
    if (counts.error > 0 && !window.confirm(`${counts.error} error finding(s) are still open for ${date}. Certify anyway?`)) return;
    const note = window.prompt(`Certify ${entityLabel(entity)} — ${date} as the correct baseline (optional note):`, '');
    if (note === null) return;
    setData(prev => ({
      ...prev,
      prodBaselines: [...(prev.prodBaselines || []), {
        id: Date.now(), entity, date,
        loadIds: collLoadIds.length > 0 ? collLoadIds.join(',') : undefined,
        collectionId: collection ? String(collection.loadCollectionId) : undefined,
        certifiedBy: currentUser.name, certifiedAt: new Date().toISOString(),
        note: note || undefined,
      }],
    }));
    setNotice(`${entity} — ${date} certified as the correct baseline. The next period's controls will compare against it.`);
  };
  const uncertify = (id: number) => {
    if (!window.confirm('Remove this certification? Controls will fall back to comparing with the previous period.')) return;
    setData(prev => ({ ...prev, prodBaselines: (prev.prodBaselines || []).filter(b => b.id !== id) }));
  };

  // Load collections grouped by reporting date, newest first (Scope step).
  const collectionGroups = useMemo(() => {
    const by = new Map<string, CollectionInfo[]>();
    for (const c of collections) {
      const d = c.reportingDate ? String(c.reportingDate).slice(0, 10) : '—';
      const arr = by.get(d) || [];
      arr.push(c);
      by.set(d, arr);
    }
    return Array.from(by.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [collections]);

  const stepBtn = (s: typeof STEPS[number], i: number) => {
    const active = step === s.key;
    const badge = s.key === 'controls' && counts.error > 0 ? ` · ${counts.error} ⚠` : '';
    return (
      <React.Fragment key={s.key}>
        {i > 0 && <span className="text-brand-text-secondary/40 select-none">›</span>}
        <button onClick={() => setStep(s.key)}
          className={`flex items-center gap-2 text-sm font-semibold py-1.5 px-3 rounded-full border transition-colors ${
            active ? 'bg-brand-primary text-white border-brand-primary'
              : 'bg-white text-brand-text-secondary border-gray-300 hover:border-brand-primary hover:text-brand-primary'}`}>
          <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-bold ${
            active ? 'bg-white/20' : 'bg-brand-bg-body'}`}>{s.n}</span>
          {s.label}{badge}
        </button>
      </React.Fragment>
    );
  };

  return (
    <div className="p-5 md:p-8 space-y-6">
      <BackButton />
      <PageHeader
        title="Production"
        subtitle="Monthly production line: pick your scope, feed and control the data against the certified baseline, review the consolidated balance sheet, certify the period."
      />
      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map(stepBtn)}
        <div className="ml-auto">
          <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Reporting entity (scope)</label>
          <select value={entity} onChange={e => setEntitySel(e.target.value)} className="p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary">
            {entities.map(e => <option key={e} value={e}>{entityLabel(e)}</option>)}
          </select>
        </div>
      </div>

      {/* Working-scope banner: always visible once something is picked. */}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="px-2.5 py-1 rounded-full border border-efg-line bg-brand-bg-body/60 font-semibold">{entityLabel(entity) || '—'}</span>
        {collection ? (
          <span className="px-2.5 py-1 rounded-full border border-brand-secondary/40 bg-brand-secondary/5">
            📦 collection {String(collection.loadCollectionId)}{collection.name ? ` · ${collection.name}` : ''} · {collDate || '—'} · load(s) {collLoadIds.join(', ') || '—'}
          </span>
        ) : (
          <span className="px-2.5 py-1 rounded-full border border-efg-line text-brand-text-secondary">no load collection picked — Scope step</span>
        )}
        {baselines[0] && (
          <span className="px-2.5 py-1 rounded-full border border-status-green/40 bg-status-green/5 text-status-green font-semibold"
            title={`Certified by ${baselines[0].certifiedBy} on ${baselines[0].certifiedAt.slice(0, 16).replace('T', ' ')}`}>
            ✔ last certified: {baselines[0].date}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-status-red bg-status-red/10 border border-status-red/30 rounded-md px-4 py-2">{error}</p>}
      {notice && (
        <p className="text-sm text-brand-text-primary bg-brand-bg-body border border-efg-line rounded-md px-4 py-2 flex justify-between items-center">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-brand-text-secondary hover:text-brand-text-primary ml-4">×</button>
        </p>
      )}

      {/* ------------------------------------------------ 1 — SCOPE */}
      {step === 'scope' && (
        <Card>
          <SectionHeader title="1 — Scope"
            suffix="pick the load collection you work on — period, loads and consolidation level follow in one click" />
          {mode !== 'api' ? (
            <p className="text-sm text-brand-text-secondary">
              The load collections come from MERCURY (API backend required). You can still work on CSV-fed data:
              pick the reporting entity top right and continue to the Data step.
            </p>
          ) : collections.length === 0 ? (
            <EmptyState title="No load collection visible"
              hint="MERCURY is unreachable, or core_load_collections has no visible row — check ☰ → Logs → Technical. You can still feed by loadid in the Data step." />
          ) : (
            collectionGroups.map(([d, cols]) => (
              <div key={d} className="mb-4">
                <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-brand-text-secondary mb-2">{d}</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cols.map(c => {
                    const id = String(c.loadCollectionId);
                    const selected = id === collectionSel;
                    const re = c.reportingEntityId ? String(c.reportingEntityId) : '';
                    const reName = reportingEntities.find(e => e.id === re)?.name;
                    const certified = baselinesAll.some(b => b.entity === re && b.date === (c.reportingDate ? String(c.reportingDate).slice(0, 10) : ''));
                    return (
                      <button key={id} onClick={() => pickCollection(c)}
                        className={`text-left border rounded-xl p-4 transition-all ${selected
                          ? 'border-brand-primary ring-2 ring-brand-primary/25 bg-brand-primary/5'
                          : 'border-efg-line hover:border-brand-secondary hover:shadow-card'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-sm">{c.name || `Collection ${id}`}</span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            {certified && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-status-green/40 text-status-green">✔ certified</span>}
                            {c.isMaster && <span title="Master collection">★</span>}
                          </span>
                        </div>
                        <p className="text-[11px] text-brand-text-secondary mt-1.5">
                          #{id} · scope <strong className="text-brand-text-primary">{re || '—'}</strong>{reName ? ` — ${reName}` : ''}
                        </p>
                        <p className="text-[11px] text-brand-text-secondary mt-0.5">load(s) {(c.loadIds || []).join(', ') || '—'}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          <div className="flex justify-end mt-2">
            <button onClick={() => setStep('data')}
              className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors">
              Continue to Data →
            </button>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------ 2 — DATA */}
      {step === 'data' && (
        <>
          <MercuryCard entity={entity} presetLoadIds={collLoadIds.length > 0 ? collLoadIds : undefined}
            onLoaded={m => { setNotice(m); setError(null); }} onError={m => setError(m)} />
          <Card>
            <SectionHeader title="Loaded periods" suffix={entityLabel(entity)} />
            {periodRows.length === 0 ? (
              <EmptyState title="No production data yet" hint={`Feed ${entity} from MERCURY above — the controls and the balance sheet need it.`} compact />
            ) : (
              <div className="overflow-x-auto border border-efg-line rounded-lg">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-brand-bg-body"><tr>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Date</th>
                    {PROD_DATASETS.map(d => <th key={d.key} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{d.label}</th>)}
                    <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Securities</th>
                    <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Baseline</th>
                    <th />
                  </tr></thead>
                  <tbody>
                    {periodRows.map(p => {
                      const b = baselines.find(x => x.date === p.date);
                      return (
                        <tr key={p.date} className="border-t border-efg-line">
                          <td className="px-3 py-1.5 font-semibold">{p.date}</td>
                          {p.byDataset.map((n, i) => <td key={i} className="px-3 py-1.5 text-right tabular-nums">{n || '—'}</td>)}
                          <td className="px-3 py-1.5 text-right tabular-nums">{p.securities || '—'}</td>
                          <td className="px-3 py-1.5">{b ? <span className="text-status-green font-semibold">✔ certified</span> : <span className="text-brand-text-secondary">—</span>}</td>
                          <td className="px-3 py-1.5 text-right"><button onClick={() => deletePeriod(p.date)} className="text-status-red/70 hover:text-status-red underline">delete</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end mt-3">
              <button onClick={() => setStep('controls')}
                className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors">
                Continue to Controls →
              </button>
            </div>
          </Card>
        </>
      )}

      {/* ------------------------------------------------ 3 — CONTROLS */}
      {step === 'controls' && (
        <Card>
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <SectionHeader title="3 — Controls" suffix={`${entityLabel(entity)} — treatment must stay identical over time and vs the reference`} />
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
                  {prevDates.map(d => (
                    <option key={d} value={d}>{d}{baselines.some(b => b.date === d) ? ' ✔ certified' : ''}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Comparison base, spelled out. */}
          {date && (
            <p className={`text-[12px] rounded-md border px-3 py-2 mb-4 ${compareBaseline
              ? 'border-status-green/40 bg-status-green/5 text-brand-text-primary'
              : 'border-efg-line bg-brand-bg-body/50 text-brand-text-secondary'}`}>
              {compare ? (
                compareBaseline
                  ? <>Compared to <strong>{compare}</strong> — ✔ certified baseline (by {compareBaseline.certifiedBy} on {compareBaseline.certifiedAt.slice(0, 10)}{compareBaseline.note ? ` · "${compareBaseline.note}"` : ''}).</>
                  : <>Compared to <strong>{compare}</strong> — ⚠ not a certified baseline (certify periods in step 5 so drifts are measured against validated data).</>
              ) : (
                <>No earlier period to compare with — C1/C3 drift controls are skipped; C2/C4/C5 run on the period alone.</>
              )}
            </p>
          )}

          {/* Per-control dashboard. */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            {controlStats.map(cs => {
              const status = cs.errors > 0 ? 'red' : cs.warnings > 0 ? 'amber' : 'green';
              const dot = status === 'red' ? 'bg-status-red' : status === 'amber' ? 'bg-status-amber' : 'bg-status-green';
              const active = controlFilter === cs.id;
              return (
                <div key={cs.id}
                  className={`border rounded-xl p-3 cursor-pointer transition-all ${active
                    ? 'border-brand-primary ring-2 ring-brand-primary/25 bg-brand-primary/5'
                    : 'border-efg-line hover:border-brand-secondary hover:shadow-card'}`}
                  onClick={() => setControlFilter(active ? '' : cs.id)}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{cs.id}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                  </div>
                  <p className="text-[11px] text-brand-text-secondary mt-0.5 leading-tight">{cs.title}</p>
                  <p className="text-[11px] mt-1.5 tabular-nums">
                    {cs.errors > 0 && <span className="text-status-red font-semibold">{cs.errors} err</span>}
                    {cs.errors > 0 && (cs.warnings > 0 || cs.infos > 0) && ' · '}
                    {cs.warnings > 0 && <span className="text-status-amber font-semibold">{cs.warnings} warn</span>}
                    {cs.warnings > 0 && cs.infos > 0 && ' · '}
                    {cs.infos > 0 && <span className="text-brand-text-secondary">{cs.infos} info</span>}
                    {cs.errors === 0 && cs.warnings === 0 && cs.infos === 0 && <span className="text-status-green font-semibold">clean</span>}
                    {cs.decided > 0 && <span className="text-brand-text-secondary"> · {cs.decided} decided</span>}
                  </p>
                  <button onClick={e => { e.stopPropagation(); setDocOpen(docOpen === cs.id ? null : cs.id); }}
                    className="text-[10px] underline text-brand-text-secondary hover:text-brand-primary mt-1">
                    {docOpen === cs.id ? 'hide' : 'what does it check?'}
                  </button>
                </div>
              );
            })}
          </div>
          {docOpen && (() => {
            const cd = CONTROL_DOCS.find(x => x.id === docOpen);
            return cd ? (
              <div className="border border-efg-line rounded-lg bg-brand-bg-body/40 px-4 py-3 mb-4 text-[12px] space-y-1.5">
                <p className="font-bold">{cd.id} — {cd.title}</p>
                <p><span className="font-semibold text-brand-text-secondary">What it checks:</span> {cd.what}</p>
                <p><span className="font-semibold text-brand-text-secondary">Comparison base:</span> {cd.base}</p>
                <p><span className="font-semibold text-brand-text-secondary">Expected action:</span> {cd.action}</p>
              </div>
            ) : null;
          })()}

          <div className="flex flex-wrap gap-3 mb-4 text-[12px] font-semibold">
            <span className={`px-3 py-1 rounded-full border ${SEV_STYLE.error}`}>{counts.error} errors</span>
            <span className={`px-3 py-1 rounded-full border ${SEV_STYLE.warning}`}>{counts.warning} warnings</span>
            <span className={`px-3 py-1 rounded-full border ${SEV_STYLE.info}`}>{counts.info} info (new / disappeared)</span>
            <button onClick={() => setShowResolved(v => !v)}
              className={`px-3 py-1 rounded-full border transition-colors ${showResolved ? 'bg-brand-secondary text-white border-brand-secondary' : 'bg-white text-brand-text-secondary border-gray-300 hover:border-brand-secondary'}`}>
              {findings.length - activeFindings.length} resolved {showResolved ? '(shown)' : '(hidden)'}
            </button>
            {controlFilter && (
              <button onClick={() => setControlFilter('')}
                className="px-3 py-1 rounded-full border bg-brand-primary/10 text-brand-primary border-brand-primary/40">
                filter: {controlFilter} ✕
              </button>
            )}
          </div>
          {dates.length === 0 ? (
            <EmptyState title={`No production data for ${entity}`} hint="Feed the period in the Data step first." compact />
          ) : shownFindings.length === 0 ? (
            <p className="text-sm text-brand-text-primary bg-status-green/10 border border-status-green/30 rounded-md px-4 py-3">
              ✓ No open finding for {date}{compare ? ` vs ${compare}` : ''}{controlFilter ? ` on ${controlFilter}` : ''}{findings.length > 0 ? ` — ${findings.length - activeFindings.length} decided (see resolved / history below)` : ' — same treatment across periods, datasets and the reference'}.
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
                                      ? (() => {
                                        // Columns whose value changed between the periods are
                                        // highlighted (HQLA in red — treatment change).
                                        const rows = (detail as typeof secs).sort((a, b) => a.date.localeCompare(b.date));
                                        const diff = (get: (r: typeof rows[number]) => unknown) =>
                                          new Set(rows.map(r => String(get(r) ?? ''))).size > 1;
                                        const hl = (changed: boolean, grave = false) =>
                                          changed ? (grave ? ' bg-status-red/15 font-semibold' : ' bg-status-amber/15 font-semibold') : '';
                                        return rows.map(r => (
                                          <tr key={r.id} className="border-t border-efg-line/60">
                                            <td className="px-2 py-1 font-semibold">{r.date}</td><td className="px-2 py-1">{r.isin}</td>
                                            <td className={'px-2 py-1' + hl(diff(x => x.securityMaster))}>{r.securityMaster || '—'}</td>
                                            <td className={'px-2 py-1' + hl(diff(x => x.securityType))}>{r.securityType || '—'}</td>
                                            <td className={'px-2 py-1' + hl(diff(x => x.rating))}>{r.rating || '—'}</td>
                                            <td className={'px-2 py-1' + hl(diff(x => x.dailyReval))}>{r.dailyReval === undefined ? '—' : String(r.dailyReval)}</td>
                                            <td className={'px-2 py-1' + hl(diff(x => x.issuerLexId))}>{r.issuerLexId || '—'}</td>
                                            <td className={'px-2 py-1' + hl(diff(x => x.guarantorName || x.guarantorLexId))}>{r.guarantorName || r.guarantorLexId || '—'}</td>
                                            <td className={'px-2 py-1 font-semibold' + hl(diff(x => x.hqlaLevel), true)}>{r.hqlaLevel || '—'}</td>
                                            <td className="px-2 py-1 text-right tabular-nums">{r.amount?.toFixed(1) ?? '—'}</td>
                                          </tr>
                                        ));
                                      })()
                                      : (() => {
                                        // Per-dataset diff: a value changing across the periods
                                        // within the same dataset is highlighted; plausibility
                                        // flags mark a client type at odds with the dataset
                                        // (e.g. a Bank in Due from customers).
                                        const rows = (detail as typeof cps).sort((a, b) => a.date.localeCompare(b.date) || a.dataset.localeCompare(b.dataset));
                                        const diffIn = (ds: string, get: (r: typeof rows[number]) => unknown) =>
                                          new Set(rows.filter(x => x.dataset === ds).map(r => String(get(r) ?? ''))).size > 1;
                                        const hl = (changed: boolean) => changed ? ' bg-status-amber/15 font-semibold' : '';
                                        const BANK_DS = ['dueFromBanks', 'dueToBanks'];
                                        const CUSTOMER_DS = ['dueFromCustomers', 'dueToCustomers', 'mortgages'];
                                        const implausible = (r: typeof rows[number]): string | null => {
                                          const t = (r.clientType || '').toLowerCase();
                                          if (!t) return null;
                                          if (t.includes('bank') && CUSTOMER_DS.includes(r.dataset))
                                            return `A Bank counterparty in "${PROD_DATASETS.find(d => d.key === r.dataset)?.label}" is unusual — check the client type or the dataset.`;
                                          if (!t.includes('bank') && BANK_DS.includes(r.dataset))
                                            return `A ${r.clientType} counterparty in "${PROD_DATASETS.find(d => d.key === r.dataset)?.label}" is unusual — check the client type or the dataset.`;
                                          return null;
                                        };
                                        return rows.map(r => {
                                          const odd = implausible(r);
                                          return (
                                            <tr key={r.id} className="border-t border-efg-line/60">
                                              <td className="px-2 py-1 font-semibold">{r.date}</td>
                                              <td className="px-2 py-1">{PROD_DATASETS.find(d => d.key === r.dataset)?.label || r.dataset}</td>
                                              <td className="px-2 py-1">{r.clientNumber}</td>
                                              <td title={odd ?? undefined}
                                                className={'px-2 py-1' + hl(diffIn(r.dataset, x => x.clientType)) + (odd ? ' bg-status-red/15 font-semibold cursor-help' : '')}>
                                                {r.clientType || '—'}{odd ? ' ⚠' : ''}
                                              </td>
                                              <td className={'px-2 py-1' + hl(diffIn(r.dataset, x => x.groupLexId))}>{r.groupLexId || '—'}</td>
                                              <td className={'px-2 py-1' + hl(diffIn(r.dataset, x => x.counterpartyType))}>{r.counterpartyType || '—'}</td>
                                              <td className={'px-2 py-1' + hl(diffIn(r.dataset, x => x.issuerRating))}>{r.issuerRating || '—'}</td>
                                              <td className="px-2 py-1 text-right tabular-nums">{r.amount?.toFixed(1) ?? '—'}</td>
                                              <td className="px-2 py-1">{r.currency || '—'}</td>
                                            </tr>
                                          );
                                        });
                                      })()}
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
          <p className="text-[11px] text-brand-text-secondary mt-2">
            In a finding's detail, <span className="bg-status-amber/15 px-1 rounded font-semibold">highlighted cells</span> are the values that
            changed between the two periods; <span className="bg-status-red/15 px-1 rounded font-semibold">red cells</span> flag a treatment-grave
            change (HQLA level) or an implausible combination (e.g. a Bank counterparty in a customer dataset — hover the ⚠ for the reason).
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
          <div className="flex justify-end mt-3">
            <button onClick={() => setStep('balance')}
              className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors">
              Continue to Balance sheet →
            </button>
          </div>
        </Card>
      )}

      {/* ------------------------------------------------ 4 — BALANCE SHEET */}
      {step === 'balance' && (
        <>
          <BalanceCard collection={collection} collLoadIds={collLoadIds} conso={conso} />
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setShowAdj(v => !v)}
              className={`text-sm font-semibold border py-2 px-4 rounded-md transition-colors ${showAdj
                ? 'bg-brand-secondary text-white border-brand-secondary'
                : 'border-brand-secondary text-brand-secondary hover:bg-brand-secondary hover:text-white'}`}>
              {showAdj ? 'Hide the adjustments tool' : '🔧 Open the adjustments tool'}
            </button>
            <span className="text-[12px] text-brand-text-secondary">
              A rubrique doesn't tie out with accounting? Match the adjustment lines against core_positions and prepare the INSERTs for MERCURY.
            </span>
            <button onClick={() => setStep('certify')}
              className="ml-auto text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors">
              Continue to Certify →
            </button>
          </div>
          {showAdj && (
            <AdjustmentsCard entity={entity} presetCollectionId={collectionSel || undefined}
              onNotice={m => { setNotice(m); setError(null); }} onError={m => setError(m)} />
          )}
        </>
      )}

      {/* ------------------------------------------------ 5 — CERTIFY */}
      {step === 'certify' && (
        <Card>
          <SectionHeader title="5 — Certify & referential"
            suffix={`${entityLabel(entity)} — declare the period's data correct; the next period's controls compare against it`} />
          {!date ? (
            <EmptyState title="Nothing to certify yet" hint="Feed a period in the Data step first." compact />
          ) : (
            <>
              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                <div className="border border-efg-line rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-brand-text-secondary">Period under review</p>
                  <p className="text-lg font-bold mt-1">{date}</p>
                  <p className="text-[11px] text-brand-text-secondary mt-0.5">
                    {collection ? `collection ${String(collection.loadCollectionId)} · load(s) ${collLoadIds.join(', ')}` : 'no load collection linked'}
                  </p>
                </div>
                <div className="border border-efg-line rounded-xl p-4">
                  <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-brand-text-secondary">Data</p>
                  <p className="text-lg font-bold mt-1 tabular-nums">
                    {cps.filter(r => r.entity === entity && r.date === date).length + secs.filter(r => r.entity === entity && r.date === date).length} rows
                  </p>
                  <p className="text-[11px] text-brand-text-secondary mt-0.5">
                    {cps.filter(r => r.entity === entity && r.date === date).length} counterparty · {secs.filter(r => r.entity === entity && r.date === date).length} securities
                  </p>
                </div>
                <div className={`border rounded-xl p-4 ${counts.error > 0 ? 'border-status-red/40 bg-status-red/5' : 'border-status-green/40 bg-status-green/5'}`}>
                  <p className="text-[10px] uppercase tracking-[0.1em] font-semibold text-brand-text-secondary">Controls</p>
                  <p className="text-lg font-bold mt-1 tabular-nums">
                    {counts.error > 0 ? `${counts.error} error(s) open` : '✓ clean'}
                  </p>
                  <p className="text-[11px] text-brand-text-secondary mt-0.5">
                    {counts.warning} warning(s) open · {periodDecisions.length} decision(s) logged for {date}
                  </p>
                </div>
              </div>

              {currentBaseline ? (
                <p className="text-sm text-brand-text-primary bg-status-green/10 border border-status-green/30 rounded-md px-4 py-3 mb-4">
                  ✔ <strong>{date} is certified</strong> by {currentBaseline.certifiedBy} on {currentBaseline.certifiedAt.slice(0, 16).replace('T', ' ')}
                  {currentBaseline.note ? ` — "${currentBaseline.note}"` : ''}.
                  <button onClick={() => uncertify(currentBaseline.id)} className="ml-3 underline text-status-red/70 hover:text-status-red">remove certification</button>
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <button onClick={certify}
                    className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors">
                    ✔ Certify {entity} — {date} as the correct baseline
                  </button>
                  {counts.error > 0 && (
                    <span className="text-[12px] text-status-amber font-semibold">⚠ {counts.error} error finding(s) still open — treat them in Controls first (a confirmation is asked).</span>
                  )}
                </div>
              )}

              <p className="text-[11px] text-brand-text-secondary mb-5">
                Certifying stores a baseline record ({'entity, date, loads, by whom, when'}) in the RegReport database — the period's dataset becomes the reference the
                next period's C1/C3 drift controls compare against, and validated-drift decisions are the audit trail of what entered it.
                The data itself stays as loaded (snapshots per period); removing a certification only removes the pointer.
              </p>

              <SectionHeader title="Certified baselines" suffix={`${baselines.length} record(s) — ${entity}`} />
              {baselines.length === 0 ? (
                <EmptyState title="No certified baseline yet" hint="Certify your first period above — from then on, drifts are measured against validated data instead of simply the previous month." compact />
              ) : (
                <div className="overflow-x-auto border border-efg-line rounded-lg">
                  <table className="w-full text-xs whitespace-nowrap">
                    <thead className="bg-brand-bg-body"><tr>
                      {['Period', 'Loads', 'Collection', 'Certified by', 'At', 'Note', 'Decisions', ''].map((h, hi) =>
                        <th key={hi} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {baselines.map(b => (
                        <tr key={b.id} className="border-t border-efg-line">
                          <td className="px-3 py-1.5 font-semibold">{b.date}</td>
                          <td className="px-3 py-1.5">{b.loadIds || '—'}</td>
                          <td className="px-3 py-1.5">{b.collectionId || '—'}</td>
                          <td className="px-3 py-1.5">{b.certifiedBy}</td>
                          <td className="px-3 py-1.5 tabular-nums">{b.certifiedAt.slice(0, 16).replace('T', ' ')}</td>
                          <td className="px-3 py-1.5 whitespace-normal max-w-sm text-brand-text-secondary">{b.note || '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums">{entityLogs.filter(l => l.date === b.date).length}</td>
                          <td className="px-3 py-1.5"><button onClick={() => uncertify(b.id)} className="underline text-status-red/70 hover:text-status-red">remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
};

export default ProductionPage;
