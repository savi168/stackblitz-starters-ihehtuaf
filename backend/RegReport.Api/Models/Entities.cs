using System.Text.Json.Serialization;

namespace RegReport.Api.Models;

// These types mirror the TypeScript domain model in the frontend (src/types.ts).
// Property names serialize to camelCase (ASP.NET Core default), matching the
// JSON the frontend sends and expects.

// ---- Nested value objects (stored as JSON columns) ----

public class Cet1CapitalBreakdown
{
    public double Equity { get; set; }
    public double Pnl { get; set; }
    public double ShareBuyback { get; set; }
    public double GoodwillIntangibles { get; set; }
    public double OtherDeductions { get; set; }
    public double ToBeDefined { get; set; }
    public double? Dividend { get; set; }
}

public class CashflowBreakdown
{
    public double BankAndFi { get; set; }
    public double Retail { get; set; }
    public double Corporate { get; set; }
    public double Derivatives { get; set; }
    public double Other { get; set; }
}

public class NetCashOutflowsBreakdown
{
    public CashflowBreakdown? Inflows { get; set; }
    public CashflowBreakdown? Outflows { get; set; }
}

public class HqlaBreakdown
{
    public double CentralBank { get; set; }
    public double ReverseRepo { get; set; }
    public double Sovereign { get; set; }
    public double PublicSector { get; set; }
    public double Other { get; set; }
}

public class LiquidityDataPoint
{
    public double? Hqla { get; set; }
    public double? NetCashOutflows { get; set; }
    public double? Asf { get; set; }
    public double? Rsf { get; set; }
    public NetCashOutflowsBreakdown? NetCashOutflowsBreakdown { get; set; }
    public HqlaBreakdown? HqlaBreakdown { get; set; }
}

public class StatusLog
{
    public string Timestamp { get; set; } = "";
    public string OldStatus { get; set; } = "";
    public string NewStatus { get; set; } = "";
}

public class Attachment
{
    public string Name { get; set; } = "";
    public string DataUrl { get; set; } = "";
    public string Type { get; set; } = "";
}

public class KpiThresholds
{
    public double Red { get; set; }
    public double Amber { get; set; }
}

public class EntityThresholds
{
    public KpiThresholds? Cet1 { get; set; }
    public KpiThresholds? Lcr { get; set; }
    public KpiThresholds? Nsfr { get; set; }
    public KpiThresholds? Leverage { get; set; }
    // Local regulatory capital requirement (incl. Pillar 2), % of RWA.
    public double? LocalCapitalRequirement { get; set; }
}

public class Bilan
{
    public double Chf { get; set; }
    public double Eur { get; set; }
    public double Usd { get; set; }
    public double Gbp { get; set; }
    public double Other { get; set; }
}

public class DiagnosisResult
{
    public string Severity { get; set; } = "info";
    public string Category { get; set; } = "";
    public string Message { get; set; } = "";
    public string? Field { get; set; }
}

// ---- Persisted entities ----

public class KpiHistoryEntry
{
    // Surrogate key for the DB only; not part of the API shape.
    [JsonIgnore] public int Id { get; set; }

    public string Entity { get; set; } = "";
    public string Date { get; set; } = "";

    public double Cet1Capital { get; set; }
    public double CreditRWA { get; set; }
    public double MarketRWA { get; set; }
    public double OpRWA { get; set; }
    public double OtherRWA { get; set; }
    public double Tier1 { get; set; }
    public double Exposure { get; set; }

    public Cet1CapitalBreakdown? Cet1CapitalBreakdown { get; set; }
    // Liquidity keyed by currency (e.g. "TOT", "CHF", "EUR").
    public Dictionary<string, LiquidityDataPoint>? Liquidity { get; set; }
}

public class Deadline
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Status { get; set; } = "upcoming";   // completed | inprogress | upcoming
    public string Type { get; set; } = "regulatory";    // regulatory | internal
    public string Comments { get; set; } = "";
    public List<StatusLog> History { get; set; } = new();
    public List<Attachment> Attachments { get; set; } = new();

    public string EndOfPeriod { get; set; } = "";
    public string DueDate { get; set; } = "";
    public string Entity { get; set; } = "";
    public string ControlNumber { get; set; } = "";
    public string Frequency { get; set; } = "";
    public string OwnerGroup { get; set; } = "";
    public string Validator1 { get; set; } = "";
    public string Validator2 { get; set; } = "";
    public bool OwnerApproved { get; set; }
    public bool Validation1Approved { get; set; }
    public bool Validation2Approved { get; set; }
    public bool SignedOffWithException { get; set; }
    public string LightFull { get; set; } = "";          // Light | Full | ''
    public string ItemType { get; set; } = "";
    public string Path { get; set; } = "";
}

