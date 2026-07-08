import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useData } from '../context/DataContext';
import { Card, PageHeader, BackButton, SectionHeader, TabButton, Select, Modal, InfoBox } from '../components';
import { BACKEND_TABLES, AGGREGATE_ENDPOINTS, TableMeta, EndpointMeta } from '../services/backendSchema';
import {
    buildCsvTemplate, convertCsvRows, CSV_IMPORTABLE, CSV_NOTES,
    downloadCsv, NATURAL_KEYS, parseCsv,
} from '../services/csvImport';
import { projectToKpiHistory } from '../services/capital';
import { CentralData } from '../types';

const methodColor: Record<EndpointMeta['method'], string> = {
    GET: 'bg-green-50 text-green-700 border-green-200',
    POST: 'bg-blue-50 text-blue-700 border-blue-200',
    PUT: 'bg-amber-50 text-amber-700 border-amber-200',
    DELETE: 'bg-red-50 text-brand-primary border-red-200',
};

const MethodBadge: React.FC<{ method: EndpointMeta['method'] }> = ({ method }) => (
    <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${methodColor[method]}`}>{method}</span>
);

const camel = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const renderCell = (v: unknown) => {
    if (v === null || v === undefined || v === '') return <span className="text-gray-300">—</span>;
    if (typeof v === 'boolean') return <span className={v ? 'text-green-600' : 'text-gray-400'}>{v ? '✓' : '✗'}</span>;
    if (typeof v === 'object') {
        const s = JSON.stringify(v);
        return <span title={s} className="text-brand-text-secondary italic">{s.length > 44 ? s.slice(0, 44) + '…' : s}</span>;
    }
    return <span className="font-mono">{String(v)}</span>;
};

// --- Connection / reboot panel ---
const ConnectionPanel: React.FC = () => {
    const { mode, apiBaseUrl, reload, lastSyncedAt, loadError, data } = useData();
    const [busy, setBusy] = useState(false);
    const [health, setHealth] = useState<{ ok: boolean; status?: number; latency?: number; error?: string } | null>(null);

    const ping = useCallback(async () => {
        if (mode !== 'api' || !apiBaseUrl) return;
        const t0 = performance.now();
        try {
            const res = await fetch(`${apiBaseUrl}/data`, { method: 'GET' });
            setHealth({ ok: res.ok, status: res.status, latency: Math.round(performance.now() - t0) });
        } catch (e) {
            setHealth({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
    }, [mode, apiBaseUrl]);

    const reboot = useCallback(async () => {
        setBusy(true);
        try {
            await ping();
            await reload();
        } catch { /* surfaced via loadError */ } finally {
            setBusy(false);
        }
    }, [ping, reload]);

    const storageBytes = useMemo(() => {
        if (mode !== 'local') return null;
        try { return new Blob([JSON.stringify(data)]).size; } catch { return null; }
    }, [mode, data]);

    const statusDot = mode === 'local'
        ? 'bg-status-green'
        : health == null ? 'bg-gray-300' : health.ok ? 'bg-status-green' : 'bg-status-red';

    return (
        <Card className="mb-6">
            <SectionHeader title="Connection" suffix={mode === 'api' ? 'REST API' : 'Browser storage'} />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                    <p className="text-[11px] uppercase tracking-widest text-brand-text-secondary mb-1">Mode</p>
                    <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${statusDot}`} />
                        <span className="text-lg font-light text-brand-text-primary">{mode === 'api' ? 'API (SQL Server)' : 'Local (localStorage)'}</span>
                    </div>
                </div>
                <div className="md:col-span-2 min-w-0">
                    <p className="text-[11px] uppercase tracking-widest text-brand-text-secondary mb-1">Source</p>
                    <p className="text-sm font-mono text-brand-text-primary truncate" title={apiBaseUrl || 'localStorage["regReportData"]'}>
                        {apiBaseUrl ? `${apiBaseUrl}/data` : 'localStorage["regReportData"]'}
                    </p>
                </div>
                <div className="flex justify-end">
                    <button
                        onClick={reboot}
                        disabled={busy}
                        className="text-sm font-semibold bg-brand-secondary hover:bg-brand-secondary-dark text-white py-2 px-5 rounded-md transition-colors disabled:opacity-50"
                    >
                        {busy ? 'Rebooting…' : '⟳ Reboot / Reconnect'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-4 border-t border-efg-line text-sm">
                <div>
                    <p className="text-[11px] uppercase tracking-widest text-brand-text-secondary">Health</p>
                    <p className="text-brand-text-primary mt-0.5">
                        {mode === 'local' ? 'OK (offline)'
                            : health == null ? '— (press Reboot)'
                                : health.ok ? `OK · ${health.latency} ms`
                                    : `Unreachable${health.status ? ' · ' + health.status : ''}`}
                    </p>
                </div>
                <div>
                    <p className="text-[11px] uppercase tracking-widest text-brand-text-secondary">Last sync</p>
                    <p className="text-brand-text-primary mt-0.5">{lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : '—'}</p>
                </div>
                <div>
                    <p className="text-[11px] uppercase tracking-widest text-brand-text-secondary">{mode === 'local' ? 'Payload size' : 'Tables'}</p>
                    <p className="text-brand-text-primary mt-0.5">{mode === 'local' && storageBytes != null ? `${(storageBytes / 1024).toFixed(1)} KB` : `${BACKEND_TABLES.length}`}</p>
                </div>
                <div>
                    <p className="text-[11px] uppercase tracking-widest text-brand-text-secondary">Status</p>
                    <p className={`mt-0.5 ${loadError ? 'text-status-red' : 'text-status-green'}`}>{loadError ? 'Error' : 'Connected'}</p>
                </div>
            </div>
            {loadError && <InfoBox className="!mt-4 !border-status-red"><span className="text-status-red">{loadError}</span></InfoBox>}
            {mode === 'local' && (
                <p className="text-xs text-brand-text-secondary mt-4">
                    No backend configured. Set <code className="bg-brand-bg-body px-1 rounded">VITE_API_BASE_URL</code> to connect to the .NET + SQL Server API
                    (see <code className="bg-brand-bg-body px-1 rounded">docs/BACKEND_WINDOWS_QUICKSTART.md</code>). The cockpit then reflects live database rows.
                </p>
            )}
        </Card>
    );
};

