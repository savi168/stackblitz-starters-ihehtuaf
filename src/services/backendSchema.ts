import { CentralData } from '../types';

/**
 * Static description of the backend data model: how each field of the
 * front-end `CentralData` aggregate maps to a SQL table / EF Core entity and
 * which REST endpoints read or write it. Drives the Backend Cockpit
 * (schema view, API map, data explorer columns, insert forms).
 *
 * Kept in sync by hand with backend/RegReport.Api/Models/Entities.cs and the
 * controllers under backend/RegReport.Api/Controllers/.
 */

export interface ColumnMeta {
  name: string;
  type: string;
  /** Primary key. */
  pk?: boolean;
  /** Foreign key target, e.g. "Projects.Id". */
  fk?: string;
  /** Stored as a JSON column (nested object). */
  json?: boolean;
  note?: string;
}

export interface EndpointMeta {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  desc?: string;
}

export interface TableMeta {
  /** Field in the CentralData aggregate. */
  key: keyof CentralData;
  /** SQL table name. */
  table: string;
  /** C# entity / TS type. */
  entity: string;
  kind: 'list' | 'singleton';
  description: string;
  columns: ColumnMeta[];
  endpoints: EndpointMeta[];
}

export const AGGREGATE_ENDPOINTS: EndpointMeta[] = [
  { method: 'GET', path: '/api/data', desc: 'Compose the whole CentralData document (used by the front-end on load)' },
  { method: 'PUT', path: '/api/data', desc: 'Replace the whole CentralData document (used on every front-end save)' },
];

