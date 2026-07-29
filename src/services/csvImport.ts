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
  kpisHistory: 'Amounts in mCHF. status keys: entity+date (existing rows for the same entity+date are replaced). Nested fields (cet1CapitalBreakdown, liquidity) are optional — leave empty or paste valid JSON; the backend stores them relationally (Breakdown* columns / KpiLiquidity table).',
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

// --- Capital line-items bulk load (Workbench) -----------------------------------

/**
 * CSV template & conversion for bulk-loading capital line items (notably the
 * memorandum data: CET1 movement detail lines, RWA by currency…) into ONE
 * capital report (entity+date selected in the Workbench).
 * Columns: section (equity|deduction|at1|t2|rwa), label, amount (signed,
 * mCHF), memo (true/false), code (optional, auto if empty).
 */
export const buildCapitalItemsTemplate = (delim = ','): string => {
  const rows = [
    ['section', 'label', 'amount', 'memo', 'code'],
    ['equity', 'Share buyback programme', '-38.9', 'true', ''],
    ['equity', 'Acquisition Spark', '12.5', 'true', ''],
    ['deduction', 'Goodwill (-)', '-115.5', 'false', 'goodwill'],
    ['rwa', 'USD', '1634', 'true', ''],
    ['rwa', 'USD (LC)', '2089', 'true', ''],
  ];
  return rows.map(r => r.map(v => csvEscape(v, delim)).join(delim)).join('\r\n') + '\r\n';
};

const CAPITAL_SECTIONS = new Set(['equity', 'deduction', 'at1', 't2', 'rwa']);

export interface CapitalItemsCsvResult {
  items: Array<{ section: string; label: string; amount: number; memo: boolean; code: string }>;
  warnings: string[];
}

