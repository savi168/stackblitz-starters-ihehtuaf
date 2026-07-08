export interface StatusLog {
  timestamp: string;
  oldStatus: Deadline['status'];
  newStatus: Deadline['status'];
}

export interface Attachment {
  name: string;
  dataUrl: string;
  type: string;
}

export interface Deadline {
  id: number;
  name: string; // From "Title"
  status: "completed" | "inprogress" | "upcoming";
  comments: string;
  history: StatusLog[];
  attachments: Attachment[];
  type: 'regulatory' | 'internal';
  
  // Fields from the new SHP file structure
  endOfPeriod: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD, was externalDeadline
  entity: string;
  controlNumber: string;
  frequency: string;
  ownerGroup: string; // was producer
  validator1: string;
  validator2: string;
  ownerApproved: boolean;
  validation1Approved: boolean;
  validation2Approved: boolean;
  signedOffWithException: boolean;
  lightFull: 'Light' | 'Full' | '';
  itemType: string;
  path: string;
}

export interface CET1CapitalBreakdown {
  equity: number;
  pnl: number;
  shareBuyback: number;
  goodwillIntangibles: number;
  otherDeductions: number;
  toBeDefined: number;
  dividend?: number;
}

export interface CashflowBreakdown {
  bankAndFi: number;
  retail: number;
  corporate: number;
  derivatives: number;
  other: number;
}

export interface NetCashOutflowsBreakdown {
  inflows: CashflowBreakdown;
  outflows: CashflowBreakdown;
}

export interface HQLABreakdown {
  centralBank: number;
  reverseRepo: number;
  sovereign: number;
  publicSector: number;
  other: number;
}

export interface LiquidityDataPoint {
    hqla: number;
    netCashOutflows: number;
    asf: number;
    rsf: number;
    netCashOutflowsBreakdown?: NetCashOutflowsBreakdown;
    hqlaBreakdown?: HQLABreakdown;
}

export type LiquidityByCurrency = {
    [currency: string]: Partial<LiquidityDataPoint>;
};

export interface KpiHistoryEntry {
  entity: string;
  date: string;
  // Capital Adequacy
  cet1Capital: number;
  creditRWA: number;
  marketRWA: number;
  opRWA: number;
  otherRWA: number;
  tier1: number;
  exposure: number;
  cet1CapitalBreakdown?: CET1CapitalBreakdown;
  // Liquidity by currency
  liquidity?: LiquidityByCurrency;
}

export interface Bilan {
  chf: number;
  eur: number;
  usd: number;
  gbp: number;
  other: number;
}

export interface KpiThresholds {
  red: number;
  amber: number;
}

export interface EntityThresholds {
  cet1: KpiThresholds;
  lcr: KpiThresholds;
  nsfr: KpiThresholds;
  leverage: KpiThresholds;
  /** Local regulatory capital requirement (incl. Pillar 2), % of RWA. */
  localCapitalRequirement?: number;
}

export interface RiskAppetite {
  [entity: string]: Partial<EntityThresholds>;
}

export interface CounterpartyRwa {
  entity: string;
  date: string;
  counterpartyName: string;
  industry: 'Bank' | 'Corporate' | 'Retail' | 'Sovereign' | 'Real Estate' | 'Equity';
  rwa: number; // in millions
}

export interface LargeExposure {
  entity: string;
  date: string;
  counterparty: string;
  exposureValue: number; // in millions
  limit: number; // in millions
}

export interface TeamMember {
    id: number;
    name: string;
    role: string;
    email: string;
    phone?: string;
}

export interface Project {
    id: number;
    name: string;
    description: string;
}

export interface ProjectTask {
    id: number;
    projectId: number;
    title: string;
    assignee: string;
    status: 'To Do' | 'In Progress' | 'Done';
    itTicket?: string;
}

export interface DiagnosisResult {
  severity: 'info' | 'warning' | 'error';
  category: string;
  message: string;
  field?: string;
}

// ---- Capital adequacy detail (relational: one report per entity+date) ----

export type CapitalSection = 'equity' | 'deduction' | 'at1' | 't2' | 'rwa';

export interface CapitalLineItem {
  id: number;
  section: CapitalSection;
  /** Stable machine code, e.g. 'shareCapital', 'goodwill', 'creditRwa'. */
  code: string;
  label: string;
  /** mCHF, signed (FINMA convention: deductions are negative). */
  amount: number;
  /** "Of which" informational rows: shown but excluded from the additive totals. */
  memo?: boolean;
}

/** Key metrics as reported (KM1). Computed values are derived from lineItems. */
export interface CapitalKeyMetrics {
  cet1Capital?: number;
  tier1Capital?: number;
  totalCapital?: number;
  rwa?: number;
  cet1Ratio?: number;          // %
  tier1Ratio?: number;         // %
  totalCapitalRatio?: number;  // %
  leverageExposure?: number;   // mCHF
  leverageRatio?: number;      // %
}

