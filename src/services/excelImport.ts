import * as XLSX from 'xlsx';
import { CapitalKeyMetrics, CapitalLineItem, CapitalSection, LcrReport } from '../types';
import { newItemId } from './capital';

/**
 * Parses the official FINMA / SNB regulatory Excel templates:
 *  - Capital adequacy survey "CASABIS" (Basel3final / CRSABIS workbook):
 *    KM1 key metrics, CASABISIRB_CAP capital composition (by FINMA row code),
 *    CASABISIRB_RWALRD risk-weighted assets split.
 *  - Liquidity survey "LCR_G": one sheet per currency (LCR_G01_TOT.MELD…),
 *    read via SNB row codes (col E) and summary labels (col Y).
 *
 * Amounts in the files are CHF thousands; the app works in mCHF → /1000.
 * Sign convention preserved: deductions stay negative.
 */

// --- Result shapes ----------------------------------------------------------

export interface ParsedCapital {
  kind: 'capital';
  fileName: string;
  date: string; // YYYY-MM-DD
  keyMetrics: CapitalKeyMetrics;
  lineItems: CapitalLineItem[];
}

export interface ParsedLcr {
  kind: 'lcr';
  fileName: string;
  date: string; // YYYY-MM-DD
  /** One entry per currency sheet that contains data. */
  reports: Omit<LcrReport, 'id' | 'entity'>[];
}

export type ParsedImport = ParsedCapital | ParsedLcr;

// --- Generic helpers --------------------------------------------------------

type Sheet = XLSX.WorkSheet;

const cell = (ws: Sheet, addr: string): unknown => ws[addr]?.v;

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && isFinite(v) ? v : undefined;

const kToM = (v: number | undefined): number | undefined =>
  v === undefined ? undefined : Math.round((v / 1000) * 10000) / 10000;

const toIsoDate = (v: unknown): string | undefined => {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // cellDates gives a Date at local/UTC midnight — read UTC parts.
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); // 31.12.2025
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const iso = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  if (typeof v === 'number') {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return undefined;
};

/** Scans a column for the first row whose string value matches the regex. */
const findRow = (ws: Sheet, col: string, re: RegExp, maxRow = 900): number | undefined => {
  for (let r = 1; r <= maxRow; r++) {
    const v = cell(ws, `${col}${r}`);
    if (typeof v === 'string' && re.test(v.replace(/\s+/g, ' ').trim())) return r;
  }
  return undefined;
};

/** Builds a map of trimmed first-token of a column → row number (FINMA/SNB row codes). */
const codeMap = (ws: Sheet, col: string, maxRow = 900): Map<string, number> => {
  const map = new Map<string, number>();
  for (let r = 1; r <= maxRow; r++) {
    const v = cell(ws, `${col}${r}`);
    if (v === undefined || v === null) continue;
    const code = String(v).trim().split(/\s/)[0];
    if (code && !map.has(code)) map.set(code, r);
  }
  return map;
};

// --- Detection ---------------------------------------------------------------

export const detectFileType = (wb: XLSX.WorkBook): 'capital' | 'lcr' | null => {
  if (wb.SheetNames.includes('KM1') && wb.SheetNames.includes('CASABISIRB_CAP')) return 'capital';
  if (wb.SheetNames.some(n => /^LCR_G01_[A-Z]{3}\.MELD$/.test(n))) return 'lcr';
  return null;
};

export const parseWorkbook = (buffer: ArrayBuffer, fileName: string): ParsedImport => {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const kind = detectFileType(wb);
  if (kind === 'capital') return parseCapital(wb, fileName);
  if (kind === 'lcr') return parseLcr(wb, fileName);
  throw new Error(
    "Unrecognized file: expected a FINMA capital adequacy template (KM1 + CASABISIRB_CAP sheets) or an SNB LCR_G file (LCR_G01_*.MELD sheets)."
  );
};

// --- Capital adequacy (CASABIS) ----------------------------------------------

