import React from 'react';
import { BackButton, PageHeader } from '../components';
import { DataExplorer } from './BackendCockpitPage';

/**
 * v3.24: the Data Explorer as its own module (Data section) — exactly the
 * explorer that lived inside the Backend Cockpit: table picker, per-column
 * filters, row editor with audit trail, CSV import/export. The cockpit keeps
 * the connection / schema / API concerns.
 */
export const DataExplorerPage: React.FC = () => (
  <div className="p-5 md:p-8">
    <BackButton />
    <PageHeader title="Data Explorer"
      subtitle="Browse any application table: per-column filters, row editing with full audit, CSV import / export." />
    <DataExplorer />
  </div>
);

export default DataExplorerPage;