// --- Insert-row modal ---
const InsertRowModal: React.FC<{
    table: TableMeta;
    fields: { key: string; type: string }[];
    onClose: () => void;
    onSubmit: (row: Record<string, unknown>) => void;
}> = ({ table, fields, onClose, onSubmit }) => {
    const [values, setValues] = useState<Record<string, string>>({});

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const row: Record<string, unknown> = {};
        fields.forEach(f => {
            const raw = values[f.key] ?? '';
            if (f.key === 'id' && raw.trim() === '') { row.id = Date.now(); return; }
            if (f.type === 'number') row[f.key] = raw.trim() === '' ? 0 : Number(raw);
            else if (f.type === 'boolean') row[f.key] = raw === 'true';
            else row[f.key] = raw;
        });
        onSubmit(row);
    };

    return (
        <Modal isOpen onClose={onClose} title={`Insert into ${table.table}`}>
            <form onSubmit={submit} className="space-y-3">
                <p className="text-sm text-brand-text-secondary">Adds one row to <code className="bg-brand-bg-body px-1 rounded">{String(table.key)}</code>. Nested/JSON columns are left empty (edit them later in Admin).</p>
                <div className="grid grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                    {fields.map(f => (
                        <div key={f.key}>
                            <label className="block text-xs font-medium text-brand-text-secondary mb-1">
                                {f.key}{f.key === 'id' && <span className="text-gray-400"> (auto)</span>}
                                <span className="text-gray-400 ml-1">· {f.type}</span>
                            </label>
                            {f.type === 'boolean' ? (
                                <select value={values[f.key] ?? 'false'} onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))} className="block w-full p-2 border-2 border-gray-200 rounded-lg text-sm">
                                    <option value="false">false</option>
                                    <option value="true">true</option>
                                </select>
                            ) : (
                                <input
                                    type={f.type === 'number' ? 'number' : 'text'}
                                    step="any"
                                    value={values[f.key] ?? ''}
                                    onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                                    className="block w-full p-2 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary"
                                />
                            )}
                        </div>
                    ))}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose} className="text-sm font-semibold text-brand-text-secondary bg-brand-bg-body hover:bg-efg-line py-2 px-4 rounded-md">Cancel</button>
                    <button type="submit" className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md">Insert Row</button>
                </div>
            </form>
        </Modal>
    );
};

