import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { APP_VERSION, fetchMeta } from '../version';

/**
 * v3.21 architecture: grouped left navigation — every module of the app,
 * organized by domain (Monthly close / Analytics / Simulation / Data /
 * Workspace / Admin). Replaces the old top NavBar; admin-only items stay
 * hidden for readers exactly like before (the API enforces it server-side).
 */

const IC: Record<string, React.ReactNode> = {
  home: <><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>,
  check: <><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></>,
  swap: <><path d="M16 3h5v5" /><path d="M8 21H3v-5" /><path d="M21 3l-7.5 7.5" /><path d="M3 21l7.5-7.5" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 6-6" /></>,
  doc: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  flask: <><path d="M9 3v6L4 19a2 2 0 0 0 1.8 3h12.4A2 2 0 0 0 20 19L15 9V3" /><path d="M8 3h8" /></>,
  coins: <><ellipse cx="12" cy="6" rx="7" ry="2.5" /><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" /><path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></>,
  db: <><ellipse cx="12" cy="5.5" rx="8" ry="2.8" /><path d="M4 5.5v13c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8v-13" /><path d="M4 12c0 1.5 3.6 2.8 8 2.8s8-1.3 8-2.8" /></>,
  map2: <><path d="M9 4l6 2 6-2v14l-6 2-6-2-6 2V6z" /><path d="M9 4v14M15 6v14" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  kanban: <><rect x="3" y="3" width="7" height="14" rx="1.5" /><rect x="14" y="3" width="7" height="9" rx="1.5" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><circle cx="17.5" cy="9" r="2.6" /><path d="M16 14.4c3 .3 5.5 2.4 5.5 5.6" /></>,
  server: <><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><path d="M7 7.5h.01M7 16.5h.01" /></>,
  shield: <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" /></>,
};

