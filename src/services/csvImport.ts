/**
 * CSV bulk-load support for the Backend Cockpit's Data Explorer:
 *  - generates a per-table CSV template (headers + one example row showing
 *    the accepted values / formats),
 *  - parses uploaded CSV files (auto-detects ',' vs ';' — European Excel
 *    saves with semicolons — handles quoted fields and embedded newlines),
 *  - converts cells to the right JS types (numbers, booleans, JSON columns)
 *    and fills per-table defaults so imported rows are complete objects.
 */

// --- Template examples (header order + accepted values) ----------------------

/** Ordered example row per table key. Keys = JSON field names (camelCase). */
export const CSV_EXAMPLES: Record<string, Record<string, string>> = {
  kpisHistory: {
    entity: 'Group',
    date: '2025-09-30',
    cet1Capital: '1680',
    creditRWA: '5480',
    marketRWA: '870',
    opRWA: '2950',
    otherRWA: '600',
    tier1: '2030',
    exposure: '39500',
    cet1CapitalBreakdown: '{"equity":2500,"pnl":100,"shareBuyback":200,"goodwillIntangibles":500,"otherDeductions":220,"toBeDefined":0,"dividend":50}',
    liquidity: '{"TOT":{"hqla":8200,"netCashOutflows":3300},"CHF":{"hqla":2300,"netCashOutflows":1500}}',
  },
  deadlines: {
    id: '',
    name: 'REGULATORY REPORTING - LCR REPORT',
    status: 'upcoming',
    type: 'regulatory',
    entity: 'Bank',
    dueDate: '2025-11-04',
    endOfPeriod: '2025-10-31',
    controlNumber: 'R.R.02',
    frequency: 'Monthly',
    ownerGroup: 'ICS_FIN_Owner',
    validator1: 'ICS_FIN_Validator1',
    validator2: 'ICS_FIN_Validator2',
    lightFull: 'Full',
    itemType: 'Item',
    comments: '',
    path: '',
  },
  counterpartyRwa: {
    entity: 'Group',
    date: '2025-09-30',
    counterpartyName: 'Global Bank 1',
    industry: 'Bank',
    rwa: '250',
  },
  largeExposures: {
    entity: 'Hong Kong',
    date: '2025-09-30',
    counterparty: 'APAC Wealth Management',
    exposureValue: '210',
    limit: '250',
  },
  team: {
    id: '',
    name: 'Alice Martin',
    role: 'Lead Analyst',
    email: 'alice.martin@example.com',
    phone: '555-0101',
  },
  projects: {
    id: '',
    name: 'Q4 Regulatory Filing Automation',
    description: 'Automate the quarterly report generation.',
  },
  projectTasks: {
    id: '',
    projectId: '1',
    title: 'Validate CET1 calculation logic',
    assignee: 'Bob Durand',
    status: 'To Do',
    itTicket: 'IT-5821',
  },
  lcrReports: {
    entity: 'Group',
    date: '2025-12-31',
    currency: 'TOT',
    source: 'manual',
    hqlaCat1: '8289.9',
    hqlaCat2a: '948.8',
    hqlaCat2b: '0',
    totalHqla: '9238.7',
    totalOutflows: '11303.1',
    inflowsBeforeCap: '7884.4',
    inflowsAfterCap: '7884.4',
    netOutflows: '3418.7',
    lcrRatio: '270.24',
  },
};

/** Notes shown in the import modal (accepted values, per table). */
export const CSV_NOTES: Record<string, string> = {
  kpisHistory: 'Amounts in mCHF. status keys: entity+date (existing rows for the same entity+date are replaced). JSON columns (cet1CapitalBreakdown, liquidity) are optional — leave empty or paste valid JSON.',
  deadlines: "status: completed | inprogress | upcoming · type: regulatory | internal · lightFull: Light | Full | (empty) · dates: YYYY-MM-DD · id empty = auto.",
  counterpartyRwa: 'industry: Bank | Corporate | Retail | Sovereign | Real Estate | Equity · rwa in mCHF.',
  largeExposures: 'Amounts in mCHF.',
  team: 'id empty = auto.',
  projects: 'id empty = auto.',
  projectTasks: "status: To Do | In Progress | Done · projectId must reference an existing project id.",
  lcrReports: 'Amounts in mCHF, lcrRatio in %. Keys: entity+date+currency (matching rows are replaced). source: manual | excel. The aggregated KPI entry is re-computed after import.',
};

/** Tables that support CSV bulk import (flat lists). */
export const CSV_IMPORTABLE: string[] = Object.keys(CSV_EXAMPLES);

// --- Template generation ------------------------------------------------------

const csvEscape = (v: string, delim: string): string =>
  v.includes(delim) || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;

export const buildCsvTemplate = (tableKey: string, delim = ','): string => {
  const example = CSV_EXAMPLES[tableKey];
  if (!example) throw new Error(`No CSV template for table '${tableKey}'.`);
  const headers = Object.keys(example);
  const lines = [
    headers.map(h => csvEscape(h, delim)).join(delim),
    headers.map(h => csvEscape(example[h], delim)).join(delim),
  ];
  return lines.join('\r\n') + '\r\n';
};