export const BACKEND_TABLES: TableMeta[] = [
  {
    key: 'kpisHistory',
    table: 'KpiHistory',
    entity: 'KpiHistoryEntry',
    kind: 'list',
    description: 'Raw KPI inputs per entity & date (capital, RWA, liquidity by currency).',
    columns: [
      { name: 'Id', type: 'int', pk: true, note: 'surrogate key (not in API shape)' },
      { name: 'Entity', type: 'string' },
      { name: 'Date', type: 'date' },
      { name: 'Cet1Capital', type: 'number' },
      { name: 'CreditRWA', type: 'number' },
      { name: 'MarketRWA', type: 'number' },
      { name: 'OpRWA', type: 'number' },
      { name: 'OtherRWA', type: 'number' },
      { name: 'Tier1', type: 'number' },
      { name: 'Exposure', type: 'number' },
      { name: 'Cet1CapitalBreakdown', type: 'object', json: true },
      { name: 'Liquidity', type: 'map<currency,obj>', json: true },
    ],
    endpoints: [
      { method: 'GET', path: '/api/kpis?entity=', desc: 'List KPI entries (optionally by entity)' },
      { method: 'GET', path: '/api/kpis/{entity}/{date}', desc: 'Get one entry' },
      { method: 'PUT', path: '/api/kpis/{entity}/{date}', desc: 'Upsert an entry' },
      { method: 'DELETE', path: '/api/kpis/{entity}/{date}', desc: 'Delete an entry' },
    ],
  },
  {
    key: 'deadlines',
    table: 'Deadlines',
    entity: 'Deadline',
    kind: 'list',
    description: 'Regulatory & internal deadlines, with status history and attachments.',
    columns: [
      { name: 'Id', type: 'int', pk: true },
      { name: 'Name', type: 'string' },
      { name: 'Status', type: 'enum', note: 'completed | inprogress | upcoming' },
      { name: 'Type', type: 'enum', note: 'regulatory | internal' },
      { name: 'Entity', type: 'string' },
      { name: 'DueDate', type: 'date' },
      { name: 'EndOfPeriod', type: 'date' },
      { name: 'OwnerGroup', type: 'string' },
      { name: 'History', type: 'StatusLog[]', json: true },
      { name: 'Attachments', type: 'Attachment[]', json: true },
    ],
    endpoints: [
      { method: 'GET', path: '/api/deadlines', desc: 'List deadlines' },
      { method: 'POST', path: '/api/deadlines', desc: 'Create' },
      { method: 'PUT', path: '/api/deadlines/{id}', desc: 'Update' },
      { method: 'DELETE', path: '/api/deadlines/{id}', desc: 'Delete' },
    ],
  },
  {
    key: 'counterpartyRwa',
    table: 'CounterpartyRwa',
    entity: 'CounterpartyRwa',
    kind: 'list',
    description: 'RWA per counterparty / industry, by entity & date.',
    columns: [
      { name: 'Id', type: 'int', pk: true },
      { name: 'Entity', type: 'string' },
      { name: 'Date', type: 'date' },
      { name: 'CounterpartyName', type: 'string' },
      { name: 'Industry', type: 'string' },
      { name: 'Rwa', type: 'number' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/counterparty-rwa?entity=&date=', desc: 'List (filterable)' },
      { method: 'POST', path: '/api/counterparty-rwa', desc: 'Create' },
      { method: 'PUT', path: '/api/counterparty-rwa/{id}', desc: 'Update' },
      { method: 'DELETE', path: '/api/counterparty-rwa/{id}', desc: 'Delete' },
      { method: 'PUT', path: '/api/counterparty-rwa/bulk/{entity}/{date}', desc: 'Bulk replace for an entity+date' },
    ],
  },
  {
    key: 'largeExposures',
    table: 'LargeExposures',
    entity: 'LargeExposure',
    kind: 'list',
    description: 'Large exposures vs approved limits, by entity & date.',
    columns: [
      { name: 'Id', type: 'int', pk: true },
      { name: 'Entity', type: 'string' },
      { name: 'Date', type: 'date' },
      { name: 'Counterparty', type: 'string' },
      { name: 'ExposureValue', type: 'number' },
      { name: 'Limit', type: 'number' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/large-exposures?entity=&date=', desc: 'List (filterable)' },
      { method: 'POST', path: '/api/large-exposures', desc: 'Create' },
      { method: 'PUT', path: '/api/large-exposures/{id}', desc: 'Update' },
      { method: 'DELETE', path: '/api/large-exposures/{id}', desc: 'Delete' },
      { method: 'PUT', path: '/api/large-exposures/bulk/{entity}/{date}', desc: 'Bulk replace for an entity+date' },
    ],
  },
  {
    key: 'team',
    table: 'TeamMembers',
    entity: 'TeamMember',
    kind: 'list',
    description: 'Project team directory.',
    columns: [
      { name: 'Id', type: 'int', pk: true },
      { name: 'Name', type: 'string' },
      { name: 'Role', type: 'string' },
      { name: 'Email', type: 'string' },
      { name: 'Phone', type: 'string?' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/team', desc: 'List' },
      { method: 'POST', path: '/api/team', desc: 'Create' },
      { method: 'PUT', path: '/api/team/{id}', desc: 'Update' },
      { method: 'DELETE', path: '/api/team/{id}', desc: 'Delete' },
    ],
  },
  {
    key: 'projects',
    table: 'Projects',
    entity: 'Project',
    kind: 'list',
    description: 'Improvement projects.',
    columns: [
      { name: 'Id', type: 'int', pk: true },
      { name: 'Name', type: 'string' },
      { name: 'Description', type: 'string' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/projects', desc: 'List' },
      { method: 'POST', path: '/api/projects', desc: 'Create' },
      { method: 'PUT', path: '/api/projects/{id}', desc: 'Update' },
      { method: 'DELETE', path: '/api/projects/{id}', desc: 'Delete' },
      { method: 'GET', path: '/api/projects/{id}/tasks', desc: 'Tasks of a project' },
    ],
  },
  {
    key: 'projectTasks',
    table: 'ProjectTasks',
    entity: 'ProjectTask',
    kind: 'list',
    description: 'Tasks belonging to a project.',
    columns: [
      { name: 'Id', type: 'int', pk: true },
      { name: 'ProjectId', type: 'int', fk: 'Projects.Id' },
      { name: 'Title', type: 'string' },
      { name: 'Assignee', type: 'string' },
      { name: 'Status', type: 'enum', note: 'To Do | In Progress | Done' },
      { name: 'ItTicket', type: 'string?' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/projects/{id}/tasks', desc: 'List tasks of a project' },
      { method: 'POST', path: '/api/projects/{id}/tasks', desc: 'Add a task' },
    ],
  },
  {
    key: 'capitalReports',
    table: 'CapitalReports',
    entity: 'CapitalReport',
    kind: 'list',
    description: 'Capital adequacy report per entity & date (KM1 key metrics + composition line items).',
    columns: [
      { name: 'Id', type: 'int', pk: true },
      { name: 'Entity', type: 'string' },
      { name: 'Date', type: 'date' },
      { name: 'Source', type: 'enum', note: 'manual | excel' },
      { name: 'FileName', type: 'string?' },
      { name: 'ImportedAt', type: 'datetime?' },
      { name: 'KeyMetrics', type: 'object', json: true, note: 'KM1: CET1, T1, total, RWA, ratios, leverage' },
      { name: 'LineItems', type: 'CapitalLineItem[]', fk: 'CapitalLineItems.CapitalReportId', note: 'relational child table' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/capital-reports?entity=&date=', desc: 'List (filterable)' },
      { method: 'PUT', path: '/api/capital-reports/{entity}/{date}', desc: 'Upsert the full report (with line items)' },
      { method: 'DELETE', path: '/api/capital-reports/{entity}/{date}', desc: 'Delete' },
    ],
  },
  {
    key: 'lcrReports',
    table: 'LcrReports',
    entity: 'LcrReport',
    kind: 'list',
    description: 'LCR report per entity, date & currency (HQLA by category, flows, ratio).',
    columns: [
      { name: 'Id', type: 'int', pk: true },
      { name: 'Entity', type: 'string' },
      { name: 'Date', type: 'date' },
      { name: 'Currency', type: 'string', note: 'TOT | CHF | EUR | …' },
      { name: 'Source', type: 'enum', note: 'manual | excel' },
      { name: 'HqlaCat1', type: 'number' },
      { name: 'HqlaCat2a', type: 'number' },
      { name: 'HqlaCat2b', type: 'number' },
      { name: 'TotalHqla', type: 'number' },
      { name: 'TotalOutflows', type: 'number' },
      { name: 'InflowsBeforeCap', type: 'number' },
      { name: 'InflowsAfterCap', type: 'number' },
      { name: 'NetOutflows', type: 'number' },
      { name: 'LcrRatio', type: 'number', note: '%' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/lcr-reports?entity=&date=', desc: 'List (filterable)' },
      { method: 'PUT', path: '/api/lcr-reports/bulk/{entity}/{date}', desc: 'Replace all currencies for an entity+date' },
      { method: 'DELETE', path: '/api/lcr-reports/{id}', desc: 'Delete one' },
    ],
  },
  {
    key: 'riskAppetite',
    table: 'AppSettings[riskAppetite]',
    entity: 'Dictionary<string,EntityThresholds>',
    kind: 'singleton',
    description: 'Red/amber thresholds per KPI and per entity (stored as a JSON setting).',
    columns: [
      { name: '<entity>', type: 'object', json: true, note: 'cet1 / lcr / nsfr / leverage → { red, amber }' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/settings/risk-appetite', desc: 'Get all thresholds' },
      { method: 'PUT', path: '/api/settings/risk-appetite', desc: 'Replace all' },
      { method: 'PUT', path: '/api/settings/risk-appetite/{entity}', desc: 'Update one entity' },
    ],
  },
  {
    key: 'nsfrReports',
    table: 'NsfrReports',
    entity: 'NsfrReport',
    kind: 'list',
    description: 'NSFR report per entity & date (weighted ASF/RSF totals, ratio, maturity-bucket line items).',
    columns: [
      { name: 'Id', type: 'bigint', pk: true },
      { name: 'Entity', type: 'string' },
      { name: 'Date', type: 'date' },
      { name: 'Source', type: 'enum', note: 'manual | excel' },
      { name: 'FileName', type: 'string?' },
      { name: 'TotalAsf', type: 'number', note: 'weighted, mCHF' },
      { name: 'TotalRsf', type: 'number', note: 'weighted, mCHF' },
      { name: 'NsfrRatio', type: 'number', note: '%' },
      { name: 'Comments', type: 'string?' },
      { name: 'LineItems', type: 'NsfrLineItem[]', fk: 'NsfrLineItems.NsfrReportId', note: 'asf | rsf | rsfOff; amounts by maturity bucket' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/nsfr-reports?entity=&date=', desc: 'List (filterable)' },
      { method: 'PUT', path: '/api/nsfr-reports/{entity}/{date}', desc: 'Upsert the full report (with line items)' },
      { method: 'DELETE', path: '/api/nsfr-reports/{entity}/{date}', desc: 'Delete' },
    ],
  },
  {
    key: 'importMapping',
    table: 'AppSettings[importMapping]',
    entity: 'ImportMapping',
    kind: 'singleton',
    description: 'Excel import anchors for the FINMA/SNB templates (editable in Workbench → Mapping).',
    columns: [
      { name: 'sheets', type: 'object', json: true, note: 'capital workbook sheet names' },
      { name: 'km1Items', type: 'object', json: true, note: 'KM1 item numbers' },
      { name: 'capitalRows', type: 'CapitalRowMap[]', json: true, note: 'FINMA row codes → line items' },
      { name: 'capitalAnchors', type: 'object', json: true, note: 'net CET1 + RWA codes' },
      { name: 'lcrCodes', type: 'object', json: true, note: 'SNB row codes' },
      { name: 'lcrHqlaLabels', type: 'object', json: true, note: 'HQLA total labels' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/settings/import-mapping', desc: 'Get' },
      { method: 'PUT', path: '/api/settings/import-mapping', desc: 'Replace' },
    ],
  },
  {
    key: 'bilan',
    table: 'AppSettings[bilan]',
    entity: 'Bilan',
    kind: 'singleton',
    description: 'Balance-sheet split by currency (stored as a JSON setting).',
    columns: [
      { name: 'Chf', type: 'number' },
      { name: 'Eur', type: 'number' },
      { name: 'Usd', type: 'number' },
      { name: 'Gbp', type: 'number' },
      { name: 'Other', type: 'number' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/settings/bilan', desc: 'Get' },
      { method: 'PUT', path: '/api/settings/bilan', desc: 'Replace' },
    ],
  },
];
