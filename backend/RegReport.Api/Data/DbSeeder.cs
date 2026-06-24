using System.Text.Json;
using RegReport.Api.Models;

namespace RegReport.Api.Data;

/// <summary>
/// Seeds a small demo dataset on first run so the app is not blank.
///
/// To load your real data, either:
///  - PUT your exported CentralData JSON to /api/data, or
///  - drop a `seed.json` (a full CentralData document) next to the executable;
///    it takes precedence over the built-in demo data.
/// </summary>
public static class DbSeeder
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public static void Seed(AppDbContext db)
    {
        if (db.Team.Any() || db.KpiHistory.Any() || db.Deadlines.Any())
            return; // already seeded

        var seedFile = Path.Combine(AppContext.BaseDirectory, "seed.json");
        if (File.Exists(seedFile))
        {
            var json = File.ReadAllText(seedFile);
            var data = JsonSerializer.Deserialize<CentralData>(json, JsonOpts);
            if (data is not null) { CentralDataStore.Replace(db, data); return; }
        }

        var demo = new CentralData
        {
            Team =
            {
                new TeamMember { Id = 1, Name = "Alice Martin", Role = "Project Manager", Email = "alice.martin@example.com", Phone = "555-0101" },
                new TeamMember { Id = 2, Name = "Bob Durand", Role = "Lead Analyst", Email = "bob.durand@example.com", Phone = "555-0102" },
            },
            Projects = { new Project { Id = 1, Name = "Q4 Regulatory Filing Automation", Description = "Automate the generation and submission of key regulatory reports." } },
            ProjectTasks =
            {
                new ProjectTask { Id = 101, ProjectId = 1, Title = "Gather LCR data requirements", Assignee = "Bob Durand", Status = "Done", ItTicket = "IT-5821" },
                new ProjectTask { Id = 102, ProjectId = 1, Title = "Develop data extraction script", Assignee = "Bob Durand", Status = "In Progress" },
            },
            Deadlines =
            {
                new Deadline
                {
                    Id = 36118, Name = "LCR REPORT - PRODUCTION, REVIEW AND SUBMISSION", Status = "inprogress",
                    Type = "regulatory", EndOfPeriod = "2025-10-31", DueDate = "2025-11-04", Entity = "Liechtenstein",
                    ControlNumber = "R.R.02", Frequency = "Monthly", OwnerGroup = "ICS_FIN_Owner", LightFull = "Full", ItemType = "Item",
                },
            },
            Bilan = new Bilan { Chf = 12000, Eur = 5400, Usd = 3200, Gbp = 900, Other = 700 },
            RiskAppetite = new()
            {
                ["Bank"] = new EntityThresholds
                {
                    Cet1 = new KpiThresholds { Red = 8, Amber = 10 },
                    Lcr = new KpiThresholds { Red = 100, Amber = 110 },
                    Nsfr = new KpiThresholds { Red = 100, Amber = 105 },
                    Leverage = new KpiThresholds { Red = 3, Amber = 4 },
                },
            },
            KpisHistory =
            {
                new KpiHistoryEntry
                {
                    Entity = "Bank", Date = "2025-09-30", Cet1Capital = 1850, CreditRWA = 9200, MarketRWA = 800,
                    OpRWA = 1200, OtherRWA = 0, Tier1 = 1950, Exposure = 42000,
                    Cet1CapitalBreakdown = new Cet1CapitalBreakdown { Equity = 1700, Pnl = 220, ShareBuyback = 0, GoodwillIntangibles = 60, OtherDeductions = 10, ToBeDefined = 0 },
                    Liquidity = new() { ["TOT"] = new LiquidityDataPoint { Hqla = 8200, NetCashOutflows = 6400, Asf = 31000, Rsf = 28000 } },
                },
                new KpiHistoryEntry
                {
                    Entity = "Bank", Date = "2025-12-31", Cet1Capital = 1920, CreditRWA = 9400, MarketRWA = 760,
                    OpRWA = 1200, OtherRWA = 0, Tier1 = 2010, Exposure = 43000,
                    Cet1CapitalBreakdown = new Cet1CapitalBreakdown { Equity = 1700, Pnl = 300, ShareBuyback = 0, GoodwillIntangibles = 60, OtherDeductions = 10, ToBeDefined = 0, Dividend = 80 },
                    Liquidity = new() { ["TOT"] = new LiquidityDataPoint { Hqla = 8600, NetCashOutflows = 6500, Asf = 31500, Rsf = 28200 } },
                },
            },
        };

        CentralDataStore.Replace(db, demo);
    }
}
