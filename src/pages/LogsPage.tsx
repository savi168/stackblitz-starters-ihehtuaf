import React, { useState, useMemo, useCallback, useEffect, useSyncExternalStore } from 'react';
import { useData } from '../context/DataContext';
import { Card, PageHeader, BackButton, SectionHeader, TabButton } from '../components';
import {
  getTechLog, subscribeTechLog, getLocalBusinessLog, TechEntry, BusinessEntry,
} from '../services/appLog';

/** Server-side entries as returned by GET /api/logs/tech. */
interface ServerTechEntry { at: string; level: string; category: string; message: string }
/** Rows of the ChangeLogs table (GET /api/logs/business). */
interface ServerBusinessEntry { id: number; at: string; userName: string; dataset: string; rowKey?: string; action: string; details: string }

const time = (t: number | string) => new Date(t).toLocaleTimeString();
const dateTime = (t: number | string) => new Date(t).toLocaleString();

const levelTone = (level: string) =>
  /error|critical/i.test(level) ? 'bg-status-red/15 text-status-red'
    : /warn/i.test(level) ? 'bg-status-amber/15 text-status-amber'
      : 'bg-brand-bg-body text-brand-text-secondary';

const statusTone = (status?: number) =>
  status == null ? 'text-brand-text-secondary'
    : status >= 500 ? 'text-status-red'
      : status >= 400 ? 'text-status-amber'
        : 'text-status-green';