/** FINMA row code → target line item. Additive rows drive the CET1 sum; memo rows are "of which" details. */
const CAP_ROWS: Array<{ finma: string; section: CapitalSection; code: string; label: string; memo?: boolean }> = [
  // Additive equity chain (1.1.1.1 → 1.1.1.8 subtotal)
  { finma: '1.1.1.1', section: 'equity', code: 'equityFinStatements', label: 'Equity per financial statements' },
  { finma: '1.1.1.2', section: 'equity', code: 'scopeChanges', label: 'Changes in scope of consolidation (+/-)' },
  { finma: '1.1.1.4', section: 'equity', code: 'ownSharesAdj', label: 'Adjustment for own shares held (+/-)' },
  { finma: '1.1.1.5', section: 'equity', code: 'nonEligibleEquity', label: 'Equity not eligible as CET1 (-)' },
  { finma: '1.1.1.6', section: 'equity', code: 'minorityInterests', label: 'Minority interests (-)' },
  // "Of which" composition of the equity figure (informational)
  { finma: '1.1.1.8.1', section: 'equity', code: 'shareCapital', label: 'of which: Paid-up share capital', memo: true },
  { finma: '1.1.1.8.5', section: 'equity', code: 'sharePremium', label: 'of which: Share premium & retained earnings', memo: true },
  { finma: '1.1.1.8.6', section: 'equity', code: 'fxTranslation', label: 'of which: Foreign exchange reserves (+/-)', memo: true },
  { finma: '1.1.1.8.7', section: 'equity', code: 'generalBankingRisks', label: 'of which: Reserves for general banking risks', memo: true },
  { finma: '1.1.1.8.8', section: 'equity', code: 'oci', label: 'of which: Other reserves / OCI (+/-)', memo: true },
  { finma: '1.1.1.8.9', section: 'equity', code: 'profitCarried', label: 'of which: Profit/loss carried forward', memo: true },
  { finma: '1.1.1.8.10', section: 'equity', code: 'interimPnl', label: 'of which: Interim P&L for the current year', memo: true },
  // Additive deductions & adjustments
  { finma: '1.1.1.7', section: 'deduction', code: 'futureDividends', label: 'Future expected dividends (-)' },
  { finma: '1.1.1.9.5.12', section: 'deduction', code: 'cashFlowHedge', label: 'Cash flow hedge adjustment (+/-)' },
  { finma: '1.1.1.11.1', section: 'deduction', code: 'ownShares', label: 'Own CET1 instruments (-)' },
  { finma: '1.1.1.11.2', section: 'deduction', code: 'goodwill', label: 'Goodwill (-)' },
  { finma: '1.1.1.11.3', section: 'deduction', code: 'dtlGoodwill', label: 'DTL associated with goodwill (+)' },
  { finma: '1.1.1.11.4', section: 'deduction', code: 'intangibles', label: 'Other intangible assets (-)' },
  { finma: '1.1.1.11.5', section: 'deduction', code: 'dtlIntangibles', label: 'DTL associated with intangibles (+)' },
  { finma: '1.1.1.11.6', section: 'deduction', code: 'dtaFutureProfit', label: 'DTA relying on future profitability (-)' },
  { finma: '1.1.1.11.8', section: 'deduction', code: 'pensionAssets', label: 'Defined benefit pension fund assets (-)' },
  { finma: '1.1.1.11.12', section: 'deduction', code: 'prudentValuation', label: 'Prudent valuation adjustment (-)' },
  // AT1 / T2 (net figures additive; instrument details as memo)
  { finma: '1.1.2.10', section: 'at1', code: 'netAt1', label: 'AT1 capital, net' },
  { finma: '1.1.2.1', section: 'at1', code: 'at1EquityInstruments', label: 'of which: AT1 instruments recorded as equity', memo: true },
  { finma: '1.1.2.2', section: 'at1', code: 'at1DebtInstruments', label: 'of which: AT1 instruments recorded as debt', memo: true },
  { finma: '1.2.13', section: 't2', code: 'netT2', label: 'T2 capital, net' },
];