// --- CSV bulk import modal ---
const ImportCsvModal: React.FC<{
    tableKey: string;
    table: TableMeta;
    onClose: () => void;
    onImport: (rows: Record<string, unknown>[], mode: 'append' | 'replace') => void;
}> = ({ tableKey, table, onClose, onImport }) => {
    const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<'append' | 'replace'>('append');
    const [fileName, setFileName] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);

    const handleFile = async (file: File) => {
        setError(null);
        setRows(null);
        setFileName(file.name);
        try {
            const text = await file.text();
            const lines = parseCsv(text);
            const result = convertCsvRows(tableKey, lines);
            setRows(result.rows);
            setWarnings(result.warnings);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    return (
        <Modal isOpen onClose={onClose} title={`Bulk CSV import — ${table.table}`}>
            <div className="space-y-4 text-sm">
                <ol className="list-decimal list-inside text-brand-text-secondary space-y-1">
                    <li>Download the template below — it contains the headers and <strong>one example row</strong> showing the accepted values.</li>
                    <li>Fill it in Excel and save as CSV (comma or semicolon both work).</li>
                    <li>Load the file — rows are previewed before anything is written.</li>
                </ol>

                <button
                    onClick={() => downloadCsv(`${table.table}_template.csv`, buildCsvTemplate(tableKey))}
                    className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-2 px-4 rounded-md transition-colors"
                >
                    ⬇ Download CSV template ({table.table})
                </button>

                {CSV_NOTES[tableKey] && (
                    <p className="text-xs text-brand-text-secondary bg-brand-bg-body border border-efg-line rounded-md px-3 py-2">
                        <strong>Accepted values —</strong> {CSV_NOTES[tableKey]}
                    </p>
                )}

                <div>
                    <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden"
                        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                    <button
                        onClick={() => fileInput.current?.click()}
                        className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-4 rounded-md transition-colors"
                    >
                        Choose CSV file…
                    </button>
                    {fileName && <span className="ml-3 text-brand-text-secondary">{fileName}</span>}
                </div>

                {error && <p className="text-status-red bg-status-red/10 border border-status-red/30 rounded-md px-3 py-2">{error}</p>}
                {warnings.map((w, i) => (
                    <p key={i} className="text-status-amber text-xs bg-status-amber/10 border border-status-amber/30 rounded-md px-3 py-1.5">{w}</p>
                ))}

                {rows && (
                    <>
                        <p className="text-brand-text-primary font-medium">{rows.length} row(s) ready to import.</p>
                        <div className="overflow-x-auto border border-efg-line rounded-md max-h-48 overflow-y-auto">
                            <table className="w-full text-xs whitespace-nowrap">
                                <thead className="bg-brand-bg-body sticky top-0">
                                    <tr>{Object.keys(rows[0]).map(k => <th key={k} className="px-2 py-1.5 text-left text-[10px] uppercase tracking-wide text-brand-text-secondary">{k}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {rows.slice(0, 20).map((r, i) => (
                                        <tr key={i} className="border-t border-efg-line">
                                            {Object.keys(rows[0]).map(k => <td key={k} className="px-2 py-1">{renderCell(r[k])}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {rows.length > 20 && <p className="text-xs text-brand-text-secondary">Previewing first 20 of {rows.length}.</p>}

                        <div className="flex items-center gap-6 pt-1">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} className="text-brand-primary focus:ring-brand-primary" />
                                <span>Append / upsert <span className="text-brand-text-secondary text-xs">(matching keys are replaced)</span></span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} className="text-brand-primary focus:ring-brand-primary" />
                                <span>Replace table <span className="text-brand-text-secondary text-xs">(deletes existing rows first)</span></span>
                            </label>
                        </div>
                    </>
                )}

                <div className="flex justify-end gap-3 pt-2 border-t border-efg-line">
                    <button onClick={onClose} className="text-sm font-semibold text-brand-text-secondary bg-brand-bg-body hover:bg-efg-line py-2 px-4 rounded-md">Cancel</button>
                    <button
                        onClick={() => rows && onImport(rows, mode)}
                        disabled={!rows || rows.length === 0}
                        className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2 px-5 rounded-md disabled:opacity-40"
                    >
                        Import {rows ? `${rows.length} row(s)` : ''}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

// --- Data explorer (spreadsheet) ---
const DataExplorer: React.FC = () => {
    const { data, setData } = useData();
    const [selectedKey, setSelectedKey] = useState<string>(BACKEND_TABLES[0].key as string);
    const [query, setQuery] = useState('');
    const [inserting, setInserting] = useState(false);
    const [importingCsv, setImportingCsv] = useState(false);
    const [importNotice, setImportNotice] = useState<string | null>(null);

    const table = useMemo(() => BACKEND_TABLES.find(t => (t.key as string) === selectedKey)!, [selectedKey]);
    // list-kind tables missing from older saved data behave as empty lists
    const raw = (data as unknown as Record<string, unknown>)[selectedKey] ?? (table.kind === 'list' ? [] : undefined);
    const isList = Array.isArray(raw);
    const rows = useMemo(() => (isList ? (raw as Record<string, unknown>[]) : []), [isList, raw]);

    const columns = useMemo(() => {
        const set = new Set<string>();
        rows.slice(0, 100).forEach(r => Object.keys(r).forEach(k => set.add(k)));
        return Array.from(set);
    }, [rows]);

    const filtered = useMemo(() => {
        if (!query.trim()) return rows;
        const q = query.toLowerCase();
        return rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
    }, [rows, query]);

    const insertFields = useMemo(() => {
        if (columns.length > 0) {
            return columns
                .filter(c => {
                    const sample = rows.find(r => r[c] !== null && r[c] !== undefined)?.[c];
                    return typeof sample !== 'object'; // skip nested/JSON columns
                })
                .map(c => {
                    const sample = rows.find(r => r[c] !== null && r[c] !== undefined)?.[c];
                    const type = typeof sample === 'number' ? 'number' : typeof sample === 'boolean' ? 'boolean' : 'string';
                    return { key: c, type };
                });
        }
        // No rows yet: derive from the static schema (camelCased), scalar only.
        return table.columns.filter(c => !c.json).map(c => ({
            key: camel(c.name),
            type: c.type.includes('number') || c.type === 'int' ? 'number' : c.type === 'bool' ? 'boolean' : 'string',
        }));
    }, [columns, rows, table]);

    const handleInsert = (row: Record<string, unknown>) => {
        setData(prev => ({ ...prev, [selectedKey]: [...((prev as unknown as Record<string, unknown>)[selectedKey] as unknown[] || []), row] }));
        setInserting(false);
    };

    const handleCsvImport = (imported: Record<string, unknown>[], mode: 'append' | 'replace') => {
        setData(prev => {
            const existing = ((prev as unknown as Record<string, unknown>)[selectedKey] as Record<string, unknown>[] | undefined) || [];
            let next: Record<string, unknown>[];
            if (mode === 'replace') {
                next = imported;
            } else {
                // Upsert: drop existing rows whose natural key matches an imported row.
                const keys = NATURAL_KEYS[selectedKey];
                if (keys) {
                    const sig = (r: Record<string, unknown>) => keys.map(k => String(r[k] ?? '')).join('|');
                    const importedSigs = new Set(imported.map(sig));
                    next = [...existing.filter(r => !importedSigs.has(sig(r))), ...imported];
                } else {
                    next = [...existing, ...imported];
                }
            }
            let updated = { ...prev, [selectedKey]: next } as CentralData;
            // LCR rows feed the aggregated KPI history — re-project affected entity+dates.
            if (selectedKey === 'lcrReports') {
                const pairs = new Set(imported.map(r => `${r.entity}|${r.date}`));
                for (const pair of pairs) {
                    const [entity, date] = pair.split('|');
                    updated = { ...updated, kpisHistory: projectToKpiHistory(updated, entity, date) };
                }
            }
            return updated;
        });
        setImportingCsv(false);
        setImportNotice(`${imported.length} row(s) imported into ${table.table} (${mode === 'replace' ? 'table replaced' : 'append/upsert'}). Saved to the current data source.`);
    };

    const deleteRow = (rowIndex: number) => {
        if (!window.confirm('Delete this row? (persists to the current data source)')) return;
        setData(prev => {
            const list = [...((prev as unknown as Record<string, unknown>)[selectedKey] as unknown[])];
            // map filtered index back to the real row reference
            const target = filtered[rowIndex];
            const realIdx = list.indexOf(target);
            if (realIdx >= 0) list.splice(realIdx, 1);
            return { ...prev, [selectedKey]: list };
        });
    };

    return (
        <Card>
            <div className="flex flex-col md:flex-row md:items-end gap-4 mb-5">
                <div className="md:w-72">
                    <Select label="Table" value={selectedKey} onChange={e => { setSelectedKey(e.target.value); setQuery(''); }}>
                        {BACKEND_TABLES.map(t => (
                            <option key={t.key as string} value={t.key as string}>
                                {t.table} ({Array.isArray((data as unknown as Record<string, unknown>)[t.key as string]) ? ((data as unknown as Record<string, unknown>)[t.key as string] as unknown[]).length : '1'})
                            </option>
                        ))}
                    </Select>
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium text-brand-text-secondary mb-1">Search</label>
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter rows…" className="block w-full p-3 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary" />
                </div>
                {isList && (
                    <button onClick={() => setInserting(true)} className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-2.5 px-4 rounded-md transition-colors whitespace-nowrap">
                        + Insert Row
                    </button>
                )}
                {CSV_IMPORTABLE.includes(selectedKey) && (
                    <>
                        <button onClick={() => downloadCsv(`${table.table}_template.csv`, buildCsvTemplate(selectedKey))}
                            title="CSV template with headers + one example row showing the accepted values"
                            className="text-sm font-semibold text-brand-text-secondary border border-gray-300 hover:border-brand-secondary hover:text-brand-secondary py-2.5 px-4 rounded-md transition-colors whitespace-nowrap">
                            ⬇ CSV template
                        </button>
                        <button onClick={() => setImportingCsv(true)}
                            className="text-sm font-semibold bg-brand-primary hover:bg-brand-primary-dark text-white py-2.5 px-4 rounded-md transition-colors whitespace-nowrap">
                            ⬆ Import CSV
                        </button>
                    </>
                )}
            </div>

            <p className="text-xs text-brand-text-secondary mb-3">{table.description}</p>
            {selectedKey === 'capitalReports' && (
                <p className="text-xs text-brand-text-secondary bg-brand-bg-body border border-efg-line rounded-md px-3 py-2 mb-3">
                    Capital reports carry nested line items — load them via the <strong>Capital Workbench</strong> (FINMA Excel import or manual entry), not CSV.
                </p>
            )}
            {importNotice && (
                <p className="text-xs text-brand-text-primary bg-brand-bg-body border border-efg-line rounded-md px-3 py-2 mb-3 flex justify-between items-center">
                    <span>{importNotice}</span>
                    <button onClick={() => setImportNotice(null)} className="text-brand-text-secondary hover:text-brand-text-primary ml-3">×</button>
                </p>
            )}

            {isList ? (
                <div className="overflow-x-auto border border-efg-line rounded-lg">
                    <table className="w-full text-xs text-left whitespace-nowrap">
                        <thead className="bg-brand-bg-body">
                            <tr>
                                <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold sticky left-0 bg-brand-bg-body">#</th>
                                {columns.map(c => <th key={c} className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">{c}</th>)}
                                <th className="px-3 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={columns.length + 2} className="px-3 py-8 text-center text-brand-text-secondary">No rows.</td></tr>
                            ) : filtered.slice(0, 500).map((row, i) => (
                                <tr key={i} className="border-t border-efg-line hover:bg-brand-bg-body">
                                    <td className="px-3 py-1.5 text-gray-400 sticky left-0 bg-white">{i + 1}</td>
                                    {columns.map(c => <td key={c} className="px-3 py-1.5">{renderCell(row[c])}</td>)}
                                    <td className="px-3 py-1.5 text-right">
                                        <button onClick={() => deleteRow(i)} title="Delete row" className="text-gray-300 hover:text-brand-primary">✕</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="overflow-x-auto border border-efg-line rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-brand-bg-body">
                            <tr>
                                <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Key</th>
                                <th className="px-4 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries((raw as Record<string, unknown>) || {}).map(([k, v]) => (
                                <tr key={k} className="border-t border-efg-line">
                                    <td className="px-4 py-2 font-medium text-brand-text-primary align-top">{k}</td>
                                    <td className="px-4 py-2">{renderCell(v)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {filtered.length > 500 && <p className="text-xs text-brand-text-secondary mt-2">Showing first 500 of {filtered.length} rows.</p>}

            {inserting && <InsertRowModal table={table} fields={insertFields} onClose={() => setInserting(false)} onSubmit={handleInsert} />}
            {importingCsv && (
                <ImportCsvModal
                    tableKey={selectedKey}
                    table={table}
                    onClose={() => setImportingCsv(false)}
                    onImport={handleCsvImport}
                />
            )}
        </Card>
    );
};

// --- Schema & API map ---
const SchemaMap: React.FC = () => {
    const { data } = useData();
    return (
        <div className="space-y-6">
            <Card>
                <SectionHeader title="Aggregate Endpoint" suffix="used by the front-end" />
                <p className="text-sm text-brand-text-secondary mb-3">The front-end repository talks to a single aggregate route; it composes / replaces every table at once.</p>
                <div className="space-y-1.5">
                    {AGGREGATE_ENDPOINTS.map(e => (
                        <div key={e.method + e.path} className="flex items-center gap-3 text-sm">
                            <MethodBadge method={e.method} />
                            <code className="font-mono text-brand-text-primary">{e.path}</code>
                            <span className="text-brand-text-secondary text-xs">{e.desc}</span>
                        </div>
                    ))}
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {BACKEND_TABLES.map(t => {
                    const count = Array.isArray((data as unknown as Record<string, unknown>)[t.key as string])
                        ? ((data as unknown as Record<string, unknown>)[t.key as string] as unknown[]).length
                        : 1;
                    return (
                        <Card key={t.key as string}>
                            <div className="flex items-baseline justify-between mb-1">
                                <h3 className="text-base font-semibold text-brand-text-primary">{t.table}</h3>
                                <span className="text-xs text-brand-text-secondary">{count} {t.kind === 'list' ? 'rows' : 'doc'} · {t.entity}</span>
                            </div>
                            <p className="text-xs text-brand-text-secondary mb-3">{t.description}</p>

                            {/* Columns */}
                            <div className="border border-efg-line rounded-md overflow-hidden mb-3">
                                <table className="w-full text-xs">
                                    <tbody>
                                        {t.columns.map(c => (
                                            <tr key={c.name} className="border-b border-efg-line last:border-0">
                                                <td className="px-3 py-1.5 font-mono text-brand-text-primary">
                                                    {c.name}
                                                    {c.pk && <span className="ml-1.5 text-[9px] font-bold text-brand-primary">PK</span>}
                                                    {c.fk && <span className="ml-1.5 text-[9px] font-bold text-blue-600">FK→{c.fk}</span>}
                                                    {c.json && <span className="ml-1.5 text-[9px] font-bold text-amber-600">JSON</span>}
                                                </td>
                                                <td className="px-3 py-1.5 text-right text-brand-text-secondary font-mono">{c.type}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Endpoints */}
                            <div className="space-y-1">
                                {t.endpoints.map(e => (
                                    <div key={e.method + e.path} className="flex items-center gap-2 text-xs">
                                        <MethodBadge method={e.method} />
                                        <code className="font-mono text-brand-text-primary truncate" title={e.desc}>{e.path}</code>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

export const BackendCockpitPage: React.FC = () => {
    const [tab, setTab] = useState<'data' | 'schema'>('data');

    return (
        <div className="p-5 md:p-8">
            <BackButton />
            <PageHeader title="Backend Cockpit" subtitle="Connection, live tables, schema and API map" />

            <ConnectionPanel />

            <div className="mb-6 border-b border-efg-line">
                <nav className="-mb-px flex space-x-8">
                    <TabButton label="Data Explorer" isActive={tab === 'data'} onClick={() => setTab('data')} />
                    <TabButton label="Schema & API Map" isActive={tab === 'schema'} onClick={() => setTab('schema')} />
                </nav>
            </div>

            <div className="animate-fade-in">
                {tab === 'data' ? <DataExplorer /> : <SchemaMap />}
            </div>
        </div>
    );
};