export const downloadCsv = (fileName: string, content: string) => {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

// --- CSV parsing ---------------------------------------------------------------

/** Detects ',' vs ';' (European Excel) on the first non-empty line, outside quotes. */
export const detectDelimiter = (text: string): string => {
  const line = text.split(/\r?\n/).find(l => l.trim().length > 0) || '';
  let inQ = false, commas = 0, semis = 0;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch === ',') commas++;
    else if (!inQ && ch === ';') semis++;
  }
  return semis > commas ? ';' : ',';
};

/** RFC-4180-ish parser: quoted fields, escaped quotes, newlines inside quotes. */
export const parseCsv = (text: string, delim?: string): string[][] => {
  const d = delim || detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  const src = text.replace(/^﻿/, ''); // strip BOM

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === d) {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
};

// --- Row conversion --------------------------------------------------------------

/** Complete base objects so imported rows satisfy the app's expectations. */
const TABLE_DEFAULTS: Record<string, Record<string, unknown>> = {
  deadlines: {
    comments: '', history: [], attachments: [], controlNumber: '', frequency: '',
    ownerGroup: '', validator1: '', validator2: '', ownerApproved: false,
    validation1Approved: false, validation2Approved: false, signedOffWithException: false,
    lightFull: '', itemType: 'Item', path: '', status: 'upcoming', type: 'regulatory',
    endOfPeriod: '', dueDate: '', entity: '', name: '',
  },
  lcrReports: {
    source: 'manual', hqlaCat1: 0, hqlaCat2a: 0, hqlaCat2b: 0, totalHqla: 0,
    totalOutflows: 0, inflowsBeforeCap: 0, inflowsAfterCap: 0, netOutflows: 0, lcrRatio: 0,
  },
  kpisHistory: {
    cet1Capital: 0, creditRWA: 0, marketRWA: 0, opRWA: 0, otherRWA: 0, tier1: 0, exposure: 0,
  },
};

export interface CsvConversionResult {
  rows: Record<string, unknown>[];
  warnings: string[];
}

/**
 * Converts parsed CSV lines into typed row objects for a table:
 * header row = field names; types inferred from the template example
 * (number-like → number, true/false → boolean, {…}/[…] → JSON) with
 * fallback to string; empty cells are omitted (defaults apply).
 */
export const convertCsvRows = (tableKey: string, lines: string[][]): CsvConversionResult => {
  if (lines.length < 2) throw new Error('The CSV needs a header line and at least one data line.');
  const example = CSV_EXAMPLES[tableKey] || {};
  const header = lines[0].map(h => h.trim());
  const warnings: string[] = [];

  const known = new Set(Object.keys(example));
  const unknown = header.filter(h => h && !known.has(h));
  if (unknown.length > 0 && known.size > 0) {
    warnings.push(`Unknown column(s) kept as text: ${unknown.join(', ')}`);
  }

  const inferType = (key: string): 'number' | 'boolean' | 'json' | 'string' => {
    const ex = example[key];
    if (ex === undefined) return 'string';
    const t = ex.trim();
    if (t.startsWith('{') || t.startsWith('[')) return 'json';
    if (t === 'true' || t === 'false') return 'boolean';
    if (t !== '' && !isNaN(Number(t))) return 'number';
    // Special-case ids: example is empty but the column is numeric.
    if (key === 'id' || key.endsWith('Id')) return 'number';
    return 'string';
  };

  const rows: Record<string, unknown>[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = lines[li];
    const row: Record<string, unknown> = { ...(TABLE_DEFAULTS[tableKey] || {}) };
    header.forEach((key, ci) => {
      if (!key) return;
      const raw = (cells[ci] ?? '').trim();
      if (raw === '') return; // defaults / auto-id apply
      switch (inferType(key)) {
        case 'number': {
          const n = Number(raw.replace(',', '.'));
          if (isNaN(n)) warnings.push(`Line ${li + 1}: '${key}' = "${raw}" is not a number — skipped.`);
          else row[key] = n;
          break;
        }
        case 'boolean':
          row[key] = ['true', '1', 'yes', 'x'].includes(raw.toLowerCase());
          break;
        case 'json':
          try { row[key] = JSON.parse(raw); }
          catch { warnings.push(`Line ${li + 1}: '${key}' is not valid JSON — skipped.`); }
          break;
        default:
          row[key] = raw;
      }
    });
    // Auto-assign ids when the table uses them and the cell was empty.
    if ('id' in (CSV_EXAMPLES[tableKey] || {}) && row.id === undefined) {
      row.id = Date.now() + li;
    }
    rows.push(row);
  }
  return { rows, warnings };
};

/** Natural keys used to replace matching rows on import (upsert semantics). */
export const NATURAL_KEYS: Record<string, string[]> = {
  kpisHistory: ['entity', 'date'],
  lcrReports: ['entity', 'date', 'currency'],
  team: ['id'],
  projects: ['id'],
  projectTasks: ['id'],
  deadlines: ['id'],
};
