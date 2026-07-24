import * as XLSX from 'xlsx';
import {
  CapitalKeyMetrics, CapitalLineItem, CapitalRowMap, ImportMapping,
  LcrReport, NsfrLineItem, NsfrSection,
} from '../types';
import { newItemId } from './capital';
import { resolveMapping } from './importMapping';

export { DEFAULT_IMPORT_MAPPING, resolveMapping } from './importMapping';

/**
 * Parses the official FINMA / SNB regulatory Excel templates:
 *  - Capital adequacy survey "CASABIS" (Basel3final / CRSABIS workbook):
 *    KM1 key metrics, CASABISIRB_CAP capital composition (by FINMA row code),
 *    CASABISIRB_RWALRD risk-weighted assets split.
 *  - Liquidity survey "LCR_G": one sheet per currency (LCR_G01_TOT.MELD…),
 *    read via SNB row codes (col E) and summary labels (col Y).
 *
 * Every anchor (sheet names, row codes, item numbers, labels) comes from an
 * ImportMapping. The defaults below match the current template versions
 * (CRSABIS v1.2, LCR_G release 1.3); when a new version moves things around,
 * override the mapping in the app (Workbench → Import mapping) — no code
 * change needed. Overrides are merged field-by-field over the defaults.
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

export interface ParsedNsfr {
  kind: 'nsfr';
  fileName: string;
  date: string; // YYYY-MM-DD
  totalAsf: number;
  totalRsf: number;
  nsfrRatio: number; // %
  lineItems: NsfrLineItem[];
}

export type ParsedImport = ParsedCapital | ParsedLcr | ParsedNsfr;

// --- Generic helpers --------------------------------------------------------

type Sheet = XLSX.WorkSheet;

const cell = (ws: Sheet, addr: string): unknown => ws[addr]?.v;

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && isFinite(v) ? v : undefined;

const kToM = (v: number | undefined): number | undefined =>
  v === undefined ? undefined : Math.round((v / 1000) * 10000) / 10000;

const norm = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

const toIsoDate = (v: unknown): string | undefined => {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // SheetJS (cellDates) builds Dates at LOCAL midnight, so reading UTC parts
    // on a UTC+1 machine shifts 31.12 back to 30.12. Shifting to midday first
    // makes the UTC parts correct regardless of whether the Date was built at
    // local or UTC midnight, on any timezone up to ±12h.
    const noon = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${noon.getUTCFullYear()}-${String(noon.getUTCMonth() + 1).padStart(2, '0')}-${String(noon.getUTCDate()).padStart(2, '0')}`;
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

/** Scans a column for the first row whose normalized value equals one of the labels (priority order). */
const findLabelledRow = (ws: Sheet, col: string, labels: string[], maxRow = 900): number | undefined => {
  for (const label of labels) {
    const want = norm(label).toLowerCase();
    for (let r = 1; r <= maxRow; r++) {
      if (norm(cell(ws, `${col}${r}`)).toLowerCase() === want) return r;
    }
  }
  return undefined;
};