public class CounterpartyRwa
{
    [JsonIgnore] public int Id { get; set; }
    public string Entity { get; set; } = "";
    public string Date { get; set; } = "";
    public string CounterpartyName { get; set; } = "";
    public string Industry { get; set; } = "";
    public double Rwa { get; set; }
}

public class LargeExposure
{
    [JsonIgnore] public int Id { get; set; }
    public string Entity { get; set; } = "";
    public string Date { get; set; } = "";
    public string Counterparty { get; set; } = "";
    public double ExposureValue { get; set; }
    public double Limit { get; set; }
}

public class TeamMember
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Role { get; set; } = "";
    public string Email { get; set; } = "";
    public string? Phone { get; set; }
}

public class Project
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
}

public class ProjectTask
{
    public int Id { get; set; }
    public int ProjectId { get; set; }
    public string Title { get; set; } = "";
    public string Assignee { get; set; } = "";
    public string Status { get; set; } = "To Do";   // To Do | In Progress | Done
    public string? ItTicket { get; set; }
}

// ---- Capital adequacy detail (relational: one report per entity+date) ----

public class CapitalKeyMetrics
{
    public double? Cet1Capital { get; set; }
    public double? Tier1Capital { get; set; }
    public double? TotalCapital { get; set; }
    public double? Rwa { get; set; }
    public double? Cet1Ratio { get; set; }          // %
    public double? Tier1Ratio { get; set; }         // %
    public double? TotalCapitalRatio { get; set; }  // %
    public double? LeverageExposure { get; set; }   // mCHF
    public double? LeverageRatio { get; set; }      // %
}

// Ids are long: the frontend generates timestamp-based ids (> Int32.MaxValue).
public class CapitalReport
{
    public long Id { get; set; }
    public string Entity { get; set; } = "";
    public string Date { get; set; } = "";
    public string Source { get; set; } = "manual";  // manual | excel
    public string? FileName { get; set; }
    public string? ImportedAt { get; set; }
    // Forward-looking scenario (management projection), not an actual position.
    public bool? IsProjection { get; set; }
    // Management commentary shown on the Management Report (one bullet per line).
    public string? Comments { get; set; }
    // KM1 figures as reported; computed values are derived from LineItems.
    public CapitalKeyMetrics? KeyMetrics { get; set; }
    public List<CapitalLineItem> LineItems { get; set; } = new();
}

public class CapitalLineItem
{
    public long Id { get; set; }
    [JsonIgnore] public long CapitalReportId { get; set; }
    public string Section { get; set; } = "equity"; // equity | deduction | at1 | t2 | rwa
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    // mCHF, signed (FINMA convention: deductions are negative).
    public double Amount { get; set; }
    // "Of which" informational rows, excluded from the additive totals.
    public bool Memo { get; set; }
}

// ---- LCR detail (relational: one report per entity+date+currency) ----

public class LcrReport
{
    public long Id { get; set; }
    public string Entity { get; set; } = "";
    public string Date { get; set; } = "";
    public string Currency { get; set; } = "TOT";
    public string Source { get; set; } = "manual";  // manual | excel
    public string? FileName { get; set; }
    public double HqlaCat1 { get; set; }
    public double HqlaCat2a { get; set; }
    public double HqlaCat2b { get; set; }
    public double TotalHqla { get; set; }
    public double TotalOutflows { get; set; }
    public double InflowsBeforeCap { get; set; }
    public double InflowsAfterCap { get; set; }
    public double NetOutflows { get; set; }
    public double LcrRatio { get; set; }            // %
    // Weighted flow components (management-report detail; optional).
    public double? RetailOutflows { get; set; }
    public double? WholesaleOutflows { get; set; }
    public double? DerivativesOutflows { get; set; }
    public double? ReverseRepoInflows { get; set; }
    public double? DerivativesInflows { get; set; }
    // Commentary (HQLA comments…), usually set on the TOT row.
    public string? Comments { get; set; }
}

