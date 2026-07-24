import * as XLSX from 'xlsx';
import { FinStatement, FinStatementLineItem } from '../types';
import { newItemId } from './capital';

/**
 * Parsers for the internal finance extracts that feed the financial statements
 * and the CET1 movement details:
 *  - Balance sheet monthly ("Balance sheet In CHF millions"): account codes in
 *    col B, labels col C, current period col D; reporting date read from the
 *    column headers.
 *  - P&L monthly ("Underlying profitability evolution"): one column per month
 *    (Periodic), codes in cols A/B/C, labels col D → one pnl statement per month.
 *  - Statement of changes in equity ("Equity from analysis"): movements in
 *    rows, components in columns; the Total equity column is stored (CHF → mn).
 *
 * The files evolve from month to month (new rows, new columns): everything is
 * located by labels/codes — never by fixed positions — and every row with a
 * value is stored line by line (computed/subtotal rows as memo lines).
 */

export interface ParsedFin {
  kind: 'fin';
  fileName: string;
  /** Statements without id/entity (assigned at import). */
  statements: Array<Omit<FinStatement, 'id' | 'entity'>>;
}

type Sheet = XLSX.WorkSheet;
const cellV = (ws: Sheet, r: number, c: number): unknown => ws[XLSX.utils.encode_cell({ r, c })]?.v;
const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
const round2 = (v: number) => Math.round(v * 100) / 100;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'];
const monthEnd = (y: number, m1to12: number): string => {
  const d = new Date(Date.UTC(y, m1to12, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const sheetRange = (ws: Sheet) => XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');

/** Finds the first cell matching the predicate; returns [row, col] or null. */
const findCell = (ws: Sheet, pred: (v: string) => boolean, maxRow = 200): [number, number] | null => {
  const range = sheetRange(ws);
  for (let r = 0; r <= Math.min(range.e.r, maxRow); r++) {
    for (let c = 0; c <= Math.min(range.e.c, 60); c++) {
      const v = norm(cellV(ws, r, c)).toLowerCase();
      if (v && pred(v)) return [r, c];
    }
  }
  return null;
};

const mkItem = (section: string, code: string, label: string, amount: number, memo?: boolean): FinStatementLineItem =>
  ({ id: newItemId(), section, code, label, amount: round2(amount), ...(memo ? { memo: true } : {}) });

// --- Balance sheet monthly -----------------------------------------------------

const parseBalanceSheet = (ws: Sheet, fileName: string): Omit<FinStatement, 'id' | 'entity'> => {
  const anchor = findCell(ws, v => v.startsWith('total assets'));
  if (!anchor) throw new Error('Balance sheet: "Total assets" row not found.');
  const [startRow, labelCol] = anchor;
  const codeCol = labelCol - 1;
  const valueCol = labelCol + 1;

  // Reporting date: a real Date in the value column above the table, else a
  // month-name + year pair in the header rows.
  let date: string | undefined;
  for (let r = 0; r < startRow; r++) {
    const v = cellV(ws, r, valueCol);
    if (v instanceof Date && !isNaN(v.getTime())) {
      const noon = new Date(v.getTime() + 12 * 3600 * 1000);
      date = monthEnd(noon.getUTCFullYear(), noon.getUTCMonth() + 1);
    }
  }
  if (!date) {
    let year: number | undefined, month: number | undefined;
    for (let r = 0; r < startRow; r++) {
      const v = cellV(ws, r, valueCol);
      const n = num(v);
      if (n !== undefined && n > 1990 && n < 2100) year = n;
      const mIdx = MONTHS.indexOf(norm(v).toLowerCase());
      if (mIdx >= 0) month = mIdx + 1;
    }
    if (year && month) date = monthEnd(year, month);
  }
  if (!date) throw new Error('Balance sheet: could not read the reporting period from the column headers.');

  const lineItems: FinStatementLineItem[] = [];
  let section = 'assets';
  const range = sheetRange(ws);
  for (let r = startRow; r <= range.e.r; r++) {
    const label = norm(cellV(ws, r, labelCol));
    const low = label.toLowerCase();
    const code = norm(cellV(ws, r, codeCol));
    const amount = num(cellV(ws, r, valueCol));
    if (low.startsWith('total equity')) {
      if (amount !== undefined) lineItems.push(mkItem(section, code, label, amount, true));
      break; // coded duplicates below the equity block are ignored
    }
    if (low.startsWith('total liabilities')) section = 'liabilities';
    else if (low === 'equity' || low.startsWith('share capital')) section = 'equity';
    if (!label || amount === undefined) continue;
    // Totals and uncoded asset/liability rows are groups/subtotals → memo;
    // equity rows are legitimately uncoded → additive.
    const memo = low.startsWith('total') || low === 'equity' || (!code && section !== 'equity');
    lineItems.push(mkItem(section, code, label, amount, memo || undefined));
  }
  return { date, kind: 'balanceSheet', gaap: 'IFRS', source: 'excel', fileName, lineItems };
};

// --- P&L monthly (one statement per month column) -------------------------------

const parsePnl = (ws: Sheet, fileName: string): Array<Omit<FinStatement, 'id' | 'entity'>> => {
  const range = sheetRange(ws);
  // Month columns: the header row whose cells are full month names; the year
  // row is the closest numeric-year row above it in the same columns.
  let monthRow = -1;
  const cols: Array<{ c: number; month: number; year?: number }> = [];
  for (let r = 0; r <= Math.min(range.e.r, 30) && monthRow === -1; r++) {
    const found: Array<{ c: number; month: number }> = [];
    for (let c = 0; c <= range.e.c; c++) {
      const mIdx = MONTHS.indexOf(norm(cellV(ws, r, c)).toLowerCase());
      if (mIdx >= 0) found.push({ c, month: mIdx + 1 });
    }
    if (found.length >= 2) { monthRow = r; cols.push(...found); }
  }
  if (monthRow === -1) throw new Error('P&L: month header row not found.');
  // Year per column: nearest numeric year above the month row.
  for (const col of cols) {
    for (let r = monthRow - 1; r >= 0; r--) {
      const n = num(cellV(ws, r, col.c));
      if (n !== undefined && n > 1990 && n < 2100) { col.year = n; break; }
    }
  }
  const labelColCell = findCell(ws, v => v === 'net interest income' || v === 'operating income');
  const labelCol = labelColCell ? labelColCell[1] : 3; // usually column D

  const statements: Array<Omit<FinStatement, 'id' | 'entity'>> = [];
  for (const col of cols) {
    if (!col.year) continue;
    const lineItems: FinStatementLineItem[] = [];
    for (let r = monthRow + 1; r <= range.e.r; r++) {
      const label = norm(cellV(ws, r, labelCol));
      if (!label) continue;
      const amount = num(cellV(ws, r, col.c));
      if (amount === undefined) continue;
      // Most specific code wins (cols A/B/C hold hierarchy levels).
      let code = '';
      for (let cc = labelCol - 1; cc >= Math.max(0, labelCol - 3); cc--) {
        const v = norm(cellV(ws, r, cc));
        if (v && /^\d/.test(v)) { code = v; break; }
      }
      // Coded rows: 7* = income, 6* = expenses. Uncoded rows are computed
      // aggregates (Underlying P&L, Life Insurance…) → memo; a few coded rows
      // are aggregates of other coded rows (743 Operating income) → memo too.
      const codedAggregate = /^operating income$/i.test(label);
      if (code) lineItems.push(mkItem(code.startsWith('7') ? 'income' : 'expenses', code, label, amount, codedAggregate || undefined));
      else lineItems.push(mkItem(amount >= 0 ? 'income' : 'expenses', '', label, amount, true));
    }
    if (lineItems.length > 0) {
      statements.push({ date: monthEnd(col.year, col.month), kind: 'pnl', gaap: 'IFRS', source: 'excel', fileName, lineItems });
    }
  }
  if (statements.length === 0) throw new Error('P&L: no monthly columns with data found.');
  return statements;
};

// --- Statement of changes in equity ---------------------------------------------

const parseEquity = (ws: Sheet, fileName: string, fallbackDate: string): Omit<FinStatement, 'id' | 'entity'> => {
  const headerCell = findCell(ws, v => v === 'share capital');
  if (!headerCell) throw new Error('Equity statement: component header row ("Share capital"…) not found.');
  const [headerRow] = headerCell;
  // Total equity column = rightmost component of the header row.
  const range = sheetRange(ws);
  let totalCol = -1;
  for (let c = 0; c <= range.e.c; c++) {
    if (norm(cellV(ws, headerRow, c)).toLowerCase().startsWith('total equity')) totalCol = c;
  }
  if (totalCol === -1) throw new Error('Equity statement: "Total equity" column not found.');
  const labelCol = 0;

  // Amounts are in CHF units → mn.
  const scale = 1e6;
  const lineItems: FinStatementLineItem[] = [];
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const label = norm(cellV(ws, r, labelCol));
    if (!label) continue;
    const amount = num(cellV(ws, r, totalCol));
    if (amount === undefined) continue;
    const low = label.toLowerCase();
    const memo = low.startsWith('at end') || low.startsWith('at beginning') || low.startsWith('total comprehensive');
    lineItems.push(mkItem('movements', '', label, amount / scale, memo || undefined));
  }
  if (lineItems.length === 0) throw new Error('Equity statement: no movement rows found.');
  return { date: fallbackDate, kind: 'equity', gaap: 'IFRS', source: 'excel', fileName, lineItems };
};

// --- Detection / entry point -----------------------------------------------------

/**
 * Detects and parses one of the three internal finance formats. `fallbackDate`
 * (the Workbench-selected period) is used when the file carries no date
 * (equity statement).
 */
export const parseFinWorkbook = (buffer: ArrayBuffer, fileName: string, fallbackDate: string): ParsedFin => {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    if (findCell(ws, v => v.startsWith('balance sheet in chf'))) {
      return { kind: 'fin', fileName, statements: [parseBalanceSheet(ws, fileName)] };
    }
    if (findCell(ws, v => v.startsWith('underlying profitability'))) {
      return { kind: 'fin', fileName, statements: parsePnl(ws, fileName) };
    }
    if (findCell(ws, v => v.startsWith('equity from analysis'))) {
      return { kind: 'fin', fileName, statements: [parseEquity(ws, fileName, fallbackDate)] };
    }
  }
  throw new Error(
    'Unrecognized file: expected a FINMA/SNB return (CASABIS, LCR_G, NSFR_G) or an internal finance extract ' +
    '("Balance sheet In CHF millions", "Underlying profitability evolution" or "Equity from analysis").'
  );
};
