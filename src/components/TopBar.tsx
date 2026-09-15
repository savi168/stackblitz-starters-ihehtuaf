import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useScope } from '../context/ScopeContext';

/**
 * v3.21 architecture: the global context bar. Shows where you are (crumb +
 * page title) and carries the GLOBAL production scope — reporting period and
 * entity picked once, persisted per browser. Phase 1: the selection is
 * stored and displayed (with the certified/in-progress status); pages keep
 * their own selectors and will be wired to it progressively.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const periodLabel = (iso: string): string => {
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]}-${m[1].slice(2)}` : iso;
};

const TITLES: Array<[string, string, string]> = [
  ['/production/analytics', 'Analytics /', 'Balance sheet analytics'],
  ['/production/reco', 'Monthly close /', 'Reco & adjustments'],
  ['/production', 'Monthly close /', 'Production line'],
  ['/deadlines', 'Monthly close /', 'Calendar & deadlines'],
  ['/report', 'Analytics /', 'Management report'],
  ['/daily-reports', 'Analytics /', 'Daily reports'],
  ['/scenarios', 'Simulation /', 'Scenarios & projections'],
  ['/capital', 'Simulation /', 'Capital & liquidity workbench'],
  ['/library', 'Data /', 'Library'],
  ['/projects', 'Workspace /', 'Projects'],
  ['/team', 'Workspace /', 'Team & contacts'],
  ['/datamanagement', 'Admin /', 'Data management'],
  ['/logs', 'Admin /', 'Logs & audit'],
  ['/hub', '', 'Modules overview'],
  ['/', '', 'Home — close cockpit'],
];

/** ☰ menu (admins): Logs + built-in documentation deep links (unchanged). */
const HeaderMenu: React.FC = () => {
  const { isAdmin } = useData();
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!isAdmin) return null;

  const item = 'block w-full text-left px-4 py-2 text-sm text-brand-text-primary hover:bg-brand-bg-body transition-colors';
  const DOCS: { label: string; doc: string }[] = [
    { label: 'RegReport — tool documentation', doc: 'regreport-documentation' },
    { label: 'MERCURY — data model (PDF)', doc: 'mercury-datamodel' },
    { label: 'MERCURY — integration & adjustments', doc: 'mercury-integration' },
    { label: 'Release & upgrade procedure', doc: 'release-procedure' },
    { label: 'Release notes (version history)', doc: 'release-notes' },
  ];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} title="Logs & documentation" aria-haspopup="menu" aria-expanded={open}
        className={`text-base leading-none px-2 py-1 rounded-md border transition-colors ${open ? 'border-efg-line bg-brand-bg-body' : 'border-transparent hover:border-efg-line'}`}>
        ☰
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-72 bg-white border border-efg-line rounded-lg shadow-lg py-2 z-50">
          <Link to="/logs" role="menuitem" onClick={() => setOpen(false)} className={item}>
            <span className="font-semibold">Logs</span>
            <span className="block text-xs text-brand-text-secondary">Technical (API, debug) & business audit trail</span>
          </Link>
          <div className="my-2 border-t border-efg-line" />
          <p className="px-4 pb-1 text-[10px] uppercase tracking-widest text-brand-text-secondary">Documentation</p>
          {DOCS.map(d => (
            <Link key={d.doc} to={`/library?doc=${d.doc}`} role="menuitem" onClick={() => setOpen(false)} className={item}>
              {d.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export const TopBar: React.FC<{
  dark: boolean; onToggleTheme: () => void; onOpenSidebar: () => void;
}> = ({ dark, onToggleTheme, onOpenSidebar }) => {
  const { mode, data } = useData();
  const scope = useScope();
  const location = useLocation();

  let [, crumb, title] = TITLES.find(([p]) =>
    p === '/' ? location.pathname === '/' : location.pathname === p || location.pathname.startsWith(`${p}/`)) ?? ['', '', ''];
  if (location.pathname === '/cockpit') {
    crumb = location.search.includes('table=') || location.search.includes('tab=data') ? 'Data /' : 'Admin /';
    title = location.search.includes('table=prodMappingEntries') ? 'Mappings & nomenclatures'
      : location.search.includes('tab=data') ? 'Data explorer' : 'Backend cockpit';
  }

  const certified = scope.entity && scope.period
    ? (data.prodBaselines || []).some(b => b.entity === scope.entity && b.date === scope.period)
    : null;
  const selCls = 'text-xs font-semibold bg-white border border-gray-300 rounded-md px-2 py-1.5 focus:border-brand-primary max-w-[210px]';

  return (
    <header className="app-header border-b border-efg-line sticky top-0 z-40">
      <div className="h-14 px-4 md:px-6 flex items-center gap-3">
        <button onClick={onOpenSidebar} title="Menu" aria-label="Open navigation"
          className="lg:hidden p-1.5 rounded-md border border-transparent text-brand-text-secondary hover:border-efg-line transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <div className="min-w-0 flex items-baseline gap-1.5">
          {crumb && <span className="hidden sm:inline text-xs text-brand-text-secondary whitespace-nowrap">{crumb}</span>}
          <span className="text-[13px] font-semibold truncate">{title}</span>
        </div>
        <div className="flex-1" />
        {mode === 'api' && scope.periods.length > 0 && (
          <span className="hidden md:flex items-center gap-2" title="Global production scope — period & entity (stored per browser; module wiring lands progressively)">
            <select value={scope.period} onChange={e => scope.setPeriod(e.target.value)} className={selCls} aria-label="Reporting period">
              {scope.periods.map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}
            </select>
            <select value={scope.entity} onChange={e => scope.setEntity(e.target.value)} className={selCls} aria-label="Reporting entity">
              {scope.entities.map(e => <option key={e.id} value={e.id}>{e.name ? `${e.id} — ${e.name}` : e.id}</option>)}
            </select>
            {certified !== null && (
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full border px-2.5 py-1 whitespace-nowrap ${
                certified
                  ? 'text-status-green bg-status-green/10 border-status-green/30'
                  : 'text-status-amber bg-status-amber/10 border-status-amber/30'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${certified ? 'bg-status-green' : 'bg-status-amber'}`} />
                {certified ? 'Certified ✔' : 'Close in progress'}
              </span>
            )}
          </span>
        )}
        <span className="flex items-center gap-0.5 pl-1 border-l border-efg-line">
          <button onClick={() => window.dispatchEvent(new CustomEvent('regreport:open-palette'))}
            title="Search everything — Ctrl K"
            className="p-1.5 rounded-md border border-transparent text-brand-text-secondary hover:text-brand-text-primary hover:border-efg-line transition-colors">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-label="Search">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
          </button>
          <HeaderMenu />
          <button onClick={onToggleTheme} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="text-base leading-none px-2 py-1 rounded-md border border-transparent hover:border-efg-line transition-colors">
            {dark ? '☀️' : '🌙'}
          </button>
        </span>
      </div>
    </header>
  );
};
