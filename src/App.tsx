import React, { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Link, NavLink, Navigate } from 'react-router-dom';
import { DataProvider, useData } from './context/DataContext';
import { ErrorBoundary } from './components';
import { APP_VERSION, fetchMeta } from './version';

// adminOnly modules stay hidden (and their routes blocked) for users without
// the Admin role — the API enforces the same rule server-side on mutations.
// Readers (non-admin) only see the finished reports: Report + Daily Reports.
// Everything else — working tools and internal modules — is team/admin only.
const NAV_ITEMS = [
  { to: '/report', label: 'Report' },
  { to: '/scenarios', label: 'Scenarios', adminOnly: true },
  { to: '/capital', label: 'Workbench', adminOnly: true },
  { to: '/production', label: 'Production', adminOnly: true },
  { to: '/daily-reports', label: 'Daily Reports' },
  { to: '/deadlines', label: 'Deadlines', adminOnly: true },
  { to: '/library', label: 'Library', adminOnly: true },
  { to: '/projects', label: 'Projects', adminOnly: true },
  { to: '/cockpit', label: 'Backend', adminOnly: true },
  { to: '/datamanagement', label: 'Admin', adminOnly: true },
];

// --- LAZY-LOADED PAGES ---
// Each page (and its heavy chart/PDF dependencies) is split into its own chunk
// so the initial load only ships the code needed for the landing page.
const HubPage = lazy(() => import('./pages/HubPage').then(m => ({ default: m.HubPage })));
const DeadlinesPage = lazy(() => import('./pages/DeadlinesPage').then(m => ({ default: m.DeadlinesPage })));
const DataManagementPage = lazy(() => import('./pages/DataManagementPage').then(m => ({ default: m.DataManagementPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
const TeamPage = lazy(() => import('./pages/TeamPage').then(m => ({ default: m.TeamPage })));
const DailyReportsPage = lazy(() => import('./pages/DailyReportsPage').then(m => ({ default: m.DailyReportsPage })));
const LibraryPage = lazy(() => import('./pages/LibraryPage').then(m => ({ default: m.LibraryPage })));
const BackendCockpitPage = lazy(() => import('./pages/BackendCockpitPage').then(m => ({ default: m.BackendCockpitPage })));
const CapitalWorkbenchPage = lazy(() => import('./pages/CapitalWorkbenchPage').then(m => ({ default: m.CapitalWorkbenchPage })));
const ManagementReportPage = lazy(() => import('./pages/ManagementReportPage').then(m => ({ default: m.ManagementReportPage })));
const ScenariosPage = lazy(() => import('./pages/ScenariosPage').then(m => ({ default: m.ScenariosPage })));
const ProductionPage = lazy(() => import('./pages/ProductionPage'));
const LogsPage = lazy(() => import('./pages/LogsPage').then(m => ({ default: m.LogsPage })));

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center py-24 text-brand-text-secondary">
    <span className="animate-pulse text-lg">Loading…</span>
  </div>
);

/** Blocks a route for non-admin users (UI guard; the API enforces it too). */
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin } = useData();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
};

/** Release number + deployment environment (PROD / TEST / DEV / LOCAL) —
 * the environment comes from the API (/api/meta), so the badge tells at a
 * glance which backend this browser tab is talking to. */
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
    <span className="flex items-center gap-1.5" title={`RegReport v${APP_VERSION}${env ? ` — ${env} environment` : ''}`}>
      <span className="text-[10px] text-brand-text-secondary tabular-nums">v{APP_VERSION}</span>
      {env && (
        <span className={`text-[10px] font-bold tracking-wider rounded px-1.5 py-0.5 ${tone}`}>{env}</span>
      )}
    </span>
  );
};

/** Top-right ☰ menu (admins): Logs page + the built-in documentation. The
 * doc links deep-link into the Library viewer via /library?doc=<stem>. */
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
      <button
        onClick={() => setOpen(o => !o)}
        title="Logs & documentation"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`text-base leading-none px-2 py-1 rounded-md border transition-colors ${open ? 'border-efg-line bg-brand-bg-body' : 'border-transparent hover:border-efg-line'}`}
      >
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

