import React from 'react';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { HubPage } from './pages/HubPage';
import { KpiDetailsPage } from './pages/KpiDetailsPage';
import { DeadlinesPage } from './pages/DeadlinesPage';
import { DataManagementPage } from './pages/DataManagementPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { TeamPage } from './pages/TeamPage';
import { ErrorBoundary } from './components';

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
                 <Link to="/deadlines" className="text-brand-text-secondary hover:text-brand-primary font-semibold">Deadlines</Link>
                 <Link to="/projects" className="text-brand-text-secondary hover:text-brand-primary font-semibold">Projects</Link>
                 <Link to="/datamanagement" className="text-brand-text-secondary hover:text-brand-primary font-semibold">Admin</Link>
              </div>
            </nav>
          </header>
          <main>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<HubPage />} />
                <Route path="/details" element={<KpiDetailsPage />} />
                <Route path="/deadlines" element={<DeadlinesPage />} />
                <Route path="/datamanagement" element={<DataManagementPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                <Route path="/team" element={<TeamPage />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </HashRouter>
    </DataProvider>
  );
};

export default App;