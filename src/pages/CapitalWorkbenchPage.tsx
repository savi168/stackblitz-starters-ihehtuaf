import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { BackButton, Card, Modal, PageHeader, SectionHeader, TabButton } from '../components';
import {
  CapitalLineItem,
  CapitalReport,
  CapitalSection,
  LcrReport,
} from '../types';
import {
  computeCapitalSummary,
  createManualCapitalTemplate,
  newItemId,
  projectToKpiHistory,
  SECTION_LABELS,
} from '../services/capital';
import type { ParsedImport } from '../services/excelImport';

/**
 * Capital & Liquidity Workbench: feed the KPIs per entity either by importing
 * the official FINMA/SNB Excel returns (CASABIS capital adequacy, LCR_G) or by
 * entering the components manually in the sub-applications (shareholder
 * equity, deductions, AT1/T2, RWA, LCR by currency). CET1 is computed from
 * the components and projected into the aggregated KPI history used by all
 * dashboards.
 */

const fmt = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined || isNaN(v) ? '—' : v.toLocaleString('en-CH', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmtPct = (v: number | null | undefined): string =>
  v === null || v === undefined || isNaN(v) ? '—' : `${v.toFixed(2)}%`;

// --- Summary strip -----------------------------------------------------------

const SummaryTile: React.FC<{ label: string; value: string; sub?: string; accent?: boolean }> = ({ label, value, sub, accent }) => (
  <div className={`px-5 py-6 text-center flex flex-col justify-center ${accent ? 'bg-brand-secondary text-white' : 'bg-white'}`}>
    <p className={`text-[11px] uppercase tracking-[0.15em] mb-2 ${accent ? 'text-white/70' : 'text-brand-text-secondary'}`}>{label}</p>
    <p className={`text-2xl font-light leading-none ${accent ? '' : 'text-brand-text-primary'}`}>{value}</p>
    {sub && <p className={`text-[11px] mt-2 ${accent ? 'text-white/60' : 'text-brand-text-secondary'}`}>{sub}</p>}
  </div>
);

// --- Editable line-item table --------------------------------------------------

const LineItemTable: React.FC<{
  items: CapitalLineItem[];
  section: CapitalSection;
  onChange: (items: CapitalLineItem[]) => void;
}> = ({ items, section, onChange }) => {
  const rows = items.filter(i => i.section === section);
  const additiveTotal = rows.filter(r => !r.memo).reduce((a, r) => a + (r.amount || 0), 0);

  const update = (id: number, patch: Partial<CapitalLineItem>) =>
    onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));
  const remove = (id: number) => onChange(items.filter(i => i.id !== id));
  const add = () =>
    onChange([...items, { id: newItemId(), section, code: `custom${Date.now() % 10000}`, label: '', amount: 0 }]);

  return (
    <div>
      <div className="overflow-x-auto border border-efg-line rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-bg-body text-left">
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold">Item</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold text-right w-44">Amount (mCHF)</th>
              <th className="px-2 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-efg-line">
            {rows.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-brand-text-secondary">No items — add a row below.</td></tr>
            )}
            {rows.map(row => (
              <tr key={row.id} className={row.memo ? 'bg-gray-50/60' : ''}>
                <td className="px-4 py-1.5">
                  <input
                    type="text"
                    value={row.label}
                    onChange={e => update(row.id, { label: e.target.value })}
                    placeholder="Label…"
                    className={`w-full bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-sm py-1 ${row.memo ? 'text-brand-text-secondary italic' : 'text-brand-text-primary'}`}
                  />
                </td>
                <td className="px-4 py-1.5 text-right">
                  <input
                    type="number"
                    step="0.01"
                    value={row.amount}
                    onChange={e => update(row.id, { amount: parseFloat(e.target.value) || 0 })}
                    className={`w-36 text-right bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-sm py-1 tabular-nums ${row.amount < 0 ? 'text-status-red' : 'text-brand-text-primary'}`}
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button onClick={() => remove(row.id)} title="Remove row" className="text-gray-300 hover:text-status-red text-lg leading-none">×</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-brand-bg-body border-t border-brand-text-primary/30">
              <td className="px-4 py-2.5 text-sm font-semibold text-brand-text-primary">Total ({SECTION_LABELS[section]})</td>
              <td className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums text-brand-text-primary">{fmt(additiveTotal, 2)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={add} className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-4 rounded-md transition-colors">
          + Add row
        </button>
        {rows.some(r => r.memo) && (
          <span className="text-[11px] text-brand-text-secondary italic">Greyed rows are “of which” details — not added to the total.</span>
        )}
      </div>
    </div>
  );
};

// --- LCR table -----------------------------------------------------------------

const LcrTable: React.FC<{
  reports: LcrReport[];
  onChange: (reports: LcrReport[]) => void;
  entity: string;
  date: string;
}> = ({ reports, onChange, entity, date }) => {
  const update = (id: number, patch: Partial<LcrReport>) =>
    onChange(reports.map(r => {
      if (r.id !== id) return r;
      const next = { ...r, ...patch };
      next.netOutflows = Math.max(next.totalOutflows - next.inflowsAfterCap, 0);
      next.lcrRatio = next.netOutflows > 0 ? Math.round((next.totalHqla / next.netOutflows) * 10000) / 100 : 0;
      return next;
    }));
  const remove = (id: number) => onChange(reports.filter(r => r.id !== id));
  const add = () =>
    onChange([...reports, {
      id: newItemId(), entity, date, currency: 'TOT', source: 'manual',
      hqlaCat1: 0, hqlaCat2a: 0, hqlaCat2b: 0, totalHqla: 0,
      totalOutflows: 0, inflowsBeforeCap: 0, inflowsAfterCap: 0, netOutflows: 0, lcrRatio: 0,
    }]);

  const numCell = (r: LcrReport, key: keyof LcrReport) => (
    <td className="px-3 py-1.5 text-right">
      <input
        type="number" step="0.1" value={r[key] as number}
        onChange={e => update(r.id, { [key]: parseFloat(e.target.value) || 0 } as Partial<LcrReport>)}
        className="w-28 text-right bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-sm py-1 tabular-nums"
      />
    </td>
  );

  return (
    <div>
      <div className="overflow-x-auto border border-efg-line rounded-lg">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="bg-brand-bg-body text-left">
              {['Currency', 'HQLA Cat 1', 'HQLA Cat 2a', 'HQLA Cat 2b', 'Total HQLA', 'Outflows', 'Inflows (capped)', 'Net outflows', 'LCR', ''].map((h, i) => (
                <th key={h + i} className={`px-3 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold ${i > 0 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-efg-line">
            {reports.length === 0 && (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-brand-text-secondary">No LCR data for this entity/date — import an LCR_G file or add a currency.</td></tr>
            )}
            {reports.map(r => (
              <tr key={r.id}>
                <td className="px-3 py-1.5">
                  <input
                    type="text" value={r.currency}
                    onChange={e => update(r.id, { currency: e.target.value.toUpperCase().slice(0, 3) })}
                    className="w-16 bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-sm font-semibold py-1"
                  />
                </td>
                {numCell(r, 'hqlaCat1')}
                {numCell(r, 'hqlaCat2a')}
                {numCell(r, 'hqlaCat2b')}
                {numCell(r, 'totalHqla')}
                {numCell(r, 'totalOutflows')}
                {numCell(r, 'inflowsAfterCap')}
                <td className="px-3 py-1.5 text-right tabular-nums text-brand-text-secondary">{fmt(r.netOutflows)}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${r.netOutflows === 0 ? 'text-brand-text-secondary' : r.lcrRatio >= 100 ? 'text-status-green' : 'text-status-red'}`}>
                  {r.netOutflows === 0 ? '—' : fmtPct(r.lcrRatio)}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button onClick={() => remove(r.id)} title="Remove currency" className="text-gray-300 hover:text-status-red text-lg leading-none">×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <button onClick={add} className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-4 rounded-md transition-colors">
          + Add currency
        </button>
      </div>
    </div>
  );
};

// --- Import preview modal ---------------------------------------------------------

const ImportPreview: React.FC<{
  parsed: ParsedImport;
  entities: string[];
  onConfirm: (entity: string) => void;
  onCancel: () => void;
}> = ({ parsed, entities, onConfirm, onCancel }) => {
  const [entity, setEntity] = useState(entities[0] || '');
  const [newEntity, setNewEntity] = useState('');
  const effectiveEntity = newEntity.trim() || entity;

  return (
    <Modal isOpen onClose={onCancel} title={parsed.kind === 'capital' ? 'Import — Capital Adequacy (FINMA CASABIS)' : 'Import — LCR (SNB LCR_G)'}>
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary mb-1">File</p>
            <p className="font-medium text-brand-text-primary break-all">{parsed.fileName}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary mb-1">Reporting date (from file)</p>
            <p className="font-medium text-brand-text-primary">{parsed.date}</p>
          </div>
        </div>

        {parsed.kind === 'capital' ? (
          <div className="border border-efg-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-efg-line">
                <tr><td className="px-4 py-2 text-brand-text-secondary">CET1 capital</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{fmt(parsed.keyMetrics.cet1Capital)} mCHF</td></tr>
                <tr><td className="px-4 py-2 text-brand-text-secondary">Tier 1 / Total capital</td><td className="px-4 py-2 text-right tabular-nums">{fmt(parsed.keyMetrics.tier1Capital)} / {fmt(parsed.keyMetrics.totalCapital)} mCHF</td></tr>
                <tr><td className="px-4 py-2 text-brand-text-secondary">Total RWA</td><td className="px-4 py-2 text-right tabular-nums">{fmt(parsed.keyMetrics.rwa)} mCHF</td></tr>
                <tr><td className="px-4 py-2 text-brand-text-secondary">CET1 ratio / Leverage ratio</td><td className="px-4 py-2 text-right tabular-nums">{fmtPct(parsed.keyMetrics.cet1Ratio)} / {fmtPct(parsed.keyMetrics.leverageRatio)}</td></tr>
                <tr><td className="px-4 py-2 text-brand-text-secondary">Detail line items</td><td className="px-4 py-2 text-right tabular-nums">{parsed.lineItems.length}</td></tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border border-efg-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-brand-bg-body text-left">
                <th className="px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary">Currency</th>
                <th className="px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary text-right">HQLA</th>
                <th className="px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary text-right">Net outflows</th>
                <th className="px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary text-right">LCR</th>
              </tr></thead>
              <tbody className="divide-y divide-efg-line">
                {parsed.reports.map(r => (
                  <tr key={r.currency}>
                    <td className="px-4 py-2 font-semibold">{r.currency}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(r.totalHqla)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmt(r.netOutflows)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{r.netOutflows === 0 ? '—' : fmtPct(r.lcrRatio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-brand-text-secondary mb-1">Assign to entity</label>
            <select value={entity} onChange={e => setEntity(e.target.value)} disabled={!!newEntity.trim()}
              className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-brand-primary focus:ring-brand-primary disabled:opacity-50">
              {entities.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-brand-text-secondary mb-1">…or a new entity</label>
            <input type="text" value={newEntity} onChange={e => setNewEntity(e.target.value)} placeholder="e.g. Monaco"
              className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-brand-primary focus:ring-brand-primary" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onCancel} className="text-sm font-semibold text-brand-text-secondary border border-gray-300 hover:bg-gray-50 py-2 px-5 rounded-md transition-colors">Cancel</button>
          <button
            onClick={() => effectiveEntity && onConfirm(effectiveEntity)}
            disabled={!effectiveEntity}
            className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors disabled:opacity-40"
          >
            Import for “{effectiveEntity || '…'}”
          </button>
        </div>
      </div>
    </Modal>
  );
};

// --- Page ---------------------------------------------------------------------------

type WorkTab = 'equity' | 'deduction' | 'at1t2' | 'rwa' | 'lcr';

export const CapitalWorkbenchPage: React.FC = () => {
  const { data, setData, allEntities } = useData();
  const [entity, setEntity] = useState(allEntities[0] || 'Group');
  const [date, setDate] = useState('');
  const [tab, setTab] = useState<WorkTab>('equity');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const capitalReports = data.capitalReports || [];
  const lcrReports = data.lcrReports || [];

  // Dates available for the selected entity across reports + KPI history.
  const datesForEntity = useMemo(() => {
    const set = new Set<string>();
    capitalReports.filter(r => r.entity === entity).forEach(r => set.add(r.date));
    lcrReports.filter(r => r.entity === entity).forEach(r => set.add(r.date));
    data.kpisHistory.filter(k => k.entity === entity).forEach(k => set.add(k.date));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [capitalReports, lcrReports, data.kpisHistory, entity]);

  const effectiveDate = date || datesForEntity[0] || '';

  const report = useMemo(
    () => capitalReports.find(r => r.entity === entity && r.date === effectiveDate) || null,
    [capitalReports, entity, effectiveDate]
  );
  const entityLcrs = useMemo(
    () => lcrReports.filter(r => r.entity === entity && r.date === effectiveDate),
    [lcrReports, entity, effectiveDate]
  );
  const summary = useMemo(() => (report ? computeCapitalSummary(report) : null), [report]);

  // --- mutations (all end with re-projecting the aggregated KPI entry) ---

  const applyChange = useCallback((mutate: (draft: {
    capitalReports: CapitalReport[]; lcrReports: LcrReport[];
  }) => { entity: string; date: string }) => {
    setData(prev => {
      const draft = {
        capitalReports: [...(prev.capitalReports || [])],
        lcrReports: [...(prev.lcrReports || [])],
      };
      const target = mutate(draft);
      const next = { ...prev, ...draft };
      next.kpisHistory = projectToKpiHistory(next, target.entity, target.date);
      return next;
    });
  }, [setData]);

  const updateReport = useCallback((updated: CapitalReport) => {
    applyChange(draft => {
      draft.capitalReports = [
        ...draft.capitalReports.filter(r => !(r.entity === updated.entity && r.date === updated.date)),
        updated,
      ];
      return { entity: updated.entity, date: updated.date };
    });
  }, [applyChange]);

  const updateLcrs = useCallback((reports: LcrReport[]) => {
    applyChange(draft => {
      draft.lcrReports = [
        ...draft.lcrReports.filter(r => !(r.entity === entity && r.date === effectiveDate)),
        ...reports,
      ];
      return { entity, date: effectiveDate };
    });
  }, [applyChange, entity, effectiveDate]);

  const startManual = () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = effectiveDate || today;
    updateReport(createManualCapitalTemplate(entity, d));
    if (!date) setDate(d);
    setNotice(`Manual capital template created for ${entity} — ${d}. Fill in the components; CET1 is computed live.`);
  };

  const handleFile = async (file: File) => {
    setImportError(null);
    setImporting(true);
    try {
      const { parseWorkbook } = await import('../services/excelImport');
      const buffer = await file.arrayBuffer();
      setParsed(parseWorkbook(buffer, file.name));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const confirmImport = (targetEntity: string) => {
    if (!parsed) return;
    if (parsed.kind === 'capital') {
      const newReport: CapitalReport = {
        id: newItemId(),
        entity: targetEntity,
        date: parsed.date,
        source: 'excel',
        fileName: parsed.fileName,
        importedAt: new Date().toISOString(),
        keyMetrics: parsed.keyMetrics,
        lineItems: parsed.lineItems,
      };
      applyChange(draft => {
        draft.capitalReports = [
          ...draft.capitalReports.filter(r => !(r.entity === targetEntity && r.date === parsed.date)),
          newReport,
        ];
        return { entity: targetEntity, date: parsed.date };
      });
      setNotice(`Capital adequacy imported for ${targetEntity} — ${parsed.date} (${parsed.lineItems.length} line items). KPI history updated.`);
    } else {
      applyChange(draft => {
        draft.lcrReports = [
          ...draft.lcrReports.filter(r => !(r.entity === targetEntity && r.date === parsed.date)),
          ...parsed.reports.map(r => ({ ...r, id: newItemId(), entity: targetEntity })),
        ];
        return { entity: targetEntity, date: parsed.date };
      });
      setNotice(`LCR imported for ${targetEntity} — ${parsed.date} (${parsed.reports.length} currencies). KPI history updated.`);
    }
    setEntity(targetEntity);
    setDate(parsed.date);
    setParsed(null);
  };

  const deleteReport = () => {
    if (!report) return;
    if (!window.confirm(`Delete the capital report for ${entity} — ${effectiveDate}? The aggregated KPI entry is kept.`)) return;
    setData(prev => ({
      ...prev,
      capitalReports: (prev.capitalReports || []).filter(r => !(r.entity === entity && r.date === effectiveDate)),
    }));
  };

  const gap = summary?.cet1ReconciliationGap;

  return (
    <div className="p-5 md:p-8">
      <BackButton />
      <PageHeader title="Capital & Liquidity Workbench" subtitle="Feed the KPIs per entity: import FINMA/SNB Excel returns or enter the components in the sub-applications" />

      {/* --- Source / import bar --- */}
      <Card className="mb-6">
        <SectionHeader title="Data Source" suffix="Excel import or manual entry" />
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-brand-text-secondary mb-1">Entity</label>
              <select value={entity} onChange={e => { setEntity(e.target.value); setDate(''); }}
                className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-brand-primary focus:ring-brand-primary">
                {allEntities.map(e => <option key={e} value={e}>{e}</option>)}
                {!allEntities.includes(entity) && <option value={entity}>{entity}</option>}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text-secondary mb-1">Reporting date</label>
              <select value={effectiveDate} onChange={e => setDate(e.target.value)}
                className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm bg-white focus:border-brand-primary focus:ring-brand-primary">
                {datesForEntity.map(d => <option key={d} value={d}>{d}</option>)}
                {datesForEntity.length === 0 && <option value="">No data yet</option>}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <button
              onClick={() => fileInput.current?.click()}
              disabled={importing}
              className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2.5 px-5 rounded-md transition-colors disabled:opacity-50"
            >
              {importing ? 'Reading…' : 'Import Excel (CASABIS / LCR_G)'}
            </button>
            <button
              onClick={startManual}
              className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-2.5 px-5 rounded-md transition-colors"
            >
              {report ? 'Reset manual template' : 'Start manual entry'}
            </button>
          </div>
        </div>
        {importError && (
          <p className="mt-3 text-sm text-status-red bg-status-red/10 border border-status-red/30 rounded-md px-4 py-2">{importError}</p>
        )}
        {notice && (
          <p className="mt-3 text-sm text-brand-text-primary bg-brand-bg-body border border-efg-line rounded-md px-4 py-2 flex justify-between items-center">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="text-brand-text-secondary hover:text-brand-text-primary ml-4">×</button>
          </p>
        )}
        {report && (
          <p className="mt-3 text-[12px] text-brand-text-secondary">
            Source: <span className="font-semibold">{report.source === 'excel' ? `Excel — ${report.fileName}` : 'Manual entry'}</span>
            {report.importedAt && <> · imported {new Date(report.importedAt).toLocaleString()}</>}
            <button onClick={deleteReport} className="ml-4 text-status-red/80 hover:text-status-red underline">delete report</button>
          </p>
        )}
      </Card>

      {/* --- Computed summary --- */}
      {summary && (
        <div className="mb-6">
          <SectionHeader title={`Computed Capital Position — ${entity} · ${effectiveDate}`} suffix="CET1 = Σ equity + Σ deductions" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border border-efg-line rounded-lg overflow-hidden divide-y md:divide-y-0 divide-x divide-efg-line">
            <SummaryTile label="CET1 Capital" value={fmt(summary.cet1)} sub="mCHF" accent />
            <SummaryTile label="Tier 1" value={fmt(summary.tier1)} sub={`AT1 ${fmt(summary.at1)}`} />
            <SummaryTile label="Total Capital" value={fmt(summary.totalCapital)} sub={`T2 ${fmt(summary.t2)}`} />
            <SummaryTile label="Total RWA" value={fmt(summary.rwaTotal)} sub="mCHF" />
            <SummaryTile label="CET1 Ratio" value={fmtPct(summary.cet1Ratio)} sub={`T1 ${fmtPct(summary.tier1Ratio)}`} />
            <SummaryTile label="Leverage Ratio" value={fmtPct(summary.leverageRatio)} sub={`LRD ${fmt(summary.leverageExposure)}`} />
          </div>
          {gap !== null && gap !== undefined && (
            <p className={`mt-2 text-[12px] ${Math.abs(gap) > 0.5 ? 'text-status-amber' : 'text-brand-text-secondary'}`}>
              {Math.abs(gap) > 0.5
                ? `⚠ Computed CET1 differs from the reported KM1 figure by ${fmt(gap, 2)} mCHF — check the line items.`
                : `✓ Reconciled with the reported KM1 CET1 (${fmt(report!.keyMetrics.cet1Capital, 1)} mCHF).`}
            </p>
          )}
        </div>
      )}

      {/* --- Sub-applications --- */}
      <Card>
        <div className="flex flex-wrap gap-1 border-b border-efg-line mb-6 -mt-1">
          <TabButton label="Shareholder Equity" isActive={tab === 'equity'} onClick={() => setTab('equity')} />
          <TabButton label="Deductions" isActive={tab === 'deduction'} onClick={() => setTab('deduction')} />
          <TabButton label="AT1 & T2" isActive={tab === 'at1t2'} onClick={() => setTab('at1t2')} />
          <TabButton label="RWA" isActive={tab === 'rwa'} onClick={() => setTab('rwa')} />
          <TabButton label={`LCR (${entityLcrs.length})`} isActive={tab === 'lcr'} onClick={() => setTab('lcr')} />
        </div>

        {tab !== 'lcr' && !report && (
          <div className="text-center py-12 text-brand-text-secondary">
            <p className="mb-4">No capital report for <span className="font-semibold">{entity}</span>{effectiveDate && <> — {effectiveDate}</>} yet.</p>
            <p className="text-sm">Import the FINMA CASABIS Excel file, or start a manual template with the standard components (share capital, RSU, currency translation, goodwill, deferred tax…).</p>
          </div>
        )}

        {report && tab === 'equity' && (
          <LineItemTable items={report.lineItems} section="equity" onChange={items => updateReport({ ...report, lineItems: items })} />
        )}
        {report && tab === 'deduction' && (
          <LineItemTable items={report.lineItems} section="deduction" onChange={items => updateReport({ ...report, lineItems: items })} />
        )}
        {report && tab === 'at1t2' && (
          <div className="space-y-8">
            <div>
              <SectionHeader title="Additional Tier 1" />
              <LineItemTable items={report.lineItems} section="at1" onChange={items => updateReport({ ...report, lineItems: items })} />
            </div>
            <div>
              <SectionHeader title="Tier 2" />
              <LineItemTable items={report.lineItems} section="t2" onChange={items => updateReport({ ...report, lineItems: items })} />
            </div>
          </div>
        )}
        {report && tab === 'rwa' && (
          <LineItemTable items={report.lineItems} section="rwa" onChange={items => updateReport({ ...report, lineItems: items })} />
        )}
        {tab === 'lcr' && (
          <LcrTable reports={entityLcrs} onChange={updateLcrs} entity={entity} date={effectiveDate || new Date().toISOString().slice(0, 10)} />
        )}
      </Card>

      {parsed && (
        <ImportPreview
          parsed={parsed}
          entities={allEntities.length > 0 ? allEntities : ['Group']}
          onConfirm={confirmImport}
          onCancel={() => setParsed(null)}
        />
      )}
    </div>
  );
};
