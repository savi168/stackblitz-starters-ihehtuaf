import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { BackButton, Card, PageHeader, SectionHeader } from '../components';
import { Scenario, ScenarioShock, ShockTarget } from '../types';
import { newItemId } from '../services/capital';
import { formatDate } from '../utils';

/**
 * What-if simulator: build named scenarios of shocks (acquisition, disposal,
 * HQLA purchase/sale, deposit outflow…) on top of a baseline period and see
 * the impact on CET1 / total capital / leverage, LCR and NSFR — per shock and
 * combined. Scenarios are persisted (Scenarios + ScenarioShocks tables).
 */

const fmt = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined || isNaN(v as number) ? '—'
    : (v as number).toLocaleString('en-CH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const fmtPct = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined || isNaN(v as number) ? '—' : `${(v as number).toFixed(digits)}%`;

/** Shock catalogue: what can be shocked, per target metric. */
const SHOCK_CODES: Record<ShockTarget, Array<{ code: string; label: string }>> = {
  capital: [
    { code: 'cet1Delta', label: 'Δ CET1 capital (e.g. goodwill of an acquisition −, sale gain +)' },
    { code: 'at1Delta', label: 'Δ AT1 capital (issuance +, buy-back −)' },
    { code: 'rwaDelta', label: 'Δ Total RWA (acquired book +, disposal −)' },
    { code: 'lrdDelta', label: 'Δ Leverage exposure (LRD)' },
  ],
  lcr: [
    { code: 'hqlaDelta', label: 'Δ HQLA (purchase +, sale −)' },
    { code: 'outflowsDelta', label: 'Δ Weighted outflows (deposit outflow +…)' },
    { code: 'inflowsDelta', label: 'Δ Weighted inflows (after cap)' },
  ],
  nsfr: [
    { code: 'asfDelta', label: 'Δ Available stable funding (ASF)' },
    { code: 'rsfDelta', label: 'Δ Required stable funding (RSF)' },
  ],
};

const TARGET_LABELS: Record<ShockTarget, string> = { capital: 'Capital', lcr: 'LCR', nsfr: 'NSFR' };

interface Baseline {
  cet1: number | null; at1: number | null; rwa: number | null; lrd: number | null;
  hqla: number | null; outflows: number | null; inflows: number | null;
  asf: number | null; rsf: number | null;
}

interface SimResult {
  cet1Ratio: [number | null, number | null];
  totalRatio: [number | null, number | null];
  leverage: [number | null, number | null];
  lcr: [number | null, number | null];
  nsfr: [number | null, number | null];
}

const sumShocks = (shocks: ScenarioShock[], code: string) =>
  shocks.filter(s => s.code === code).reduce((a, s) => a + (s.amount || 0), 0);

const simulate = (base: Baseline, shocks: ScenarioShock[]): SimResult => {
  const ratio = (num: number | null, den: number | null): number | null =>
    num !== null && den !== null && den > 0 ? (num / den) * 100 : null;

  const cet1B = base.cet1, rwaB = base.rwa;
  const cet1A = cet1B !== null ? cet1B + sumShocks(shocks, 'cet1Delta') : null;
  const at1A = base.at1 !== null ? base.at1 + sumShocks(shocks, 'at1Delta') : null;
  const rwaA = rwaB !== null ? rwaB + sumShocks(shocks, 'rwaDelta') : null;
  const lrdA = base.lrd !== null ? base.lrd + sumShocks(shocks, 'lrdDelta') : null;
  const t1B = cet1B !== null && base.at1 !== null ? cet1B + base.at1 : null;
  const t1A = cet1A !== null && at1A !== null ? cet1A + at1A : null;

  const hqlaA = base.hqla !== null ? base.hqla + sumShocks(shocks, 'hqlaDelta') : null;
  const outA = base.outflows !== null ? base.outflows + sumShocks(shocks, 'outflowsDelta') : null;
  const inA = base.inflows !== null ? base.inflows + sumShocks(shocks, 'inflowsDelta') : null;
  const netB = base.outflows !== null && base.inflows !== null ? Math.max(base.outflows - base.inflows, 0) : null;
  const netA = outA !== null && inA !== null ? Math.max(outA - inA, 0) : null;

  const asfA = base.asf !== null ? base.asf + sumShocks(shocks, 'asfDelta') : null;
  const rsfA = base.rsf !== null ? base.rsf + sumShocks(shocks, 'rsfDelta') : null;

  return {
    cet1Ratio: [ratio(cet1B, rwaB), ratio(cet1A, rwaA)],
    totalRatio: [ratio(t1B, rwaB), ratio(t1A, rwaA)],
    leverage: [ratio(t1B, base.lrd), ratio(t1A, lrdA)],
    lcr: [ratio(base.hqla, netB), ratio(hqlaA, netA)],
    nsfr: [ratio(base.asf, base.rsf), ratio(asfA, rsfA)],
  };
};

export const ScenariosPage: React.FC = () => {
  const { data, setData, allEntities, isAdmin } = useData();
  const [entity, setEntity] = useState(allEntities[0] || 'Group');
  const [baseDate, setBaseDate] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const dates = useMemo(() => {
    const set = new Set<string>();
    data.kpisHistory.filter(k => k.entity === entity).forEach(k => set.add(k.date));
    (data.lcrReports || []).filter(r => r.entity === entity).forEach(r => set.add(r.date));
    (data.nsfrReports || []).filter(r => r.entity === entity).forEach(r => set.add(r.date));
    return Array.from(set).sort();
  }, [data, entity]);
  const effDate = baseDate || dates[dates.length - 1] || '';

  // Baseline figures from the aggregated stores.
  const baseline: Baseline = useMemo(() => {
    const k = data.kpisHistory.find(x => x.entity === entity && x.date === effDate);
    const rwa = k ? k.creditRWA + k.marketRWA + k.opRWA + k.otherRWA : null;
    const lcrTot = (data.lcrReports || []).find(r => r.entity === entity && r.date === effDate && r.currency === 'TOT');
    const liqTot = k?.liquidity?.TOT;
    const nsfr = (data.nsfrReports || []).find(r => r.entity === entity && r.date === effDate);
    return {
      cet1: k ? k.cet1Capital : null,
      at1: k ? k.tier1 - k.cet1Capital : null,
      rwa,
      lrd: k && k.exposure > 0 ? k.exposure : null,
      hqla: lcrTot ? lcrTot.totalHqla : liqTot?.hqla ?? null,
      outflows: lcrTot ? lcrTot.totalOutflows : liqTot?.netCashOutflows ?? null,
      inflows: lcrTot ? lcrTot.inflowsAfterCap : (liqTot?.netCashOutflows !== undefined ? 0 : null),
      asf: nsfr ? nsfr.totalAsf : liqTot?.asf ?? null,
      rsf: nsfr ? nsfr.totalRsf : liqTot?.rsf ?? null,
    };
  }, [data, entity, effDate]);

  const scenarios = useMemo(
    () => (data.scenarios || []).filter(s => s.entity === entity && s.baseDate === effDate),
    [data.scenarios, entity, effDate]
  );
  const scenario = scenarios.find(s => s.id === selectedId) || scenarios[0] || null;
  useEffect(() => {
    if (scenario && selectedId !== scenario.id) setSelectedId(scenario.id);
    if (!scenario) setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, effDate, scenarios.length]);

  const saveScenario = (s: Scenario) =>
    setData(prev => ({ ...prev, scenarios: [...(prev.scenarios || []).filter(x => x.id !== s.id), s] }));

  const createScenario = () => {
    const s: Scenario = { id: newItemId(), entity, baseDate: effDate, name: `Scenario ${scenarios.length + 1}`, shocks: [] };
    saveScenario(s);
    setSelectedId(s.id);
  };
  const duplicateScenario = () => {
    if (!scenario) return;
    const s: Scenario = { ...scenario, id: newItemId(), name: `${scenario.name} (copy)`, shocks: scenario.shocks.map(x => ({ ...x, id: newItemId() })) };
    saveScenario(s);
    setSelectedId(s.id);
  };
  const deleteScenario = () => {
    if (!scenario || !window.confirm(`Delete scenario "${scenario.name}"?`)) return;
    setData(prev => ({ ...prev, scenarios: (prev.scenarios || []).filter(x => x.id !== scenario.id) }));
    setSelectedId(null);
  };

  const sim = scenario ? simulate(baseline, scenario.shocks) : null;

  const metricRow = (label: string, pair: [number | null, number | null], goodUp = true) => {
    const [before, after] = pair;
    const delta = before !== null && after !== null ? after - before : null;
    return (
      <div className="px-5 py-4 text-center">
        <p className="text-[11px] uppercase tracking-[0.15em] text-brand-text-secondary mb-1">{label}</p>
        <p className="text-sm text-brand-text-secondary">{fmtPct(before)} →</p>
        <p className="text-2xl font-light text-brand-text-primary">{fmtPct(after)}</p>
        {delta !== null && (
          <p className={`text-[12px] font-medium ${delta === 0 ? 'text-brand-text-secondary' : (delta > 0) === goodUp ? 'text-status-green' : 'text-status-red'}`}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(2)} p.p.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="p-5 md:p-8">
      <BackButton />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Scenarios & Projections" subtitle="What-if simulation: acquisitions, disposals, HQLA trades… impact on CET1, LCR and NSFR" />
        <div className="mb-6 flex gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Entity</label>
            <select value={entity} onChange={e => { setEntity(e.target.value); setBaseDate(''); setSelectedId(null); }}
              className="p-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-brand-primary min-w-36">
              {allEntities.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Baseline period</label>
            <select value={effDate} onChange={e => { setBaseDate(e.target.value); setSelectedId(null); }}
              className="p-2.5 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-brand-primary min-w-36">
              {dates.map(d => <option key={d} value={d}>{formatDate(d)}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Scenario selector */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {scenarios.map(s => (
            <button key={s.id} onClick={() => setSelectedId(s.id)}
              className={`text-sm font-semibold py-1.5 px-4 rounded-md border transition-colors ${scenario?.id === s.id ? 'bg-brand-secondary text-white border-brand-secondary' : 'text-brand-text-secondary border-gray-300 hover:border-brand-secondary hover:text-brand-secondary'}`}>
              {s.name}
            </button>
          ))}
          {isAdmin && (
            <>
              <button onClick={createScenario} className="text-sm font-semibold text-brand-primary border border-brand-primary hover:bg-brand-primary hover:text-white py-1.5 px-4 rounded-md transition-colors">+ New scenario</button>
              {scenario && <button onClick={duplicateScenario} className="text-sm text-brand-text-secondary hover:text-brand-secondary underline">duplicate</button>}
              {scenario && <button onClick={deleteScenario} className="text-sm text-status-red/80 hover:text-status-red underline">delete</button>}
            </>
          )}
          {scenarios.length === 0 && !isAdmin && <p className="text-sm text-brand-text-secondary">No scenarios for this entity/period.</p>}
        </div>
        {scenario && isAdmin && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="text" value={scenario.name} onChange={e => saveScenario({ ...scenario, name: e.target.value })}
              className="p-2 border-2 border-gray-200 rounded-lg text-sm font-semibold focus:border-brand-primary" placeholder="Scenario name" />
            <input type="text" value={scenario.description || ''} onChange={e => saveScenario({ ...scenario, description: e.target.value })}
              className="p-2 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary" placeholder="Description (e.g. Acquisition of XYZ + USD 240m AT1 buy-back)" />
          </div>
        )}
      </Card>

      {scenario && (
        <>
          {/* Shocks editor */}
          <Card className="mb-6">
            <SectionHeader title="Shocks" suffix="signed amounts, mCHF — applied to the baseline" />
            <div className="overflow-x-auto border border-efg-line rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-bg-body text-left">
                    {['Target', 'Impact', 'Label', 'Amount (mCHF)', ''].map((h, i) => (
                      <th key={h + i} className={`px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold ${i === 3 ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-efg-line">
                  {scenario.shocks.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-brand-text-secondary">No shocks yet — add one below (e.g. Capital / Δ CET1 = −115 for the goodwill of an acquisition).</td></tr>
                  )}
                  {scenario.shocks.map(shock => (
                    <tr key={shock.id}>
                      <td className="px-4 py-1.5 w-28">
                        <select value={shock.target} disabled={!isAdmin}
                          onChange={e => {
                            const target = e.target.value as ShockTarget;
                            saveScenario({ ...scenario, shocks: scenario.shocks.map(x => x.id === shock.id ? { ...x, target, code: SHOCK_CODES[target][0].code } : x) });
                          }}
                          className="border-0 bg-transparent text-sm py-0.5 focus:ring-0 cursor-pointer font-semibold">
                          {(Object.keys(TARGET_LABELS) as ShockTarget[]).map(t => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-1.5">
                        <select value={shock.code} disabled={!isAdmin}
                          onChange={e => saveScenario({ ...scenario, shocks: scenario.shocks.map(x => x.id === shock.id ? { ...x, code: e.target.value } : x) })}
                          className="border-0 bg-transparent text-sm py-0.5 focus:ring-0 cursor-pointer max-w-xs truncate">
                          {SHOCK_CODES[shock.target].map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-1.5">
                        <input type="text" value={shock.label} disabled={!isAdmin} placeholder="e.g. Acquisition Spark — goodwill"
                          onChange={e => saveScenario({ ...scenario, shocks: scenario.shocks.map(x => x.id === shock.id ? { ...x, label: e.target.value } : x) })}
                          className="w-full bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-sm py-1" />
                      </td>
                      <td className="px-4 py-1.5 text-right w-40">
                        <input type="text" inputMode="decimal" defaultValue={shock.amount} disabled={!isAdmin}
                          onBlur={e => {
                            const v = parseFloat(e.target.value.replace(',', '.'));
                            saveScenario({ ...scenario, shocks: scenario.shocks.map(x => x.id === shock.id ? { ...x, amount: isNaN(v) ? 0 : v } : x) });
                          }}
                          className={`w-32 text-right bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-sm py-1 tabular-nums ${shock.amount < 0 ? 'text-status-red' : ''}`} />
                      </td>
                      <td className="px-2 py-1.5 text-center w-10">
                        {isAdmin && <button onClick={() => saveScenario({ ...scenario, shocks: scenario.shocks.filter(x => x.id !== shock.id) })}
                          className="text-gray-300 hover:text-status-red text-lg leading-none">×</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isAdmin && (
              <button onClick={() => saveScenario({ ...scenario, shocks: [...scenario.shocks, { id: newItemId(), target: 'capital', code: 'cet1Delta', label: '', amount: 0 }] })}
                className="mt-3 text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-4 rounded-md transition-colors">
                + Add shock
              </button>
            )}
          </Card>

          {/* Results */}
          {sim && (
            <Card className="mb-6">
              <SectionHeader title={`Impact — ${scenario.name}`} suffix={`baseline ${formatDate(effDate)} → after shocks`} />
              <div className="grid grid-cols-2 md:grid-cols-5 border border-efg-line rounded-lg overflow-hidden divide-x divide-efg-line">
                {metricRow('CET1 Ratio', sim.cet1Ratio)}
                {metricRow('Total Capital Ratio', sim.totalRatio)}
                {metricRow('Leverage Ratio', sim.leverage)}
                {metricRow('LCR', sim.lcr)}
                {metricRow('NSFR', sim.nsfr)}
              </div>
              {/* Per-shock standalone contributions */}
              {scenario.shocks.length > 1 && (
                <div className="mt-4 overflow-x-auto border border-efg-line rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-brand-bg-body">
                      <tr>
                        {['Shock (standalone impact)', 'CET1 ratio', 'LCR', 'NSFR'].map((h, i) => (
                          <th key={h} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold ${i > 0 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-efg-line">
                      {scenario.shocks.map(shock => {
                        const solo = simulate(baseline, [shock]);
                        const d = (pair: [number | null, number | null]) =>
                          pair[0] !== null && pair[1] !== null ? pair[1] - pair[0] : null;
                        const cell = (v: number | null) => v === null || Math.abs(v) < 0.005 ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)} p.p.`;
                        return (
                          <tr key={shock.id}>
                            <td className="px-3 py-1.5">{shock.label || SHOCK_CODES[shock.target].find(c => c.code === shock.code)?.label} <span className="text-brand-text-secondary">({fmt(shock.amount, 0)})</span></td>
                            <td className={`px-3 py-1.5 text-right tabular-nums ${d(solo.cet1Ratio) !== null && d(solo.cet1Ratio)! < 0 ? 'text-status-red' : 'text-brand-text-primary'}`}>{cell(d(solo.cet1Ratio))}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums ${d(solo.lcr) !== null && d(solo.lcr)! < 0 ? 'text-status-red' : 'text-brand-text-primary'}`}>{cell(d(solo.lcr))}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums ${d(solo.nsfr) !== null && d(solo.nsfr)! < 0 ? 'text-status-red' : 'text-brand-text-primary'}`}>{cell(d(solo.nsfr))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-brand-text-secondary mt-3 italic">
                Simplifications: LCR inflow cap is not re-computed after shocks; RWA/LRD deltas are applied directly (no risk-weighting model).
                Baselines come from the aggregated KPI entry, the LCR TOT row and the NSFR report of the selected period.
              </p>
            </Card>
          )}

          {/* All scenarios side by side */}
          {scenarios.length > 1 && (
            <Card>
              <SectionHeader title="Scenario comparison" suffix={`baseline ${formatDate(effDate)}`} />
              <div className="overflow-x-auto border border-efg-line rounded-lg">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="bg-brand-bg-body">
                    <tr>
                      {['Metric', 'Baseline', ...scenarios.map(s => s.name)].map((h, i) => (
                        <th key={h + i} className={`px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold ${i > 0 ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-efg-line">
                    {([['CET1 Ratio', 'cet1Ratio'], ['Total Capital Ratio', 'totalRatio'], ['Leverage Ratio', 'leverage'], ['LCR', 'lcr'], ['NSFR', 'nsfr']] as Array<[string, keyof SimResult]>).map(([label, key]) => (
                      <tr key={key}>
                        <td className="px-3 py-1.5 font-semibold text-brand-text-primary">{label}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtPct(simulate(baseline, [])[key][0])}</td>
                        {scenarios.map(s => (
                          <td key={s.id} className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtPct(simulate(baseline, s.shocks)[key][1])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