// --- Technical tab -----------------------------------------------------------
const TechnicalTab: React.FC = () => {
  const { mode, apiBaseUrl } = useData();
  const clientLog = useSyncExternalStore(subscribeTechLog, getTechLog);
  const [serverLog, setServerLog] = useState<ServerTechEntry[] | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);

  const fetchServer = useCallback(async () => {
    if (mode !== 'api' || !apiBaseUrl) return;
    try {
      const res = await fetch(`${apiBaseUrl}/logs/tech?take=500`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}${res.status === 404 ? ' — has the API been rebuilt & restarted with this release?' : ''}`);
      setServerLog(await res.json() as ServerTechEntry[]);
      setServerError(null);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : String(e));
    }
  }, [mode, apiBaseUrl]);
  useEffect(() => { void fetchServer(); }, [fetchServer]);

  const q = query.trim().toLowerCase();
  const clientRows = useMemo(() => {
    let rows = clientLog.slice().reverse();
    if (errorsOnly) rows = rows.filter(r => r.kind === 'error' || (r.status ?? 0) >= 400);
    if (q) rows = rows.filter(r => r.message.toLowerCase().includes(q));
    return rows;
  }, [clientLog, q, errorsOnly]);

  const serverRows = useMemo(() => {
    let rows = serverLog ?? [];
    if (errorsOnly) rows = rows.filter(r => /error|warn|critical/i.test(r.level));
    if (q) rows = rows.filter(r => `${r.category} ${r.message}`.toLowerCase().includes(q));
    return rows;
  }, [serverLog, q, errorsOnly]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter log lines…"
          className="flex-1 p-2.5 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary bg-white"
        />
        <label className="flex items-center gap-2 text-sm text-brand-text-secondary cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={errorsOnly} onChange={e => setErrorsOnly(e.target.checked)} className="text-brand-primary focus:ring-brand-primary" />
          Errors & warnings only
        </label>
        {mode === 'api' && (
          <button onClick={() => void fetchServer()} className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-2 px-4 rounded-md transition-colors whitespace-nowrap">
            ⟳ Refresh server log
          </button>
        )}
      </div>

      <Card>
        <SectionHeader title="This browser session" suffix={`${clientRows.length} entries — API calls made by this tab`} />
        <div className="overflow-x-auto border border-efg-line rounded-lg max-h-[45vh] overflow-y-auto">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="bg-brand-bg-body sticky top-0">
              <tr>
                <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Time</th>
                <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Kind</th>
                <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Message</th>
                <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold text-right">Status</th>
                <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold text-right">ms</th>
              </tr>
            </thead>
            <tbody>
              {clientRows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-brand-text-secondary">No entries yet.</td></tr>
              ) : clientRows.map((r: TechEntry, i) => (
                <tr key={i} className="border-t border-efg-line">
                  <td className="px-3 py-1.5 text-brand-text-secondary tabular-nums">{time(r.at)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.kind === 'error' ? 'bg-status-red/15 text-status-red' : r.kind === 'api' ? 'bg-brand-bg-body text-brand-text-secondary' : 'bg-brand-secondary/10 text-brand-secondary'}`}>{r.kind}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono max-w-[42rem] truncate" title={r.message}>{r.message}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${statusTone(r.status)}`}>{r.status ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-brand-text-secondary">{r.ms ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {mode === 'api' && (
        <Card>
          <SectionHeader title="API server" suffix="requests, startup, schema migrations, errors — since the API was last started" />
          {serverError && (
            <p className="text-status-red text-sm bg-status-red/10 border border-status-red/30 rounded-md px-3 py-2 mb-3">{serverError}</p>
          )}
          <div className="overflow-x-auto border border-efg-line rounded-lg max-h-[45vh] overflow-y-auto">
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-brand-bg-body sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Time</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Level</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Source</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Message</th>
                </tr>
              </thead>
              <tbody>
                {serverRows.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-brand-text-secondary">{serverLog == null ? 'Loading…' : 'No entries.'}</td></tr>
                ) : serverRows.map((r, i) => (
                  <tr key={i} className="border-t border-efg-line">
                    <td className="px-3 py-1.5 text-brand-text-secondary tabular-nums">{time(r.at)}</td>
                    <td className="px-3 py-1.5"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${levelTone(r.level)}`}>{r.level}</span></td>
                    <td className="px-3 py-1.5 text-brand-text-secondary">{r.category}</td>
                    <td className="px-3 py-1.5 font-mono max-w-[46rem] truncate" title={r.message}>{r.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

// --- Business tab ------------------------------------------------------------
const BusinessTab: React.FC = () => {
  const { mode, apiBaseUrl } = useData();
  const [rows, setRows] = useState<ServerBusinessEntry[] | BusinessEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    if (mode !== 'api' || !apiBaseUrl) { setRows(getLocalBusinessLog()); return; }
    try {
      const res = await fetch(`${apiBaseUrl}/logs/business?take=300`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}${res.status === 404 ? ' — has the API been rebuilt & restarted with this release?' : ''}`);
      setRows(await res.json() as ServerBusinessEntry[]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [mode, apiBaseUrl]);
  useEffect(() => { void refresh(); }, [refresh]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = rows ?? [];
    if (!q) return list;
    return (list as (ServerBusinessEntry | BusinessEntry)[]).filter(r =>
      `${r.userName} ${r.dataset} ${r.rowKey || ''} ${r.action} ${r.details}`.toLowerCase().includes(q));
  }, [rows, q]);

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter — user, dataset, row, action, details…"
          className="flex-1 p-2.5 border-2 border-gray-200 rounded-lg text-sm focus:border-brand-primary bg-white"
        />
        <button onClick={() => void refresh()} className="text-sm font-semibold text-brand-secondary border border-brand-secondary hover:bg-brand-secondary hover:text-white py-2 px-4 rounded-md transition-colors whitespace-nowrap">
          ⟳ Refresh
        </button>
      </div>
      <p className="text-xs text-brand-text-secondary mb-3">
        Every data change: one summary line per dataset on each save, plus detailed field-level entries from the
        Data Explorer editor. {mode === 'api' ? 'Persisted in the ChangeLogs SQL table.' : 'Local demo mode — stored in this browser only.'}
      </p>
      {error && <p className="text-status-red text-sm bg-status-red/10 border border-status-red/30 rounded-md px-3 py-2 mb-3">{error}</p>}
      <div className="overflow-x-auto border border-efg-line rounded-lg max-h-[62vh] overflow-y-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-brand-bg-body sticky top-0">
            <tr>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold whitespace-nowrap">When</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">User</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Dataset</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Row</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Action</th>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-brand-text-secondary font-semibold">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-brand-text-secondary">{rows == null ? 'Loading…' : 'No entries yet — they appear as soon as data changes.'}</td></tr>
            ) : (filtered as (ServerBusinessEntry | BusinessEntry)[]).map((r, i) => (
              <tr key={i} className="border-t border-efg-line align-top">
                <td className="px-3 py-1.5 text-brand-text-secondary whitespace-nowrap tabular-nums">{dateTime(r.at)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{r.userName.split('\\').pop()}</td>
                <td className="px-3 py-1.5 font-mono whitespace-nowrap">{r.dataset}</td>
                <td className="px-3 py-1.5 whitespace-nowrap max-w-[16rem] truncate" title={r.rowKey || undefined}>
                  {r.rowKey ? (
                    <button onClick={() => setQuery(r.rowKey!)} title="Filter on this row" className="underline decoration-dotted hover:text-brand-primary">{r.rowKey}</button>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.action === 'delete' ? 'bg-status-red/15 text-status-red' : r.action === 'insert' || r.action === 'import' ? 'bg-status-green/15 text-status-green' : 'bg-brand-bg-body text-brand-text-secondary'}`}>{r.action}</span>
                </td>
                <td className="px-3 py-1.5 whitespace-pre-wrap break-words max-w-[40rem]">{r.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export const LogsPage: React.FC = () => {
  const [tab, setTab] = useState<'tech' | 'business'>('tech');
  return (
    <div className="p-5 md:p-8">
      <BackButton />
      <PageHeader title="Logs" subtitle="Technical activity (debugging) and business audit trail (data changes)" />
      <div className="mb-6 border-b border-efg-line">
        <nav className="-mb-px flex space-x-8">
          <TabButton label="Technical" isActive={tab === 'tech'} onClick={() => setTab('tech')} />
          <TabButton label="Business" isActive={tab === 'business'} onClick={() => setTab('business')} />
        </nav>
      </div>
      <div className="animate-fade-in">
        {tab === 'tech' ? <TechnicalTab /> : <BusinessTab />}
      </div>
    </div>
  );
};