const parseCapital = (wb: XLSX.WorkBook, fileName: string): ParsedCapital => {
  const delivery = wb.Sheets['Delivery note'];
  const km1 = wb.Sheets['KM1'];
  const cap = wb.Sheets['CASABISIRB_CAP'];
  const rwa = wb.Sheets['CASABISIRB_RWALRD'];

  const date =
    (delivery && toIsoDate(cell(delivery, 'H5'))) ||
    (km1 && toIsoDate(cell(km1, 'I3'))) ||
    (cap && toIsoDate(cell(cap, 'I3')));
  if (!date) throw new Error('Could not read the reporting date from the file (Delivery note H5 / KM1 I3).');

  // -- KM1 key metrics (labels in col B, values in col I) --
  const km1Val = (re: RegExp): number | undefined => {
    const r = km1 ? findRow(km1, 'B', re, 60) : undefined;
    return r ? num(cell(km1, `I${r}`)) : undefined;
  };
  const pctVal = (v: number | undefined) =>
    v === undefined ? undefined : Math.round(v * 100 * 10000) / 10000; // decimal → %

  const keyMetrics: CapitalKeyMetrics = {
    cet1Capital: kToM(km1Val(/^1 Common Equity Tier 1/)),
    tier1Capital: kToM(km1Val(/^2 Tier 1$/)),
    totalCapital: kToM(km1Val(/^3 Total capital$/)),
    rwa: kToM(km1Val(/^4 Total risk-weighted assets \(RWA\)/)),
    cet1Ratio: pctVal(km1Val(/^5 CET1 ratio/)),
    tier1Ratio: pctVal(km1Val(/^6 T1 ratio/)),
    totalCapitalRatio: pctVal(km1Val(/^7 Total capital ratio/)),
    leverageExposure: kToM(km1Val(/^13 Total Basel III leverage ratio exposure/)),
    leverageRatio: pctVal(km1Val(/^14 Basel/)),
  };

  // -- Capital composition by FINMA row code (col A codes, col I amounts) --
  const lineItems: CapitalLineItem[] = [];
  if (cap) {
    const codes = codeMap(cap, 'A', 200);
    const capVal = (finma: string): number | undefined => {
      const r = codes.get(finma);
      return r ? num(cell(cap, `I${r}`)) : undefined;
    };

    for (const def of CAP_ROWS) {
      const v = capVal(def.finma);
      if (v === undefined || (v === 0 && def.memo)) continue;
      lineItems.push({
        id: newItemId(),
        section: def.section,
        code: def.code,
        label: def.label,
        amount: kToM(v)!,
        ...(def.memo ? { memo: true } : {}),
      });
    }

    // Residual so that Σ equity + Σ deductions === the file's net CET1 exactly.
    const netCet1 = kToM(capVal('1.1.1.27'));
    if (netCet1 !== undefined) {
      const additive = lineItems
        .filter(i => !i.memo && (i.section === 'equity' || i.section === 'deduction'))
        .reduce((a, i) => a + i.amount, 0);
      const residual = Math.round((netCet1 - additive) * 10000) / 10000;
      if (Math.abs(residual) > 0.005) {
        lineItems.push({
          id: newItemId(),
          section: 'deduction',
          code: 'otherAdjustments',
          label: 'Other adjustments (residual to reported net CET1)',
          amount: residual,
        });
      }
    }
  }

  // -- RWA split (CASABISIRB_RWALRD: 2 total, 2.1 credit, 2.2 market, 2.3 op) --
  if (rwa) {
    const codes = codeMap(rwa, 'A', 120);
    const rwaVal = (finma: string): number | undefined => {
      const r = codes.get(finma);
      return r ? num(cell(rwa, `I${r}`)) : undefined;
    };
    const total = kToM(rwaVal('2'));
    const credit = kToM(rwaVal('2.1')) ?? 0;
    const market = kToM(rwaVal('2.2')) ?? 0;
    const op = kToM(rwaVal('2.3')) ?? 0;
    if (total !== undefined) {
      const other = Math.round((total - credit - market - op) * 10000) / 10000;
      const mk = (code: string, label: string, amount: number): CapitalLineItem =>
        ({ id: newItemId(), section: 'rwa', code, label, amount });
      lineItems.push(
        mk('creditRwa', 'Credit & counterparty risk RWA', credit),
        mk('marketRwa', 'Market risk RWA', market),
        mk('opRwa', 'Operational risk RWA', op),
        mk('otherRwa', 'Other RWA & adjustments', other),
      );
      if (keyMetrics.rwa === undefined) keyMetrics.rwa = total;
    }
    const lrd = kToM(rwaVal('2.6'));
    if (lrd !== undefined && keyMetrics.leverageExposure === undefined) keyMetrics.leverageExposure = lrd;
  }

  return { kind: 'capital', fileName, date, keyMetrics, lineItems };
};

