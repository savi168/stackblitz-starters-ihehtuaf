import {
  CapitalLineItem,
  CapitalReport,
  CapitalSection,
  CentralData,
  CET1CapitalBreakdown,
  KpiHistoryEntry,
  LcrReport,
  LiquidityByCurrency,
  NsfrReport,
} from '../types';

/**
 * Capital adequacy domain logic: the additive model that turns line items
 * (shareholder equity, deductions, AT1, T2, RWA) into CET1 / Tier 1 / total
 * capital and ratios, plus the projection that keeps the aggregated
 * `kpisHistory` entry (used by every existing chart) in sync with the
 * detailed capital & LCR reports.
 *
 * Sign convention (FINMA): amounts that increase capital are positive,
 * deductions are negative. CET1 = Σ equity + Σ deductions (non-memo rows).
 */

export const SECTION_LABELS: Record<CapitalSection, string> = {
  equity: 'Shareholder Equity',
  deduction: 'Deductions & Adjustments',
  at1: 'Additional Tier 1 (AT1)',
  t2: 'Tier 2 (T2)',
  rwa: 'Risk-Weighted Assets',
};

export const SECTION_ORDER: CapitalSection[] = ['equity', 'deduction', 'at1', 't2', 'rwa'];

export interface CapitalSummary {
  equityTotal: number;
  deductionTotal: number;
  cet1: number;
  at1: number;
  tier1: number;
  t2: number;
  totalCapital: number;
  creditRwa: number;
  marketRwa: number;
  opRwa: number;
  otherRwa: number;
  rwaTotal: number;
  cet1Ratio: number | null;      // %
  tier1Ratio: number | null;     // %
  totalCapitalRatio: number | null; // %
  leverageExposure: number | null;
  leverageRatio: number | null;  // %
  /** Difference between computed CET1 and the reported KM1 figure (if any). */
  cet1ReconciliationGap: number | null;
}

const sum = (items: CapitalLineItem[], section: CapitalSection): number =>
  items.filter(i => i.section === section && !i.memo).reduce((acc, i) => acc + (i.amount || 0), 0);

const byCode = (items: CapitalLineItem[], code: string): number =>
  items.find(i => i.code === code)?.amount ?? 0;

export const computeCapitalSummary = (report: CapitalReport): CapitalSummary => {
  const items = report.lineItems;
  const km = report.keyMetrics || {};

  const equityTotal = sum(items, 'equity');
  const deductionTotal = sum(items, 'deduction');
  const hasItems = items.some(i => !i.memo && i.section !== 'rwa');

  // Computed from components when line items exist; reported figures as fallback.
  const cet1 = hasItems ? equityTotal + deductionTotal : (km.cet1Capital ?? 0);
  const at1 = hasItems ? sum(items, 'at1') : (km.tier1Capital ?? 0) - (km.cet1Capital ?? 0);
  const tier1 = cet1 + at1;
  const t2 = hasItems ? sum(items, 't2') : (km.totalCapital ?? 0) - (km.tier1Capital ?? 0);
  const totalCapital = tier1 + t2;

  const creditRwa = byCode(items, 'creditRwa');
  const marketRwa = byCode(items, 'marketRwa');
  const opRwa = byCode(items, 'opRwa');
  const otherRwa = byCode(items, 'otherRwa');
  const rwaFromItems = sum(items, 'rwa');
  const rwaTotal = rwaFromItems !== 0 ? rwaFromItems : (km.rwa ?? 0);

  const pct = (num: number) => (rwaTotal > 0 ? (num / rwaTotal) * 100 : null);
  const leverageExposure = km.leverageExposure ?? null;

  return {
    equityTotal,
    deductionTotal,
    cet1,
    at1,
    tier1,
    t2,
    totalCapital,
    creditRwa,
    marketRwa,
    opRwa,
    otherRwa,
    rwaTotal,
    cet1Ratio: pct(cet1),
    tier1Ratio: pct(tier1),
    totalCapitalRatio: pct(totalCapital),
    leverageExposure,
    leverageRatio: leverageExposure && leverageExposure > 0 ? (tier1 / leverageExposure) * 100 : null,
    cet1ReconciliationGap: hasItems && km.cet1Capital != null ? cet1 - km.cet1Capital : null,
  };
};

// --- Manual entry template -------------------------------------------------

let nextItemId = Date.now();
export const newItemId = () => ++nextItemId;

/**
 * Standard rows for manual entry — the sub-application structure the user
 * fills in per entity (share capital, RSU, currency translation, goodwill…).
 * All additive: CET1 = Σ equity + Σ deductions.
 */
export const createManualCapitalTemplate = (entity: string, date: string): CapitalReport => {
  const mk = (section: CapitalSection, code: string, label: string): CapitalLineItem =>
    ({ id: newItemId(), section, code, label, amount: 0 });

  return {
    id: newItemId(),
    entity,
    date,
    source: 'manual',
    keyMetrics: {},
    lineItems: [
      mk('equity', 'shareCapital', 'Share capital (paid-up)'),
      mk('equity', 'sharePremium', 'Share premium reserves'),
      mk('equity', 'retainedEarnings', 'Retained earnings'),
      mk('equity', 'fxTranslation', 'Currency translation adjustment (+/-)'),
      mk('equity', 'rsu', 'Share-based payments / RSU (+/-)'),
      mk('equity', 'acquisitions', 'Acquisitions / scope changes (+/-)'),
      mk('equity', 'oci', 'Other comprehensive income (+/-)'),
      mk('equity', 'interimPnl', 'Interim P&L for the current year (+/-)'),
      mk('equity', 'minorityInterests', 'Minority interests (-)'),
      mk('deduction', 'futureDividends', 'Future expected dividends (-)'),
      mk('deduction', 'goodwill', 'Goodwill (-)'),
      mk('deduction', 'intangibles', 'Other intangible assets (-)'),
      mk('deduction', 'dtlIntangibles', 'Deferred tax liabilities on intangibles (+)'),
      mk('deduction', 'dtaFutureProfit', 'Deferred tax assets on future profitability (-)'),
      mk('deduction', 'ownShares', 'Own shares / buyback programme (-)'),
      mk('deduction', 'otherAdjustments', 'Other adjustments (+/-)'),
      mk('at1', 'netAt1', 'AT1 instruments, net'),
      mk('t2', 'netT2', 'T2 instruments, net'),
      mk('rwa', 'creditRwa', 'Credit risk RWA'),
      mk('rwa', 'marketRwa', 'Market risk RWA'),
      mk('rwa', 'opRwa', 'Operational risk RWA'),
      mk('rwa', 'otherRwa', 'Other RWA'),
    ],
  };
};

