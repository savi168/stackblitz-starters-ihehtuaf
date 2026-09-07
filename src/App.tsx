import React, { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Link, NavLink, Navigate } from 'react-router-dom';
import { DataProvider, useData } from './context/DataContext';
import { ErrorBoundary } from './components';
import { APP_VERSION, fetchMeta } from './version';

// adminOnly modules stay hidden (and their routes blocked) for users without
// the Admin role — the API enforces the same rule server-side on mutations.
const NAV_ITEMS = [
  { to: '/report', label: 'Report' },
  { to: '/scenarios', label: 'Scenarios' },
  { to: '/capital', label: 'Workbench', adminOnly: true },
  { to: '/production', label: 'Production', adminOnly: true },
  { to: '/daily-reports', label: 'Daily Reports' },
  { to: '/deadlines', label: 'Deadlines' },
  { to: '/library', label: 'Library' },
  { to: '/projects', label: 'Projects' },
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
                  <Route path="/deadlines" element={<DeadlinesPage />} />
                  <Route path="/library" element={<LibraryPage />} />
                  <Route path="/datamanagement" element={<AdminRoute><DataManagementPage /></AdminRoute>} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/cockpit" element={<AdminRoute><BackendCockpitPage /></AdminRoute>} />
                  <Route path="/capital" element={<AdminRoute><CapitalWorkbenchPage /></AdminRoute>} />
                  <Route path="/report" element={<ManagementReportPage />} />
                  <Route path="/scenarios" element={<ScenariosPage />} />
                  <Route path="/production" element={<AdminRoute><ProductionPage /></AdminRoute>} />
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
