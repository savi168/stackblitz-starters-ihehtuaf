import React, { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { ErrorBoundary } from './components';

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

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center py-24 text-brand-text-secondary">
    <span className="animate-pulse text-lg">Loading…</span>
  </div>
);

// --- APP ROUTER ---

const App: React.FC = () => {
  return (
    <DataProvider>
      <HashRouter>
        <div className="min-h-screen bg-brand-bg-body text-brand-text-primary">
          <header className="bg-white shadow-md sticky top-0 z-40">
            <nav className="container mx-auto px-6 py-3 flex justify-between items-center">
              <Link to="/" className="text-2xl font-bold text-brand-primary hover:text-brand-primary-dark">
                📊 RegReport
              </Link>
              <div className="space-x-4">
                 <Link to="/details" className="text-brand-text-secondary hover:text-brand-primary font-semibold">KPI Analysis</Link>
                 <Link to="/daily-reports" className="text-brand-text-secondary hover:text-brand-primary font-semibold">Daily Reports</Link>
                 <Link to="/deadlines" className="text-brand-text-secondary hover:text-brand-primary font-semibold">Deadlines</Link>
                 <Link to="/projects" className="text-brand-text-secondary hover:text-brand-primary font-semibold">Projects</Link>
                 <Link to="/datamanagement" className="text-brand-text-secondary hover:text-brand-primary font-semibold">Admin</Link>
              </div>
            </nav>
          </header>
          <main>
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<HubPage />} />
                  <Route path="/details" element={<KpiDetailsPage />} />
                  <Route path="/daily-reports" element={<DailyReportsPage />} />
                  <Route path="/deadlines" element={<DeadlinesPage />} />
                  <Route path="/datamanagement" element={<DataManagementPage />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                  <Route path="/team" element={<TeamPage />} />
                  <Route path="/business-case" element={<BusinessCasePage />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </HashRouter>
    </DataProvider>
  );
};

export default App;