export const convertCapitalItemsCsv = (lines: string[][]): CapitalItemsCsvResult => {
  if (lines.length < 2) throw new Error('The CSV needs a header line and at least one data line.');
  const header = lines[0].map(h => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iSection = col('section'), iLabel = col('label'), iAmount = col('amount');
  const iMemo = col('memo'), iCode = col('code');
  if (iSection === -1 || iLabel === -1 || iAmount === -1) {
    throw new Error("The header must contain at least: section, label, amount (plus optional memo, code).");
  }
  const items: CapitalItemsCsvResult['items'] = [];
  const warnings: string[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = lines[li];
    const section = (cells[iSection] ?? '').trim().toLowerCase();
    const label = (cells[iLabel] ?? '').trim();
    const rawAmount = (cells[iAmount] ?? '').trim();
    if (!section && !label) continue;
    if (!CAPITAL_SECTIONS.has(section)) {
      warnings.push(`Line ${li + 1}: unknown section "${section}" (expected equity|deduction|at1|t2|rwa) — skipped.`);
      continue;
    }
    if (!label) { warnings.push(`Line ${li + 1}: empty label — skipped.`); continue; }
    const amount = Number(rawAmount.replace(',', '.'));
    if (isNaN(amount)) { warnings.push(`Line ${li + 1}: amount "${rawAmount}" is not a number — skipped.`); continue; }
    const memoRaw = iMemo >= 0 ? (cells[iMemo] ?? '').trim().toLowerCase() : '';
    items.push({
      section,
      label,
      amount,
      memo: ['true', '1', 'yes', 'x'].includes(memoRaw),
      code: iCode >= 0 ? (cells[iCode] ?? '').trim() : '',
    });
  }
  return { items, warnings };
};

// --- Round-trip exports (edit outside, re-import in the tool's format) --------------

/** Current capital line items → CSV in the exact Bulk-line-items import format. */
export const buildCapitalItemsExport = (
  items: Array<{ section: string; label: string; amount: number; memo?: boolean; code?: string }>,
  delim = ','
): string => {
  const rows = [
    ['section', 'label', 'amount', 'memo', 'code'],
    ...items.map(i => [i.section, i.label, String(i.amount), i.memo ? 'true' : 'false', i.code || '']),
  ];
  return rows.map(r => r.map(v => csvEscape(v, delim)).join(delim)).join('\r\n') + '\r\n';
};

/** Current financial statement lines → CSV in the exact statement import format. */
export const buildFinStatementExport = (
  items: Array<{ section: string; label: string; amount: number; memo?: boolean }>,
  delim = ','
): string => {
  const rows = [
    ['section', 'label', 'amount', 'memo'],
    ...items.map(i => [i.section, i.label, String(i.amount), i.memo ? 'true' : 'false']),
  ];
  return rows.map(r => r.map(v => csvEscape(v, delim)).join(delim)).join('\r\n') + '\r\n';
};

// --- CET1 movements YTD bulk load (all periods at once) -----------------------------

/** Accepts YYYY-MM-DD or DD.MM.YYYY; returns ISO or undefined. */
const normDate = (raw: string): string | undefined => {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
};

/**
 * CSV for feeding the CET1 movement detail across ALL periods in one file:
 * YTD (cumulative for the year) amounts per line and per month-end — the
 * month-to-month deltas and the YTD column are computed by the report.
 * Rows become memo line items (never in the CET1 totals), upserted by
 * section+label on each period's capital report.
 */
export const buildMovementsCsvTemplate = (delim = ','): string => {
  const rows = [
    ['date', 'label', 'ytd_amount', 'section'],
    ['2025-01-31', 'Share buy-back', '-12.5', 'equity'],
    ['2025-02-28', 'Share buy-back', '-25.0', 'equity'],
    ['2025-01-31', 'Acquisition Spark', '12.5', 'equity'],
    ['2025-02-28', 'Acquisition Spark', '12.5', 'equity'],
    ['2025-01-31', 'RSU vesting', '4.2', 'equity'],
  ];
  return rows.map(r => r.map(v => csvEscape(v, delim)).join(delim)).join('\r\n') + '\r\n';
};

export interface MovementsCsvResult {
  rows: Array<{ date: string; label: string; amount: number; section: string }>;
  warnings: string[];
}

export const convertMovementsCsv = (lines: string[][]): MovementsCsvResult => {
  if (lines.length < 2) throw new Error('The CSV needs a header line and at least one data line.');
  const header = lines[0].map(h => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1;
  const iDate = col('date'), iLabel = col('label', 'line');
  const iAmount = col('ytd_amount', 'ytd', 'amount'), iSection = col('section');
  if (iDate === -1 || iLabel === -1 || iAmount === -1) {
    throw new Error('The header must contain: date, label, ytd_amount (plus optional section).');
  }
  const rows: MovementsCsvResult['rows'] = [];
  const warnings: string[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = lines[li];
    const date = normDate(cells[iDate] ?? '');
    const label = (cells[iLabel] ?? '').trim();
    const rawAmount = (cells[iAmount] ?? '').trim();
    if (!date && !label) continue;
    if (!date) { warnings.push(`Line ${li + 1}: invalid date "${cells[iDate]}" (expected YYYY-MM-DD or DD.MM.YYYY) — skipped.`); continue; }
    if (!label) { warnings.push(`Line ${li + 1}: empty label — skipped.`); continue; }
    const amount = Number(rawAmount.replace(',', '.'));
    if (isNaN(amount)) { warnings.push(`Line ${li + 1}: amount "${rawAmount}" is not a number — skipped.`); continue; }
    const section = iSection >= 0 ? (cells[iSection] ?? '').trim().toLowerCase() || 'equity' : 'equity';
    if (!CAPITAL_SECTIONS.has(section)) {
      warnings.push(`Line ${li + 1}: unknown section "${section}" — skipped.`);
      continue;
    }
    rows.push({ date, label, amount, section });
  }
  return { rows, warnings };
};

// --- RWA by currency bulk load (all periods at once) --------------------------------

/**
 * CSV for feeding the RWA-by-currency table across ALL periods in one file.
 * Each row becomes two memo line items on the period's capital report:
 * "<CCY>" (CHF equivalent) and "<CCY> (LC)" (original currency, optional) —
 * the implied FX rates and the FX-vs-business decomposition are computed
 * by the report.
 */
export const buildRwaCcyTemplate = (delim = ','): string => {
  const rows = [
    ['date', 'currency', 'rwa_chf', 'rwa_lc'],
    ['2025-01-31', 'CHF', '2450', ''],
    ['2025-01-31', 'USD', '1634', '2089'],
    ['2025-01-31', 'EUR', '980', '1046'],
    ['2025-01-31', 'GBP', '410', '385'],
    ['2025-02-28', 'USD', '1702', '2140'],
  ];
  return rows.map(r => r.map(v => csvEscape(v, delim)).join(delim)).join('\r\n') + '\r\n';
};

export interface RwaCcyCsvResult {
  rows: Array<{ date: string; currency: string; rwaChf: number; rwaLc?: number }>;
  warnings: string[];
}

export const convertRwaCcyCsv = (lines: string[][]): RwaCcyCsvResult => {
  if (lines.length < 2) throw new Error('The CSV needs a header line and at least one data line.');
  const header = lines[0].map(h => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1;
  const iDate = col('date'), iCcy = col('currency', 'ccy');
  const iChf = col('rwa_chf', 'chf', 'amount_chf'), iLc = col('rwa_lc', 'lc', 'amount_lc');
  if (iDate === -1 || iCcy === -1 || iChf === -1) {
    throw new Error('The header must contain: date, currency, rwa_chf (plus optional rwa_lc).');
  }
  const rows: RwaCcyCsvResult['rows'] = [];
  const warnings: string[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = lines[li];
    const date = normDate(cells[iDate] ?? '');
    const currency = (cells[iCcy] ?? '').trim().toUpperCase();
    const rawChf = (cells[iChf] ?? '').trim();
    if (!date && !currency) continue;
    if (!date) { warnings.push(`Line ${li + 1}: invalid date "${cells[iDate]}" (expected YYYY-MM-DD or DD.MM.YYYY) — skipped.`); continue; }
    if (!/^[A-Z]{3}$/.test(currency)) { warnings.push(`Line ${li + 1}: currency "${currency}" is not a 3-letter code — skipped.`); continue; }
    const rwaChf = Number(rawChf.replace(',', '.'));
    if (isNaN(rwaChf)) { warnings.push(`Line ${li + 1}: rwa_chf "${rawChf}" is not a number — skipped.`); continue; }
    const rawLc = iLc >= 0 ? (cells[iLc] ?? '').trim() : '';
    const rwaLc = rawLc === '' ? undefined : Number(rawLc.replace(',', '.'));
    if (rwaLc !== undefined && isNaN(rwaLc)) { warnings.push(`Line ${li + 1}: rwa_lc "${rawLc}" is not a number — skipped.`); continue; }
    rows.push({ date, currency, rwaChf, ...(rwaLc !== undefined ? { rwaLc } : {}) });
  }
  return { rows, warnings };
};

// --- Production controls: counterparty datasets / securities / reference ------------

const PROD_DATASET_KEYS = new Set(['liquidityAssets', 'dueFromBanks', 'dueToBanks', 'dueFromCustomers', 'dueToCustomers', 'mortgages']);

export const buildProdCounterpartyTemplate = (delim = ','): string => {
  const rows = [
    ['date', 'dataset', 'client_number', 'client_type', 'group_lexid', 'counterparty_type', 'issuer_rating', 'amount', 'currency'],
    ['2025-12-31', 'liquidityAssets', 'C-10001', 'BANKB', 'LEX-KFW', 'financial', 'AAA', '120.5', 'EUR'],
    ['2025-12-31', 'dueFromBanks', 'C-20044', 'BANKB', 'LEX-UBS', 'retail bank', 'A+', '85.0', 'CHF'],
    ['2025-12-31', 'dueFromCustomers', 'C-30412', 'PRIVP', 'LEX-30412', 'retail', '', '12.3', 'CHF'],
  ];
  return rows.map(r => r.map(v => csvEscape(v, delim)).join(delim)).join('\r\n') + '\r\n';
};

export interface ProdCounterpartyCsvResult {
  rows: Array<{ date: string; dataset: string; clientNumber: string; clientType: string; groupLexId: string; counterpartyType: string; issuerRating?: string; amount?: number; currency?: string }>;
  warnings: string[];
}

export const convertProdCounterpartyCsv = (lines: string[][]): ProdCounterpartyCsvResult => {
  if (lines.length < 2) throw new Error('The CSV needs a header line and at least one data line.');
  const header = lines[0].map(h => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1;
  const iDate = col('date'), iDs = col('dataset'), iClient = col('client_number', 'client');
  const iCt = col('client_type'), iLex = col('group_lexid', 'grouplexid'), iCpt = col('counterparty_type', 'type');
  const iRating = col('issuer_rating', 'rating'), iAmount = col('amount'), iCcy = col('currency');
  if (iDate === -1 || iDs === -1 || iClient === -1) {
    throw new Error('The header must contain: date, dataset, client_number (plus client_type, group_lexid, counterparty_type, issuer_rating, amount, currency).');
  }
  const rows: ProdCounterpartyCsvResult['rows'] = [];
  const warnings: string[] = [];
  for (let li = 1; li < lines.length; li++) {
    const c = lines[li];
    const date = normDate(c[iDate] ?? '');
    const dataset = (c[iDs] ?? '').trim();
    const clientNumber = (c[iClient] ?? '').trim();
    if (!date && !clientNumber) continue;
    if (!date) { warnings.push(`Line ${li + 1}: invalid date "${c[iDate]}" — skipped.`); continue; }
    if (!PROD_DATASET_KEYS.has(dataset)) { warnings.push(`Line ${li + 1}: unknown dataset "${dataset}" (expected ${Array.from(PROD_DATASET_KEYS).join('|')}) — skipped.`); continue; }
    if (!clientNumber) { warnings.push(`Line ${li + 1}: empty client_number — skipped.`); continue; }
    const rawAmount = iAmount >= 0 ? (c[iAmount] ?? '').trim() : '';
    const amount = rawAmount === '' ? undefined : Number(rawAmount.replace(',', '.'));
    if (amount !== undefined && isNaN(amount)) { warnings.push(`Line ${li + 1}: amount "${rawAmount}" is not a number — skipped.`); continue; }
    rows.push({
      date, dataset, clientNumber,
      clientType: iCt >= 0 ? (c[iCt] ?? '').trim() : '',
      groupLexId: iLex >= 0 ? (c[iLex] ?? '').trim() : '',
      counterpartyType: iCpt >= 0 ? (c[iCpt] ?? '').trim() : '',
      ...(iRating >= 0 && (c[iRating] ?? '').trim() ? { issuerRating: (c[iRating] ?? '').trim() } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(iCcy >= 0 && (c[iCcy] ?? '').trim() ? { currency: (c[iCcy] ?? '').trim().toUpperCase() } : {}),
    });
  }
  return { rows, warnings };
};

export const buildProdSecuritiesTemplate = (delim = ','): string => {
  const rows = [
    ['date', 'isin', 'security_master', 'security_type', 'rating', 'daily_reval', 'issuer_lexid', 'guarantor_lexid', 'guarantor_name', 'hqla_level', 'amount'],
    ['2025-12-31', 'DE000KFW0001', 'SM-88410', 'bond', 'AAA', 'true', 'LEX-KFW', 'LEX-DE-GOV', 'German government', 'L1', '54.2'],
    ['2025-12-31', 'CH0012032048', 'SM-11220', 'equity', 'A', 'true', 'LEX-ROCHE', '', '', 'L2b', '12.7'],
  ];
  return rows.map(r => r.map(v => csvEscape(v, delim)).join(delim)).join('\r\n') + '\r\n';
};

export interface ProdSecuritiesCsvResult {
  rows: Array<{ date: string; isin: string; securityMaster?: string; securityType?: string; rating?: string; dailyReval?: boolean; issuerLexId?: string; guarantorLexId?: string; guarantorName?: string; hqlaLevel?: string; amount?: number }>;
  warnings: string[];
}

export const convertProdSecuritiesCsv = (lines: string[][]): ProdSecuritiesCsvResult => {
  if (lines.length < 2) throw new Error('The CSV needs a header line and at least one data line.');
  const header = lines[0].map(h => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1;
  const iDate = col('date'), iIsin = col('isin');
  const iSm = col('security_master', 'securitymaster'), iType = col('security_type', 'type');
  const iRating = col('rating'), iReval = col('daily_reval', 'reval');
  const iIssuer = col('issuer_lexid'), iGLex = col('guarantor_lexid'), iGName = col('guarantor_name', 'guarantor');
  const iHqla = col('hqla_level', 'hqla'), iAmount = col('amount');
  if (iDate === -1 || iIsin === -1) throw new Error('The header must contain: date, isin (plus the security attributes).');
  const rows: ProdSecuritiesCsvResult['rows'] = [];
  const warnings: string[] = [];
  for (let li = 1; li < lines.length; li++) {
    const c = lines[li];
    const date = normDate(c[iDate] ?? '');
    const isin = (c[iIsin] ?? '').trim().toUpperCase();
    if (!date && !isin) continue;
    if (!date) { warnings.push(`Line ${li + 1}: invalid date "${c[iDate]}" — skipped.`); continue; }
    if (!isin) { warnings.push(`Line ${li + 1}: empty isin — skipped.`); continue; }
    const rawAmount = iAmount >= 0 ? (c[iAmount] ?? '').trim() : '';
    const amount = rawAmount === '' ? undefined : Number(rawAmount.replace(',', '.'));
    if (amount !== undefined && isNaN(amount)) { warnings.push(`Line ${li + 1}: amount "${rawAmount}" is not a number — skipped.`); continue; }
    const get = (i: number) => (i >= 0 ? (c[i] ?? '').trim() : '');
    const revalRaw = get(iReval).toLowerCase();
    rows.push({
      date, isin,
      ...(get(iSm) ? { securityMaster: get(iSm) } : {}),
      ...(get(iType) ? { securityType: get(iType) } : {}),
      ...(get(iRating) ? { rating: get(iRating) } : {}),
      ...(revalRaw ? { dailyReval: ['true', '1', 'yes', 'x'].includes(revalRaw) } : {}),
      ...(get(iIssuer) ? { issuerLexId: get(iIssuer) } : {}),
      ...(get(iGLex) ? { guarantorLexId: get(iGLex) } : {}),
      ...(get(iGName) ? { guarantorName: get(iGName) } : {}),
      ...(get(iHqla) ? { hqlaLevel: get(iHqla) } : {}),
      ...(amount !== undefined ? { amount } : {}),
    });
  }
  return { rows, warnings };
};

export const buildProdRefTemplate = (delim = ','): string => {
  const rows = [
    ['group_lexid', 'name', 'guarantor_lexid', 'guarantor_name', 'expected_hqla_level', 'notes'],
    ['LEX-KFW', 'KFW', 'LEX-DE-GOV', 'German government', 'L1', 'explicit federal guarantee'],
    ['LEX-DE-GOV', 'German government', '', '', 'L1', 'sovereign'],
  ];
  return rows.map(r => r.map(v => csvEscape(v, delim)).join(delim)).join('\r\n') + '\r\n';
};

export interface ProdRefCsvResult {
  rows: Array<{ groupLexId: string; name?: string; guarantorLexId?: string; guarantorName?: string; expectedHqlaLevel?: string; notes?: string }>;
  warnings: string[];
}

export const convertProdRefCsv = (lines: string[][]): ProdRefCsvResult => {
  if (lines.length < 2) throw new Error('The CSV needs a header line and at least one data line.');
  const header = lines[0].map(h => h.trim().toLowerCase());
  const col = (...names: string[]) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1;
  const iLex = col('group_lexid', 'grouplexid'), iName = col('name');
  const iGLex = col('guarantor_lexid'), iGName = col('guarantor_name', 'guarantor');
  const iHqla = col('expected_hqla_level', 'hqla_level', 'hqla'), iNotes = col('notes');
  if (iLex === -1) throw new Error('The header must contain: group_lexid (plus name, guarantor_lexid, guarantor_name, expected_hqla_level, notes).');
  const rows: ProdRefCsvResult['rows'] = [];
  const warnings: string[] = [];
  for (let li = 1; li < lines.length; li++) {
    const c = lines[li];
    const groupLexId = (c[iLex] ?? '').trim();
    if (!groupLexId) { if (c.some(x => (x ?? '').trim())) warnings.push(`Line ${li + 1}: empty group_lexid — skipped.`); continue; }
    const get = (i: number) => (i >= 0 ? (c[i] ?? '').trim() : '');
    rows.push({
      groupLexId,
      ...(get(iName) ? { name: get(iName) } : {}),
      ...(get(iGLex) ? { guarantorLexId: get(iGLex) } : {}),
      ...(get(iGName) ? { guarantorName: get(iGName) } : {}),
      ...(get(iHqla) ? { expectedHqlaLevel: get(iHqla) } : {}),
      ...(get(iNotes) ? { notes: get(iNotes) } : {}),
    });
  }
  return { rows, warnings };
};

// --- Financial statements bulk load (Workbench) ------------------------------------

const FIN_SECTIONS: Record<string, string[]> = {
  balanceSheet: ['assets', 'liabilities', 'equity'],
  pnl: ['income', 'expenses'],
  equity: ['movements'],
};

const FIN_EXAMPLES: Record<string, string[][]> = {
  balanceSheet: [
    ['assets', 'Cash and balances with central banks', '5200', 'false'],
    ['liabilities', 'Due to customers (deposits)', '30500', 'false'],
    ['equity', 'Share capital', '149.1', 'false'],
  ],
  pnl: [
    ['income', 'Net fee and commission income', '410.2', 'false'],
    ['expenses', 'Personnel expenses (-)', '-285.4', 'false'],
  ],
  equity: [
    ['movements', 'Opening balance', '2389.4', 'false'],
    ['movements', 'Dividends (-)', '-88.4', 'false'],
  ],
};

export const buildFinStatementTemplate = (kind: string, delim = ','): string => {
  const rows = [['section', 'label', 'amount', 'memo'], ...(FIN_EXAMPLES[kind] || [])];
  return rows.map(r => r.map(v => csvEscape(v, delim)).join(delim)).join('\r\n') + '\r\n';
};

export const convertFinStatementCsv = (kind: string, lines: string[][]): CapitalItemsCsvResult => {
  if (lines.length < 2) throw new Error('The CSV needs a header line and at least one data line.');
  const valid = new Set(FIN_SECTIONS[kind] || []);
  const header = lines[0].map(h => h.trim().toLowerCase());
  const iSection = header.indexOf('section'), iLabel = header.indexOf('label');
  const iAmount = header.indexOf('amount'), iMemo = header.indexOf('memo');
  if (iSection === -1 || iLabel === -1 || iAmount === -1) {
    throw new Error('The header must contain at least: section, label, amount (plus optional memo).');
  }
  const items: CapitalItemsCsvResult['items'] = [];
  const warnings: string[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = lines[li];
    const section = (cells[iSection] ?? '').trim();
    const label = (cells[iLabel] ?? '').trim();
    if (!section && !label) continue;
    if (!valid.has(section)) {
      warnings.push(`Line ${li + 1}: unknown section "${section}" (expected ${Array.from(valid).join('|')}) — skipped.`);
      continue;
    }
    const amount = Number((cells[iAmount] ?? '').trim().replace(',', '.'));
    if (!label || isNaN(amount)) { warnings.push(`Line ${li + 1}: missing label or invalid amount — skipped.`); continue; }
    const memoRaw = iMemo >= 0 ? (cells[iMemo] ?? '').trim().toLowerCase() : '';
    items.push({ section, label, amount, memo: ['true', '1', 'yes', 'x'].includes(memoRaw), code: '' });
  }
  return { items, warnings };
};