// ---- NSFR detail (relational: one report per entity+date) ----

public class NsfrReport
{
    public long Id { get; set; }
    public string Entity { get; set; } = "";
    public string Date { get; set; } = "";
    public string Source { get; set; } = "manual";  // manual | excel
    public string? FileName { get; set; }
    // Weighted totals from the NSFR_G form (mCHF) and the resulting ratio (%).
    public double TotalAsf { get; set; }
    public double TotalRsf { get; set; }
    public double NsfrRatio { get; set; }
    public string? Comments { get; set; }
    public List<NsfrLineItem> LineItems { get; set; } = new();
}

public class NsfrLineItem
{
    public long Id { get; set; }
    [JsonIgnore] public long NsfrReportId { get; set; }
    public string Section { get; set; } = "asf";    // asf | rsf | rsfOff
    // SNB row code in the NSFR_G01 form (column E).
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    // Raw balance amounts by residual maturity bucket, mCHF.
    public double AmountLt6m { get; set; }
    public double Amount6mTo1y { get; set; }
    public double AmountGte1y { get; set; }
}

// ---- Financial statements (relational: one per entity+date+kind) ----

public class FinStatement
{
    public long Id { get; set; }
    public string Entity { get; set; } = "";
    public string Date { get; set; } = "";
    public string Kind { get; set; } = "balanceSheet"; // balanceSheet | pnl | equity
    public string Source { get; set; } = "manual";     // manual | excel
    public string? FileName { get; set; }
    public string? Comments { get; set; }
    public List<FinStatementLineItem> LineItems { get; set; } = new();
}

public class FinStatementLineItem
{
    public long Id { get; set; }
    [JsonIgnore] public long FinStatementId { get; set; }
    // balanceSheet: assets|liabilities|equity · pnl: income|expenses · equity: movements
    public string Section { get; set; } = "";
    public string Code { get; set; } = "";
    public string Label { get; set; } = "";
    public double Amount { get; set; } // mCHF, signed
    public bool Memo { get; set; }
}

// ---- Scenario simulation (what-if shocks on the regulatory ratios) ----

public class Scenario
{
    public long Id { get; set; }
    public string Entity { get; set; } = "";
    public string BaseDate { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public List<ScenarioShock> Shocks { get; set; } = new();
}

public class ScenarioShock
{
    public long Id { get; set; }
    [JsonIgnore] public long ScenarioId { get; set; }
    public string Target { get; set; } = "capital";    // capital | lcr | nsfr
    public string Code { get; set; } = "";             // cet1Delta, rwaDelta, hqlaDelta, …
    public string Label { get; set; } = "";
    public double Amount { get; set; }                 // mCHF, signed
}

// Small singletons (bilan, riskAppetite, diagnosisResults) live in a key/value
// table as JSON to avoid over-modelling rarely-changing settings.
public class AppSetting
{
    public string Key { get; set; } = "";
    public string Value { get; set; } = "{}";
}

// ---- Aggregate returned/accepted by /api/data (mirrors CentralData) ----

public class CentralData
{
    public List<Deadline> Deadlines { get; set; } = new();
    public List<KpiHistoryEntry> KpisHistory { get; set; } = new();
    public Bilan Bilan { get; set; } = new();
    public Dictionary<string, EntityThresholds> RiskAppetite { get; set; } = new();
    public List<CounterpartyRwa> CounterpartyRwa { get; set; } = new();
    public List<LargeExposure> LargeExposures { get; set; } = new();
    public List<TeamMember> Team { get; set; } = new();
    public List<Project> Projects { get; set; } = new();
    public List<ProjectTask> ProjectTasks { get; set; } = new();
    public Dictionary<string, List<DiagnosisResult>>? DiagnosisResults { get; set; }
    public List<CapitalReport> CapitalReports { get; set; } = new();
    public List<LcrReport> LcrReports { get; set; } = new();
    public List<NsfrReport> NsfrReports { get; set; } = new();
    public List<FinStatement> FinStatements { get; set; } = new();
    public List<Scenario> Scenarios { get; set; } = new();
    // Excel import anchors (FINMA/SNB template versions). Free-form JSON owned
    // by the frontend parser — the API only stores and returns it.
    public System.Text.Json.JsonElement? ImportMapping { get; set; }
}
