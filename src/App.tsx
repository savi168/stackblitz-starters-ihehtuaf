import React, { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Link, NavLink, Navigate } from 'react-router-dom';
import { DataProvider, useData } from './context/DataContext';
import { ErrorBoundary } from './components';

// adminOnly modules stay hidden (and their routes blocked) for users without
// the Admin role — the API enforces the same rule server-side on mutations.
const NAV_ITEMS = [
  { to: '/report', label: 'Report' },
  { to: '/scenarios', label: 'Scenarios' },
  { to: '/details', label: 'KPI Analysis' },
  { to: '/capital', label: 'Workbench', adminOnly: true },
  { to: '/daily-reports', label: 'Daily Reports' },
  { to: '/deadlines', label: 'Deadlines' },
  { to: '/projects', label: 'Projects' },
  { to: '/cockpit', label: 'Backend', adminOnly: true },
  { to: '/datamanagement', label: 'Admin', adminOnly: true },
];

// --- LAZY-LOADED PAGES ---
// Each page (and its heavy chart/PDF dependencies) is split into its own chunk
// so the initial load only ships the code needed for the landing page.
const HubPage = lazy(() => import('./pages/HubPage').then(m => ({ default: m.HubPage })));
const KpiDetailsPage = lazy(() => import('./pages/KpiDetailsPage').then(m => ({ default: m.KpiDetailsPage })));
const DeadlinesPage = lazy(() => import('./pages/DeadlinesPage').then(m => ({ default: m.DeadlinesPage })));
const DataManagementPage = lazy(() => import('./pages/DataManagementPage').then(m => ({ default: m.DataManagementPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage').then(m => ({ default: m.ProjectDetailPage })));
const TeamPage = lazy(() => import('./pages/TeamPage').then(m => ({ default: m.TeamPage })));
const DailyReportsPage = lazy(() => import('./pages/DailyReportsPage').then(m => ({ default: m.DailyReportsPage })));
const BusinessCasePage = lazy(() => import('./pages/BusinessCasePage').then(m => ({ default: m.BusinessCasePage })));
const BackendCockpitPage = lazy(() => import('./pages/BackendCockpitPage').then(m => ({ default: m.BackendCockpitPage })));
const CapitalWorkbenchPage = lazy(() => import('./pages/CapitalWorkbenchPage').then(m => ({ default: m.CapitalWorkbenchPage })));
const ManagementReportPage = lazy(() => import('./pages/ManagementReportPage').then(m => ({ default: m.ManagementReportPage })));
const ScenariosPage = lazy(() => import('./pages/ScenariosPage').then(m => ({ default: m.ScenariosPage })));

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
  return (
    <DataProvider>
      <HashRouter>
        <div className="min-h-screen flex flex-col bg-brand-bg-body text-brand-text-primary">
          <header className="bg-white border-b border-efg-line sticky top-0 z-40">
            <nav className="container mx-auto px-6 h-16 flex justify-between items-center">
              <Link to="/" className="flex items-center gap-2 group">
                <span className="text-xl font-semibold tracking-tight text-brand-text-primary">
                  Reg<span className="text-brand-primary">Report</span>
                </span>
                <span className="hidden sm:inline text-xs uppercase tracking-widest text-brand-text-secondary border-l border-efg-line pl-2">
                  Regulatory Reporting
                </span>
              </Link>
              <NavBar />
            </nav>
          </header>
          <main className="flex-1">
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<HubPage />} />
                  <Route path="/details" element={<KpiDetailsPage />} />
                  <Route path="/daily-reports" element={<DailyReportsPage />} />
                  <Route path="/deadlines" element={<DeadlinesPage />} />
                  <Route path="/datamanagement" element={<AdminRoute><DataManagementPage /></AdminRoute>} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/business-case" element={<BusinessCasePage />} />
                  <Route path="/cockpit" element={<AdminRoute><BackendCockpitPage /></AdminRoute>} />
                  <Route path="/capital" element={<AdminRoute><CapitalWorkbenchPage /></AdminRoute>} />
                  <Route path="/report" element={<ManagementReportPage />} />
                  <Route path="/scenarios" element={<ScenariosPage />} />
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