// --- LCR (LCR_G) ---------------------------------------------------------------

const parseLcr = (wb: XLSX.WorkBook, fileName: string): ParsedLcr => {
  const sheets = wb.SheetNames.filter(n => /^LCR_G01_[A-Z]{3}\.MELD$/.test(n));
  const reports: Omit<LcrReport, 'id' | 'entity'>[] = [];
  let date: string | undefined;

  for (const name of sheets) {
    const ws = wb.Sheets[name];
    const currency = (cell(ws, 'L2') as string) || name.replace(/^LCR_G01_([A-Z]{3})\.MELD$/, '$1');
    date = date || toIsoDate(cell(ws, 'L4'));

    // SNB row codes live in column E; amounts (col 01) in column F.
    const codes = codeMap(ws, 'E', 800);
    const rowVal = (code: string): number | undefined => {
      const r = codes.get(code);
      return r ? num(cell(ws, `F${r}`)) : undefined;
    };
    // HQLA weighted totals are labelled in column Y with values in column W.
    const labelled = (re: RegExp): number | undefined => {
      const r = findRow(ws, 'Y', re, 800);
      return r ? num(cell(ws, `W${r}`)) : undefined;
    };

    // The CHF sheet labels the total differently (alternative treatment):
    // "Total stock of HQLA plus usage of alternative treatment".
    const totalHqla =
      kToM(labelled(/^Total stock of HQLA$/)) ??
      kToM(labelled(/^Total stock of HQLA plus usage of alternative treatment$/)) ??
      kToM(labelled(/^Total stock of HQLA before alternative treatment$/)) ??
      0;
    const hqlaCat1 = kToM(labelled(/^Total category 1 assets \(adjusted\)$/)) ?? 0;
    const hqlaCat2a = kToM(labelled(/^Total category 2a assets \(adjusted\)$/)) ?? 0;
    const hqlaCat2b = kToM(labelled(/^Total category 2b assets \(adjusted\)$/)) ?? 0;
    const totalOutflows = kToM(rowVal('182')) ?? 0;
    const inflowsBeforeCap = kToM(rowVal('210')) ?? 0;
    const inflowsAfterCap = kToM(rowVal('212')) ?? 0;
    const lcrDecimal = rowVal('270');

    // Skip currency sheets that were left empty in the submission.
    if (totalHqla === 0 && totalOutflows === 0) continue;

    const netOutflows = Math.max(totalOutflows - inflowsAfterCap, 0);
    reports.push({
      date: '', // filled below once the date is known
      currency,
      source: 'excel',
      fileName,
      hqlaCat1,
      hqlaCat2a,
      hqlaCat2b,
      totalHqla,
      totalOutflows,
      inflowsBeforeCap,
      inflowsAfterCap,
      netOutflows: Math.round(netOutflows * 10000) / 10000,
      lcrRatio: lcrDecimal !== undefined
        ? Math.round(lcrDecimal * 100 * 100) / 100
        : (netOutflows > 0 ? Math.round((totalHqla / netOutflows) * 100 * 100) / 100 : 0),
    });
  }

  // Fallback: delivery note H4 ("31.12.2025")
  if (!date) {
    const delivery = wb.Sheets['Delivery note'];
    date = delivery ? toIsoDate(cell(delivery, 'H4')) : undefined;
  }
  if (!date) throw new Error('Could not read the reference date from the LCR file (L4 / Delivery note H4).');
  if (reports.length === 0) throw new Error('No LCR data found: all currency sheets are empty.');

  for (const r of reports) r.date = date;
  return { kind: 'lcr', fileName, date, reports };
};
