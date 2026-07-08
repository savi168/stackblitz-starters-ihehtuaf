import { ImportMapping } from '../types';

/**
 * Default anchors for the FINMA/SNB Excel templates (CRSABIS v1.2, LCR_G
 * release 1.3). When a new template version moves rows or renames sheets,
 * override these values in the app (Workbench → Import mapping) — they are
 * stored with the central data, so no code change or redeploy is needed.
 *
 * Kept in a module WITHOUT the xlsx dependency so the mapping editor UI can
 * import it while the heavy parser stays in its own lazy-loaded chunk.
 */
export const DEFAULT_IMPORT_MAPPING: Required<ImportMapping> = {
  sheets: { km1: 'KM1', cap: 'CASABISIRB_CAP', rwa: 'CASABISIRB_RWALRD' },
  km1Items: {
    cet1Capital: '1',
    tier1Capital: '2',
    totalCapital: '3',
    rwa: '4',
    cet1Ratio: '5',
    tier1Ratio: '6',
    totalCapitalRatio: '7',
    leverageExposure: '13',
    leverageRatio: '14',
  },
  capitalRows: [
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
  ],
  capitalAnchors: {
    netCet1: '1.1.1.27',
    rwaTotal: '2',
    creditRwa: '2.1',
    marketRwa: '2.2',
    opRwa: '2.3',
    leverageExposure: '2.6',
  },
  lcrCodes: {
    totalOutflows: '182', inflowsBeforeCap: '210', inflowsAfterCap: '212', lcrRatio: '270',
    // weighted flow components (values read from column S)
    retailOutflows: '81', wholesaleOutflows: '121', derivativesOutflows: '138',
    reverseRepoInflows: '195', derivativesInflows: '206',
  },
  nsfr: { sheet: 'NSFR_G01', totalAsf: '74', totalRsf: '350', ratio: '354' },
  lcrHqlaLabels: {
    cat1: ['Total category 1 assets (adjusted)'],
    cat2a: ['Total category 2a assets (adjusted)'],
    cat2b: ['Total category 2b assets (adjusted)'],
    // The CHF sheet labels the total differently (alternative treatment).
    total: [
      'Total stock of HQLA',
      'Total stock of HQLA plus usage of alternative treatment',
      'Total stock of HQLA before alternative treatment',
    ],
  },
};

/** Merges user overrides (stored in the central data) over the defaults, field by field. */
export const resolveMapping = (overrides?: ImportMapping): Required<ImportMapping> => ({
  sheets: { ...DEFAULT_IMPORT_MAPPING.sheets, ...(overrides?.sheets || {}) },
  km1Items: { ...DEFAULT_IMPORT_MAPPING.km1Items, ...(overrides?.km1Items || {}) },
  capitalRows: overrides?.capitalRows && overrides.capitalRows.length > 0
    ? overrides.capitalRows
    : DEFAULT_IMPORT_MAPPING.capitalRows,
  capitalAnchors: { ...DEFAULT_IMPORT_MAPPING.capitalAnchors, ...(overrides?.capitalAnchors || {}) },
  lcrCodes: { ...DEFAULT_IMPORT_MAPPING.lcrCodes, ...(overrides?.lcrCodes || {}) },
  lcrHqlaLabels: { ...DEFAULT_IMPORT_MAPPING.lcrHqlaLabels, ...(overrides?.lcrHqlaLabels || {}) },
  nsfr: { ...DEFAULT_IMPORT_MAPPING.nsfr, ...(overrides?.nsfr || {}) },
});