export interface CapitalReport {
  id: number;
  entity: string;
  date: string; // YYYY-MM-DD
  source: 'manual' | 'excel';
  fileName?: string;
  importedAt?: string; // ISO timestamp
  /** Forward-looking scenario (management projection), not an actual position. */
  isProjection?: boolean;
  /** Management commentary ("Active capital management" bullets, one per line). */
  comments?: string;
  keyMetrics: CapitalKeyMetrics;
  lineItems: CapitalLineItem[];
}

// ---- Excel import mapping (editable configuration, no code changes needed) ----

/** One FINMA row code of the capital sheet mapped to a line item. */
export interface CapitalRowMap {
  /** FINMA row code in column A, e.g. '1.1.1.7'. */
  finma: string;
  section: CapitalSection;
  code: string;
  label: string;
  memo?: boolean;
}

/**
 * All anchors the Excel parser uses. When FINMA/SNB publish a new template
 * version, adjust these values in the app (Workbench → Import mapping) —
 * no code change required. Missing fields fall back to the built-in defaults.
 */
export interface ImportMapping {
  /** Sheet names of the capital workbook. */
  sheets?: { km1?: string; cap?: string; rwa?: string };
  /** KM1 item numbers (start of column B labels), e.g. cet1Capital: '1'. */
  km1Items?: Partial<Record<keyof CapitalKeyMetrics, string>>;
  /** Capital composition rows (FINMA codes in column A of the capital sheet). */
  capitalRows?: CapitalRowMap[];
  /** Anchor codes: net CET1 (residual check) + RWA sheet codes. */
  capitalAnchors?: {
    netCet1?: string;
    rwaTotal?: string;
    creditRwa?: string;
    marketRwa?: string;
    opRwa?: string;
    leverageExposure?: string;
  };
  /** SNB row codes (column E) of the LCR sheets. */
  lcrCodes?: {
    totalOutflows?: string; inflowsBeforeCap?: string; inflowsAfterCap?: string; lcrRatio?: string;
    // weighted flow components (column S)
    retailOutflows?: string; wholesaleOutflows?: string; derivativesOutflows?: string;
    reverseRepoInflows?: string; derivativesInflows?: string;
  };
  /** NSFR_G form anchors. */
  nsfr?: { sheet?: string; totalAsf?: string; totalRsf?: string; ratio?: string };
  /** Column-Y labels of the weighted HQLA totals (first match wins). */
  lcrHqlaLabels?: { cat1?: string[]; cat2a?: string[]; cat2b?: string[]; total?: string[] };
}

// ---- LCR detail (relational: one report per entity+date+currency) ----

export interface LcrReport {
  id: number;
  entity: string;
  date: string; // YYYY-MM-DD
  currency: string; // 'TOT' | 'CHF' | 'EUR' | ...
  source: 'manual' | 'excel';
  fileName?: string;
  /** Weighted amounts, mCHF. */
  hqlaCat1: number;
  hqlaCat2a: number;
  hqlaCat2b: number;
  totalHqla: number;
  totalOutflows: number;
  inflowsBeforeCap: number;
  inflowsAfterCap: number;
  netOutflows: number;
  lcrRatio: number; // %
  // Weighted flow components (management-report detail; optional).
  retailOutflows?: number;
  wholesaleOutflows?: number;
  derivativesOutflows?: number;
  reverseRepoInflows?: number;
  derivativesInflows?: number;
  /** Commentary (HQLA comments…), usually set on the TOT row. */
  comments?: string;
}

// ---- NSFR detail (relational: one report per entity+date) ----

export type NsfrSection = 'asf' | 'rsf' | 'rsfOff';

export interface NsfrLineItem {
  id: number;
  section: NsfrSection;
  /** SNB row code in the NSFR_G01 form (column E). */
  code: string;
  label: string;
  /** Raw balance amounts by residual maturity bucket, mCHF. */
  amountLt6m: number;
  amount6mTo1y: number;
  amountGte1y: number;
}

export interface NsfrReport {
  id: number;
  entity: string;
  date: string; // YYYY-MM-DD
  source: 'manual' | 'excel';
  fileName?: string;
  /** Weighted totals from the form (mCHF) and the resulting ratio (%). */
  totalAsf: number;
  totalRsf: number;
  nsfrRatio: number;
  comments?: string;
  lineItems: NsfrLineItem[];
}

export interface CentralData {
  deadlines: Deadline[];
  kpisHistory: KpiHistoryEntry[];
  bilan: Bilan;
  riskAppetite: RiskAppetite;
  counterpartyRwa: CounterpartyRwa[];
  largeExposures: LargeExposure[];
  team: TeamMember[];
  projects: Project[];
  projectTasks: ProjectTask[];
  diagnosisResults?: Record<string, DiagnosisResult[]>; // Key: entity|date
  // Optional so data saved before these existed still loads.
  capitalReports?: CapitalReport[];
  lcrReports?: LcrReport[];
  nsfrReports?: NsfrReport[];
  /** Overrides for the Excel import anchors (FINMA/SNB template versions). */
  importMapping?: ImportMapping;
}

export interface CalculatedKpis extends Omit<KpiHistoryEntry, 'liquidity'>, Partial<LiquidityDataPoint> {
    rwaTotal: number;
    cet1: string;
    lcr: string;
    nsfr: string;
    leverage: string;
}