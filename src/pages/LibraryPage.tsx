import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { BackButton, Card, PageHeader, SectionHeader } from '../components';
import {
  DOC_KINDS, DocMeta, deleteDocument, downloadDocument, fmtSize, kindLabel,
  listDocuments, uploadDocument,
} from '../services/documents';

/**
 * Library: regulatory PDFs (Swiss OFR/CAO, EBA norms…), working papers and
 * workbench source files — stored INSIDE the RegReport database, organised as
 * a simple folder/subfolder tree ('/'-separated paths). Fully offline.
 */

const fileIcon = (d: DocMeta): string => {
  const n = (d.fileName || '').toLowerCase();
  if (n.endsWith('.pdf')) return '📕';
  if (/\.(xlsx?|xlsb|xlsm|csv)$/.test(n)) return '📊';
  if (/\.(docx?|rtf)$/.test(n)) return '📝';
  if (/\.(pptx?)$/.test(n)) return '📈';
  if (/\.(zip|7z|rar)$/.test(n)) return '🗜️';
  return '📄';
};

/** Compact upload + list panel, reused by the Workbench (entity/date-tagged
 * source files) and by the Library page itself. */
export const DocumentsPanel: React.FC<{
  /** Fixed folder for uploads (Library passes the user-chosen one). */
  folder: string;
  /** When set, uploads are tagged and the list is filtered on entity. */
  entity?: string;
  /** Period tag for uploads; list filter unless showAllDates. */
  date?: string;
  withKind?: boolean;
  onChanged?: () => void;
}> = ({ folder, entity, date, withKind }) => {
  const { mode, apiBaseUrl, isAdmin } = useData();
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('workingPaper');
  const [allDates, setAllDates] = useState(false);

  const refresh = useCallback(() => {
    if (mode !== 'api') return;
    listDocuments(apiBaseUrl!).then(setDocs).catch(e => setError(String(e.message || e)));
  }, [mode, apiBaseUrl]);
  useEffect(() => { refresh(); }, [refresh]);

  if (mode !== 'api') {
    return <p className="text-sm text-brand-text-secondary">Connect the API backend to store and re-download source files (docs/SQL_DOCUMENTS.sql).</p>;
  }

  const shown = docs
    .filter(d => !entity || d.entity === entity)
    .filter(d => allDates || !date || d.date === date)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.uploadedAt.localeCompare(a.uploadedAt));

  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setError(null);
    try {
      await uploadDocument(apiBaseUrl!, f, {
        folder, entity, date, kind: withKind ? kind : undefined,
      });
      refresh();
    } catch (e) { setError(String((e as Error).message || e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {error && <p className="text-xs text-status-red mb-2">{error}</p>}
      {isAdmin && (
        <div className="flex flex-wrap items-end gap-2 mb-2">
          {withKind && (
            <div>
              <label className="block text-[9px] uppercase tracking-wider text-brand-text-secondary">Type</label>
              <select value={kind} onChange={e => setKind(e.target.value)} className="p-1.5 border border-gray-200 rounded-md text-[11px] bg-white">
                {DOC_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
          <input type="file" disabled={busy} onChange={e => { onUpload(e.target.files?.[0]); e.target.value = ''; }}
            className="block text-[11px] text-brand-text-secondary file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border file:border-gray-300 file:bg-white file:text-[11px] file:font-semibold hover:file:border-brand-secondary" />
          {busy && <span className="text-[11px] text-brand-text-secondary pb-1">Uploading…</span>}
          {date && (
            <label className="text-[11px] text-brand-text-secondary pb-1 ml-auto flex items-center gap-1">
              <input type="checkbox" checked={allDates} onChange={e => setAllDates(e.target.checked)} /> all periods
            </label>
          )}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-xs text-brand-text-secondary">No file stored{entity ? ` for ${entity}${date && !allDates ? ` — ${date}` : ''}` : ''} yet.</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {shown.map(d => (
              <tr key={d.id} className="border-t border-efg-line/60">
                <td className="py-1 pr-2">{fileIcon(d)}</td>
                <td className="py-1 pr-3">
                  <button onClick={() => downloadDocument(apiBaseUrl!, d).catch(e => setError(String(e.message || e)))}
                    className="underline text-brand-secondary hover:text-brand-primary text-left">{d.fileName}</button>
                </td>
                {withKind && <td className="py-1 pr-3 text-brand-text-secondary whitespace-nowrap">{kindLabel(d.kind)}</td>}
                <td className="py-1 pr-3 text-brand-text-secondary whitespace-nowrap">{d.date || ''}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-brand-text-secondary whitespace-nowrap">{fmtSize(d.sizeBytes)}</td>
                <td className="py-1 pr-3 text-brand-text-secondary whitespace-nowrap hidden md:table-cell">{d.uploadedBy.split('\\').pop()} · {d.uploadedAt.slice(0, 10)}</td>
                {isAdmin && (
                  <td className="py-1 text-right">
                    <button onClick={async () => {
                      if (!window.confirm(`Delete "${d.fileName}"?`)) return;
                      try { await deleteDocument(apiBaseUrl!, d.id); refresh(); }
                      catch (e) { setError(String((e as Error).message || e)); }
                    }} className="text-status-red/60 hover:text-status-red">✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export const LibraryPage: React.FC = () => {
  const { mode, apiBaseUrl, isAdmin } = useData();
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [upFolder, setUpFolder] = useState('Regulations');
  const [upTitle, setUpTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (mode !== 'api') return;
    listDocuments(apiBaseUrl!).then(d => { setDocs(d); setError(null); })
      .catch(e => setError(String(e.message || e)));
  }, [mode, apiBaseUrl]);
  useEffect(() => { refresh(); }, [refresh]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => (q
    ? docs.filter(d => `${d.folder}/${d.fileName} ${d.title} ${d.notes || ''}`.toLowerCase().includes(q))
    : docs), [docs, q]);

  // Folder tree from the '/'-separated paths (ancestors included).
  const folders = useMemo(() => {
    const set = new Set<string>();
    filtered.forEach(d => {
      if (!d.folder) return;
      const parts = d.folder.split('/');
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
    });
    return Array.from(set).sort();
  }, [filtered]);
  const hiddenBy = (path: string): boolean =>
    !q && Array.from(collapsed).some(c => path === c || path.startsWith(c + '/'));
  const toggle = (f: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(f)) next.delete(f); else next.add(f);
    return next;
  });
  const docCount = (folder: string) =>
    filtered.filter(d => d.folder === folder || d.folder.startsWith(folder + '/')).length;

  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setError(null);
    try {
      await uploadDocument(apiBaseUrl!, f, { folder: upFolder.trim(), title: upTitle.trim() || undefined });
      setUpTitle('');
      refresh();
    } catch (e) { setError(String((e as Error).message || e)); }
    finally { setBusy(false); }
  };

  const fileRow = (d: DocMeta, indent: number) => (
    <div key={d.id} className="flex items-center gap-2 py-1 border-t border-efg-line/50 text-sm"
      style={{ paddingLeft: `${indent * 1.25 + 1.5}rem` }}>
      <span>{fileIcon(d)}</span>
      <button onClick={() => downloadDocument(apiBaseUrl!, d).catch(e => setError(String(e.message || e)))}
        className="underline text-brand-secondary hover:text-brand-primary text-left" title="Download">
        {d.title || d.fileName}
      </button>
      {d.title && d.title !== d.fileName && <span className="text-xs text-brand-text-secondary">({d.fileName})</span>}
      <span className="text-xs text-brand-text-secondary ml-auto tabular-nums whitespace-nowrap">
        {fmtSize(d.sizeBytes)} · {d.uploadedBy.split('\\').pop()} · {d.uploadedAt.slice(0, 10)}
      </span>
      {isAdmin && (
        <button onClick={async () => {
          if (!window.confirm(`Delete "${d.fileName}"?`)) return;
          try { await deleteDocument(apiBaseUrl!, d.id); refresh(); }
          catch (e) { setError(String((e as Error).message || e)); }
        }} className="text-status-red/60 hover:text-status-red px-1">✕</button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <BackButton />
      <PageHeader title="Library"
        subtitle="Regulatory texts, norms and working files — stored in the RegReport database, organised in folders, available offline and re-downloadable at any time." />

      <Card>
        <SectionHeader title="Built-in documentation" suffix="shipped with the app — always available, even with an empty database" />
        <div className="flex flex-wrap gap-4 text-sm">
          <a href="docs/regreport-documentation.html" target="_blank" rel="noreferrer"
            className="underline text-brand-secondary hover:text-brand-primary">📘 RegReport — tool documentation</a>
          <a href="docs/mercury-datamodel.pdf" target="_blank" rel="noreferrer"
            className="underline text-brand-secondary hover:text-brand-primary">📕 MERCURY — Quadrum Data Lake data model (PDF)</a>
          <a href="docs/mercury-integration.md" target="_blank" rel="noreferrer"
            className="underline text-brand-secondary hover:text-brand-primary">📄 MERCURY — integration & adjustments notes</a>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-end gap-4 mb-3">
          <SectionHeader title="Document library" suffix={`${docs.length} file(s) in the database`} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="ml-auto p-2 border border-gray-200 rounded-md text-sm bg-white focus:border-brand-primary w-64" />
        </div>
        {mode !== 'api' ? (
          <p className="text-sm text-brand-text-secondary">
            Connect the API backend to use the library (run docs/SQL_DOCUMENTS.sql once on RegReport).
          </p>
        ) : (
          <>
            {error && <p className="text-sm text-status-red mb-2">{error}</p>}
            {isAdmin && (
              <div className="flex flex-wrap items-end gap-3 mb-4 border border-efg-line rounded-lg p-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Folder (use / for subfolders)</label>
                  <input list="lib-folders" value={upFolder} onChange={e => setUpFolder(e.target.value)}
                    placeholder="e.g. Regulations/EBA" className="p-2 border border-gray-200 rounded-md text-sm bg-white w-64" />
                  <datalist id="lib-folders">{folders.map(f => <option key={f} value={f} />)}</datalist>
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.1em] text-brand-text-secondary mb-1">Title (optional)</label>
                  <input value={upTitle} onChange={e => setUpTitle(e.target.value)}
                    placeholder="e.g. CAO — Capital Adequacy Ordinance" className="p-2 border border-gray-200 rounded-md text-sm bg-white w-72" />
                </div>
                <input type="file" disabled={busy} onChange={e => { onUpload(e.target.files?.[0]); e.target.value = ''; }}
                  className="block text-sm text-brand-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:text-sm file:font-semibold hover:file:border-brand-secondary" />
                {busy && <span className="text-sm text-brand-text-secondary pb-2">Uploading…</span>}
              </div>
            )}
            {filtered.length === 0 ? (
              <p className="text-sm text-brand-text-secondary">
                {q ? 'No document matches the search.' : 'The library is empty — upload the first document above (e.g. the Swiss CAO/OFR PDF into Regulations/Swiss).'}
              </p>
            ) : (
              <div className="border border-efg-line rounded-lg px-3 py-1">
                {filtered.filter(d => !d.folder).map(d => fileRow(d, 0))}
                {folders.map(f => {
                  if (hiddenBy(f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '')) return null;
                  const depth = f.split('/').length - 1;
                  const inFolder = filtered.filter(d => d.folder === f);
                  return (
                    <React.Fragment key={f}>
                      <div onClick={() => toggle(f)}
                        className="flex items-center gap-2 py-1.5 border-t border-efg-line/50 cursor-pointer hover:bg-brand-bg-body/50 text-sm font-semibold"
                        style={{ paddingLeft: `${depth * 1.25}rem` }}>
                        <span>{!q && collapsed.has(f) ? '▸' : '▾'}</span>
                        <span>📁 {f.split('/').pop()}</span>
                        <span className="text-xs text-brand-text-secondary font-normal">({docCount(f)})</span>
                      </div>
                      {(q || !collapsed.has(f)) && inFolder.map(d => fileRow(d, depth + 1))}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-brand-text-secondary mt-3">
              Files are stored inside the RegReport SQL database (varbinary) — a database backup includes every document,
              nothing leaves the local environment, and anyone can re-download the original at any time.
              Workbench source files (working papers, CASABIS/LCR_G/NSFR_G) uploaded from the Workbench page land here too,
              under Workbench/&lt;entity&gt;/&lt;period&gt;, tagged by entity, period and type.
            </p>
          </>
        )}
      </Card>
    </div>
  );
};