/** Scans a column for the first row whose value starts with `itemNo` followed by whitespace. */
const findItemRow = (ws: Sheet, col: string, itemNo: string, maxRow = 120): number | undefined => {
  const re = new RegExp(`^${itemNo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`);
  for (let r = 1; r <= maxRow; r++) {
    const v = cell(ws, `${col}${r}`);
    // trailing space appended so an item number alone in a cell still matches
    if (typeof v === 'string' && re.test(v.replace(/\s+/g, ' ').trim() + ' ')) return r;
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

export const detectFileType = (wb: XLSX.WorkBook, m: Required<ImportMapping>): 'capital' | 'lcr' | 'nsfr' | null => {
  if (wb.SheetNames.includes(m.sheets.km1!) && wb.SheetNames.includes(m.sheets.cap!)) return 'capital';
  if (wb.SheetNames.some(n => /^LCR_G\d+_[A-Z]{3}\.MELD$/.test(n))) return 'lcr';
  if (wb.SheetNames.includes(m.nsfr.sheet!)) return 'nsfr';
  return null;
};

export const parseWorkbook = (buffer: ArrayBuffer, fileName: string, mappingOverrides?: ImportMapping): ParsedImport => {
  const mapping = resolveMapping(mappingOverrides);
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const kind = detectFileType(wb, mapping);
  if (kind === 'capital') return parseCapital(wb, fileName, mapping);
  if (kind === 'lcr') return parseLcr(wb, fileName, mapping);
  if (kind === 'nsfr') return parseNsfr(wb, fileName, mapping);
  throw new Error(
    `Unrecognized file: expected a FINMA capital adequacy template ('${mapping.sheets.km1}' + '${mapping.sheets.cap}' sheets), an SNB LCR_G file (LCR_G01_*.MELD sheets) or an SNB NSFR_G file ('${mapping.nsfr.sheet}' sheet). If the template changed, adjust the import mapping.`
  );
};

// --- Capital adequacy (CASABIS) ----------------------------------------------

const parseCapital = (wb: XLSX.WorkBook, fileName: string, m: Required<ImportMapping>): ParsedCapital => {
  const delivery = wb.Sheets['Delivery note'];
  const km1 = wb.Sheets[m.sheets.km1!];
  const cap = wb.Sheets[m.sheets.cap!];
  const rwa = wb.Sheets[m.sheets.rwa!];

  const date =
    (delivery && toIsoDate(cell(delivery, 'H5'))) ||
    (km1 && toIsoDate(cell(km1, 'I3'))) ||
    (cap && toIsoDate(cell(cap, 'I3')));
  if (!date) throw new Error('Could not read the reporting date from the file (Delivery note H5 / KM1 I3).');

  // -- KM1 key metrics (item numbers at the start of col B labels, values in col I) --
  const km1Val = (itemNo: string | undefined): number | undefined => {
    if (!itemNo || !km1) return undefined;
    const r = findItemRow(km1, 'B', itemNo, 60);
    return r ? num(cell(km1, `I${r}`)) : undefined;
  };
  const pctVal = (v: number | undefined) =>
    v === undefined ? undefined : Math.round(v * 100 * 10000) / 10000; // decimal → %

  const keyMetrics: CapitalKeyMetrics = {
    cet1Capital: kToM(km1Val(m.km1Items.cet1Capital)),
    tier1Capital: kToM(km1Val(m.km1Items.tier1Capital)),
    totalCapital: kToM(km1Val(m.km1Items.totalCapital)),
    rwa: kToM(km1Val(m.km1Items.rwa)),
    cet1Ratio: pctVal(km1Val(m.km1Items.cet1Ratio)),
    tier1Ratio: pctVal(km1Val(m.km1Items.tier1Ratio)),
    totalCapitalRatio: pctVal(km1Val(m.km1Items.totalCapitalRatio)),
    leverageExposure: kToM(km1Val(m.km1Items.leverageExposure)),
    leverageRatio: pctVal(km1Val(m.km1Items.leverageRatio)),
  };

  // -- Capital composition by FINMA row code (col A codes, col I amounts) --
  const lineItems: CapitalLineItem[] = [];
  if (cap) {
    const codes = codeMap(cap, 'A', 200);
    const capVal = (finma: string | undefined): number | undefined => {
      const r = finma ? codes.get(finma) : undefined;
      return r ? num(cell(cap, `I${r}`)) : undefined;
    };

    for (const def of m.capitalRows as CapitalRowMap[]) {
      const v = capVal(def.finma);
      // "Of which" memo rows only when the form carries a value; standard
      // additive rows are always created (0 when the cell is empty) so
      // post-import adjustments (own shares / buy-back, dividends…) can be
      // typed straight into the Workbench.
      if (def.memo && !v) continue;
      lineItems.push({
        id: newItemId(),
        section: def.section,
        code: def.code,
        label: def.label,
        amount: kToM(v) ?? 0,
        ...(def.memo ? { memo: true } : {}),
      });
    }

    // Residual so that Σ equity + Σ deductions === the file's net CET1 exactly.
    const netCet1 = kToM(capVal(m.capitalAnchors.netCet1));
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

    // Full line-by-line capture: every other coded CAP row with a value is kept
    // as a memo item (never in totals), labelled "[<finma-code>] <form label>",
    // so the imported file is stored in the database row by row.
    const mappedCodes = new Set<string>(
      (m.capitalRows as CapitalRowMap[]).map(d => d.finma).concat(m.capitalAnchors.netCet1 ?? []),
    );
    for (const [finma, r] of codes) {
      if (mappedCodes.has(finma) || !/^\d/.test(finma)) continue;
      const v = num(cell(cap, `I${r}`));
      if (v === undefined || v === 0) continue;
      const section: CapitalLineItem['section'] =
        finma.startsWith('1.1.2') ? 'at1' :
        finma.startsWith('1.2') || finma.startsWith('1.3') ? 't2' : 'equity';
      lineItems.push({
        id: newItemId(),
        section,
        code: `finma-${finma}`,
        label: `[${finma}] ${norm(cell(cap, `B${r}`)) || 'Unlabelled row'}`,
        amount: kToM(v)!,
        memo: true,
      });
    }
  }

  // -- RWA split (RWALRD sheet: total / credit / market / operational codes) --
  if (rwa) {
    const codes = codeMap(rwa, 'A', 120);
    const rwaVal = (finma: string | undefined): number | undefined => {
      const r = finma ? codes.get(finma) : undefined;
      return r ? num(cell(rwa, `I${r}`)) : undefined;
    };
    const total = kToM(rwaVal(m.capitalAnchors.rwaTotal));
    const credit = kToM(rwaVal(m.capitalAnchors.creditRwa)) ?? 0;
    const market = kToM(rwaVal(m.capitalAnchors.marketRwa)) ?? 0;
    const op = kToM(rwaVal(m.capitalAnchors.opRwa)) ?? 0;
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
    const lrd = kToM(rwaVal(m.capitalAnchors.leverageExposure));
    if (lrd !== undefined && keyMetrics.leverageExposure === undefined) keyMetrics.leverageExposure = lrd;
  }

  return { kind: 'capital', fileName, date, keyMetrics, lineItems };
};

// --- LCR (LCR_G) ---------------------------------------------------------------

const parseLcr = (wb: XLSX.WorkBook, fileName: string, m: Required<ImportMapping>): ParsedLcr => {
  const sheets = wb.SheetNames.filter(n => /^LCR_G\d+_[A-Z]{3}\.MELD$/.test(n));
  const reports: Omit<LcrReport, 'id' | 'entity'>[] = [];
  let date: string | undefined;

  for (const name of sheets) {
    const ws = wb.Sheets[name];
    const currency = (cell(ws, 'L2') as string) || name.replace(/^LCR_G\d+_([A-Z]{3})\.MELD$/, '$1');
    date = date || toIsoDate(cell(ws, 'L4'));

    // SNB row codes live in column E; amounts (col 01) in column F,
    // weighted amounts in column S.
    const codes = codeMap(ws, 'E', 800);
    const rowVal = (code: string | undefined): number | undefined => {
      const r = code ? codes.get(code) : undefined;
      return r ? num(cell(ws, `F${r}`)) : undefined;
    };
    const weightedVal = (code: string | undefined): number | undefined => {
      const r = code ? codes.get(code) : undefined;
      return r ? num(cell(ws, `S${r}`)) : undefined;
    };
    // HQLA weighted totals are labelled in column Y with values in column W.
    const labelled = (labels: string[] | undefined): number | undefined => {
      if (!labels || labels.length === 0) return undefined;
      const r = findLabelledRow(ws, 'Y', labels, 800);
      return r ? num(cell(ws, `W${r}`)) : undefined;
    };

    const totalHqla = kToM(labelled(m.lcrHqlaLabels.total)) ?? 0;
    const hqlaCat1 = kToM(labelled(m.lcrHqlaLabels.cat1)) ?? 0;
    const hqlaCat2a = kToM(labelled(m.lcrHqlaLabels.cat2a)) ?? 0;
    const hqlaCat2b = kToM(labelled(m.lcrHqlaLabels.cat2b)) ?? 0;
    const totalOutflows = kToM(rowVal(m.lcrCodes.totalOutflows)) ?? 0;
    const inflowsBeforeCap = kToM(rowVal(m.lcrCodes.inflowsBeforeCap)) ?? 0;
    const inflowsAfterCap = kToM(rowVal(m.lcrCodes.inflowsAfterCap)) ?? 0;
    const lcrDecimal = rowVal(m.lcrCodes.lcrRatio);

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
      // Weighted flow components for the management-report detail view.
      retailOutflows: kToM(weightedVal(m.lcrCodes.retailOutflows)) ?? 0,
      wholesaleOutflows: kToM(weightedVal(m.lcrCodes.wholesaleOutflows)) ?? 0,
      derivativesOutflows: kToM(weightedVal(m.lcrCodes.derivativesOutflows)) ?? 0,
      reverseRepoInflows: kToM(weightedVal(m.lcrCodes.reverseRepoInflows)) ?? 0,
      derivativesInflows: kToM(weightedVal(m.lcrCodes.derivativesInflows)) ?? 0,
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

// --- NSFR (NSFR_G) ---------------------------------------------------------------

/**
 * SNB NSFR_G form: one sheet ('NSFR_G01'), labels in column D, SNB row codes
 * in column E, raw amounts by maturity bucket in K (<6m), L (6m-1y), M (>=1y),
 * calculated weighted totals in column V (Total ASF / Total RSF / ratio only).
 * Sections: A. Available stable funding (rows < RSF header), B.1 on-balance
 * RSF, B.2 off-balance RSF. Every row carrying an amount becomes a line item.
 */
const parseNsfr = (wb: XLSX.WorkBook, fileName: string, m: Required<ImportMapping>): ParsedNsfr => {
  const ws = wb.Sheets[m.nsfr.sheet!];
  if (!ws) throw new Error(`Sheet '${m.nsfr.sheet}' not found in the NSFR file.`);

  // Cut-off date: B4 on the form ('31.03.2026'), fallback Start!H2.
  const date =
    toIsoDate(cell(ws, 'B4')) ||
    (wb.Sheets['Start'] && toIsoDate(cell(wb.Sheets['Start'], 'H2')));
  if (!date) throw new Error('Could not read the cut-off date from the NSFR file (NSFR_G01 B4 / Start H2).');

  // Section boundaries: located from the section headers in column D.
  const rsfStart = findLabelledRow(ws, 'D', ['B. Required stable funding'], 400) ?? 78;
  const rsfOffStart = findLabelledRow(ws, 'D', ['B.2. Off balance-sheet items'], 400) ?? 336;

  const codes = codeMap(ws, 'E', 400);
  const totalAsfRow = m.nsfr.totalAsf ? codes.get(m.nsfr.totalAsf) : undefined;
  const totalRsfRow = m.nsfr.totalRsf ? codes.get(m.nsfr.totalRsf) : undefined;
  const ratioRow = m.nsfr.ratio ? codes.get(m.nsfr.ratio) : undefined;

  const totalAsf = kToM(totalAsfRow ? num(cell(ws, `V${totalAsfRow}`)) : undefined) ?? 0;
  const totalRsf = kToM(totalRsfRow ? num(cell(ws, `V${totalRsfRow}`)) : undefined) ?? 0;
  const ratioDecimal = ratioRow ? num(cell(ws, `V${ratioRow}`)) : undefined;
  const nsfrRatio = ratioDecimal !== undefined
    ? Math.round(ratioDecimal * 100 * 100) / 100
    : (totalRsf > 0 ? Math.round((totalAsf / totalRsf) * 100 * 100) / 100 : 0);

  // --- Sequential scan with hierarchical context reconstruction ---
  // The form puts group headers ("Unsecured funding from banks, of which:",
  // "Encumbered for central bank liquidity operations, of which:") on rows
  // WITHOUT an SNB code; the coded detail rows below only carry the child
  // label ("non-operational deposit…", "Unencumbered"). We rebuild readable
  // labels as "group — subgroup — child". Cell indentation would be the exact
  // signal but SheetJS CE does not expose it, so scope ends are inferred:
  // a coded row that does not look like a child clears the context.
  const totalCodes = new Set([m.nsfr.totalAsf, m.nsfr.totalRsf, m.nsfr.ratio]);
  const stripOfWhich = (s: string) => s.replace(/,?\s*of which:?\s*$/i, '').replace(/:\s*$/, '').trim();
  const isSectionTitle = (s: string) => /^[AB]\.(\d\.)?\s/.test(s) || /^[AB]\.\s/.test(s);
  const SECURED_CHILDREN = new Set([
    'Retail and small business customers', 'Non-financial corporates', 'Central banks',
    'Sovereigns/PSEs/MDBs/NDBs', 'Banks', 'Other financial institutions', 'Other legal entities',
  ]);
  const looksLikeChild = (label: string, ctx1: string): boolean => {
    if (/^[a-z"“]/.test(label)) return true;                 // lowercase start (op./non-op. deposits…)
    if (label === 'Unencumbered') return true;
    if (/^Encumbered for periods/.test(label)) return true;
    if (ctx1 && SECURED_CHILDREN.has(label)) return true;    // counterparties under "Secured borrowings…"
    return false;
  };

  const lineItems: NsfrLineItem[] = [];
  let ctx1 = '';
  let ctx2 = '';
  for (let r = 1; r <= 400; r++) {
    const rawLabel = norm(cell(ws, `D${r}`));
    if (!rawLabel) continue;
    const codeCell = cell(ws, `E${r}`);
    const code = codeCell === undefined || codeCell === null ? '' : String(codeCell).trim().split(/\s/)[0];

    if (!code) {
      // Header row: section titles reset everything; "Encumbered…" headers are
      // sub-groups of the current group; anything else starts a new group.
      if (isSectionTitle(rawLabel)) { ctx1 = ''; ctx2 = ''; continue; }
      if (/^Encumbered/.test(rawLabel) && ctx1) ctx2 = stripOfWhich(rawLabel);
      else { ctx1 = stripOfWhich(rawLabel); ctx2 = ''; }
      continue;
    }

    if (totalCodes.has(code)) { ctx1 = ''; ctx2 = ''; continue; }

    // Coded row: does it belong to the open group?
    if (ctx1 && !looksLikeChild(rawLabel, ctx1)) { ctx1 = ''; ctx2 = ''; }

    const k = kToM(num(cell(ws, `K${r}`)));
    const l = kToM(num(cell(ws, `L${r}`)));
    const mm = kToM(num(cell(ws, `M${r}`)));

    // Coded rows ending in "of which:" also open a (light) group for their
    // immediate lowercase children ("Total central bank reserves, of which:").
    const opensGroup = /,?\s*of which:?\s*$/i.test(rawLabel);

    if (k !== undefined || l !== undefined || mm !== undefined) {
      const label = [ctx1, ctx2, stripOfWhich(rawLabel)].filter(Boolean).join(' — ');
      const section: NsfrSection = r < rsfStart ? 'asf' : r < rsfOffStart ? 'rsf' : 'rsfOff';
      lineItems.push({
        id: newItemId(),
        section,
        code,
        label,
        amountLt6m: k ?? 0,
        amount6mTo1y: l ?? 0,
        amountGte1y: mm ?? 0,
      });
    }

    if (opensGroup && !ctx1) { ctx1 = stripOfWhich(rawLabel); ctx2 = ''; }
  }

  return { kind: 'nsfr', fileName, date, totalAsf, totalRsf, nsfrRatio, lineItems };
};
