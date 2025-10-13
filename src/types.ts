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

export interface CentralData {
  deadlines: Deadline[];
  kpisHistory: KpiHistoryEntry[];
  bilan: Bilan;
  riskAppetite: RiskAppetite;
  counterpartyRwa: CounterpartyRwa[];
  team: TeamMember[];
  projects: Project[];
  projectTasks: ProjectTask[];
}

export interface CalculatedKpis extends Omit<KpiHistoryEntry, 'liquidity'>, Partial<LiquidityDataPoint> {
    rwaTotal: number;
    cet1: string;
    lcr: string;
    nsfr: string;
    leverage: string;
}