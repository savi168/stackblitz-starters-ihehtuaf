import { CentralData } from './types';

export const centralData: CentralData = {
    team: [
        { id: 1, name: "Alice Martin", role: "Project Manager", email: "alice.martin@example.com", phone: "555-0101" },
        { id: 2, name: "Bob Durand", role: "Lead Analyst", email: "bob.durand@example.com", phone: "555-0102" },
        { id: 3, name: "Charlie Petit", role: "IT Specialist", email: "charlie.petit@example.com", phone: "555-0103" },
        { id: 4, name: "Diana Lefevre", role: "Data Scientist", email: "diana.lefevre@example.com", phone: "555-0104" }
    ],
    projects: [
        { id: 1, name: "Q4 Regulatory Filing Automation", description: "Automate the generation and submission of key regulatory reports for the fourth quarter." },
        { id: 2, name: "Risk Appetite Framework Review", description: "Annual review and update of the firm-wide risk appetite statements and thresholds." }
    ],
    projectTasks: [
        { id: 101, projectId: 1, title: "Gather LCR data requirements", assignee: "Bob Durand", status: "Done", itTicket: "IT-5821" },
        { id: 102, projectId: 1, title: "Develop data extraction script", assignee: "Charlie Petit", status: "In Progress", itTicket: "IT-5822" },
        { id: 103, projectId: 1, title: "Validate CET1 calculation logic", assignee: "Bob Durand", status: "In Progress", itTicket: "" },
        { id: 104, projectId: 1, title: "Draft final report for review", assignee: "Alice Martin", status: "To Do", itTicket: "" },
        { id: 201, projectId: 2, title: "Interview business heads for feedback", assignee: "Alice Martin", status: "Done", itTicket: "" },
        { id: 202, projectId: 2, title: "Analyze historical threshold breaches", assignee: "Diana Lefevre", status: "In Progress", itTicket: "IT-5910" },
        { id: 203, projectId: 2, title: "Propose new NSFR thresholds", assignee: "Bob Durand", status: "To Do", itTicket: "" }
    ],
    deadlines: [
        { 
            id: 36118,
            name: "REGULATORY REPORTING - LCR REPORT - PRODUCTION, REVIEW AND SUBMISSION (due on the 15th)",
            status: "inprogress",
            type: "regulatory",
            comments: "",
            history: [],
            attachments: [],
            endOfPeriod: "2025-10-31",
            dueDate: "2025-11-04",
            entity: "Liechtenstein",
            controlNumber: "R.R.02",
            frequency: "Monthly",
            ownerGroup: "ICS_FIN_Owner_R.R_LI1",
            validator1: "ICS_FIN_Validator1_R.R_LI1",
            validator2: "ICS_FIN_Validator2_R.R_LI1",
            ownerApproved: false,
            validation1Approved: false,
            validation2Approved: false,
            signedOffWithException: false,
            lightFull: "Full",
            itemType: "Item",
            path: "shp/cs/rfi/controls/Lists/todo",
        },
        { 
            id: 36428,
            name: "REGULATORY REPORTING - LCR REPORT - PRODUCTION, REVIEW AND SUBMISSION (due on the 20th)",
            status: "upcoming",
            type: "regulatory",
            comments: "",
            history: [],
            attachments: [],
            endOfPeriod: "2025-10-31",
            dueDate: "2025-11-06",
            entity: "Bank",
            controlNumber: "R.R.02",
            frequency: "Monthly",
            ownerGroup: "ICS_FIN_Owner_R.R_LI1",
            validator1: "ICS_FIN_Validator1_R.R_LI1",
            validator2: "ICS_FIN_Validator2_R.R_LI1",
            ownerApproved: false,
            validation1Approved: false,
            validation2Approved: false,
            signedOffWithException: false,
            lightFull: "Light",
            itemType: "Item",
            path: "shp/cs/rfi/controls/Lists/todo",
        },
        { 
            id: 3, 
            name: "Management Dashboard", 
            status: "upcoming", 
            type: "internal",
            comments: "Monthly KPIs", 
            history: [], 
            attachments: [],
            endOfPeriod: "2025-10-31",
            dueDate: "2025-10-25",
            entity: "Group",
            controlNumber: "M.D.01",
            frequency: "Monthly",
            ownerGroup: "MGMT_FIN_Owner",
            validator1: "MGMT_FIN_Validator1",
            validator2: "N/A",
            ownerApproved: false,
            validation1Approved: false,
            validation2Approved: false,
            signedOffWithException: false,
            lightFull: "",
            itemType: "Dashboard",
            path: "dashboards/mgmt/finance",
        }
    ],
    kpisHistory: [
        { 
            entity: "Group", date: "2025-09-30", cet1Capital: 1680, creditRWA: 5480, marketRWA: 870, opRWA: 2950, otherRWA: 600, tier1: 2030, exposure: 39500,
            cet1CapitalBreakdown: { equity: 2500, pnl: 100, shareBuyback: 200, goodwillIntangibles: 500, otherDeductions: 220, toBeDefined: 0, dividend: 50 },
            liquidity: {
                "TOT": {
                    hqla: 10200, netCashOutflows: 3850, asf: 0, rsf: 0,
                    hqlaBreakdown: { centralBank: 5000, reverseRepo: 2000, sovereign: 2200, publicSector: 500, other: 500 },
                    netCashOutflowsBreakdown: {
                        inflows: { bankAndFi: 500, retail: 800, corporate: 400, derivatives: 250, other: 200 },
                        outflows: { bankAndFi: 2000, retail: 1500, corporate: 1000, derivatives: 1000, other: 500 }
                    }
                },
                 "CHF": { hqla: 6000, netCashOutflows: 2000, asf: 0, rsf: 0 },
                 "USD": { hqla: 3200, netCashOutflows: 1500, asf: 0, rsf: 0 },
                 "EUR": { hqla: 1000, netCashOutflows: 350, asf: 0, rsf: 0 },
            }
        },
        { 
            entity: "Group", date: "2025-08-31", cet1Capital: 1661, creditRWA: 5421, marketRWA: 850, opRWA: 2934, otherRWA: 595, tier1: 2012, exposure: 39062,
            cet1CapitalBreakdown: { equity: 2450, pnl: 80, shareBuyback: 180, goodwillIntangibles: 490, otherDeductions: 199, toBeDefined: 0, dividend: 45 },
            liquidity: {
                "TOT": {
                    hqla: 9943, netCashOutflows: 3778, asf: 0, rsf: 0,
                    hqlaBreakdown: { centralBank: 4800, reverseRepo: 1900, sovereign: 2300, publicSector: 500, other: 443 },
                    netCashOutflowsBreakdown: {
                        inflows: { bankAndFi: 450, retail: 750, corporate: 420, derivatives: 200, other: 180 },
                        outflows: { bankAndFi: 1900, retail: 1400, corporate: 1100, derivatives: 900, other: 478 }
                    }
                }
            }
        },
        { entity: "Group", date: "2025-07-31", cet1Capital: 1696, creditRWA: 5566, marketRWA: 766, opRWA: 2930, otherRWA: 560, tier1: 2047, exposure: 38401, liquidity: { "TOT": { hqla: 9440, netCashOutflows: 4182, asf: 0, rsf: 0 } } },
        { entity: "Group", date: "2025-06-30", cet1Capital: 1692, creditRWA: 5595, marketRWA: 838, opRWA: 2918, otherRWA: 565, tier1: 2043, exposure: 38268, liquidity: { "TOT": { hqla: 9112, netCashOutflows: 3570, asf: 0, rsf: 0 } } },
        { entity: "Group", date: "2025-05-31", cet1Capital: 1692, creditRWA: 5655, marketRWA: 746, opRWA: 2804, otherRWA: 515, tier1: 2043, exposure: 37968, liquidity: { "TOT": { hqla: 9018, netCashOutflows: 3975, asf: 0, rsf: 0 } } },
        { entity: "Group", date: "2025-04-30", cet1Capital: 1661, creditRWA: 5561, marketRWA: 765, opRWA: 2840, otherRWA: 526, tier1: 2012, exposure: 38956, liquidity: { "TOT": { hqla: 9439, netCashOutflows: 4474, asf: 0, rsf: 0 } } },
        { entity: "Group", date: "2025-03-31", cet1Capital: 1701, creditRWA: 5757, marketRWA: 796, opRWA: 2820, otherRWA: 553, tier1: 2052, exposure: 38962, liquidity: { "TOT": { hqla: 9473, netCashOutflows: 4077, asf: 0, rsf: 0 } } },
        { entity: "Group", date: "2025-02-28", cet1Capital: 1672, creditRWA: 5815, marketRWA: 738, opRWA: 2801, otherRWA: 542, tier1: 2023, exposure: 41680, liquidity: { "TOT": { hqla: 9903, netCashOutflows: 4599, asf: 0, rsf: 0 } } },
        { entity: "Group", date: "2025-01-31", cet1Capital: 1650, creditRWA: 5768, marketRWA: 748, opRWA: 2782, otherRWA: 549, tier1: 2001, exposure: 41515, liquidity: { "TOT": { hqla: 11045, netCashOutflows: 5213, asf: 0, rsf: 0 } } },
        { entity: "Group", date: "2024-12-31", cet1Capital: 1649, creditRWA: 5676, marketRWA: 580, opRWA: 2540, otherRWA: 523, tier1: 2000, exposure: 41504, liquidity: { "TOT": { hqla: 11145, netCashOutflows: 4597, asf: 0, rsf: 0 } } },
        { 
            entity: "Bank", date: "2025-09-30", cet1Capital: 4200, creditRWA: 20000, marketRWA: 5000, opRWA: 2800, otherRWA: 0, tier1: 4500, exposure: 85000,
            cet1CapitalBreakdown: { equity: 6000, pnl: 500, shareBuyback: 300, goodwillIntangibles: 1500, otherDeductions: 500, toBeDefined: 0, dividend: 100 },
            liquidity: {
                "TOT": {
                    hqla: 8500, netCashOutflows: 6000, asf: 35000, rsf: 29000,
                    hqlaBreakdown: { centralBank: 4000, reverseRepo: 1500, sovereign: 2000, publicSector: 800, other: 200 },
                    netCashOutflowsBreakdown: {
                        inflows: { bankAndFi: 1000, retail: 1200, corporate: 800, derivatives: 500, other: 500 },
                        outflows: { bankAndFi: 4000, retail: 2000, corporate: 2000, derivatives: 1500, other: 500 }
                    }
                }
            }
        },
        { entity: "Lean", date: "2025-09-30", cet1Capital: 850, creditRWA: 5500, marketRWA: 1200, opRWA: 800, otherRWA: 0, tier1: 900, exposure: 18000, liquidity: { "TOT": { hqla: 2000, netCashOutflows: 1400, asf: 8000, rsf: 6500 } } },
        { 
            entity: "Liechtenstein", date: "2025-09-30", cet1Capital: 600, creditRWA: 3000, marketRWA: 500, opRWA: 400, otherRWA: 100, tier1: 650, exposure: 12000,
            liquidity: { "TOT": { hqla: 1500, netCashOutflows: 1100, asf: 7000, rsf: 6000 } }
        },
        { 
            entity: "Liechtenstein", date: "2025-09-29", cet1Capital: 602, creditRWA: 3010, marketRWA: 500, opRWA: 400, otherRWA: 100, tier1: 652, exposure: 12050,
            liquidity: { "TOT": { hqla: 1480, netCashOutflows: 1150, asf: 7000, rsf: 6000 } }
        },
        { 
            entity: "Hong Kong", date: "2025-09-30", cet1Capital: 1200, creditRWA: 6000, marketRWA: 1000, opRWA: 800, otherRWA: 200, tier1: 1300, exposure: 24000,
            liquidity: { "TOT": { hqla: 3000, netCashOutflows: 2200, asf: 14000, rsf: 12000 } }
        },
        { 
            entity: "Hong Kong", date: "2025-09-29", cet1Capital: 1205, creditRWA: 6010, marketRWA: 1000, opRWA: 800, otherRWA: 200, tier1: 1305, exposure: 24050,
            liquidity: { "TOT": { hqla: 2950, netCashOutflows: 2280, asf: 14000, rsf: 12000 } }
        }
    ],
    bilan: { chf: 45000, eur: 28000, usd: 15000, gbp: 3500, other: 2500 },
    riskAppetite: {
        "Group": {
            cet1: { red: 8, amber: 10.5 },
            lcr: { red: 100, amber: 120 },
            nsfr: { red: 100, amber: 110 },
            leverage: { red: 3, amber: 4 },
        },
        "Bank": {
            cet1: { red: 9, amber: 11 },
            lcr: { red: 110, amber: 130 },
            nsfr: { red: 100, amber: 110 },
            leverage: { red: 3.5, amber: 4.5 },
        },
        "Lean": {
            cet1: { red: 12, amber: 14 },
            lcr: { red: 120, amber: 150 },
            nsfr: { red: 100, amber: 110 },
            leverage: { red: 5, amber: 6 },
        }
    },
    counterpartyRwa: [
      // Group Data for 2025-09-30 - Banks (23 counterparties)
      ...Array.from({ length: 23 }, (_, i) => ({ entity: "Group", date: "2025-09-30", counterpartyName: `Global Bank ${i + 1}`, industry: "Bank" as const, rwa: 250 - i * 8 })),
      // Group Data for 2025-09-30 - Corporates (18 counterparties)
      ...Array.from({ length: 18 }, (_, i) => ({ entity: "Group", date: "2025-09-30", counterpartyName: `Major Corp ${i + 1}`, industry: "Corporate" as const, rwa: 150 - i * 6 })),
       // Group Data for 2025-09-30 - Real Estate (5 counterparties)
      ...Array.from({ length: 5 }, (_, i) => ({ entity: "Group", date: "2025-09-30", counterpartyName: `Realty Trust ${i + 1}`, industry: "Real Estate" as const, rwa: 90 - i * 10 })),
      // Group Data for 2025-09-30 - Equity (3 counterparties)
      ...Array.from({ length: 3 }, (_, i) => ({ entity: "Group", date: "2025-09-30", counterpartyName: `Equity Fund ${i + 1}`, industry: "Equity" as const, rwa: 40 - i * 5 })),
  
      // Bank Entity Data for 2025-09-30 - Banks (15 counterparties)
      ...Array.from({ length: 15 }, (_, i) => ({ entity: "Bank", date: "2025-09-30", counterpartyName: `Investment Bank ${i + 1}`, industry: "Bank" as const, rwa: 300 - i * 12 })),
      // Bank Entity Data for 2025-09-30 - Sovereign (3 counterparties)
      { entity: "Bank", date: "2025-09-30", counterpartyName: "US Treasury", industry: "Sovereign", rwa: 10 },
      { entity: "Bank", date: "2025-09-30", counterpartyName: "UK Gilt", industry: "Sovereign", rwa: 8 },
      { entity: "Bank", date: "2025-09-30", counterpartyName: "German Bund", industry: "Sovereign", rwa: 5 },
  
      // Older data for Group to test filtering
      ...Array.from({ length: 5 }, (_, i) => ({ entity: "Group", date: "2025-08-31", counterpartyName: `Global Bank ${i + 1}`, industry: "Bank" as const, rwa: 245 - i * 8 })),
  ],
  largeExposures: [
    { entity: "Liechtenstein", date: "2025-09-30", counterparty: "Global Investment Bank A", exposureValue: 85, limit: 100 },
    { entity: "Liechtenstein", date: "2025-09-30", counterparty: "Major Swiss Bank", exposureValue: 70, limit: 100 },
    { entity: "Liechtenstein", date: "2025-09-30", counterparty: "EU Sovereign Fund", exposureValue: 120, limit: 150 },
    { entity: "Hong Kong", date: "2025-09-30", counterparty: "APAC Wealth Management", exposureValue: 210, limit: 250 },
    { entity: "Hong Kong", date: "2025-09-30", counterparty: "China Construction Bank", exposureValue: 180, limit: 250 },
    { entity: "Hong Kong", date: "2025-09-30", counterparty: "Singapore Sovereign Fund", exposureValue: 150, limit: 200 },
    { entity: "Liechtenstein", date: "2025-09-29", counterparty: "Global Investment Bank A", exposureValue: 82, limit: 100 },
    { entity: "Liechtenstein", date: "2025-09-29", counterparty: "Major Swiss Bank", exposureValue: 71, limit: 100 },
    { entity: "Hong Kong", date: "2025-09-29", counterparty: "APAC Wealth Management", exposureValue: 205, limit: 250 },
  ],
  capitalReports: [],
  lcrReports: [],
  nsfrReports: []
};