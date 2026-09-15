import React, { lazy, Suspense, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider, useData } from './context/DataContext';
import { ScopeProvider } from './context/ScopeContext';
import { ErrorBoundary } from './components';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { CommandPalette } from './CommandPalette';

// --- LAZY-LOADED PAGES ---
// Each page (and its heavy chart/PDF dependencies) is split into its own chunk
// so the initial load only ships the code needed for the landing page.
const HomeCockpitPage = lazy(() => import('./pages/HomeCockpitPage'));
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
const BalanceAnalyticsPage = lazy(() => import('./pages/BalanceAnalyticsPage'));
const LogsPage = lazy(() => import('./pages/LogsPage').then(m => ({ default: m.LogsPage })));

/** Skeleton placeholder shaped like a typical page (header + cards) — reads
 * as "content arriving" instead of a bare Loading label. */
const PageLoader: React.FC = () => (
  <div className="p-5 md:p-8 animate-fade-in" aria-busy="true" aria-label="Loading">
    <div className="skeleton h-9 w-72 mb-3" />
    <div className="skeleton h-4 w-96 max-w-full mb-10" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="skeleton h-44 rounded-xl" />
      <div className="skeleton h-44 rounded-xl" />
    </div>
  </div>
);

/** Blocks a route for non-admin users (UI guard; the API enforces it too). */
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin } = useData();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
};

// --- APP ROUTER ---
// v3.21 architecture: grouped sidebar (all modules by domain) + a global
// context bar (period & entity picked once) around the unchanged pages.

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <DataProvider>
      <HashRouter>
        <ScopeProvider>
          <div className="min-h-screen flex bg-brand-bg-body text-brand-text-primary">
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <div className="flex-1 min-w-0 flex flex-col">
              <TopBar dark={dark} onToggleTheme={toggleTheme} onOpenSidebar={() => setSidebarOpen(true)} />
              <CommandPalette dark={dark} onToggleTheme={toggleTheme} />
              <main className="flex-1">
                <ErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/" element={<HomeCockpitPage />} />
                      <Route path="/hub" element={<HubPage />} />
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
                      <Route path="/production/reco" element={<AdminRoute><ProductionPage initialStep="reco" /></AdminRoute>} />
                      <Route path="/production/analytics" element={<AdminRoute><BalanceAnalyticsPage /></AdminRoute>} />
                      <Route path="/logs" element={<AdminRoute><LogsPage /></AdminRoute>} />
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </main>
              <footer className="border-t border-efg-line bg-white">
                <div className="px-6 py-3 flex flex-col sm:flex-row justify-between items-center gap-1 text-xs text-brand-text-secondary">
                  <span>RegReport · Regulatory Reporting Dashboard</span>
                  <span>Multi-entity regulatory KPI control center</span>
                </div>
              </footer>
            </div>
          </div>
        </ScopeProvider>
      </HashRouter>
    </DataProvider>
  );
};

export default App;