const NavBar: React.FC = () => {
  const { isAdmin, currentUser } = useData();
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map(item => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `px-2 py-1 text-sm font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-brand-text-secondary hover:text-brand-text-primary'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
      {currentUser.securityMode !== 'None' && (
        <span
          title={`Signed in as ${currentUser.name} (${currentUser.roles.join(', ')})`}
          className="ml-2 pl-2 border-l border-efg-line text-xs text-brand-text-secondary hidden md:inline"
        >
          {currentUser.name.split('\\').pop()}{isAdmin ? '' : ' · read-only'}
        </span>
      )}
    </div>
  );
};

// --- APP ROUTER ---

const App: React.FC = () => {
  // Dark mode: a class on <html> flips the CSS variables (see index.css).
  // The class is applied inside the initializer so the very first render —
  // charts included — already reads the right theme tokens.
  const [dark, setDark] = useState(() => {
    let saved = false;
    try { saved = localStorage.getItem('theme') === 'dark'; } catch { /* no storage */ }
    document.documentElement.classList.toggle('dark', saved);
    return saved;
  });
  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch { /* no storage */ }
    setDark(next);
  };
  return (
    <DataProvider>
      <HashRouter>
        <div className="min-h-screen flex flex-col bg-brand-bg-body text-brand-text-primary">
          <header className="bg-white border-b border-efg-line sticky top-0 z-40">
            <nav className="container mx-auto px-6 h-16 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Link to="/" className="flex items-center gap-2 group">
                  <span className="text-xl font-semibold tracking-tight text-brand-text-primary">
                    Reg<span className="text-brand-primary">Report</span>
                  </span>
                  <span className="hidden sm:inline text-xs uppercase tracking-widest text-brand-text-secondary border-l border-efg-line pl-2">
                    Regulatory Reporting
                  </span>
                </Link>
                <VersionBadge />
              </div>
              <div className="flex items-center gap-2">
                <NavBar />
                <HeaderMenu />
                <button onClick={toggleTheme} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                  className="text-base leading-none px-2 py-1 rounded-md border border-transparent hover:border-efg-line transition-colors">
                  {dark ? '☀️' : '🌙'}
                </button>
              </div>
            </nav>
          </header>
          <main className="flex-1">
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<HubPage />} />
                  <Route path="/daily-reports" element={<DailyReportsPage />} />
                  <Route path="/deadlines" element={<AdminRoute><DeadlinesPage /></AdminRoute>} />
                  <Route path="/library" element={<AdminRoute><LibraryPage /></AdminRoute>} />
                  <Route path="/datamanagement" element={<AdminRoute><DataManagementPage /></AdminRoute>} />
                  <Route path="/projects" element={<AdminRoute><ProjectsPage /></AdminRoute>} />
                  <Route path="/projects/:projectId" element={<AdminRoute><ProjectDetailPage /></AdminRoute>} />
                  <Route path="/team" element={<AdminRoute><TeamPage /></AdminRoute>} />
                  <Route path="/cockpit" element={<AdminRoute><BackendCockpitPage /></AdminRoute>} />
                  <Route path="/capital" element={<AdminRoute><CapitalWorkbenchPage /></AdminRoute>} />
                  <Route path="/report" element={<ManagementReportPage />} />
                  <Route path="/scenarios" element={<AdminRoute><ScenariosPage /></AdminRoute>} />
                  <Route path="/production" element={<AdminRoute><ProductionPage /></AdminRoute>} />
                  <Route path="/logs" element={<AdminRoute><LogsPage /></AdminRoute>} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
          <footer className="border-t border-efg-line bg-white">
            <div className="container mx-auto px-6 py-3 flex flex-col sm:flex-row justify-between items-center gap-1 text-xs text-brand-text-secondary">
              <span>RegReport · Regulatory Reporting Dashboard</span>
              <span>Multi-entity regulatory KPI control center</span>
            </div>
          </footer>
        </div>
      </HashRouter>
    </DataProvider>
  );
};

export default App;