// --- Projection to the aggregated KPI history ------------------------------

const buildBreakdown = (report: CapitalReport, summary: CapitalSummary): CET1CapitalBreakdown => {
  const items = report.lineItems;
  // memo rows count too: on import, interim P&L is an "of which" detail of the
  // aggregate equity figure; manually it is an additive row. Both map to pnl.
  const pnl = items.filter(i => i.code === 'interimPnl').reduce((a, i) => a + i.amount, 0);
  const dividend = Math.abs(items.filter(i => i.code === 'futureDividends').reduce((a, i) => a + i.amount, 0));
  // By code (ownShares = FINMA 1.1.1.11.1) or, for rows added by hand in the
  // Workbench, by label ("own shares", "buy-back", "buyback"…).
  const shareBuyback = Math.abs(
    items.filter(i => i.code === 'ownShares' || (!i.memo && /own shares|buy-?back/i.test(i.label)))
      .reduce((a, i) => a + i.amount, 0)
  );
  const goodwillIntangibles = Math.abs(
    items.filter(i => ['goodwill', 'dtlGoodwill', 'intangibles', 'dtlIntangibles'].includes(i.code) && !i.memo)
      .reduce((a, i) => a + i.amount, 0)
  );
  const equity = summary.equityTotal - pnl;
  // Residual so the breakdown reconciles exactly with the computed CET1.
  const otherDeductions = equity + pnl - dividend - shareBuyback - goodwillIntangibles - summary.cet1;

  return {
    equity: round2(equity),
    pnl: round2(pnl),
    shareBuyback: round2(shareBuyback),
    goodwillIntangibles: round2(goodwillIntangibles),
    otherDeductions: round2(otherDeductions),
    toBeDefined: 0,
    dividend: round2(dividend),
  };
};

const round2 = (v: number) => Math.round(v * 100) / 100;

const buildLiquidity = (
  lcrReports: LcrReport[],
  nsfr: NsfrReport | undefined,
  existing?: LiquidityByCurrency,
): LiquidityByCurrency => {
  const liquidity: LiquidityByCurrency = { ...(existing || {}) };
  for (const r of lcrReports) {
    liquidity[r.currency] = {
      ...(liquidity[r.currency] || {}),
      hqla: round2(r.totalHqla),
      netCashOutflows: round2(r.netOutflows),
    };
  }
  // NSFR feeds the aggregate (TOT) asf/rsf used by the existing NSFR KPI.
  if (nsfr) {
    liquidity.TOT = {
      ...(liquidity.TOT || {}),
      asf: round2(nsfr.totalAsf),
      rsf: round2(nsfr.totalRsf),
    };
  }
  return liquidity;
};

/**
 * Upserts the kpisHistory entry for entity+date from the detailed reports.
 * The detailed reports are the source of truth; kpisHistory is the projection
 * every existing chart reads. Returns a NEW kpisHistory array.
 */
export const projectToKpiHistory = (data: CentralData, entity: string, date: string): KpiHistoryEntry[] => {
  const capital = (data.capitalReports || []).find(r => r.entity === entity && r.date === date);
  const lcrs = (data.lcrReports || []).filter(r => r.entity === entity && r.date === date);
  const nsfr = (data.nsfrReports || []).find(r => r.entity === entity && r.date === date);
  if (!capital && lcrs.length === 0 && !nsfr) return data.kpisHistory;

  const existing = data.kpisHistory.find(k => k.entity === entity && k.date === date);
  const entry: KpiHistoryEntry = existing
    ? { ...existing }
    : { entity, date, cet1Capital: 0, creditRWA: 0, marketRWA: 0, opRWA: 0, otherRWA: 0, tier1: 0, exposure: 0 };

  if (capital) {
    const s = computeCapitalSummary(capital);
    entry.cet1Capital = round2(s.cet1);
    entry.tier1 = round2(s.tier1);
    entry.creditRWA = round2(s.creditRwa);
    entry.marketRWA = round2(s.marketRwa);
    entry.opRWA = round2(s.opRwa);
    // Keep the RWA split summing to the total (residual goes to "other").
    entry.otherRWA = round2(s.rwaTotal - s.creditRwa - s.marketRwa - s.opRwa);
    if (s.leverageExposure != null) entry.exposure = round2(s.leverageExposure);
    entry.cet1CapitalBreakdown = buildBreakdown(capital, s);
  }
  if (lcrs.length > 0 || nsfr) {
    entry.liquidity = buildLiquidity(lcrs, nsfr, entry.liquidity);
  }

  const others = data.kpisHistory.filter(k => !(k.entity === entity && k.date === date));
  return [...others, entry];
};
