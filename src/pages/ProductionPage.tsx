import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { BackButton, Card, PageHeader, SectionHeader, TabButton } from '../components';
import {
  ControlFinding, PROD_DATASETS, runCounterpartyDrift, runCrossDataset,
  runOrphans, runSecurityDrift, runSecurityVsRef,
} from '../services/productionControls';

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
    const [loads, setLoads] = useState<Array<{ loadId: number | string; reportingDate: string }>>([]);
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
              </tr></thead>
              <tbody>
                {loads.map(l => (
                  <tr key={String(l.loadId)} onClick={() => setLoadId(String(l.loadId))}
                    className={`border-t border-efg-line cursor-pointer hover:bg-brand-bg-body/60 ${String(l.loadId) === loadId ? 'bg-brand-secondary/10 font-semibold' : ''}`}>
                    <td className="px-3 py-1">{String(l.loadId) === loadId ? '● ' : ''}{String(l.loadId)}</td>
                    <td className="px-3 py-1">{String(l.reportingDate).slice(0, 10)}</td>
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

const OrphanInsertHelper: React.FC<{ keyValue: string }> = ({ keyValue }) => {
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
    const filled = fields.map(f => [f, fmt(f, vals[f.name] || '')] as const).filter(([, v]) => v !== null);
    const sql = [
      `-- Orphan fix prepared by RegReport Production on ${new Date().toISOString().slice(0, 10)}`,
      `-- 1) CHECK — the row must not already exist:`,
      `SELECT * FROM ${table} WHERE Id = ${fmt({ name: 'Id', type: 'text' }, vals.Id || '')} AND PointInTime = ${vals.PointInTime?.trim() || '?'};`,
      ``,
      `-- 2) INSERT — review, run in SSMS, then re-run the feed:`,
      `INSERT INTO ${table} (${filled.map(([f]) => f.name).join(', ')})`,
      `VALUES (${filled.map(([, v]) => v).join(', ')});`,
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

const ProductionPage: React.FC = () => {
  const { data, setData, allEntities, currentUser } = useData();
  const [tab, setTab] = useState<'prereq' | 'controls'>('prereq');
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
                                <OrphanInsertHelper keyValue={f.key} />
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
