import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../context/DataContext';
import { BackButton, Card, Modal, PageHeader, SectionHeader, TabButton } from '../components';
import {
  CapitalLineItem,
  CapitalReport,
  CapitalRowMap,
  CapitalSection,
  FinStatement,
  FinStatementKind,
  ImportMapping,
  LcrReport,
  NsfrReport,
} from '../types';
import { computeFinSummary, createFinStatementTemplate, KIND_LABELS, KIND_SECTIONS } from '../services/finStatements';
import {
  computeCapitalSummary,
  createManualCapitalTemplate,
  newItemId,
  projectToKpiHistory,
  SECTION_LABELS,
} from '../services/capital';
import { resolveMapping } from '../services/importMapping';
import {
  buildCapitalItemsTemplate, buildFinStatementTemplate, convertCapitalItemsCsv,
  convertFinStatementCsv, downloadCsv, parseCsv,
} from '../services/csvImport';
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

// --- Numeric input that tolerates intermediate states ("-", "1.", empty) --------

/**
 * A controlled <input type="number"> resets "-" to 0 (parseFloat('-') is NaN),
 * making negative amounts impossible to type. This input keeps the raw text
 * while focused and only commits parseable values; on blur it snaps back to
 * the committed number. Accepts both '.' and ',' as decimal separator.
 */
