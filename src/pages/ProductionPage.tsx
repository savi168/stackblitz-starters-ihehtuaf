import React, { useMemo, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { BackButton, Card, PageHeader, SectionHeader, TabButton } from '../components';
import { ProdCounterpartyRecord, ProdDataset, ProdGuaranteeRef, ProdSecurityRecord } from '../types';
import {
  buildProdCounterpartyTemplate, buildProdRefTemplate, buildProdSecuritiesTemplate,
  convertProdCounterpartyCsv, convertProdRefCsv, convertProdSecuritiesCsv, downloadCsv, parseCsv,
} from '../services/csvImport';
import {
  ControlFinding, PROD_DATASETS, runCounterpartyDrift, runCrossDataset,
  runSecurityDrift, runSecurityVsRef,
} from '../services/productionControls';

/**
 * Production (team-only): consistency controls on the production data,
 * period over period. Prerequisites = the CSV-fed datasets (counterparty
 * records, securities vs security master, Grouplexid guarantee/HQLA
 * reference); Controls = the check results between two periods.
 */

let nextId = Date.now();
const newId = () => ++nextId;

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
    const [dataset, setDataset] = useState('liquidityAssets');
    const [date, setDate] = useState('');
    const [loadId, setLoadId] = useState('');
    const [productType, setProductType] = useState('');
    const [busy, setBusy] = useState(false);

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
      if (!date || !loadId) { onError('MERCURY feed: reporting date and loadid are required.'); return; }
      setBusy(true);
      try {
        const res = await fetch(`${apiBaseUrl}/production/mercury/load`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ target, entity, date, loadId, productType: productType || null, dataset }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`);
        }
        const out = await res.json() as { inserted: number; skipped: number; tvf: string };
        await reload();
        onLoaded(`MERCURY feed OK: ${out.inserted} row(s) loaded into ${target} for ${entity} — ${date} (loadid ${loadId}${productType ? `, ${productType}` : ''}) via ${out.tvf}${out.skipped ? ` · ${out.skipped} row(s) without key skipped` : ''}.`);
      } catch (err) {
        onError(`MERCURY feed failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally { setBusy(false); }
    };

    const input = 'p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary';
    return (
      <Card>
        <SectionHeader title="0 — Feed from MERCURY" suffix="trigger the TVF by loadid + product type — replaces the scope, then run the controls" />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Target</label>
            <select value={target} onChange={e => setTarget(e.target.value as 'counterparties' | 'securities')} className={input}>
              <option value="counterparties">Counterparty datasets</option>
              <option value="securities">Securities</option>
            </select>
          </div>
          {target === 'counterparties' && (
            <div>
              <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Dataset (if TVF has none)</label>
              <select value={dataset} onChange={e => setDataset(e.target.value)} className={input}>
                {PROD_DATASETS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Reporting date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={input} />
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

const ProductionPage: React.FC = () => {
  const { data, setData, allEntities } = useData();
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

  const cpInput = useRef<HTMLInputElement>(null);
  const secInput = useRef<HTMLInputElement>(null);
  const refInput = useRef<HTMLInputElement>(null);

  const importCounterparties = async (file: File) => {
    setError(null);
    try {
      const { rows, warnings } = convertProdCounterpartyCsv(parseCsv(await file.text()));
      if (rows.length === 0) throw new Error('No valid rows found.' + (warnings.length ? ` ${warnings[0]}` : ''));
      const scopes = Array.from(new Set(rows.map(r => `${r.date}|${r.dataset}`)));
      if (!window.confirm(
        `Import ${rows.length} counterparty record(s) for ${entity} across ${scopes.length} period×dataset scope(s)?\n` +
        `Existing records for the same entity+date+dataset are replaced.` +
        (warnings.length ? `\n\n⚠ ${warnings.length} line(s) skipped:\n${warnings.slice(0, 5).join('\n')}` : '')
      )) return;
      const scopeSet = new Set(scopes);
      setData(prev => ({
        ...prev,
        prodCounterparties: [
          ...(prev.prodCounterparties || []).filter(r => !(r.entity === entity && scopeSet.has(`${r.date}|${r.dataset}`))),
          ...rows.map(r => ({ ...r, id: newId(), entity, dataset: r.dataset as ProdDataset } as ProdCounterpartyRecord)),
        ],
      }));
      setNotice(`${rows.length} counterparty record(s) imported for ${entity} (${scopes.length} scope(s) replaced).`);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { if (cpInput.current) cpInput.current.value = ''; }
  };

  const importSecurities = async (file: File) => {
    setError(null);
    try {
      const { rows, warnings } = convertProdSecuritiesCsv(parseCsv(await file.text()));
      if (rows.length === 0) throw new Error('No valid rows found.' + (warnings.length ? ` ${warnings[0]}` : ''));
      const ds = Array.from(new Set(rows.map(r => r.date)));
      if (!window.confirm(
        `Import ${rows.length} security record(s) for ${entity} across ${ds.length} period(s)?\n` +
        `Existing securities for the same entity+date are replaced.` +
        (warnings.length ? `\n\n⚠ ${warnings.length} line(s) skipped:\n${warnings.slice(0, 5).join('\n')}` : '')
      )) return;
      const dateSet = new Set(ds);
      setData(prev => ({
        ...prev,
        prodSecurities: [
          ...(prev.prodSecurities || []).filter(r => !(r.entity === entity && dateSet.has(r.date))),
          ...rows.map(r => ({ ...r, id: newId(), entity } as ProdSecurityRecord)),
        ],
      }));
      setNotice(`${rows.length} security record(s) imported for ${entity} (${ds.length} period(s) replaced).`);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { if (secInput.current) secInput.current.value = ''; }
  };

  const importRefs = async (file: File) => {
    setError(null);
    try {
      const { rows, warnings } = convertProdRefCsv(parseCsv(await file.text()));
      if (rows.length === 0) throw new Error('No valid rows found.' + (warnings.length ? ` ${warnings[0]}` : ''));
      if (!window.confirm(
        `Replace the Grouplexid guarantee/HQLA reference with ${rows.length} entry(ies)?` +
        (warnings.length ? `\n\n⚠ ${warnings.length} line(s) skipped:\n${warnings.slice(0, 5).join('\n')}` : '')
      )) return;
      setData(prev => ({
        ...prev,
        prodGuaranteeRefs: rows.map(r => ({ ...r, id: newId() } as ProdGuaranteeRef)),
      }));
      setNotice(`Reference replaced: ${rows.length} grouplexid entry(ies).`);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { if (refInput.current) refInput.current.value = ''; }
  };

  const deletePeriod = (d: string) => {
    if (!window.confirm(`Delete ALL production data (counterparties + securities) for ${entity} — ${d}?`)) return;
    setData(prev => ({
      ...prev,
      prodCounterparties: (prev.prodCounterparties || []).filter(r => !(r.entity === entity && r.date === d)),
      prodSecurities: (prev.prodSecurities || []).filter(r => !(r.entity === entity && r.date === d)),
    }));
  };

  // --- Controls tab state ---
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
    const order = { error: 0, warning: 1, info: 2 };
    return out.sort((a, b) => order[a.severity] - order[b.severity] || a.control.localeCompare(b.control));
  }, [cps, secs, refs, entity, date, compare]);

  const counts = useMemo(() => ({
    error: findings.filter(f => f.severity === 'error').length,
    warning: findings.filter(f => f.severity === 'warning').length,
    info: findings.filter(f => f.severity === 'info').length,
  }), [findings]);

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
            <SectionHeader title="1 — Counterparty datasets" suffix="liquidity assets · due from/to banks · due from/to customers · mortgages" />
            <p className="text-[12px] text-brand-text-secondary mb-3">
              One CSV for all periods and datasets: date · dataset · client_number · client_type (data model) ·
              group_lexid (ultimate parent) · counterparty_type · issuer_rating · amount · currency.
              Import replaces each entity+date+dataset scope present in the file.
            </p>
            <div className="flex flex-wrap gap-3">
              <input ref={cpInput} type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files?.[0] && importCounterparties(e.target.files[0])} />
              <button onClick={() => cpInput.current?.click()} className="text-[13px] font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-4 rounded-md transition-colors">⬆ Import CSV</button>
              <button onClick={() => downloadCsv('ProdCounterparties_template.csv', buildProdCounterpartyTemplate())} className="text-[13px] font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-1.5 px-4 rounded-md transition-colors">⬇ template</button>
            </div>
          </Card>
          <Card>
            <SectionHeader title="2 — Securities vs security master" suffix="ISIN · rating · daily reval · guarantor · HQLA level" />
            <p className="text-[12px] text-brand-text-secondary mb-3">
              date · isin · security_master · security_type · rating · daily_reval · issuer_lexid · guarantor_lexid ·
              guarantor_name · hqla_level (L1/L2a/L2b/nonHqla) · amount. Import replaces each entity+date present in the file.
            </p>
            <div className="flex flex-wrap gap-3">
              <input ref={secInput} type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files?.[0] && importSecurities(e.target.files[0])} />
              <button onClick={() => secInput.current?.click()} className="text-[13px] font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-4 rounded-md transition-colors">⬆ Import CSV</button>
              <button onClick={() => downloadCsv('ProdSecurities_template.csv', buildProdSecuritiesTemplate())} className="text-[13px] font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-1.5 px-4 rounded-md transition-colors">⬇ template</button>
            </div>
          </Card>
          <Card>
            <SectionHeader title="3 — Grouplexid guarantee / HQLA reference" suffix={`${refs.length} entries — e.g. KFW → German government → L1`} />
            <div className="flex flex-wrap gap-3 mb-3">
              <input ref={refInput} type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files?.[0] && importRefs(e.target.files[0])} />
              <button onClick={() => refInput.current?.click()} className="text-[13px] font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-4 rounded-md transition-colors">⬆ Import CSV (replace)</button>
              <button onClick={() => downloadCsv('ProdGuaranteeRefs_template.csv', buildProdRefTemplate())} className="text-[13px] font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-1.5 px-4 rounded-md transition-colors">⬇ template</button>
            </div>
            {refs.length > 0 && (
              <div className="overflow-x-auto border border-efg-line rounded-lg">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-brand-bg-body"><tr>
                    {['Grouplexid', 'Name', 'Guarantor', 'Expected HQLA', 'Notes'].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {refs.map(r => (
                      <tr key={r.id} className="border-t border-efg-line">
                        <td className="px-3 py-1.5 font-semibold">{r.groupLexId}</td>
                        <td className="px-3 py-1.5">{r.name || '—'}</td>
                        <td className="px-3 py-1.5">{r.guarantorName || r.guarantorLexId || '—'}</td>
                        <td className="px-3 py-1.5">{r.expectedHqlaLevel || '—'}</td>
                        <td className="px-3 py-1.5 text-brand-text-secondary">{r.notes || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
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
          </div>
          {dates.length === 0 ? (
            <p className="text-sm text-brand-text-secondary">No production data for {entity} — load the Prerequisites first.</p>
          ) : findings.length === 0 ? (
            <p className="text-sm text-brand-text-primary bg-status-green/10 border border-status-green/30 rounded-md px-4 py-3">
              ✓ No inconsistency found for {date}{compare ? ` vs ${compare}` : ''} — same treatment across periods, datasets and the reference.
            </p>
          ) : (
            <div className="overflow-x-auto border border-efg-line rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-brand-bg-body"><tr>
                  {['Severity', 'Control', 'Dataset', 'Key', 'Finding'].map(h => <th key={h} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {findings.map((f, i) => (
                    <tr key={i} className="border-t border-efg-line align-top">
                      <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${SEV_STYLE[f.severity]}`}>{f.severity}</span></td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{f.control}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-brand-text-secondary">{f.dataset || '—'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap font-semibold">{f.key}</td>
                      <td className="px-3 py-1.5">{f.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-brand-text-secondary mt-3">
            C1 — attribute drift per client between the two periods (client type, grouplexid, counterparty type, rating).
            C2 — same grouplexid must carry one single treatment across all datasets of the period.
            C3 — security attribute drift per ISIN (HQLA level change = error).
            C4 — guarantor & HQLA level vs the Grouplexid reference (physical data must match the HQLA report treatment).
          </p>
        </Card>
      )}
    </div>
  );
};

export default ProductionPage;
