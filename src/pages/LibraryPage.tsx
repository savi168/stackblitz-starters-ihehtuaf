import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { BackButton, Card, PageHeader, SectionHeader } from '../components';
import {
  DOC_KINDS, DocMeta, deleteDocument, downloadDocument, fmtSize, kindLabel,
  listDocuments, updateDocument, uploadDocument,
} from '../services/documents';

/**
 * Library: regulatory PDFs (Swiss OFR/CAO, EBA norms…), working papers and
 * workbench source files — stored INSIDE the RegReport database, organised as
 * a simple folder/subfolder tree ('/'-separated paths). Fully offline.
 */

/** Types the browser can render inline (everything else stays download-only). */
const previewType = (fileName: string): 'iframe' | 'img' | 'md' | 'text' | null => {
  const n = fileName.toLowerCase();
  if (/\.(pdf|html?)$/.test(n)) return 'iframe';
  if (/\.(png|jpe?g|gif|svg|webp)$/.test(n)) return 'img';
  if (/\.md$/.test(n)) return 'md';
  if (/\.(txt|csv|sql|json|log)$/.test(n)) return 'text';
  return null;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Tiny offline markdown renderer (headings, bold, code, lists, links). */
const mdToHtml = (md: string): string => {
  const codeBlocks: string[] = [];
  let s = escapeHtml(md).replace(/```([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre style="background:#f5f4f2;border:1px solid #e5e2dd;border-radius:6px;padding:10px;overflow-x:auto;font-size:12px">${code}</pre>`);
    return `\u0000${codeBlocks.length - 1}\u0000`;
  });
  s = s
    .replace(/^### (.*)$/gm, '<h3 style="margin:1em 0 .3em;font-size:15px">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 style="margin:1.2em 0 .4em;font-size:17px">$1</h2>')
    .replace(/^# (.*)$/gm, '<h1 style="margin:1.2em 0 .4em;font-size:20px">$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code style="background:#f5f4f2;padding:1px 4px;border-radius:4px;font-size:12px">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:#0d5257;text-decoration:underline">$1</a>')
    .replace(/^[-*] (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(\n(?!<li>))/g, '<ul style="margin:.4em 0 .4em 1.2em;list-style:disc">$1</ul>$2')
    .replace(/\n{2,}/g, '<br/><br/>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codeBlocks[Number(i)]);
};

interface ViewerState { title: string; url?: string; html?: string; type: 'iframe' | 'img' | 'md' | 'text'; isObjectUrl?: boolean; externalHref?: string }

/** Full-screen in-app viewer (PDF/HTML via the browser, markdown rendered). */
const DocViewer: React.FC<{ v: ViewerState; onClose: () => void }> = ({ v, onClose }) => {
  useEffect(() => () => { if (v.isObjectUrl && v.url) URL.revokeObjectURL(v.url); }, [v]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl w-full h-full max-w-6xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-efg-line">
          <span className="font-semibold text-sm truncate">{v.title}</span>
          {(v.externalHref || (!v.isObjectUrl && v.url)) && (
            <a href={v.externalHref || v.url} target="_blank" rel="noreferrer"
              className="text-xs underline text-brand-text-secondary hover:text-brand-secondary">open in a new tab ↗</a>
          )}
          <button onClick={onClose} className="ml-auto text-brand-text-secondary hover:text-brand-text-primary text-lg leading-none px-2">✕</button>
        </div>
        <div className="flex-1 min-h-0">
          {v.type === 'iframe' && <iframe title={v.title} src={v.url} className="w-full h-full border-0 rounded-b-lg" />}
          {v.type === 'img' && (
            <div className="w-full h-full overflow-auto flex items-start justify-center p-4">
              <img src={v.url} alt={v.title} className="max-w-full" />
            </div>
          )}
          {(v.type === 'md' || v.type === 'text') && (
            <div className="w-full h-full overflow-auto p-6 text-sm leading-relaxed"
              {...(v.type === 'md'
                ? { dangerouslySetInnerHTML: { __html: v.html || '' } }
                : {})}>
              {v.type === 'text' ? <pre className="text-xs whitespace-pre-wrap">{v.html}</pre> : undefined}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

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
  /** Filter the list to documents inside `folder` (Projects file tabs). */
  folderFilter?: boolean;
  onChanged?: () => void;
}> = ({ folder, entity, date, withKind, folderFilter }) => {
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
    .filter(d => !folderFilter || d.folder === folder || d.folder.startsWith(`${folder}/`))
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
  // ?q= pre-fills the search — used by the contact directory's procedure links.
  const [urlParams] = useSearchParams();
  const [search, setSearch] = useState(() => urlParams.get('q') || '');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [upFolder, setUpFolder] = useState('Regulations');
  const [upTitle, setUpTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  // Folders created in the UI before any file lands in them (folders become
  // permanent once they contain at least one document).
  const [extraFolders, setExtraFolders] = useState<string[]>([]);

  const addFolder = (base = '') => {
    const path = window.prompt('Folder path — use / for subfolders (e.g. Regulations/EBA):', base ? `${base}/` : '');
    if (path === null) return;
    const clean = path.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '');
    if (!clean) return;
    setExtraFolders(prev => (prev.includes(clean) ? prev : [...prev, clean]));
    setUpFolder(clean);
  };

  const moveDoc = async (d: DocMeta) => {
    const path = window.prompt(`Move "${d.fileName}" to folder (empty = root):`, d.folder);
    if (path === null) return;
    try {
      await updateDocument(apiBaseUrl!, d.id, { folder: path });
      refresh();
    } catch (e) { setError(String((e as Error).message || e)); }
  };

  // Folders are implicit path prefixes: renaming/moving a folder rewrites the
  // prefix on every document under it (one metadata update per file).
  const renameFolderPrefix = async (from: string, to: string) => {
    const remap = (p: string) => (p === from || p.startsWith(from + '/')) ? to + p.slice(from.length) : p;
    try {
      setBusy(true);
      for (const d of docs.filter(x => x.folder === from || x.folder.startsWith(from + '/'))) {
        await updateDocument(apiBaseUrl!, d.id, { folder: remap(d.folder) });
      }
      setExtraFolders(prev => Array.from(new Set(prev.map(remap))));
      setCollapsed(prev => new Set(Array.from(prev).map(remap)));
      refresh();
    } catch (e) { setError(String((e as Error).message || e)); }
    finally { setBusy(false); }
  };

  const renameFolder = (f: string) => {
    const path = window.prompt('Rename / move the folder — edit the full path:', f);
    if (path === null) return;
    const clean = path.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '');
    if (!clean || clean === f) return;
    if (clean.startsWith(f + '/')) { setError('A folder cannot be moved inside itself.'); return; }
    void renameFolderPrefix(f, clean);
  };

  const renameDoc = async (d: DocMeta) => {
    const t = window.prompt('New display name:', d.title || d.fileName);
    if (t === null || !t.trim() || t.trim() === d.title) return;
    try { await updateDocument(apiBaseUrl!, d.id, { title: t.trim() }); refresh(); }
    catch (e) { setError(String((e as Error).message || e)); }
  };

  // Drag & drop: drag a file row onto a folder (or onto any file of that
  // folder — the whole area is a target) to move it; drop files from the OS
  // explorer to upload straight into the folder. Collapsed folders auto-open
  // after hovering ~600ms; dragleave ignores moves into child elements so the
  // highlight does not flicker.
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragFolder, setDragFolder] = useState<string | null>(null);
  const [dropFolder, setDropFolder] = useState<string | null>(null);
  const dragging = dragId !== null || dragFolder !== null;
  const expandTimer = React.useRef<{ target: string; id: ReturnType<typeof setTimeout> } | null>(null);
  const clearExpandTimer = () => {
    if (expandTimer.current) { clearTimeout(expandTimer.current.id); expandTimer.current = null; }
  };
  const dropProps = (target: string) => (!isAdmin ? {} : {
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      setDropFolder(target);
      if (target && collapsed.has(target) && expandTimer.current?.target !== target) {
        clearExpandTimer();
        expandTimer.current = {
          target,
          id: setTimeout(() => setCollapsed(prev => { const n = new Set(prev); n.delete(target); return n; }), 600),
        };
      }
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = dragging ? 'move' : 'copy';
    },
    onDragLeave: (e: React.DragEvent) => {
      // Moving onto a child of the same row is not a real leave.
      if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
      setDropFolder(cur => (cur === target ? null : cur));
      if (expandTimer.current?.target === target) clearExpandTimer();
    },
    onDrop: async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropFolder(null);
      clearExpandTimer();
      try {
        const osFiles = Array.from(e.dataTransfer.files || []);
        const txt = e.dataTransfer.getData('text/plain');
        if (osFiles.length > 0) {
          setBusy(true);
          for (const f of osFiles) await uploadDocument(apiBaseUrl!, f, { folder: target });
          refresh();
        } else if (txt.startsWith('folder:') || dragFolder !== null) {
          // Moving a whole folder: it lands as a child of the target,
          // keeping its own name — never inside itself or its descendants.
          const from = txt.startsWith('folder:') ? txt.slice(7) : dragFolder!;
          if (from && target !== from && !target.startsWith(from + '/')) {
            const to = target ? `${target}/${from.split('/').pop()}` : from.split('/').pop()!;
            if (to !== from) await renameFolderPrefix(from, to);
          }
        } else {
          const id = Number(txt) || dragId;
          const doc = id ? docs.find(x => x.id === id) : undefined;
          if (doc && doc.folder !== target) { await updateDocument(apiBaseUrl!, doc.id, { folder: target }); refresh(); }
        }
      } catch (err) { setError(String((err as Error).message || err)); }
      finally { setBusy(false); setDragId(null); setDragFolder(null); }
    },
  });
  const dropHighlight = (target: string) =>
    dropFolder === target ? ' bg-brand-secondary/10 ring-1 ring-brand-secondary rounded' : '';

  // Built-in docs open inside the app (md fetched and rendered).
  const openBuiltIn = async (title: string, path: string) => {
    try {
      if (path.endsWith('.md')) {
        const res = await fetch(path);
        setViewer({ title, type: 'md', html: mdToHtml(await res.text()), externalHref: path });
      } else {
        setViewer({ title, type: 'iframe', url: path });
      }
    } catch (e) { setError(String((e as Error).message || e)); }
  };

  // Library documents: fetched as a blob and rendered in the viewer when the
  // browser can (pdf/html/images/markdown/text) — otherwise download only.
  const openDoc = async (d: DocMeta) => {
    const type = previewType(d.fileName);
    if (!type) return;
    try {
      const res = await fetch(`${apiBaseUrl}/documents/${d.id}/download`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      if (type === 'md' || type === 'text') {
        const text = await res.text();
        setViewer({ title: d.title || d.fileName, type, html: type === 'md' ? mdToHtml(text) : text });
      } else {
        const blob = await res.blob();
        setViewer({ title: d.title || d.fileName, type, url: URL.createObjectURL(blob), isObjectUrl: true });
      }
    } catch (e) { setError(String((e as Error).message || e)); }
  };

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

  // Folder tree from the '/'-separated paths (ancestors included), plus the
  // folders created in the UI that are still empty.
  const folders = useMemo(() => {
    const set = new Set<string>();
    const addPath = (p: string) => {
      const parts = p.split('/');
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
    };
    filtered.forEach(d => { if (d.folder) addPath(d.folder); });
    if (!q) extraFolders.forEach(addPath);
    return Array.from(set).sort();
  }, [filtered, extraFolders, q]);
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
    <div key={d.id}
      draggable={isAdmin}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(d.id));
        // Defer the state change: re-rendering the dragged row during
        // dragstart makes the browser cancel the drag (ghost/cursor vanish).
        const id = d.id;
        setTimeout(() => setDragId(id), 0);
      }}
      onDragEnd={() => { setDragId(null); setDropFolder(null); clearExpandTimer(); }}
      {...dropProps(d.folder)}
      className={`flex items-center gap-2 py-1 border-t border-efg-line/50 text-sm ${dragId === d.id ? 'opacity-40' : ''}${dropFolder === d.folder && dragId !== null && dragId !== d.id ? ' bg-brand-secondary/5' : ''}`}
      style={{ paddingLeft: `${indent * 1.25 + 1.5}rem` }}>
      {isAdmin && <span className="text-brand-text-secondary/50 cursor-grab active:cursor-grabbing select-none" title="Drag to move">⠿</span>}
      <span>{fileIcon(d)}</span>
      <button
        onClick={() => (previewType(d.fileName)
          ? openDoc(d)
          : downloadDocument(apiBaseUrl!, d).catch(e => setError(String(e.message || e))))}
        className="underline text-brand-secondary hover:text-brand-primary text-left"
        title={previewType(d.fileName) ? 'View in the app' : 'Download'}>
        {d.title || d.fileName}
      </button>
      {d.title && d.title !== d.fileName && <span className="text-xs text-brand-text-secondary">({d.fileName})</span>}
      <span className="text-xs text-brand-text-secondary ml-auto tabular-nums whitespace-nowrap">
        {fmtSize(d.sizeBytes)} · {d.uploadedBy.split('\\').pop()} · {d.uploadedAt.slice(0, 10)}
      </span>
      <button onClick={() => downloadDocument(apiBaseUrl!, d).catch(e => setError(String(e.message || e)))}
        title="Download" className="text-brand-text-secondary hover:text-brand-secondary px-1">⬇</button>
      {isAdmin && (
        <>
          <button onClick={() => renameDoc(d)} title="Rename"
            className="text-brand-text-secondary hover:text-brand-secondary px-1">✏️</button>
          <button onClick={() => moveDoc(d)} title="Move to another folder"
            className="text-brand-text-secondary hover:text-brand-secondary px-1">📂</button>
        </>
      )}
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
        <SectionHeader title="Built-in documentation" suffix="shipped with the app — opens right here, works even with an empty database" />
        <div className="flex flex-wrap gap-4 text-sm">
          <button onClick={() => openBuiltIn('RegReport — tool documentation', 'docs/regreport-documentation.html')}
            className="underline text-brand-secondary hover:text-brand-primary">📘 RegReport — tool documentation</button>
          <button onClick={() => openBuiltIn('MERCURY — Quadrum Data Lake data model', 'docs/mercury-datamodel.pdf')}
            className="underline text-brand-secondary hover:text-brand-primary">📕 MERCURY — Quadrum Data Lake data model (PDF)</button>
          <button onClick={() => openBuiltIn('MERCURY — integration & adjustments notes', 'docs/mercury-integration.md')}
            className="underline text-brand-secondary hover:text-brand-primary">📄 MERCURY — integration & adjustments notes</button>
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
                <button onClick={() => addFolder()}
                  className="text-sm font-semibold border border-gray-300 text-brand-text-secondary hover:border-brand-secondary hover:text-brand-secondary py-2 px-3 rounded-md transition-colors mb-px">
                  ＋ New folder
                </button>
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
            {filtered.length === 0 && folders.length === 0 ? (
              <p className="text-sm text-brand-text-secondary">
                {q ? 'No document matches the search.' : 'The library is empty — upload the first document above (e.g. the Swiss CAO/OFR PDF into Regulations/Swiss).'}
              </p>
            ) : (
              <div className="border border-efg-line rounded-lg px-3 py-1">
                {dragging && (
                  <div {...dropProps('')}
                    className={`flex items-center gap-2 py-1.5 text-sm text-brand-text-secondary border border-dashed border-gray-300 rounded my-1${dropHighlight('')}`}>
                    <span className="pl-2">📂 Drop here to move to the root ( / )</span>
                  </div>
                )}
                {filtered.filter(d => !d.folder).map(d => fileRow(d, 0))}
                {folders.map(f => {
                  if (hiddenBy(f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '')) return null;
                  const depth = f.split('/').length - 1;
                  const inFolder = filtered.filter(d => d.folder === f);
                  return (
                    <React.Fragment key={f}>
                      <div onClick={() => toggle(f)} {...dropProps(f)}
                        draggable={isAdmin}
                        onDragStart={e => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', `folder:${f}`);
                          setTimeout(() => setDragFolder(f), 0); // defer: see file rows
                        }}
                        onDragEnd={() => { setDragId(null); setDragFolder(null); setDropFolder(null); clearExpandTimer(); }}
                        className={`group flex items-center gap-2 py-1.5 border-t border-efg-line/50 cursor-pointer hover:bg-brand-bg-body/50 text-sm font-semibold${dropHighlight(f)} ${dragFolder === f ? 'opacity-40' : ''}`}
                        style={{ paddingLeft: `${depth * 1.25}rem` }}>
                        <span>{!q && collapsed.has(f) ? '▸' : '▾'}</span>
                        <span>📁 {f.split('/').pop()}</span>
                        <span className="text-xs text-brand-text-secondary font-normal">({docCount(f)})</span>
                        {isAdmin && (
                          <>
                            <button onClick={e => { e.stopPropagation(); addFolder(f); }}
                              title={`New subfolder under ${f}`}
                              className="opacity-0 group-hover:opacity-100 text-xs text-brand-text-secondary hover:text-brand-secondary border border-gray-300 hover:border-brand-secondary rounded px-1.5 transition-all">
                              ＋ sub
                            </button>
                            <button onClick={e => { e.stopPropagation(); renameFolder(f); }}
                              title={`Rename or move ${f}`}
                              className="opacity-0 group-hover:opacity-100 text-xs text-brand-text-secondary hover:text-brand-secondary border border-gray-300 hover:border-brand-secondary rounded px-1.5 transition-all">
                              ✏️
                            </button>
                            <button onClick={e => { e.stopPropagation(); setUpFolder(f); }}
                              title={`Upload into ${f}`}
                              className="opacity-0 group-hover:opacity-100 text-xs text-brand-text-secondary hover:text-brand-secondary border border-gray-300 hover:border-brand-secondary rounded px-1.5 transition-all">
                              ⬆ here
                            </button>
                          </>
                        )}
                      </div>
                      {(q || !collapsed.has(f)) && inFolder.map(d => fileRow(d, depth + 1))}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-brand-text-secondary mt-3">
              Folders: ＋ New folder (or ＋ sub on a folder row) creates any depth of subfolders — a folder becomes permanent
              once it holds at least one file. Move files AND folders by drag &amp; drop onto a folder (or the root drop zone) — a dragged
              folder takes all its content with it; ✏️ renames a file (display name) or a folder (editing the full path also moves it);
              dropping files from the Windows explorer onto a folder uploads them straight into it; ⬆ here preselects a folder for the next upload.
              Files are stored inside the RegReport SQL database (varbinary) — a database backup includes every document,
              nothing leaves the local environment, and anyone can re-download the original at any time.
              Workbench source files (working papers, CASABIS/LCR_G/NSFR_G) uploaded from the Workbench page land here too,
              under Workbench/&lt;entity&gt;/&lt;period&gt;, tagged by entity, period and type.
            </p>
          </>
        )}
      </Card>

      {viewer && <DocViewer v={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
};