const AmountInput: React.FC<{
  value: number;
  onCommit: (v: number) => void;
  className?: string;
}> = ({ value, onCommit, className }) => {
  const [text, setText] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={() => setEditing(true)}
      onChange={e => {
        const raw = e.target.value;
        setText(raw);
        const v = parseFloat(raw.replace(',', '.'));
        if (!isNaN(v)) onCommit(v);
      }}
      onBlur={() => {
        setEditing(false);
        const v = parseFloat(text.replace(',', '.'));
        onCommit(isNaN(v) ? 0 : v);
        setText(String(isNaN(v) ? 0 : v));
      }}
      className={className}
    />
  );
};

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
  const add = (memo?: boolean) =>
    onChange([...items, { id: newItemId(), section, code: `custom${Date.now() % 10000}`, label: '', amount: 0, ...(memo ? { memo: true } : {}) }]);

  return (
    <div>
      <div className="overflow-x-auto border border-efg-line rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-bg-body text-left">
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold">Item</th>
              <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold text-right w-44">Amount (mCHF)</th>
              <th className="px-3 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold text-center w-16" title="Memorandum: informational only, excluded from the totals">Memo</th>
              <th className="px-2 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-efg-line">
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-brand-text-secondary">No items — add a row below.</td></tr>
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
                  <AmountInput
                    value={row.amount}
                    onCommit={v => update(row.id, { amount: v })}
                    className={`w-36 text-right bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-sm py-1 tabular-nums ${row.memo ? 'text-brand-text-secondary italic' : row.amount < 0 ? 'text-status-red' : 'text-brand-text-primary'}`}
                  />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={!!row.memo}
                    onChange={e => update(row.id, { memo: e.target.checked || undefined })}
                    title="Memorandum item — shown for information, excluded from the total"
                    className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer"
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
              <td colSpan={2} className="px-3 py-2.5 text-center text-[10px] uppercase tracking-wide text-brand-text-secondary">excl. memo</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <button onClick={() => add(false)} className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-4 rounded-md transition-colors">
            + Add row
          </button>
          <button onClick={() => add(true)} title="Informational row (e.g. share buyback, acquisitions, shares sold) — excluded from the total"
            className="text-sm font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-1.5 px-4 rounded-md transition-colors">
            + Add memo row
          </button>
        </div>
        <span className="text-[11px] text-brand-text-secondary italic">Memo rows (greyed) are informational — e.g. share buyback, acquisitions — and never touch the total.</span>
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
      <AmountInput
        value={r[key] as number}
        onCommit={v => update(r.id, { [key]: v } as Partial<LcrReport>)}
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

  const title = parsed.kind === 'capital'
    ? 'Import — Capital Adequacy (FINMA CASABIS)'
    : parsed.kind === 'lcr'
      ? 'Import — LCR (SNB LCR_G)'
      : 'Import — NSFR (SNB NSFR_G)';

  return (
    <Modal isOpen onClose={onCancel} title={title}>
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

        {parsed.kind === 'nsfr' && (
          <div className="border border-efg-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-efg-line">
                <tr><td className="px-4 py-2 text-brand-text-secondary">Total ASF (weighted)</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{fmt(parsed.totalAsf)} mCHF</td></tr>
                <tr><td className="px-4 py-2 text-brand-text-secondary">Total RSF (weighted)</td><td className="px-4 py-2 text-right tabular-nums">{fmt(parsed.totalRsf)} mCHF</td></tr>
                <tr><td className="px-4 py-2 text-brand-text-secondary">NSFR ratio</td><td className="px-4 py-2 text-right font-semibold tabular-nums">{fmtPct(parsed.nsfrRatio)}</td></tr>
                <tr><td className="px-4 py-2 text-brand-text-secondary">Detail line items (ASF / RSF / off-B/S)</td><td className="px-4 py-2 text-right tabular-nums">{parsed.lineItems.length}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {parsed.kind === 'capital' && (
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
        )}
        {parsed.kind === 'lcr' && (
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

// --- Import mapping editor -----------------------------------------------------------

const FieldInput: React.FC<{ label: string; value: string; onChange: (v: string) => void; wide?: boolean }> = ({ label, value, onChange, wide }) => (
  <div className={wide ? 'col-span-2' : ''}>
    <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">{label}</label>
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
      className="block w-full p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary focus:ring-brand-primary" />
  </div>
);

const MappingEditor: React.FC<{
  current?: ImportMapping;
  onSave: (mapping: ImportMapping) => void;
  onClose: () => void;
}> = ({ current, onSave, onClose }) => {
  const [m, setM] = useState<Required<ImportMapping>>(() => resolveMapping(current));

  const setSheet = (k: 'km1' | 'cap' | 'rwa', v: string) => setM(p => ({ ...p, sheets: { ...p.sheets, [k]: v } }));
  const setKm1 = (k: string, v: string) => setM(p => ({ ...p, km1Items: { ...p.km1Items, [k]: v } }));
  const setAnchor = (k: string, v: string) => setM(p => ({ ...p, capitalAnchors: { ...p.capitalAnchors, [k]: v } }));
  const setLcrCode = (k: string, v: string) => setM(p => ({ ...p, lcrCodes: { ...p.lcrCodes, [k]: v } }));
  const setHqla = (k: 'cat1' | 'cat2a' | 'cat2b' | 'total', v: string) =>
    setM(p => ({ ...p, lcrHqlaLabels: { ...p.lcrHqlaLabels, [k]: v.split('\n').map(s => s.trim()).filter(Boolean) } }));

  const updateRow = (idx: number, patch: Partial<CapitalRowMap>) =>
    setM(p => ({ ...p, capitalRows: p.capitalRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));
  const removeRow = (idx: number) => setM(p => ({ ...p, capitalRows: p.capitalRows.filter((_, i) => i !== idx) }));
  const addRow = () => setM(p => ({
    ...p,
    capitalRows: [...p.capitalRows, { finma: '', section: 'equity', code: '', label: '' }],
  }));

  const km1Labels: Array<[string, string]> = [
    ['cet1Capital', 'CET1 capital'], ['tier1Capital', 'Tier 1'], ['totalCapital', 'Total capital'],
    ['rwa', 'Total RWA'], ['cet1Ratio', 'CET1 ratio'], ['tier1Ratio', 'T1 ratio'],
    ['totalCapitalRatio', 'Total cap. ratio'], ['leverageExposure', 'Leverage exposure'], ['leverageRatio', 'Leverage ratio'],
  ];
  const anchorLabels: Array<[string, string]> = [
    ['netCet1', 'Net CET1 (reconciliation)'], ['rwaTotal', 'RWA total'], ['creditRwa', 'Credit RWA'],
    ['marketRwa', 'Market RWA'], ['opRwa', 'Operational RWA'], ['leverageExposure', 'Leverage exposure (LRD)'],
  ];
  const lcrCodeLabels: Array<[string, string]> = [
    ['totalOutflows', 'Total outflows'], ['inflowsBeforeCap', 'Inflows before cap'],
    ['inflowsAfterCap', 'Inflows after cap'], ['lcrRatio', 'LCR ratio'],
  ];

  return (
    <Modal isOpen onClose={onClose} title="Import mapping — FINMA / SNB template anchors">
      <div className="space-y-7 text-sm">
        <p className="text-brand-text-secondary">
          These anchors tell the importer where to read each figure. When FINMA or the SNB publish a
          new template version (renamed sheets, moved rows), adjust them here — no code change needed.
          The mapping is stored with the central data (and in SQL Server in API mode).
        </p>

        <section>
          <SectionHeader title="Capital workbook — sheet names" />
          <div className="grid grid-cols-3 gap-3">
            <FieldInput label="Key metrics (KM1)" value={m.sheets.km1 || ''} onChange={v => setSheet('km1', v)} />
            <FieldInput label="Capital composition" value={m.sheets.cap || ''} onChange={v => setSheet('cap', v)} />
            <FieldInput label="RWA / leverage" value={m.sheets.rwa || ''} onChange={v => setSheet('rwa', v)} />
          </div>
        </section>

        <section>
          <SectionHeader title="KM1 item numbers" suffix="start of the label in column B" />
          <div className="grid grid-cols-3 gap-3">
            {km1Labels.map(([k, label]) => (
              <FieldInput key={k} label={label} value={(m.km1Items as Record<string, string>)[k] || ''} onChange={v => setKm1(k, v)} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="Capital composition rows" suffix="FINMA codes in column A" />
          <div className="border border-efg-line rounded-lg overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-[13px] whitespace-nowrap">
              <thead className="sticky top-0 bg-brand-bg-body">
                <tr className="text-left">
                  {['FINMA code', 'Section', 'Code', 'Label', 'Memo', ''].map((h, i) => (
                    <th key={h + i} className="px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-brand-text-secondary font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-efg-line">
                {m.capitalRows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-1">
                      <input type="text" value={row.finma} onChange={e => updateRow(idx, { finma: e.target.value })}
                        className="w-28 bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-[13px] py-0.5 font-mono" />
                    </td>
                    <td className="px-3 py-1">
                      <select value={row.section} onChange={e => updateRow(idx, { section: e.target.value as CapitalSection })}
                        className="border-0 bg-transparent text-[13px] py-0.5 focus:ring-0 cursor-pointer">
                        <option value="equity">equity</option>
                        <option value="deduction">deduction</option>
                        <option value="at1">at1</option>
                        <option value="t2">t2</option>
                        <option value="rwa">rwa</option>
                      </select>
                    </td>
                    <td className="px-3 py-1">
                      <input type="text" value={row.code} onChange={e => updateRow(idx, { code: e.target.value })}
                        className="w-36 bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-[13px] py-0.5 font-mono" />
                    </td>
                    <td className="px-3 py-1">
                      <input type="text" value={row.label} onChange={e => updateRow(idx, { label: e.target.value })}
                        className="w-72 bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-[13px] py-0.5" />
                    </td>
                    <td className="px-3 py-1 text-center">
                      <input type="checkbox" checked={!!row.memo} onChange={e => updateRow(idx, { memo: e.target.checked || undefined })}
                        className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer" />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button onClick={() => removeRow(idx)} className="text-gray-300 hover:text-status-red text-lg leading-none">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addRow} className="mt-2 text-[13px] font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1 px-3 rounded-md transition-colors">
            + Add mapping row
          </button>
        </section>

        <section>
          <SectionHeader title="Capital anchors" suffix="reconciliation & RWA sheet codes" />
          <div className="grid grid-cols-3 gap-3">
            {anchorLabels.map(([k, label]) => (
              <FieldInput key={k} label={label} value={(m.capitalAnchors as Record<string, string>)[k] || ''} onChange={v => setAnchor(k, v)} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="LCR — SNB row codes" suffix="column E" />
          <div className="grid grid-cols-4 gap-3">
            {lcrCodeLabels.map(([k, label]) => (
              <FieldInput key={k} label={label} value={(m.lcrCodes as Record<string, string>)[k] || ''} onChange={v => setLcrCode(k, v)} />
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title="LCR — HQLA total labels" suffix="column Y; one per line, first match wins" />
          <div className="grid grid-cols-2 gap-3">
            {(['cat1', 'cat2a', 'cat2b', 'total'] as const).map(k => (
              <div key={k}>
                <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">
                  {k === 'total' ? 'Total HQLA' : `Category ${k.replace('cat', '')}`}
                </label>
                <textarea
                  value={(m.lcrHqlaLabels[k] || []).join('\n')}
                  onChange={e => setHqla(k, e.target.value)}
                  rows={k === 'total' ? 3 : 2}
                  className="block w-full p-2 border border-gray-200 rounded-md text-[13px] bg-white focus:border-brand-primary focus:ring-brand-primary font-mono"
                />
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-between items-center pt-2 border-t border-efg-line">
          <button onClick={() => setM(resolveMapping(undefined))}
            className="text-sm font-semibold text-brand-text-secondary border border-gray-300 hover:bg-gray-50 py-2 px-4 rounded-md transition-colors">
            Reset to defaults
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm font-semibold text-brand-text-secondary border border-gray-300 hover:bg-gray-50 py-2 px-5 rounded-md transition-colors">Cancel</button>
            <button onClick={() => onSave(m)} className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md transition-colors">Save mapping</button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// --- Page ---------------------------------------------------------------------------

type WorkTab = 'equity' | 'deduction' | 'at1t2' | 'rwa' | 'lcr' | 'nsfr' | 'finBs' | 'finPnl' | 'finEq' | 'comments';

const FIN_TAB_KIND: Partial<Record<WorkTab, FinStatementKind>> = {
  finBs: 'balanceSheet', finPnl: 'pnl', finEq: 'equity',
};

// --- Financial statement editor ------------------------------------------------------

const FinStatementEditor: React.FC<{
  statement: FinStatement | null;
  kind: FinStatementKind;
  entity: string;
  date: string;
  onChange: (s: FinStatement) => void;
  onDelete: () => void;
}> = ({ statement, kind, entity, date, onChange, onDelete }) => {
  const csvInput = useRef<HTMLInputElement>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const importCsv = async (file: File) => {
    setCsvError(null);
    try {
      const { items, warnings } = convertFinStatementCsv(kind, parseCsv(await file.text()));
      if (items.length === 0) throw new Error('No valid rows found.' + (warnings[0] ? ` ${warnings[0]}` : ''));
      if (!window.confirm(`Import ${items.length} row(s) into the ${KIND_LABELS[kind]} of ${entity} — ${date}? (upsert by section+label)` +
        (warnings.length ? `\n⚠ ${warnings.length} skipped` : ''))) return;
      const base = statement ?? { ...createFinStatementTemplate(entity, date, kind), lineItems: [] };
      const lineItems = [...base.lineItems];
      for (const it of items) {
        const idx = lineItems.findIndex(x => x.section === it.section && x.label.trim().toLowerCase() === it.label.toLowerCase());
        if (idx >= 0) lineItems[idx] = { ...lineItems[idx], amount: it.amount, memo: it.memo || undefined };
        else lineItems.push({ id: newItemId(), section: it.section, code: '', label: it.label, amount: it.amount, ...(it.memo ? { memo: true } : {}) });
      }
      onChange({ ...base, lineItems, source: 'excel', fileName: file.name });
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : String(err));
    } finally {
      if (csvInput.current) csvInput.current.value = '';
    }
  };

  const summary = statement ? computeFinSummary(statement) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {!statement && (
          <button onClick={() => onChange(createFinStatementTemplate(entity, date, kind))}
            className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-4 rounded-md transition-colors">
            Start {KIND_LABELS[kind]} template
          </button>
        )}
        <input ref={csvInput} type="file" accept=".csv,text/csv" className="hidden"
          onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])} />
        <button onClick={() => csvInput.current?.click()}
          className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-2 px-4 rounded-md transition-colors">
          ⬆ Import CSV
        </button>
        <button onClick={() => downloadCsv(`${kind}_template.csv`, buildFinStatementTemplate(kind))}
          className="text-sm font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-2 px-4 rounded-md transition-colors">
          ⬇ CSV template
        </button>
        {statement && (
          <button onClick={onDelete} className="text-sm text-status-red/80 hover:text-status-red underline ml-auto">
            delete statement
          </button>
        )}
      </div>
      {csvError && <p className="text-sm text-status-red bg-status-red/10 border border-status-red/30 rounded-md px-4 py-2">{csvError}</p>}

      {statement && summary && (
        <>
          {KIND_SECTIONS[kind].map(({ key, label }) => {
            const rows = statement.lineItems.filter(i => i.section === key);
            return (
              <div key={key}>
                <SectionHeader title={label} suffix={`total ${fmt(summary.sections[key] ?? 0, 1)} mCHF`} />
                <div className="overflow-x-auto border border-efg-line rounded-lg">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-efg-line">
                      {rows.map(row => (
                        <tr key={row.id} className={row.memo ? 'bg-gray-50/60' : ''}>
                          <td className="px-4 py-1.5">
                            <input type="text" value={row.label} placeholder="Label…"
                              onChange={e => onChange({ ...statement, lineItems: statement.lineItems.map(i => i.id === row.id ? { ...i, label: e.target.value } : i) })}
                              className={`w-full bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-sm py-1 ${row.memo ? 'text-brand-text-secondary italic' : 'text-brand-text-primary'}`} />
                          </td>
                          <td className="px-4 py-1.5 text-right w-44">
                            <AmountInput value={row.amount}
                              onCommit={v => onChange({ ...statement, lineItems: statement.lineItems.map(i => i.id === row.id ? { ...i, amount: v } : i) })}
                              className={`w-36 text-right bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-sm py-1 tabular-nums ${row.memo ? 'text-brand-text-secondary italic' : row.amount < 0 ? 'text-status-red' : 'text-brand-text-primary'}`} />
                          </td>
                          <td className="px-3 py-1.5 text-center w-14">
                            <input type="checkbox" checked={!!row.memo} title="Memo — excluded from totals"
                              onChange={e => onChange({ ...statement, lineItems: statement.lineItems.map(i => i.id === row.id ? { ...i, memo: e.target.checked || undefined } : i) })}
                              className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer" />
                          </td>
                          <td className="px-2 py-1.5 text-center w-10">
                            <button onClick={() => onChange({ ...statement, lineItems: statement.lineItems.filter(i => i.id !== row.id) })}
                              className="text-gray-300 hover:text-status-red text-lg leading-none">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => onChange({ ...statement, lineItems: [...statement.lineItems, { id: newItemId(), section: key, code: '', label: '', amount: 0 }] })}
                  className="mt-2 text-[13px] font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1 px-3 rounded-md transition-colors">
                  + Add row
                </button>
              </div>
            );
          })}
          <p className={`text-sm font-semibold ${kind === 'balanceSheet' ? (summary.balanced ? 'text-status-green' : 'text-status-red') : 'text-brand-text-primary'}`}>
            {summary.keyFigureLabel}: {fmt(summary.keyFigure, 1)} mCHF
            {kind === 'balanceSheet' && (summary.balanced ? ' ✓ balanced' : ' ⚠ not balanced')}
          </p>
        </>
      )}
      {!statement && (
        <p className="text-sm text-brand-text-secondary">
          No {KIND_LABELS[kind]} for {entity} — {date} yet. Start from the template or import a CSV
          (columns: section · label · amount · memo).
        </p>
      )}
    </div>
  );
};

// --- NSFR summary view -------------------------------------------------------------

const SECTION_TITLES: Record<string, string> = {
  asf: 'A. Available Stable Funding (liabilities & capital)',
  rsf: 'B.1 Required Stable Funding (on balance-sheet)',
  rsfOff: 'B.2 Required Stable Funding (off balance-sheet)',
};

const NsfrView: React.FC<{
  report: NsfrReport;
  onChange: (report: NsfrReport) => void;
  onDelete: () => void;
}> = ({ report, onChange, onDelete }) => {
  const sections: Array<'asf' | 'rsf' | 'rsfOff'> = ['asf', 'rsf', 'rsfOff'];
  return (
    <div className="space-y-7">
      <div className="grid grid-cols-3 border border-efg-line rounded-lg overflow-hidden divide-x divide-efg-line">
        <SummaryTile label="Total ASF (weighted)" value={fmt(report.totalAsf)} sub="mCHF" />
        <SummaryTile label="Total RSF (weighted)" value={fmt(report.totalRsf)} sub="mCHF" />
        <SummaryTile label="NSFR Ratio" value={fmtPct(report.nsfrRatio)} sub={report.nsfrRatio >= 100 ? 'above 100% requirement' : 'BELOW 100% requirement'} accent />
      </div>
      <p className="text-[12px] text-brand-text-secondary -mt-3">
        Source: <span className="font-semibold">{report.source === 'excel' ? `Excel — ${report.fileName}` : 'Manual entry'}</span>
        <button onClick={onDelete} className="ml-4 text-status-red/80 hover:text-status-red underline">delete NSFR report</button>
      </p>
      {sections.map(section => {
        const rows = report.lineItems.filter(i => i.section === section);
        if (rows.length === 0) return null;
        const tot = (k: 'amountLt6m' | 'amount6mTo1y' | 'amountGte1y') => rows.reduce((a, r) => a + (r[k] || 0), 0);
        return (
          <div key={section}>
            <SectionHeader title={SECTION_TITLES[section]} suffix="raw amounts by residual maturity, mCHF" />
            <div className="overflow-x-auto border border-efg-line rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-bg-body text-left">
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold w-14">Code</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold">Item</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold text-right w-32">&lt; 6 months</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold text-right w-32">6m – 1 year</th>
                    <th className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-brand-text-secondary font-semibold text-right w-32">≥ 1 year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-efg-line">
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td className="px-4 py-1.5 font-mono text-[12px] text-brand-text-secondary">{row.code}</td>
                      <td className="px-4 py-1.5 text-brand-text-primary">{row.label}</td>
                      {(['amountLt6m', 'amount6mTo1y', 'amountGte1y'] as const).map(k => (
                        <td key={k} className="px-4 py-1.5 text-right">
                          <AmountInput
                            value={row[k]}
                            onCommit={v => onChange({
                              ...report,
                              lineItems: report.lineItems.map(i => (i.id === row.id ? { ...i, [k]: v } : i)),
                            })}
                            className="w-28 text-right bg-transparent border-0 border-b border-transparent focus:border-brand-primary focus:ring-0 text-sm py-1 tabular-nums"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-brand-bg-body border-t border-brand-text-primary/30 text-sm font-semibold text-brand-text-primary">
                    <td className="px-4 py-2.5" colSpan={2}>Total (raw)</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(tot('amountLt6m'), 1)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(tot('amount6mTo1y'), 1)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmt(tot('amountGte1y'), 1)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}
      <p className="text-[11px] text-brand-text-secondary italic">
        Weighted totals (ASF {fmt(report.totalAsf, 0)} / RSF {fmt(report.totalRsf, 0)}) come from the NSFR_G form;
        the raw bucket amounts above are pre-weighting. Edit the weighted totals directly if needed:
      </p>
      <div className="flex gap-4 items-end">
        {([['totalAsf', 'Total ASF (weighted)'], ['totalRsf', 'Total RSF (weighted)']] as const).map(([k, label]) => (
          <div key={k}>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">{label}</label>
            <AmountInput
              value={report[k]}
              onCommit={v => {
                const next = { ...report, [k]: v } as NsfrReport;
                next.nsfrRatio = next.totalRsf > 0 ? Math.round((next.totalAsf / next.totalRsf) * 10000) / 100 : 0;
                onChange(next);
              }}
              className="w-36 p-2 border border-gray-200 rounded-md text-sm text-right tabular-nums focus:border-brand-primary"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export const CapitalWorkbenchPage: React.FC = () => {
  const { data, setData, allEntities } = useData();
  const [entity, setEntity] = useState(allEntities[0] || 'Group');
  const [date, setDate] = useState('');
  const [tab, setTab] = useState<WorkTab>('equity');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const itemsCsvInput = useRef<HTMLInputElement>(null);

  const capitalReports = data.capitalReports || [];
  const lcrReports = data.lcrReports || [];
  const nsfrReports = data.nsfrReports || [];

  // Dates available for the selected entity across reports + KPI history.
  const datesForEntity = useMemo(() => {
    const set = new Set<string>();
    capitalReports.filter(r => r.entity === entity).forEach(r => set.add(r.date));
    lcrReports.filter(r => r.entity === entity).forEach(r => set.add(r.date));
    nsfrReports.filter(r => r.entity === entity).forEach(r => set.add(r.date));
    data.kpisHistory.filter(k => k.entity === entity).forEach(k => set.add(k.date));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [capitalReports, lcrReports, nsfrReports, data.kpisHistory, entity]);

  const effectiveDate = date || datesForEntity[0] || '';

  const report = useMemo(
    () => capitalReports.find(r => r.entity === entity && r.date === effectiveDate) || null,
    [capitalReports, entity, effectiveDate]
  );
  const entityLcrs = useMemo(
    () => lcrReports.filter(r => r.entity === entity && r.date === effectiveDate),
    [lcrReports, entity, effectiveDate]
  );
  const nsfrReport = useMemo(
    () => nsfrReports.find(r => r.entity === entity && r.date === effectiveDate) || null,
    [nsfrReports, entity, effectiveDate]
  );
  const finStatements = data.finStatements || [];
  const finFor = useCallback((kind: FinStatementKind) =>
    finStatements.find(s => s.entity === entity && s.date === effectiveDate && s.kind === kind) || null,
  [finStatements, entity, effectiveDate]);

  const updateFinStatement = useCallback((s: FinStatement) => {
    setData(prev => ({
      ...prev,
      finStatements: [
        ...(prev.finStatements || []).filter(x => !(x.entity === s.entity && x.date === s.date && x.kind === s.kind)),
        s,
      ],
    }));
  }, [setData]);

  const deleteFinStatement = useCallback((kind: FinStatementKind) => {
    if (!window.confirm(`Delete the ${KIND_LABELS[kind]} for ${entity} — ${effectiveDate}?`)) return;
    setData(prev => ({
      ...prev,
      finStatements: (prev.finStatements || []).filter(x => !(x.entity === entity && x.date === effectiveDate && x.kind === kind)),
    }));
  }, [setData, entity, effectiveDate]);
  const summary = useMemo(() => (report ? computeCapitalSummary(report) : null), [report]);

  // --- mutations (all end with re-projecting the aggregated KPI entry) ---

  const applyChange = useCallback((mutate: (draft: {
    capitalReports: CapitalReport[]; lcrReports: LcrReport[]; nsfrReports: NsfrReport[];
  }) => { entity: string; date: string }) => {
    setData(prev => {
      const draft = {
        capitalReports: [...(prev.capitalReports || [])],
        lcrReports: [...(prev.lcrReports || [])],
        nsfrReports: [...(prev.nsfrReports || [])],
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

  const updateNsfr = useCallback((updated: NsfrReport) => {
    applyChange(draft => {
      draft.nsfrReports = [
        ...draft.nsfrReports.filter(r => !(r.entity === updated.entity && r.date === updated.date)),
        updated,
      ];
      return { entity: updated.entity, date: updated.date };
    });
  }, [applyChange]);

  const deleteNsfr = useCallback(() => {
    if (!nsfrReport) return;
    if (!window.confirm(`Delete the NSFR report for ${entity} — ${effectiveDate}?`)) return;
    setData(prev => ({
      ...prev,
      nsfrReports: (prev.nsfrReports || []).filter(r => !(r.entity === entity && r.date === effectiveDate)),
    }));
  }, [nsfrReport, entity, effectiveDate, setData]);

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
      setParsed(parseWorkbook(buffer, file.name, data.importMapping));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  // Bulk line-items CSV (memoranda, CET1 detail, RWA by currency…): upserts
  // into the CURRENT entity+date report, matched by section+label.
  const handleItemsCsv = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const { items, warnings } = convertCapitalItemsCsv(parseCsv(text));
      if (items.length === 0) throw new Error('No valid line items found in the CSV.' + (warnings.length ? ` ${warnings[0]}` : ''));
      const targetDate = effectiveDate || new Date().toISOString().slice(0, 10);
      if (!window.confirm(
        `Import ${items.length} line item(s) into ${entity} — ${targetDate}?\n` +
        `Rows with the same section+label are updated, new ones are appended.` +
        (warnings.length ? `\n\n⚠ ${warnings.length} line(s) skipped:\n${warnings.slice(0, 5).join('\n')}` : '')
      )) return;

      const base = report ?? { ...createManualCapitalTemplate(entity, targetDate), lineItems: [] as CapitalLineItem[] };
      const lineItems = [...base.lineItems];
      for (const it of items) {
        const idx = lineItems.findIndex(x => x.section === it.section && x.label.trim().toLowerCase() === it.label.toLowerCase());
        const patch = {
          section: it.section as CapitalSection,
          label: it.label,
          amount: it.amount,
          ...(it.memo ? { memo: true as const } : {}),
        };
        if (idx >= 0) {
          lineItems[idx] = { ...lineItems[idx], ...patch, memo: it.memo || undefined };
        } else {
          lineItems.push({ id: newItemId(), code: it.code || `csv${Date.now() % 100000}${lineItems.length}`, ...patch });
        }
      }
      updateReport({ ...base, lineItems });
      if (!date) setDate(targetDate);
      setNotice(`${items.length} line item(s) imported into ${entity} — ${targetDate} (upsert by section+label). Totals & KPI history updated.`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      if (itemsCsvInput.current) itemsCsvInput.current.value = '';
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
    } else if (parsed.kind === 'lcr') {
      applyChange(draft => {
        draft.lcrReports = [
          ...draft.lcrReports.filter(r => !(r.entity === targetEntity && r.date === parsed.date)),
          ...parsed.reports.map(r => ({ ...r, id: newItemId(), entity: targetEntity })),
        ];
        return { entity: targetEntity, date: parsed.date };
      });
      setNotice(`LCR imported for ${targetEntity} — ${parsed.date} (${parsed.reports.length} currencies). KPI history updated.`);
    } else {
      const newNsfr: NsfrReport = {
        id: newItemId(),
        entity: targetEntity,
        date: parsed.date,
        source: 'excel',
        fileName: parsed.fileName,
        totalAsf: parsed.totalAsf,
        totalRsf: parsed.totalRsf,
        nsfrRatio: parsed.nsfrRatio,
        lineItems: parsed.lineItems,
      };
      applyChange(draft => {
        draft.nsfrReports = [
          ...draft.nsfrReports.filter(r => !(r.entity === targetEntity && r.date === parsed.date)),
          newNsfr,
        ];
        return { entity: targetEntity, date: parsed.date };
      });
      setNotice(`NSFR imported for ${targetEntity} — ${parsed.date} (ASF ${parsed.totalAsf.toFixed(0)} / RSF ${parsed.totalRsf.toFixed(0)} mCHF, ratio ${parsed.nsfrRatio}%). KPI history updated.`);
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
              {importing ? 'Reading…' : 'Import Excel (CASABIS / LCR_G / NSFR_G)'}
            </button>
            <button
              onClick={startManual}
              className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-2.5 px-5 rounded-md transition-colors"
            >
              {report ? 'Reset manual template' : 'Start manual entry'}
            </button>
            <button
              onClick={() => setShowMapping(true)}
              title="Adjust the FINMA/SNB template anchors (new template version) — no code change needed"
              className="text-sm font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-2.5 px-4 rounded-md transition-colors"
            >
              Mapping{data.importMapping ? ' •' : ''}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            ref={itemsCsvInput}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleItemsCsv(e.target.files[0])}
          />
          <button
            onClick={() => itemsCsvInput.current?.click()}
            title="Bulk-load line items (memoranda, CET1 movement detail, RWA by currency…) into the selected entity+date"
            className="text-[13px] font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-1.5 px-4 rounded-md transition-colors"
          >
            ⬆ Bulk line items (CSV)
          </button>
          <button
            onClick={() => downloadCsv('CapitalLineItems_template.csv', buildCapitalItemsTemplate())}
            className="text-[13px] font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-1.5 px-4 rounded-md transition-colors"
          >
            ⬇ CSV template
          </button>
          <span className="text-[11px] text-brand-text-secondary">
            columns: section (equity|deduction|at1|t2|rwa) · label · amount · memo (true/false) · code — upsert by section+label into {entity} — {effectiveDate || 'today'}
          </span>
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
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-brand-text-secondary">
            <span>
              Source: <span className="font-semibold">{report.source === 'excel' ? `Excel — ${report.fileName}` : 'Manual entry'}</span>
              {report.importedAt && <> · imported {new Date(report.importedAt).toLocaleString()}</>}
            </span>
            <label className="flex items-center gap-1.5 cursor-pointer" title="Mark this report as a forward-looking projection (shown separately in the Management Report)">
              <input
                type="checkbox"
                checked={!!report.isProjection}
                onChange={e => updateReport({ ...report, isProjection: e.target.checked || undefined })}
                className="rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer"
              />
              <span>Projection (forward-looking)</span>
            </label>
            <button onClick={deleteReport} className="text-status-red/80 hover:text-status-red underline">delete report</button>
          </div>
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
          <TabButton label={`NSFR${nsfrReport ? ' ✓' : ''}`} isActive={tab === 'nsfr'} onClick={() => setTab('nsfr')} />
          <TabButton label={`Balance Sheet${finFor('balanceSheet') ? ' ✓' : ''}`} isActive={tab === 'finBs'} onClick={() => setTab('finBs')} />
          <TabButton label={`P&L${finFor('pnl') ? ' ✓' : ''}`} isActive={tab === 'finPnl'} onClick={() => setTab('finPnl')} />
          <TabButton label={`Equity Stmt${finFor('equity') ? ' ✓' : ''}`} isActive={tab === 'finEq'} onClick={() => setTab('finEq')} />
          <TabButton label="Comments" isActive={tab === 'comments'} onClick={() => setTab('comments')} />
        </div>

        {tab !== 'lcr' && tab !== 'nsfr' && !FIN_TAB_KIND[tab] && tab !== 'comments' && !report && (
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
          <div>
            <LineItemTable items={report.lineItems} section="rwa" onChange={items => updateReport({ ...report, lineItems: items })} />
            <p className="mt-3 text-[11px] text-brand-text-secondary bg-brand-bg-body border border-efg-line rounded-md px-3 py-2">
              <strong>RWA by currency —</strong> add <em>memo</em> rows labelled with the 3-letter currency code
              (<code>USD</code> = CHF-equivalent amount) and optionally <code>USD (LC)</code> = amount in original currency:
              the Management Report then shows the currency table, the implied FX rates and the FX-impact vs business-growth
              decomposition — without touching the totals.
            </p>
          </div>
        )}
        {tab === 'lcr' && (
          <LcrTable reports={entityLcrs} onChange={updateLcrs} entity={entity} date={effectiveDate || new Date().toISOString().slice(0, 10)} />
        )}
        {tab === 'nsfr' && (
          nsfrReport ? (
            <NsfrView
              report={nsfrReport}
              onChange={updateNsfr}
              onDelete={deleteNsfr}
            />
          ) : (
            <div className="text-center py-12 text-brand-text-secondary">
              <p className="mb-4">No NSFR report for <span className="font-semibold">{entity}</span>{effectiveDate && <> — {effectiveDate}</>} yet.</p>
              <p className="text-sm">Import the SNB <strong>NSFR_G</strong> Excel file (button above) — it fills the ASF/RSF detail, the weighted totals and the ratio, and feeds the NSFR KPI automatically.</p>
            </div>
          )
        )}
        {FIN_TAB_KIND[tab] && (
          <FinStatementEditor
            statement={finFor(FIN_TAB_KIND[tab]!)}
            kind={FIN_TAB_KIND[tab]!}
            entity={entity}
            date={effectiveDate || new Date().toISOString().slice(0, 10)}
            onChange={updateFinStatement}
            onDelete={() => deleteFinStatement(FIN_TAB_KIND[tab]!)}
          />
        )}
        {tab === 'comments' && (
          <div className="space-y-6 max-w-3xl">
            <div>
              <SectionHeader title="Active capital management" suffix="shown on the Management Report — one bullet per line" />
              <textarea
                value={report?.comments || ''}
                onChange={e => report && updateReport({ ...report, comments: e.target.value })}
                disabled={!report}
                rows={5}
                placeholder={report ? 'e.g.\nShare buyback of CHF 67.5 mn in 2026 to fund employee incentive plans\nYTD net result of 153.6 mn' : 'Create or import a capital report first.'}
                className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary focus:ring-brand-primary disabled:bg-gray-50"
              />
            </div>
            <div>
              <SectionHeader title="LCR / HQLA comments" suffix="stored on the TOT currency row" />
              <textarea
                value={entityLcrs.find(r => r.currency === 'TOT')?.comments || ''}
                onChange={e => {
                  const tot = entityLcrs.find(r => r.currency === 'TOT');
                  if (tot) updateLcrs(entityLcrs.map(r => (r.id === tot.id ? { ...r, comments: e.target.value } : r)));
                }}
                disabled={!entityLcrs.some(r => r.currency === 'TOT')}
                rows={4}
                placeholder={entityLcrs.some(r => r.currency === 'TOT') ? 'e.g.\nThe HQLA decreased by CHF -174 mm due to:\n- decrease in central bank reserves by CHF -548 mm' : 'Import or add an LCR TOT row first.'}
                className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary focus:ring-brand-primary disabled:bg-gray-50"
              />
            </div>
            <div>
              <SectionHeader title="NSFR comments" />
              <textarea
                value={nsfrReport?.comments || ''}
                onChange={e => nsfrReport && updateNsfr({ ...nsfrReport, comments: e.target.value })}
                disabled={!nsfrReport}
                rows={4}
                placeholder={nsfrReport ? 'e.g.\nThe increase of CHF 337 mm in customer deposits is the main driver of the increase in ASF' : 'Import an NSFR report first.'}
                className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary focus:ring-brand-primary disabled:bg-gray-50"
              />
            </div>
          </div>
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

      {showMapping && (
        <MappingEditor
          current={data.importMapping}
          onSave={mapping => {
            setData(prev => ({ ...prev, importMapping: mapping }));
            setShowMapping(false);
            setNotice('Import mapping saved — it will be used for the next Excel imports (and persisted with the central data).');
          }}
          onClose={() => setShowMapping(false)}
        />
      )}
    </div>
  );
};