const Icon: React.FC<{ name: string; className?: string }> = ({ name, className }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className || ''}`} aria-hidden="true">
    {IC[name]}
  </svg>
);

type Item = {
  to: string; label: string; icon: string; adminOnly?: boolean;
  /** Exact-path matching (so /production isn't active on /production/reco). */
  end?: boolean;
};
const GROUPS: Array<{ label: string; items: Item[] }> = [
  { label: '', items: [{ to: '/', label: 'Home', icon: 'home', end: true }] },
  { label: 'Monthly close', items: [
    { to: '/production', label: 'Production line', icon: 'check', adminOnly: true, end: true },
    { to: '/production/reco', label: 'Reco & adjustments', icon: 'swap', adminOnly: true },
    { to: '/deadlines', label: 'Calendar & deadlines', icon: 'cal', adminOnly: true },
  ] },
  { label: 'Analytics', items: [
    { to: '/production/analytics', label: 'Balance analytics', icon: 'chart', adminOnly: true },
    { to: '/report', label: 'Management report', icon: 'doc' },
    { to: '/daily-reports', label: 'Daily reports', icon: 'pulse' },
  ] },
  { label: 'Simulation', items: [
    { to: '/scenarios', label: 'Scenarios & projections', icon: 'flask', adminOnly: true },
  ] },
  { label: 'Data', items: [
    { to: '/capital', label: 'Workbench', icon: 'coins', adminOnly: true },
    { to: '/explorer', label: 'Data explorer', icon: 'db', adminOnly: true },
    { to: '/mappings', label: 'Mappings & nomenclatures', icon: 'map2', adminOnly: true },
    { to: '/library', label: 'Library', icon: 'book', adminOnly: true },
  ] },
  { label: 'Workspace', items: [
    { to: '/projects', label: 'Projects', icon: 'kanban', adminOnly: true },
    { to: '/team', label: 'Team & contacts', icon: 'people', adminOnly: true },
  ] },
  { label: 'Admin', items: [
    { to: '/cockpit', label: 'Backend cockpit', icon: 'server', adminOnly: true },
    { to: '/datamanagement', label: 'Data management', icon: 'gear', adminOnly: true },
    { to: '/logs', label: 'Logs & audit', icon: 'shield', adminOnly: true },
  ] },
];

/** Release number + backend environment (moved from the old header). */
const VersionBadge: React.FC = () => {
  const { mode, apiBaseUrl } = useData();
  const [env, setEnv] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (mode !== 'api' || !apiBaseUrl) { setEnv('LOCAL'); return; }
    fetchMeta(apiBaseUrl).then(m => { if (!cancelled) setEnv(m?.environmentLabel || null); });
    return () => { cancelled = true; };
  }, [mode, apiBaseUrl]);
  const tone = env === 'PROD'
    ? 'bg-status-green/15 text-status-green'
    : env === 'LOCAL' ? 'bg-brand-bg-body text-brand-text-secondary'
    : 'bg-status-amber/15 text-status-amber';
  return (
    <span className="ml-auto flex items-center gap-1" title={`RegReport v${APP_VERSION}${env ? ` — ${env} environment` : ''}`}>
      <span className="text-[9px] text-brand-text-secondary tabular-nums">v{APP_VERSION}</span>
      {env && <span className={`text-[9px] font-bold tracking-wider rounded px-1 py-0.5 ${tone}`}>{env}</span>}
    </span>
  );
};

export const Sidebar: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { isAdmin, currentUser } = useData();
  const location = useLocation();

  const activeOf = (item: Item): boolean => {
    const path = item.to.split('?')[0];
    return item.end
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const shortName = currentUser.name.split('\\').pop() || currentUser.name;
  const initials = shortName.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '??';

  const body = (
    <div className="h-full w-60 bg-white border-r border-efg-line flex flex-col px-2.5 py-3.5 overflow-y-auto">
      <Link to="/" onClick={onClose} className="flex items-center gap-2 px-2 pb-3.5 group">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0 transition-transform duration-200 group-hover:scale-105">
          <rect width="32" height="32" rx="7" className="fill-brand-primary" />
          <rect x="7.5" y="17" width="4.5" height="8" rx="1.5" fill="#fff" opacity="0.85" />
          <rect x="13.75" y="12" width="4.5" height="13" rx="1.5" fill="#fff" opacity="0.92" />
          <rect x="20" y="7" width="4.5" height="18" rx="1.5" fill="#fff" />
        </svg>
        <span className="text-[17px] font-semibold tracking-tight text-brand-text-primary">
          Reg<span className="text-brand-primary">Report</span>
        </span>
        <VersionBadge />
      </Link>
      <nav className="flex-1 flex flex-col gap-0.5" aria-label="Main navigation">
        {GROUPS.map(g => {
          const items = g.items.filter(i => !i.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <React.Fragment key={g.label || 'top'}>
              {g.label && (
                <p className="text-[9px] uppercase tracking-[0.14em] font-bold text-brand-accent px-2 pt-3 pb-1">{g.label}</p>
              )}
              {items.map(item => {
                const active = activeOf(item);
                return (
                  <NavLink key={item.to} to={item.to} onClick={onClose}
                    className={`relative flex items-center gap-2.5 text-[12.5px] rounded-lg px-2.5 py-[7px] transition-colors ${
                      active
                        ? 'bg-brand-primary/[0.07] text-brand-primary font-semibold'
                        : 'text-brand-secondary font-medium hover:text-brand-text-primary hover:bg-brand-bg-body'
                    }`}>
                    {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-brand-primary" />}
                    <Icon name={item.icon} className={active ? 'text-brand-primary' : 'text-efg-steel'} />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </React.Fragment>
          );
        })}
      </nav>
      <div className="border-t border-efg-line pt-2.5 mt-2.5 px-1.5 flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-brand-secondary text-white text-[10px] font-bold flex items-center justify-center shrink-0">{initials}</span>
        <span className="min-w-0">
          <span className="block text-[11.5px] font-semibold truncate">{shortName}</span>
          <span className="block text-[9.5px] text-brand-text-secondary truncate">
            {currentUser.securityMode === 'None' ? 'Local mode' : currentUser.roles.join(' · ')}{isAdmin ? '' : ' · read-only'}
          </span>
        </span>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: static column. */}
      <aside className="hidden lg:block sticky top-0 h-screen shrink-0 z-30">{body}</aside>
      {/* Mobile: off-canvas drawer. */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 shadow-xl animate-fade-in">{body}</aside>
        </div>
      )}
    </>
  );
};
