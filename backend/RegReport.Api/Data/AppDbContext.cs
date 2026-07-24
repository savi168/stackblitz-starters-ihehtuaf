using Microsoft.EntityFrameworkCore;
using RegReport.Api.Models;

namespace RegReport.Api.Data;

// Fully relational schema: every value has its own column (owned types flatten
// fixed-shape objects, child tables hold collections). The only JSON left in
// the database is the importMapping document in Settings.
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<KpiHistoryEntry> KpiHistory => Set<KpiHistoryEntry>();
    public DbSet<KpiLiquidityEntry> KpiLiquidity => Set<KpiLiquidityEntry>();
    public DbSet<Deadline> Deadlines => Set<Deadline>();
    public DbSet<CounterpartyRwa> CounterpartyRwa => Set<CounterpartyRwa>();
    public DbSet<LargeExposure> LargeExposures => Set<LargeExposure>();
    public DbSet<TeamMember> Team => Set<TeamMember>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectTask> ProjectTasks => Set<ProjectTask>();
    public DbSet<CapitalReport> CapitalReports => Set<CapitalReport>();
    public DbSet<CapitalLineItem> CapitalLineItems => Set<CapitalLineItem>();
    public DbSet<LcrReport> LcrReports => Set<LcrReport>();
    public DbSet<NsfrReport> NsfrReports => Set<NsfrReport>();
    public DbSet<NsfrLineItem> NsfrLineItems => Set<NsfrLineItem>();
    public DbSet<FinStatement> FinStatements => Set<FinStatement>();
    public DbSet<FinStatementLineItem> FinStatementLineItems => Set<FinStatementLineItem>();
    public DbSet<Scenario> Scenarios => Set<Scenario>();
    public DbSet<ScenarioShock> ScenarioShocks => Set<ScenarioShock>();
    public DbSet<Bilan> Bilans => Set<Bilan>();
    public DbSet<RiskAppetiteEntry> RiskAppetite => Set<RiskAppetiteEntry>();
    public DbSet<DiagnosisEntry> DiagnosisResults => Set<DiagnosisEntry>();
    public DbSet<AppSetting> Settings => Set<AppSetting>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<KpiHistoryEntry>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Entity, x.Date }).IsUnique();
            // CET1 capital breakdown flattened into Breakdown* columns.
            e.OwnsOne(x => x.Cet1CapitalBreakdown, o =>
            {
                o.Property(p => p.Equity).HasColumnName("BreakdownEquity");
                o.Property(p => p.Pnl).HasColumnName("BreakdownPnl");
                o.Property(p => p.ShareBuyback).HasColumnName("BreakdownShareBuyback");
                o.Property(p => p.GoodwillIntangibles).HasColumnName("BreakdownGoodwillIntangibles");
                o.Property(p => p.OtherDeductions).HasColumnName("BreakdownOtherDeductions");
                o.Property(p => p.ToBeDefined).HasColumnName("BreakdownToBeDefined");
                o.Property(p => p.Dividend).HasColumnName("BreakdownDividend");
            });
            e.HasMany(x => x.LiquidityRows).WithOne()
                .HasForeignKey(x => x.KpiHistoryEntryId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<KpiLiquidityEntry>(e =>
        {
            e.ToTable("KpiLiquidity");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.KpiHistoryEntryId, x.Currency }).IsUnique();
        });

        b.Entity<Deadline>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedNever(); // ids come from the frontend
            e.OwnsMany(x => x.History, h =>
            {
                h.ToTable("DeadlineHistory");
                h.WithOwner().HasForeignKey("DeadlineId");
                h.Property<int>("Id").ValueGeneratedOnAdd();
                h.HasKey("Id");
            });
            e.OwnsMany(x => x.Attachments, a =>
            {
                a.ToTable("DeadlineAttachments");
                a.WithOwner().HasForeignKey("DeadlineId");
                a.Property<int>("Id").ValueGeneratedOnAdd();
                a.HasKey("Id");
            });
        });

        b.Entity<CounterpartyRwa>().HasKey(x => x.Id);
        b.Entity<LargeExposure>().HasKey(x => x.Id);

        b.Entity<TeamMember>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedNever();
        });

        b.Entity<Project>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedNever();
        });

        b.Entity<ProjectTask>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedNever();
        });

        b.Entity<CapitalReport>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Entity, x.Date }).IsUnique();
            // KM1 key metrics flattened into columns.
            e.OwnsOne(x => x.KeyMetrics, o =>
            {
                o.Property(p => p.Cet1Capital).HasColumnName("Cet1Capital");
                o.Property(p => p.Tier1Capital).HasColumnName("Tier1Capital");
                o.Property(p => p.TotalCapital).HasColumnName("TotalCapital");
                o.Property(p => p.Rwa).HasColumnName("Rwa");
                o.Property(p => p.Cet1Ratio).HasColumnName("Cet1Ratio");
                o.Property(p => p.Tier1Ratio).HasColumnName("Tier1Ratio");
                o.Property(p => p.TotalCapitalRatio).HasColumnName("TotalCapitalRatio");
                o.Property(p => p.LeverageExposure).HasColumnName("LeverageExposure");
                o.Property(p => p.LeverageRatio).HasColumnName("LeverageRatio");
            });
            e.HasMany(x => x.LineItems)
                .WithOne()
                .HasForeignKey(x => x.CapitalReportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<CapitalLineItem>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.CapitalReportId);
        });

        b.Entity<LcrReport>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Entity, x.Date, x.Currency }).IsUnique();
        });

        b.Entity<NsfrReport>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Entity, x.Date }).IsUnique();
            e.HasMany(x => x.LineItems)
                .WithOne()
                .HasForeignKey(x => x.NsfrReportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<NsfrLineItem>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.NsfrReportId);
        });

        b.Entity<FinStatement>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Entity, x.Date, x.Kind, x.Gaap }).IsUnique();
            e.HasMany(x => x.LineItems).WithOne()
                .HasForeignKey(x => x.FinStatementId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<FinStatementLineItem>(e => { e.HasKey(x => x.Id); e.HasIndex(x => x.FinStatementId); });

        b.Entity<Scenario>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Entity, x.BaseDate });
            e.HasMany(x => x.Shocks).WithOne()
                .HasForeignKey(x => x.ScenarioId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<ScenarioShock>(e => { e.HasKey(x => x.Id); e.HasIndex(x => x.ScenarioId); });

        // Balance-sheet currency totals: single-row table (shadow identity key).
        b.Entity<Bilan>(e =>
        {
            e.ToTable("Bilan");
            e.Property<int>("Id").ValueGeneratedOnAdd();
            e.HasKey("Id");
        });

        // Risk appetite: one row per entity, thresholds flattened into columns.
        b.Entity<RiskAppetiteEntry>(e =>
        {
            e.ToTable("RiskAppetite");
            e.HasKey(x => x.Entity);
            e.OwnsOne(x => x.Thresholds, t =>
            {
                t.OwnsOne(x => x.Cet1, c =>
                {
                    c.Property(p => p.Red).HasColumnName("Cet1Red");
                    c.Property(p => p.Amber).HasColumnName("Cet1Amber");
                });
                t.OwnsOne(x => x.Lcr, c =>
                {
                    c.Property(p => p.Red).HasColumnName("LcrRed");
                    c.Property(p => p.Amber).HasColumnName("LcrAmber");
                });
                t.OwnsOne(x => x.Nsfr, c =>
                {
                    c.Property(p => p.Red).HasColumnName("NsfrRed");
                    c.Property(p => p.Amber).HasColumnName("NsfrAmber");
                });
                t.OwnsOne(x => x.Leverage, c =>
                {
                    c.Property(p => p.Red).HasColumnName("LeverageRed");
                    c.Property(p => p.Amber).HasColumnName("LeverageAmber");
                });
                t.Property(p => p.LocalCapitalRequirement).HasColumnName("LocalCapitalRequirement");
            });
        });

        b.Entity<DiagnosisEntry>(e =>
        {
            e.ToTable("DiagnosisResults");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Entity);
        });

        b.Entity<AppSetting>().HasKey(x => x.Key);
    }
}
