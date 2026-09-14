import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from './context/DataContext';

/**
 * Command palette (Ctrl/Cmd+K): universal search across pages, built-in
 * documentation, entities, projects, tasks, deadlines and contacts — plus a
 * couple of actions. Fully client-side over the central data already in
 * memory, so it works offline and costs nothing.
 *
 * Opened by the keyboard shortcut or the 🔍 button in the ribbon (which
 * dispatches the 'regreport:open-palette' window event).
 */

interface Cmd {
  id: string;
  group: string;
  label: string;
  hint?: string;
  /** Extra searchable text (topics, keys…). */
  keywords?: string;
  run: () => void;
}

const GROUP_ORDER = ['Pages', 'Actions', 'Documentation', 'Entities', 'Projects', 'Tasks', 'Deadlines', 'Contacts'];

export const CommandPalette: React.FC<{ dark: boolean; onToggleTheme: () => void }> = ({ dark, onToggleTheme }) => {
  const { data, allEntities, isAdmin } = useData();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Open/close: Ctrl/Cmd+K anywhere, Escape to close, ribbon button event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
        setQ('');
        setSel(0);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpenEvent = () => { setOpen(true); setQ(''); setSel(0); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('regreport:open-palette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('regreport:open-palette', onOpenEvent);
    };
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const commands = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => { navigate(to); };
    const out: Cmd[] = [];

    // Pages (respect the Reader restriction: Report + Daily Reports only).
    const pages: [string, string, string, boolean][] = [
      ['/report', 'Management Report', 'capital lcr nsfr leverage overview', false],
      ['/daily-reports', 'Daily Reports', 'daily lcr large exposures', false],
      ['/scenarios', 'Scenarios', 'what-if simulation shock bridge', true],
      ['/capital', 'Workbench', 'import casabis k-ler finma excel data entry', true],
      ['/production', 'Production', 'mercury controls adjustments interco', true],
      ['/deadlines', 'Deadlines', 'calendar due dates', true],
      ['/library', 'Library', 'documents regulations procedures', true],
      ['/projects', 'Projects', 'kanban board tasks gantt', true],
      ['/team', 'Team & Contacts', 'directory people phone email topics', true],
      ['/cockpit', 'Backend Cockpit', 'data explorer schema sql tables', true],
      ['/datamanagement', 'Admin', 'system entities backup restore inventory', true],
      ['/logs', 'Logs', 'audit trail technical debug changes', true],
    ];
    pages.forEach(([to, label, kw, adminOnly]) => {
      if (adminOnly && !isAdmin) return;
      out.push({ id: `p${to}`, group: 'Pages', label, keywords: kw, hint: to, run: go(to) });
    });

    out.push({
      id: 'a-theme', group: 'Actions',
      label: dark ? 'Switch to light mode' : 'Switch to dark mode',
      keywords: 'theme dark light night', run: onToggleTheme,
    });

    if (isAdmin) {
      const docs: [string, string][] = [
        ['regreport-documentation', 'RegReport — tool documentation'],
        ['mercury-datamodel', 'MERCURY — data model (PDF)'],
        ['mercury-integration', 'MERCURY — integration & adjustments'],
        ['release-procedure', 'Release & upgrade procedure'],
        ['release-notes', 'Release notes (version history)'],
      ];
      docs.forEach(([stem, label]) => out.push({
        id: `d-${stem}`, group: 'Documentation', label, keywords: 'doc guide help',
        run: go(`/library?doc=${stem}`),
      }));

      allEntities.forEach(e => out.push({
        id: `e-${e}`, group: 'Entities', label: e, hint: 'open Management Report',
        keywords: 'entity report', run: go(`/report?entity=${encodeURIComponent(e)}`),
      }));

      (data.projects || []).filter(p => !p.archived).forEach(p => out.push({
        id: `pr-${p.id}`, group: 'Projects', label: p.name, hint: p.key,
        keywords: `project ${p.key}`, run: go(`/projects/${p.id}`),
      }));

      (data.projectTasks || []).slice(0, 400).forEach(t => {
        const proj = (data.projects || []).find(p => p.id === t.projectId);
        if (!proj || proj.archived) return;
        out.push({
          id: `t-${t.id}`, group: 'Tasks',
          label: t.title, hint: `${proj.key}-${t.number ?? ''} · ${proj.name}`,
          keywords: `task ${proj.key}-${t.number ?? ''}`,
          run: go(`/projects/${t.projectId}`),
        });
      });

      (data.deadlines || []).forEach(d => out.push({
        id: `dl-${d.id}`, group: 'Deadlines', label: d.name,
        hint: d.endOfPeriod || undefined, keywords: 'deadline due',
        run: go('/deadlines'),
      }));

      const people = [
        ...(data.team || []).map(m => ({ id: `tm-${m.id}`, name: m.name, sub: m.role || 'Team', kw: `${m.role || ''}` })),
        ...(data.contacts || []).map(c => ({
          id: `c-${c.id}`, name: c.name,
          sub: [c.department, c.company].filter(Boolean).join(' · ') || 'Contact',
          kw: `${c.department || ''} ${c.company || ''} ${(c.topics || '')} ${(c.notes || '')}`,
        })),
      ];
      people.forEach(p => out.push({
        id: p.id, group: 'Contacts', label: p.name, hint: p.sub,
        keywords: p.kw, run: go('/team'),
      }));
    }

    return out;
  }, [data, allEntities, isAdmin, dark, navigate, onToggleTheme]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list: Cmd[];
    if (!needle) {
      list = commands.filter(c => c.group === 'Pages' || c.group === 'Actions');
    } else {
      const terms = needle.split(/\s+/);
      list = commands.filter(c => {
        const hay = `${c.label} ${c.hint || ''} ${c.keywords || ''}`.toLowerCase();
        return terms.every(t => hay.includes(t));
      });
    }
    // Stable group ordering, capped so the panel stays scannable.
    list = [...list].sort((a, b) =>
      GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
    return list.slice(0, 14);
  }, [commands, q]);

  useEffect(() => { setSel(0); }, [q]);

  const runSel = useCallback((cmd?: Cmd) => {
    const c = cmd ?? filtered[sel];
    if (!c) return;
    setOpen(false);
    c.run();
  }, [filtered, sel]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); runSel(); }
  };

  // Keep the selected row in view while arrowing through.
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4"
      onMouseDown={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/35" />
      <div
        className="relative w-full max-w-xl bg-white rounded-xl shadow-card-hover border border-efg-line overflow-hidden animate-fade-in"
        onMouseDown={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Command palette"
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-efg-line">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" className="text-brand-text-secondary shrink-0">
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search pages, entities, projects, docs, contacts…"
            className="flex-1 py-3.5 bg-transparent text-sm text-brand-text-primary placeholder:text-brand-text-secondary focus:outline-none"
          />
          <kbd className="text-[10px] text-brand-text-secondary border border-efg-line rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-sm text-brand-text-secondary text-center">No match for “{q}”.</p>
          )}
          {filtered.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <React.Fragment key={c.id}>
                {header && (
                  <p className="px-4 pt-2.5 pb-1 text-[10px] uppercase tracking-widest text-brand-text-secondary">{header}</p>
                )}
                <button
                  data-selected={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => runSel(c)}
                  className={`w-full text-left px-4 py-2 flex items-baseline gap-2 text-sm transition-colors ${
                    i === sel ? 'bg-brand-primary/10 text-brand-text-primary' : 'text-brand-text-primary hover:bg-brand-bg-body'
                  }`}
                >
                  <span className={`truncate ${i === sel ? 'font-medium' : ''}`}>{c.label}</span>
                  {c.hint && <span className="ml-auto shrink-0 text-xs text-brand-text-secondary truncate max-w-[45%]">{c.hint}</span>}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-efg-line flex gap-4 text-[10px] text-brand-text-secondary">
          <span>↑↓ navigate</span><span>↵ open</span><span>ctrl K toggle</span>
        </div>
      </div>
    </div>
  );
};
